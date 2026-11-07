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

        return $this->listing(ReturnPickup::where('sorting_center_id', $hub->id), 'hub',
            Rider::with('user')->where('sorting_center_id', $hub->id)->where('status', Rider::STATUS_ACTIVE)->carriesParcels()->get());
    }

    /** POST /hub/return-pickups/{pickup}/assign {rider_id} */
    public function hubAssign(Request $request, int $pickup): JsonResponse
    {
        $hub = $this->hub($request);
        $riderId = (int) $request->validate(['rider_id' => ['required', 'integer']], ['rider_id.required' => 'Choose a rider.'])['rider_id'];

        return DB::transaction(function () use ($request, $hub, $pickup, $riderId) {
            $row = ReturnPickup::where('sorting_center_id', $hub->id)->lockForUpdate()->findOrFail($pickup);
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
        $rows = ReturnPickup::where('rider_id', $rider->id)
            ->orderByRaw("CASE status WHEN 'assigned' THEN 0 WHEN 'collected' THEN 1 ELSE 2 END")
            ->latest('updated_at')->limit(30)->get();

        return response()->json([
            'data' => $rows->map(fn (ReturnPickup $p) => ReturnPickups::present($p, 'rider'))->values(),
            'meta' => ['open' => $rows->whereIn('status', [ReturnPickup::STATUS_ASSIGNED, ReturnPickup::STATUS_COLLECTED])->count()],
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
        if (Rider::where('user_id', $user->id)->value('id') === $row->rider_id && $row->rider_id !== null) {
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
