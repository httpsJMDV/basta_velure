<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CommissionPayment;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\PlatformSetting;
use App\Services\DirectSettlement;
use App\Support\Gcash;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A shop's side of direct payments: the weekly statement with each courier (the cash it collected for the shop
 * minus the delivery fees it earned), and the monthly commission owed to Loved-IT.
 */
class SellerSettlementController extends Controller
{
    public function __construct(private DirectSettlement $money) {}

    /** GET /seller/settlements: the last eight weeks, one line per courier. */
    public function index(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $toReceive = 0;
        $toPay = 0;
        $weeks = [];

        foreach ($this->money->recentWeeks(8) as [$from, $to]) {
            $lines = $this->money->courierLines($from, $to, null, $sellerId)->map(function (array $line) use ($from, &$toReceive, &$toPay) {
                $settlement = $this->money->settlementFor($line['company_id'], $line['seller_id'], $from);
                if (! $settlement) {
                    $line['net_cents'] > 0 ? $toReceive += $line['net_cents'] : $toPay += -$line['net_cents'];
                }
                $company = LogisticsCompany::find($line['company_id']);

                return [
                    ...self::amounts($line),
                    'company' => $company ? [
                        'id' => $company->id, 'name' => $company->name, 'code' => $company->code, 'logo_url' => $company->logo_url,
                        'gcash' => $company->gcash_number ? ['name' => $company->gcash_name, 'number' => Gcash::format($company->gcash_number)] : null,
                    ] : null,
                    'settlement' => self::settlement($settlement),
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

    /** POST /seller/settlements: the shop sent a courier what it owed for a week. */
    public function pay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer'],
            'week_start' => ['required', 'date'],
            'reference'  => ['required', 'string'],
        ]);
        $reference = self::reference($data['reference']);
        [$from, $to] = $this->money->week($data['week_start']);
        abort_if($from->isSameWeek(CarbonImmutable::now(DirectSettlement::TZ)), 422, 'A week can be settled once it is over.');

        $line = $this->money->courierLines($from, $to, (int) $data['company_id'], $request->user()->id)->firstWhere('company_id', (int) $data['company_id']);
        abort_unless($line && DirectSettlement::direction($line['net_cents']) === 'seller_pays', 422, 'You do not owe this courier anything for that week.');
        abort_if($this->money->settlementFor($line['company_id'], $line['seller_id'], $from), 422, 'That week is already settled.');

        $settlement = $this->money->recordCourierPayment($line, $from, $to, $reference, $request->user()->id);

        return response()->json(['data' => self::settlement($settlement)], 201);
    }

    /** POST /seller/settlements/{settlement}/confirm: the shop got the courier's payment. */
    public function confirm(Request $request, CourierSettlement $settlement): JsonResponse
    {
        abort_unless((int) $settlement->seller_id === (int) $request->user()->id, 404);
        abort_unless((float) $settlement->net_amount > 0, 422, 'Only the side that received a payment can confirm it.');
        abort_if($settlement->confirmed_at, 422, 'Already confirmed.');
        $settlement->update(['confirmed_at' => now(), 'confirmed_by' => $request->user()->id]);

        return response()->json(['data' => self::settlement($settlement->fresh())]);
    }

    /** GET /seller/commission: the last six months of commission on completed direct orders. */
    public function commission(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        [$current] = $this->money->month();
        $months = [];
        foreach (range(0, 5) as $i) {
            $from = $current->subMonths($i)->startOfMonth();
            $to = $from->endOfMonth();
            $line = $this->money->commissionLines($from, $to, $sellerId)->get($sellerId);
            $payment = $this->money->commissionPaymentFor($sellerId, $from);
            if (! $line && ! $payment) {
                continue;
            }
            $months[] = [
                'period'       => $from->toDateString(),
                'label'        => $from->format('F Y'),
                'in_progress'  => $i === 0,
                'orders_count' => $line['orders_count'] ?? $payment?->orders_count ?? 0,
                'amount'       => (float) Money::fromCents($line['cents'] ?? 0),
                'payment'      => self::commissionPayment($payment),
            ];
        }

        return response()->json(['data' => [
            'months'         => $months,
            'platform_gcash' => self::platformGcash(),
        ]]);
    }

    /** POST /seller/commission: the shop paid Loved-IT a finished month's commission. */
    public function payCommission(Request $request): JsonResponse
    {
        $data = $request->validate(['period' => ['required', 'date'], 'reference' => ['required', 'string']]);
        $reference = self::reference($data['reference']);
        $sellerId = $request->user()->id;
        [$from, $to] = $this->money->month($data['period']);
        abort_if($from->isSameMonth(CarbonImmutable::now(DirectSettlement::TZ)), 422, 'A month can be paid once it is over.');

        $line = $this->money->commissionLines($from, $to, $sellerId)->get($sellerId);
        abort_unless($line && $line['cents'] > 0, 422, 'There is no commission to pay for that month.');
        abort_if($this->money->commissionPaymentFor($sellerId, $from), 422, 'That month is already paid.');

        $payment = CommissionPayment::create([
            'seller_id'    => $sellerId,
            'period'       => $from->toDateString(),
            'orders_count' => $line['orders_count'],
            'amount'       => Money::fromCents($line['cents']),
            'reference'    => $reference,
            'paid_at'      => now(),
        ]);

        return response()->json(['data' => self::commissionPayment($payment)], 201);
    }

    // ── Shared formatting (also used by the courier and admin controllers) ──

    /** @param array{orders_count: int, cod_cents: int, fee_cents: int, net_cents: int} $line */
    public static function amounts(array $line): array
    {
        return [
            'orders_count'  => $line['orders_count'],
            'cod_collected' => (float) Money::fromCents($line['cod_cents']),
            'courier_fees'  => (float) Money::fromCents($line['fee_cents']),
            'net'           => (float) Money::fromCents(abs($line['net_cents'])),
            'direction'     => DirectSettlement::direction($line['net_cents']),
        ];
    }

    public static function settlement(?CourierSettlement $s): ?array
    {
        return $s ? [
            'id'           => $s->id,
            'reference'    => $s->reference,
            'amount'       => (float) abs((float) $s->net_amount),
            'paid_by'      => (float) $s->net_amount > 0 ? 'courier' : 'seller',
            'paid_at'      => $s->paid_at?->toIso8601String(),
            'confirmed_at' => $s->confirmed_at?->toIso8601String(),
        ] : null;
    }

    public static function commissionPayment(?CommissionPayment $p): ?array
    {
        return $p ? [
            'id'           => $p->id,
            'amount'       => (float) $p->amount,
            'reference'    => $p->reference,
            'paid_at'      => $p->paid_at?->toIso8601String(),
            'confirmed_at' => $p->confirmed_at?->toIso8601String(),
        ] : null;
    }

    /** Loved-IT's own GCash, where shops pay commission (set by an admin). */
    public static function platformGcash(): ?array
    {
        $number = Gcash::normalize((string) PlatformSetting::get('platform_gcash_number', ''));

        return $number ? ['name' => (string) PlatformSetting::get('platform_gcash_name', 'Loved-IT'), 'number' => Gcash::format($number)] : null;
    }

    /** A 13-digit GCash transfer reference, or a 422. */
    public static function reference(string $value): string
    {
        $reference = Gcash::reference($value);
        if (strlen($reference) !== 13) {
            throw \Illuminate\Validation\ValidationException::withMessages(['reference' => 'Enter the 13-digit reference number of the GCash transfer.']);
        }

        return $reference;
    }
}
