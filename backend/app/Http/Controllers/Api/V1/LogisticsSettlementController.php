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
use App\Services\SettlementPayments;
use App\Support\Gcash;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A courier company's side of the money: the weekly statement with each shop, paying its riders and hubs their
 * shares of the delivery fees, and the GCash shops pay it on.
 */
class LogisticsSettlementController extends Controller
{
    public function __construct(private DirectSettlement $money, private SettlementPayments $payments) {}

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
                if (! $settlement || $settlement->state() === CourierSettlement::STATE_PAY_AGAIN) {
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

    /** POST /logistics/settlements: the courier sent a shop the cash it collected for a week (multipart with a receipt). */
    public function pay(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $data = $request->validate([
            'seller_id'  => ['required', 'integer'],
            'week_start' => ['required', 'date'],
            'reference'  => ['required', 'string'],
            'receipt'    => SellerSettlementController::RECEIPT_RULE,
        ], SellerSettlementController::RECEIPT_MESSAGES);
        $reference = SellerSettlementController::reference($data['reference']);
        [$from, $to] = $this->money->week($data['week_start']);
        abort_if($from->isSameWeek(CarbonImmutable::now(DirectSettlement::TZ)), 422, 'A week can be settled once it is over.');

        $line = $this->money->courierLines($from, $to, $company->id, (int) $data['seller_id'])->firstWhere('seller_id', (int) $data['seller_id']);
        abort_unless($line && DirectSettlement::direction($line['net_cents']) === 'courier_pays', 422, 'You do not owe this shop anything for that week.');

        $settlement = $this->payments->record($line, $from, $to, $reference, $request->file('receipt'), $request->user());

        return response()->json(['data' => SellerSettlementController::settlement($settlement)], 201);
    }

    /** POST /logistics/settlements/{settlement}/confirm: the courier got the shop's payment. */
    public function confirm(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->ours($request, $settlement, 'receiver', 'Only the side that received a payment can confirm it.');

        return response()->json(['data' => SellerSettlementController::settlement($this->payments->confirm($settlement, $request->user()))]);
    }

    /** POST /logistics/settlements/{settlement}/dispute {reason}: the shop's payment did not arrive. */
    public function dispute(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->ours($request, $settlement, 'receiver', 'Only the side that should receive a payment can report it.');
        $reason = $request->validate(SellerSettlementController::DISPUTE_RULES, SellerSettlementController::DISPUTE_MESSAGES)['reason'];

        return response()->json(['data' => SellerSettlementController::settlement($this->payments->dispute($settlement, $request->user(), trim($reason)))]);
    }

    /** POST /logistics/settlements/{settlement}/receipt {receipt}: the GCash receipt of a payment the courier sent. */
    public function receipt(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->ours($request, $settlement, 'payer', 'Only the side that sent a payment can attach its receipt.');
        $request->validate(['receipt' => ['required', ...array_slice(SellerSettlementController::RECEIPT_RULE, 1)]], SellerSettlementController::RECEIPT_MESSAGES);

        return response()->json(['data' => SellerSettlementController::settlement($this->payments->attachReceipt($settlement, $request->file('receipt')))]);
    }

    /** The company's own settlement (404 otherwise), on the side the action needs ('payer' or 'receiver'). */
    private function ours(Request $request, CourierSettlement $settlement, string $as, string $wrongSide): void
    {
        abort_unless((int) $settlement->logistics_company_id === (int) $this->company($request)->id, 404);
        $side = $as === 'payer' ? $settlement->payerSide() : $settlement->receiverSide();
        abort_unless($side === 'courier', 422, $wrongSide);
    }

    /** GET /logistics/payouts: what each rider and hub of the network is owed, and when they were last paid. */
    public function payouts(Request $request): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->select('id');

        // One grouped query per table: the network has thousands of hubs, and only those with earnings are listed.
        $totals = fn ($query, string $key) => $query->selectRaw("{$key} as k, SUM(CASE WHEN paid_at IS NULL THEN amount ELSE 0 END) as unpaid,
                SUM(CASE WHEN paid_at IS NULL THEN 1 ELSE 0 END) as unpaid_count, MAX(paid_at) as last_paid_at")
            ->groupBy($key)->get()->keyBy('k');
        $riderTotals = $totals(RiderEarning::query()->whereIn('rider_id', Rider::whereIn('sorting_center_id', $hubIds)->select('id')), 'rider_id');
        $hubTotals = $totals(HubEarning::query()->whereIn('sorting_center_id', $hubIds), 'sorting_center_id');
        $row = fn ($t) => [
            'unpaid'       => (float) Money::fromCents(Money::toCents((string) ($t->unpaid ?? '0'))),
            'unpaid_count' => (int) ($t->unpaid_count ?? 0),
            'last_paid_at' => $t->last_paid_at ?? null,
        ];

        $riders = Rider::with(['user:id,first_name,last_name,avatar_path', 'sortingCenter:id,hub_name'])
            ->whereIn('id', $riderTotals->keys())->get()
            ->map(fn (Rider $r) => [
                'id'           => $r->id,
                'name'         => $r->user ? trim($r->user->first_name . ' ' . $r->user->last_name) : 'Rider',
                'avatar_url'   => $r->user?->avatar_url,
                'hub_name'     => $r->sortingCenter?->hub_name,
                'gcash'        => $r->gcash_number ? ['name' => $r->gcash_name, 'number' => Gcash::format($r->gcash_number)] : null,
            ] + $row($riderTotals[$r->id]))
            ->filter(fn ($r) => $r['unpaid_count'] > 0 || $r['last_paid_at'])
            ->sortByDesc('unpaid')->values();

        $hubs = SortingCenter::whereIn('id', $hubTotals->keys())->get()->map(fn (SortingCenter $h) => [
            'id'           => $h->id,
            'name'         => $h->hub_name,
            'gcash'        => $h->gcash_number ? ['name' => $h->gcash_name, 'number' => Gcash::format($h->gcash_number)] : null,
        ] + $row($hubTotals[$h->id]))->filter(fn ($h) => $h['unpaid_count'] > 0 || $h['last_paid_at'])->sortByDesc('unpaid')->values();

        return response()->json(['data' => ['riders' => $riders, 'hubs' => $hubs]]);
    }

    /** Read-only earning history, scoped to this courier's rider or hub. */
    public function riderHistory(Request $request, Rider $rider): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->pluck('id');
        abort_unless($hubIds->contains($rider->sorting_center_id), 404);

        return $this->earningHistory(RiderEarning::where('rider_id', $rider->id));
    }

    public function hubHistory(Request $request, SortingCenter $hub): JsonResponse
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $this->company($request)->id)->pluck('id');
        abort_unless($hubIds->contains($hub->id), 404);

        return $this->earningHistory(HubEarning::where('sorting_center_id', $hub->id));
    }

    private function earningHistory(Builder $query): JsonResponse
    {
        $page = $query->with('parcel:id,tracking_number')->orderByDesc('earned_at')->orderByDesc('id')->paginate(30);

        return response()->json(['data' => $page->getCollection()->map(fn ($earning) => [
            'id' => $earning->id, 'tracking_number' => $earning->parcel?->tracking_number,
            'kind' => $earning->kind ?? 'hub_share', 'amount' => (string) $earning->amount,
            'earned_at' => $earning->earned_at?->toIso8601String(), 'paid_at' => $earning->paid_at?->toIso8601String(),
            'paid_reference' => $earning->paid_reference,
        ]), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
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
