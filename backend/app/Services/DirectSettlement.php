<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\CommissionPayment;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Support\Money;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * The money of direct orders (buyers pay the shop's GCash or the rider in cash), worked out from the orders so
 * the shop, the courier and the admin always see the same figures. It only reads, except recording payments.
 *
 * Courier and shop, per week (Monday to Sunday, Philippine time, by the day the parcel was delivered):
 *   cash collected on delivery (COD order totals) − delivery fees the courier earned (courier_fee) = net.
 *   A positive net is owed by the courier to the shop; a negative one by the shop to the courier
 *   (GCash orders and free-delivery orders leave the fee with the shop).
 *
 * Shop and Loved-IT, per month: the commission recorded on the shop's direct orders completed that month.
 */
class DirectSettlement
{
    public const TZ = 'Asia/Manila';

    /** The week (Monday 00:00 to Sunday 23:59:59 in Manila) containing $day, today by default. */
    public function week(?string $day = null): array
    {
        $d = $day ? CarbonImmutable::parse($day, self::TZ) : CarbonImmutable::now(self::TZ);
        $from = $d->startOfWeek(CarbonImmutable::MONDAY)->startOfDay();

        return [$from, $from->addDays(6)->endOfDay()];
    }

    /** @return array<int, array{0: CarbonImmutable, 1: CarbonImmutable}> the last $count weeks, newest first */
    public function recentWeeks(int $count = 6): array
    {
        [$from] = $this->week();

        return array_map(fn ($i) => [$from->subWeeks($i), $from->subWeeks($i)->addDays(6)->endOfDay()], range(0, $count - 1));
    }

    /**
     * One line per courier and shop with direct orders delivered in the week.
     *
     * @return Collection<int, array{company_id: int, seller_id: int, orders_count: int, cod_cents: int, fee_cents: int, net_cents: int}>
     */
    public function courierLines(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId = null, ?int $sellerId = null): Collection
    {
        $defaultId = LogisticsCompany::defaultId();

        $query = Order::query()
            ->where('settlement', Order::SETTLEMENT_DIRECT)
            ->whereHas('parcel', fn ($q) => $q->whereBetween('delivered_at', [$from->utc(), $to->utc()]))
            ->with('items:id,order_id,seller_id');
        if ($companyId) {
            LogisticsCompany::constrain($query, $companyId);
        }
        if ($sellerId) {
            $query->whereHas('items', fn ($i) => $i->where('seller_id', $sellerId));
        }

        $lines = [];
        foreach ($query->get(['id', 'logistics_company_id', 'payment_method', 'total', 'courier_fee', 'shipping_fee']) as $order) {
            $seller = (int) ($order->items->first()?->seller_id ?? 0);
            $company = (int) ($order->logistics_company_id ?? $defaultId);
            if (! $seller || ! $company) {
                continue;
            }
            $key = "{$company}-{$seller}";
            $lines[$key] ??= ['company_id' => $company, 'seller_id' => $seller, 'orders_count' => 0, 'cod_cents' => 0, 'fee_cents' => 0, 'net_cents' => 0];
            $lines[$key]['orders_count']++;
            if ($order->payment_method === 'cod') {
                $lines[$key]['cod_cents'] += Money::toCents((string) $order->total);
            }
            $lines[$key]['fee_cents'] += Money::toCents($order->courierFeeAmount());
        }

        return collect($lines)->map(fn ($l) => [...$l, 'net_cents' => $l['cod_cents'] - $l['fee_cents']])->values();
    }

    /** Who pays the net of a line: the courier (positive), the shop (negative), or nobody. */
    public static function direction(int $netCents): string
    {
        return $netCents > 0 ? 'courier_pays' : ($netCents < 0 ? 'seller_pays' : 'none');
    }

    /** The settlement recorded for a courier, shop and week, if any. */
    public function settlementFor(int $companyId, int $sellerId, CarbonImmutable $from): ?CourierSettlement
    {
        return CourierSettlement::where('logistics_company_id', $companyId)->where('seller_id', $sellerId)
            ->whereDate('period_start', $from->toDateString())->first();
    }

    /** Records that the paying side sent the net by GCash. */
    public function recordCourierPayment(array $line, CarbonImmutable $from, CarbonImmutable $to, string $reference, int $paidBy): CourierSettlement
    {
        return CourierSettlement::create([
            'logistics_company_id' => $line['company_id'],
            'seller_id'            => $line['seller_id'],
            'period_start'         => $from->toDateString(),
            'period_end'           => $to->toDateString(),
            'orders_count'         => $line['orders_count'],
            'cod_collected'        => Money::fromCents($line['cod_cents']),
            'courier_fees'         => Money::fromCents($line['fee_cents']),
            'net_amount'           => Money::fromCents($line['net_cents']),
            'reference'            => $reference,
            'paid_by'              => $paidBy,
            'paid_at'              => now(),
        ]);
    }

    /** The month (first to last day, Manila) containing $day, this month by default. */
    public function month(?string $day = null): array
    {
        $d = $day ? CarbonImmutable::parse($day, self::TZ) : CarbonImmutable::now(self::TZ);
        $from = $d->startOfMonth();

        return [$from, $from->endOfMonth()];
    }

    /**
     * Commission per shop on direct orders completed in the month.
     *
     * @return Collection<int, array{seller_id: int, orders_count: int, cents: int}> keyed by seller id
     */
    public function commissionLines(CarbonImmutable $from, CarbonImmutable $to, ?int $sellerId = null): Collection
    {
        $orders = Order::query()
            ->where('settlement', Order::SETTLEMENT_DIRECT)
            ->where('status', OrderStatus::COMPLETED->value)
            ->whereBetween('completed_at', [$from->utc(), $to->utc()])
            ->when($sellerId, fn ($q) => $q->whereHas('items', fn ($i) => $i->where('seller_id', $sellerId)))
            ->with('items:id,order_id,seller_id,commission_amount')
            ->get(['id', 'platform_voucher_discount', 'shipping_voucher_discount']);

        // A8: Loved-IT's platform and shipping vouchers are Loved-IT's money. On a direct order the buyer paid the
        // shop (or the rider) that much less, so it is credited against the commission the shop owes.
        $lines = [];
        foreach ($orders as $order) {
            foreach ($order->items->groupBy('seller_id') as $seller => $items) {
                $lines[$seller] ??= ['seller_id' => (int) $seller, 'orders_count' => 0, 'commission_cents' => 0, 'credit_cents' => 0, 'cents' => 0];
                $lines[$seller]['orders_count']++;
                $lines[$seller]['commission_cents'] += $items->sum(fn ($i) => Money::toCents((string) $i->commission_amount));
                $lines[$seller]['credit_cents'] += Money::toCents((string) ($order->platform_voucher_discount ?? '0'))
                    + Money::toCents((string) ($order->shipping_voucher_discount ?? '0'));
            }
        }
        foreach ($lines as &$line) {
            $line['cents'] = $line['commission_cents'] - $line['credit_cents'];
        }
        unset($line);

        return collect($lines);
    }

    public function commissionPaymentFor(int $sellerId, CarbonImmutable $from): ?CommissionPayment
    {
        return CommissionPayment::where('seller_id', $sellerId)->whereDate('period', $from->toDateString())->first();
    }
}
