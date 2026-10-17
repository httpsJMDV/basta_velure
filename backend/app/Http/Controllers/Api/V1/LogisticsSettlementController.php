<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CourierSettlement;
use App\Models\HubEarning;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Services\DirectSettlement;
use App\Support\Gcash;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A courier company's side of the money: the weekly statement with each shop, paying its riders and hubs their
 * shares of the delivery fees, and the GCash shops pay it on.
 */
class LogisticsSettlementController extends Controller
{
    public function __construct(private DirectSettlement $money) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/settlements: the last eight weeks, one line per shop. */
    public function index(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $toReceive = 0;
        $toPay = 0;
        $weeks = [];

        foreach ($this->money->recentWeeks(8) as [$from, $to]) {
            $lines = $this->money->courierLines($from, $to, $company->id)->map(function (array $line) use ($from, &$toReceive, &$toPay) {
                $settlement = $this->money->settlementFor($line['company_id'], $line['seller_id'], $from);
                if (! $settlement) {
                    // From the courier's side: a positive net is money it owes the shop.
                    $line['net_cents'] > 0 ? $toPay += $line['net_cents'] : $toReceive += -$line['net_cents'];
                }
                $profile = SellerProfile::where('user_id', $line['seller_id'])->first();

                return [
                    ...SellerSettlementController::amounts($line),
                    'seller' => [
                        'id'        => $line['seller_id'],
                        'shop_name' => $profile?->shop_name ?? 'Shop',
                        'logo_url'  => $profile?->logo_url,
                        'gcash'     => $profile?->gcash_number ? ['name' => $profile->gcash_account_name, 'number' => Gcash::format($profile->gcash_number)] : null,
                    ],
                    'settlement' => SellerSettlementController::settlement($settlement),
                ];
            })->values();

            if ($lines->isNotEmpty()) {
                $weeks[] = ['start' => $from->toDateString(), 'end' => $to->toDateString(), 'lines' => $lines];
            }
        }

        return response()->json(['data' => [
            'weeks'  => $weeks,
            'totals' => ['to_receive' => (float) Money::fromCents($toReceive), 'to_pay' => (float) Money::fromCents($toPay)],
        ]]);
    }

    /** POST /logistics/settlements: the courier sent a shop the cash it collected for a week. */
    public function pay(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $data = $request->validate(['seller_id' => ['required', 'integer'], 'week_start' => ['required', 'date'], 'reference' => ['required', 'string']]);
        $reference = SellerSettlementController::reference($data['reference']);
        [$from, $to] = $this->money->week($data['week_start']);
        abort_if($from->isSameWeek(CarbonImmutable::now(DirectSettlement::TZ)), 422, 'A week can be settled once it is over.');

        $line = $this->money->courierLines($from, $to, $company->id, (int) $data['seller_id'])->firstWhere('seller_id', (int) $data['seller_id']);
        abort_unless($line && DirectSettlement::direction($line['net_cents']) === 'courier_pays', 422, 'You do not owe this shop anything for that week.');
        abort_if($this->money->settlementFor($line['company_id'], $line['seller_id'], $from), 422, 'That week is already settled.');

        $settlement = $this->money->recordCourierPayment($line, $from, $to, $reference, $request->user()->id);

        return response()->json(['data' => SellerSettlementController::settlement($settlement)], 201);
    }

    /** POST /logistics/settlements/{settlement}/confirm: the courier got the shop's payment. */
    public function confirm(Request $request, CourierSettlement $settlement): JsonResponse
    {
        abort_unless((int) $settlement->logistics_company_id === (int) $this->company($request)->id, 404);
        abort_unless((float) $settlement->net_amount < 0, 422, 'Only the side that received a payment can confirm it.');
        abort_if($settlement->confirmed_at, 422, 'Already confirmed.');
        $settlement->update(['confirmed_at' => now(), 'confirmed_by' => $request->user()->id]);

        return response()->json(['data' => SellerSettlementController::settlement($settlement->fresh())]);
    }

    /** GET /logistics/payouts: what each rider and hub of the network is owed, and when they were last paid. */
    public function payouts(Request $request): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->pluck('id');

        $riders = Rider::with(['user:id,first_name,last_name,avatar_path', 'sortingCenter:id,hub_name'])
            ->whereIn('sorting_center_id', $hubIds)->get()
            ->map(function (Rider $r) {
                $unpaid = RiderEarning::where('rider_id', $r->id)->whereNull('paid_at');
                return [
                    'id'           => $r->id,
                    'name'         => $r->user ? trim($r->user->first_name . ' ' . $r->user->last_name) : 'Rider',
                    'avatar_url'   => $r->user?->avatar_url,
                    'hub_name'     => $r->sortingCenter?->hub_name,
                    'gcash'        => $r->gcash_number ? ['name' => $r->gcash_name, 'number' => Gcash::format($r->gcash_number)] : null,
                    'unpaid'       => (float) Money::fromCents(Money::toCents((string) (clone $unpaid)->sum('amount'))),
                    'unpaid_count' => (clone $unpaid)->count(),
                    'last_paid_at' => RiderEarning::where('rider_id', $r->id)->max('paid_at'),
                ];
            })
            ->filter(fn ($r) => $r['unpaid_count'] > 0 || $r['last_paid_at'])
            ->sortByDesc('unpaid')->values();

        $hubs = SortingCenter::whereIn('id', $hubIds)->get()->map(function (SortingCenter $h) {
            $unpaid = HubEarning::where('sorting_center_id', $h->id)->whereNull('paid_at');
            return [
                'id'           => $h->id,
                'name'         => $h->hub_name,
                'gcash'        => $h->gcash_number ? ['name' => $h->gcash_name, 'number' => Gcash::format($h->gcash_number)] : null,
                'unpaid'       => (float) Money::fromCents(Money::toCents((string) (clone $unpaid)->sum('amount'))),
                'unpaid_count' => (clone $unpaid)->count(),
                'last_paid_at' => HubEarning::where('sorting_center_id', $h->id)->max('paid_at'),
            ];
        })->filter(fn ($h) => $h['unpaid_count'] > 0 || $h['last_paid_at'])->sortByDesc('unpaid')->values();

        return response()->json(['data' => ['riders' => $riders, 'hubs' => $hubs]]);
    }

    /** POST /logistics/payouts/riders/{rider}: everything the rider was owed is paid. */
    public function payRider(Request $request, Rider $rider): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->pluck('id');
        abort_unless($hubIds->contains($rider->sorting_center_id), 404);
        $reference = SellerSettlementController::reference((string) $request->input('reference', ''));

        $count = RiderEarning::where('rider_id', $rider->id)->whereNull('paid_at')->update(['paid_at' => now(), 'paid_reference' => $reference]);
        abort_if($count === 0, 422, 'This rider has nothing unpaid.');

        return response()->json(['data' => ['paid_count' => $count]]);
    }

    /** POST /logistics/payouts/hubs/{hub}: everything the hub was owed is paid. */
    public function payHub(Request $request, SortingCenter $hub): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->pluck('id');
        abort_unless($hubIds->contains($hub->id), 404);
        $reference = SellerSettlementController::reference((string) $request->input('reference', ''));

        $count = HubEarning::where('sorting_center_id', $hub->id)->whereNull('paid_at')->update(['paid_at' => now(), 'paid_reference' => $reference]);
        abort_if($count === 0, 422, 'This hub has nothing unpaid.');

        return response()->json(['data' => ['paid_count' => $count]]);
    }
}
