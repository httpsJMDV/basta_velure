<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Courier\ReturnPickups;
use App\Support\ParcelAccess;
use App\Support\Validation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Return pickups (reverse logistics): the hub or the courier gives each one to a rider, the rider collects the item
 * from the buyer and hands it to the shop, and the shop confirms it arrived. docs/api/return-pickups.md.
 */
class ReturnPickupController extends Controller
{
    public function __construct(private readonly ReturnPickups $pickups)
    {
    }

    // ── Hub ───────────────────────────────────────────────────────────────────

    /** GET /hub/return-pickups: open ones first, then the last finished ones, and the hub's riders to choose from. */
    public function hubIndex(Request $request): JsonResponse
    {
        $hub = $this->hub($request);

        app(\App\Services\Courier\PickupPolicy::class)->assignReturns(LogisticsCompany::effectiveId($hub->logistics_company_id));

        return $this->listing($this->hubPickups($hub), 'hub',
            Rider::with('user')->where('sorting_center_id', $hub->id)->where('status', Rider::STATUS_ACTIVE)->carriesParcels()->get());
    }

    /**
     * The returns a hub deals with: the ones its riders collect, and the ones coming back through it to a shop near it
     * (its riders bring those to the shop).
     *
     * @return Builder<ReturnPickup>
     */
    private function hubPickups(SortingCenter $hub): Builder
    {
        return ReturnPickup::where(fn ($q) => $q->where('sorting_center_id', $hub->id)
            ->orWhere(fn ($q) => $q->where('destination_hub_id', $hub->id)
                ->whereIn('status', [ReturnPickup::STATUS_AT_HUB, ReturnPickup::STATUS_OUT_TO_SHOP, ReturnPickup::STATUS_DELIVERED, ReturnPickup::STATUS_RECEIVED])));
    }

    /** POST /hub/return-pickups/{pickup}/assign {rider_id} */
    public function hubAssign(Request $request, int $pickup): JsonResponse
    {
        $hub = $this->hub($request);
        $riderId = (int) $request->validate(['rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose a rider.'])['rider_id'];

        return DB::transaction(function () use ($request, $hub, $pickup, $riderId) {
            $row = $this->hubPickups($hub)->lockForUpdate()->findOrFail($pickup);
            // The last leg is the shop's hub's job; collecting is the job of the hub that delivered the order.
            $shopLeg = $this->pickups->readyForShopRider($row) || $row->status === ReturnPickup::STATUS_OUT_TO_SHOP;
            abort_if($shopLeg ? (int) $row->destination_hub_id !== $hub->id : (int) $row->sorting_center_id !== $hub->id, 409,
                $shopLeg ? 'The hub near the shop gives this one to a rider.' : 'This return is still on its way to the hub near the shop.');
            $rider = Rider::with('user')->where('sorting_center_id', $hub->id)->carriesParcels()->find($riderId);
            abort_unless($rider, 422, 'Choose one of your riders.');
            $this->pickups->assign($row, $rider, $request->user(), 'hub');

            return $this->one($row, 'hub', 'Return pickup given to ' . $rider->user?->first_name . '.');
        });
    }

    // ── Courier ───────────────────────────────────────────────────────────────

    /** GET /logistics/return-pickups */
    public function courierIndex(Request $request): JsonResponse
    {
        $company = $this->company($request);

        app(\App\Services\Courier\PickupPolicy::class)->assignReturns($company->id);

        return $this->listing(LogisticsCompany::constrain(ReturnPickup::query(), $company->id), 'logistics',
            LogisticsRiderController::companyRiders($company)->with('user')->where('status', Rider::STATUS_ACTIVE)->carriesParcels()->get());
    }

