<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CommissionPayment;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\PlatformSetting;
use App\Services\DirectSettlement;
use App\Services\SettlementPayments;
use App\Support\Gcash;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A shop's side of direct payments: the weekly statement with each courier (the cash it collected for the shop
 * minus the delivery fees it earned), and the monthly commission owed to Loved-IT. A payment the shop receives can be
 * confirmed or reported as not received; a payment it sends can carry its GCash receipt (SettlementPayments).
 */
class SellerSettlementController extends Controller
{
    public function __construct(private DirectSettlement $money, private SettlementPayments $payments) {}

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
                if (! $settlement || $settlement->state() === CourierSettlement::STATE_PAY_AGAIN) {
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

    /** POST /seller/settlements: the shop sent a courier what it owed for a week (multipart when a receipt is attached). */
    public function pay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer'],
            'week_start' => ['required', 'date'],
            'reference'  => ['required', 'string'],
            'receipt'    => self::RECEIPT_RULE,
        ], self::RECEIPT_MESSAGES);
        $reference = self::reference($data['reference']);
        [$from, $to] = $this->money->week($data['week_start']);
        abort_if($from->isSameWeek(CarbonImmutable::now(DirectSettlement::TZ)), 422, 'A week can be settled once it is over.');

        $line = $this->money->courierLines($from, $to, (int) $data['company_id'], $request->user()->id)->firstWhere('company_id', (int) $data['company_id']);
        abort_unless($line && DirectSettlement::direction($line['net_cents']) === 'seller_pays', 422, 'You do not owe this courier anything for that week.');

        $settlement = $this->payments->record($line, $from, $to, $reference, $request->file('receipt'), $request->user());

        return response()->json(['data' => self::settlement($settlement)], 201);
    }

    /** POST /seller/settlements/{settlement}/confirm: the shop got the courier's payment. */
    public function confirm(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->mine($request, $settlement, 'receiver', 'Only the side that received a payment can confirm it.');

        return response()->json(['data' => self::settlement($this->payments->confirm($settlement, $request->user()))]);
    }

    /** POST /seller/settlements/{settlement}/dispute {reason}: the courier's payment did not arrive. */
    public function dispute(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->mine($request, $settlement, 'receiver', 'Only the side that should receive a payment can report it.');
        $reason = $request->validate(self::DISPUTE_RULES, self::DISPUTE_MESSAGES)['reason'];

        return response()->json(['data' => self::settlement($this->payments->dispute($settlement, $request->user(), trim($reason)))]);
    }

    /** POST /seller/settlements/{settlement}/receipt {receipt}: the GCash receipt of a payment the shop sent. */
    public function receipt(Request $request, CourierSettlement $settlement): JsonResponse
    {
        $this->mine($request, $settlement, 'payer', 'Only the side that sent a payment can attach its receipt.');
        $request->validate(['receipt' => ['required', ...array_slice(self::RECEIPT_RULE, 1)]], self::RECEIPT_MESSAGES);

        return response()->json(['data' => self::settlement($this->payments->attachReceipt($settlement, $request->file('receipt')))]);
    }

    /** The shop's own settlement (404 otherwise), on the side the action needs ('payer' or 'receiver'). */
    private function mine(Request $request, CourierSettlement $settlement, string $as, string $wrongSide): void
    {
        abort_unless((int) $settlement->seller_id === (int) $request->user()->id, 404);
        $side = $as === 'payer' ? $settlement->payerSide() : $settlement->receiverSide();
        abort_unless($side === 'seller', 422, $wrongSide);
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

    // ── Shared rules and formatting (also used by the courier and admin controllers) ──

    /** An optional screenshot of the GCash receipt. */
    public const RECEIPT_RULE = ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'];
    public const RECEIPT_MESSAGES = [
        'receipt.mimes' => 'The receipt must be a JPG, PNG or WebP picture.',
        'receipt.max'   => 'The receipt picture must be 8 MB or smaller.',
    ];
    public const DISPUTE_RULES = ['reason' => ['required', 'string', 'min:10', 'max:500']];
    public const DISPUTE_MESSAGES = [
        'reason.required' => 'Say what is wrong, for example that nothing with this reference is in your GCash.',
        'reason.min'      => 'Say a little more (at least 10 characters).',
    ];

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
            'paid_by'      => $s->payerSide(),
            'paid_at'      => $s->paid_at?->toIso8601String(),
            'confirmed_at' => $s->confirmed_at?->toIso8601String(),
            'state'        => $s->state(),
            'overdue'      => $s->isOverdue(),
            'has_receipt'  => $s->receipt_path !== null,
            'dispute'      => $s->disputed_at ? ['reason' => $s->dispute_reason, 'at' => $s->disputed_at->toIso8601String()] : null,
            'resolution'   => $s->resolved_at ? ['outcome' => $s->resolution, 'note' => $s->resolution_note, 'at' => $s->resolved_at->toIso8601String()] : null,
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