    /** POST /logistics/return-pickups/{pickup}/assign {rider_id} */
    public function courierAssign(Request $request, int $pickup): JsonResponse
    {
        $company = $this->company($request);
        $riderId = (int) $request->validate(['rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose a rider.'])['rider_id'];

        return DB::transaction(function () use ($request, $company, $pickup, $riderId) {
            $row = LogisticsCompany::constrain(ReturnPickup::query(), $company->id)->lockForUpdate()->findOrFail($pickup);
            $rider = LogisticsRiderController::companyRiders($company)->with('user')->carriesParcels()->find($riderId);
            abort_unless($rider, 422, 'This rider is not one of your riders.');
            $this->pickups->assign($row, $rider, $request->user(), 'logistics');

            return $this->one($row, 'logistics', 'Return pickup given to ' . $rider->user?->first_name . '.');
        });
    }

    // ── Rider ─────────────────────────────────────────────────────────────────

    /** GET /rider/return-pickups: the ones to collect or carry now, and the last finished ones. */
    public function riderIndex(Request $request): JsonResponse
    {
        $rider = $this->rider($request);
        // The ones this rider collects, and the ones this rider brings from the hub to a shop.
        $rows = ReturnPickup::where(fn ($q) => $q->where('rider_id', $rider->id)->orWhere('shop_rider_id', $rider->id))
            ->orderByRaw("CASE status WHEN 'assigned' THEN 0 WHEN 'collected' THEN 1 WHEN 'out_to_shop' THEN 1 ELSE 2 END")
            ->latest('updated_at')->limit(30)->get();
        $mine = fn (ReturnPickup $p) => in_array($p->status, [ReturnPickup::STATUS_ASSIGNED, ReturnPickup::STATUS_COLLECTED], true) && (int) $p->rider_id === $rider->id
            || ($p->status === ReturnPickup::STATUS_OUT_TO_SHOP && (int) $p->shop_rider_id === $rider->id);

        return response()->json([
            'data' => $rows->map(fn (ReturnPickup $p) => ReturnPickups::present($p, 'rider') + [
                // What this rider does next: collect it, drop it at the hub, or hand it to the shop.
                'my_step' => match (true) {
                    $p->status === ReturnPickup::STATUS_ASSIGNED && (int) $p->rider_id === $rider->id => 'collect',
                    $p->status === ReturnPickup::STATUS_COLLECTED && (int) $p->rider_id === $rider->id => $p->goesThroughHubs() ? 'drop_at_hub' : 'deliver_to_shop',
                    $p->status === ReturnPickup::STATUS_OUT_TO_SHOP && (int) $p->shop_rider_id === $rider->id => 'deliver_to_shop',
                    default => null,
                },
            ])->values(),
            'meta' => ['open' => $rows->filter($mine)->count()],
        ]);
    }

    /** POST /rider/return-pickups/{pickup}/collected {photo}: a photo of the item in the rider's hands. */
    public function collected(Request $request, int $pickup): JsonResponse
    {
        $request->validate(['photo' => Validation::image()], Validation::uploadMessages('photo', 'a photo of the item'));
        $rider = $this->rider($request);

        return DB::transaction(function () use ($request, $rider, $pickup) {
            $row = ReturnPickup::lockForUpdate()->findOrFail($pickup);
            $this->pickups->collected($row, $rider, $request->file('photo'));

            return $this->one($row, 'rider', 'Collected. Bring it to the shop.');
        });
    }

    /** POST /rider/return-pickups/{pickup}/failed {reason} */
    public function failed(Request $request, int $pickup): JsonResponse
    {
        $reason = trim((string) $request->validate(['reason' => ['required', 'string', 'min:5', 'max:200']], [
            'reason.required' => 'Say why the item could not be collected.',
            'reason.min'      => 'Say why the item could not be collected.',
        ])['reason']);
        $rider = $this->rider($request);

        return DB::transaction(function () use ($rider, $pickup, $reason) {
            $row = ReturnPickup::lockForUpdate()->findOrFail($pickup);
            $this->pickups->failed($row, $rider, strip_tags($reason));

            return $this->one($row, 'rider', $row->status === ReturnPickup::STATUS_CANCELLED
                ? 'Saved. That was the last visit, so the pickup is cancelled.'
                : 'Saved. Try again on your next trip there.');
        });
    }

    /** POST /rider/return-pickups/{pickup}/dropped: the item is at the rider's hub, to travel back to the shop's hub. */
    public function dropped(Request $request, int $pickup): JsonResponse
    {
        $rider = $this->rider($request);

        return DB::transaction(function () use ($rider, $pickup) {
            $row = ReturnPickup::lockForUpdate()->findOrFail($pickup);
            $this->pickups->dropped($row, $rider);

            return $this->one($row, 'rider', 'Dropped at the hub. It travels back to the shop from here.');
        });
    }

    /** POST /rider/return-pickups/{pickup}/delivered: handed to the shop. */
    public function delivered(Request $request, int $pickup): JsonResponse
    {
        $rider = $this->rider($request);

        return DB::transaction(function () use ($rider, $pickup) {
            $row = ReturnPickup::lockForUpdate()->findOrFail($pickup);
            $this->pickups->delivered($row, $rider);

            return $this->one($row, 'rider', 'Handed to the shop. The shop confirms it received the item.');
        });
    }

    // ── Shop ──────────────────────────────────────────────────────────────────

    /** POST /seller/orders/{order}/return-pickup/received */
    public function received(Request $request, Order $order): JsonResponse
    {
        $sellerId = $request->user()->id;
        abort_unless($order->items()->where('seller_id', $sellerId)->exists(), 403);

        return DB::transaction(function () use ($request, $order) {
            $row = ReturnPickup::where('order_id', $order->id)->lockForUpdate()->firstOrFail();
            $this->pickups->received($row, $request->user());

            return $this->one($row, 'seller', 'Thanks. The return is complete.');
        });
    }

    // ── Photo ─────────────────────────────────────────────────────────────────

    /** GET /return-pickups/{pickup}/photo: the rider's photo of the collected item. */
    public function photo(Request $request, int $pickup): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $row = ReturnPickup::with(['parcel.order', 'order'])->find($pickup);
        $path = $row?->collect_photo_path;
        abort_unless($row && $path && $this->mayView($user, $row), 404, 'Photo not found.');
        abort_unless(Storage::disk('ids')->exists($path), 404, 'Photo not found.');

        return Storage::disk('ids')->response($path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    private function mayView(User $user, ReturnPickup $row): bool
    {
        if ($user->role === 'admin' || $row->order?->buyer_id === $user->id || $row->order?->items()->where('seller_id', $user->id)->exists()) {
            return true;
        }
        $riderId = Rider::where('user_id', $user->id)->value('id');
        if ($riderId !== null && in_array($riderId, [$row->rider_id, $row->shop_rider_id], true)) {
            return true;
        }

        return $row->parcel && ParcelAccess::role($user, $row->parcel) !== null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @param Builder<ReturnPickup> $query */
    private function listing(Builder $query, string $view, $riders): JsonResponse
    {
        $open = (clone $query)->whereIn('status', ReturnPickup::OPEN)->oldest('created_at')->get();
        $done = (clone $query)->whereNotIn('status', ReturnPickup::OPEN)->latest('updated_at')->limit(20)->get();

        return response()->json([
            'data' => $open->concat($done)->map(fn (ReturnPickup $p) => ReturnPickups::present($p, $view))->values(),
            'meta' => [
                'waiting'  => $open->where('status', ReturnPickup::STATUS_REQUESTED)->count(),
                'moving'   => $open->whereIn('status', [ReturnPickup::STATUS_ASSIGNED, ReturnPickup::STATUS_COLLECTED])->count(),
                'riders'   => collect($riders)->map(fn (Rider $r) => [
                    'id' => $r->id, 'name' => trim($r->user?->first_name . ' ' . $r->user?->last_name), 'online' => $r->isAvailable(),
                ])->values(),
            ],
        ]);
    }

    private function one(ReturnPickup $row, string $view, string $message): JsonResponse
    {
        return response()->json(['message' => $message, 'data' => ReturnPickups::present($row->fresh(), $view)]);
    }

    private function hub(Request $request): SortingCenter
    {
        return $request->user()->sortingCenter;
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    private function rider(Request $request): Rider
    {
        return Rider::with('user')->where('user_id', $request->user()->id)->firstOrFail();
    }
}
