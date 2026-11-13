<?php

namespace App\Services;

use App\Models\Order;
use App\Models\User;
use App\Services\Commerce\OrderCanceller;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/** Observable order patterns for review, never a fraud verdict or an automatic enforcement action. */
class BuyerRiskService
{
    private const SCORE = '(CASE WHEN buyer_cancellations >= 3 AND buyer_cancellations * 2 >= order_count THEN 35 ELSE 0 END
        + CASE WHEN COALESCE(refused_parcels, 0) >= 2 THEN 40 ELSE 0 END
        + CASE WHEN failed_payments >= 3 THEN 15 ELSE 0 END
        + CASE WHEN hourly_checkouts >= 5 THEN 10 ELSE 0 END)';

    public function query(): Builder
    {
        $orders = Order::query()->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('buyer_id, COUNT(*) AS order_count,
                SUM(CASE WHEN status = ? AND cancelled_by = ? THEN 1 ELSE 0 END) AS buyer_cancellations,
                SUM(CASE WHEN payment_status = ? THEN 1 ELSE 0 END) AS failed_payments,
                COUNT(DISTINCT CASE WHEN created_at >= ? THEN COALESCE(checkout_group_id, CONCAT(?, id)) END) AS hourly_checkouts',
                ['CANCELLED', 'buyer', 'failed', now()->subHour(), 'order:'])
            ->groupBy('buyer_id');

        // Count distinct parcels, not repeated attempts; respect COD restoration and soft deletions.
        $refusals = DB::table('delivery_logs as dl')->join('parcels as p', 'p.id', '=', 'dl.parcel_id')
            ->join('orders as o', 'o.id', '=', 'p.order_id')->join('users as u', 'u.id', '=', 'o.buyer_id')
            ->whereNull('dl.deleted_at')->whereNull('p.deleted_at')->whereNull('o.deleted_at')
            ->where('dl.logged_at', '>=', now()->subDays(30))
            ->where(fn ($q) => $q->whereNull('u.cod_refusals_reset_at')->orWhereColumn('dl.logged_at', '>', 'u.cod_refusals_reset_at'))
            ->where('dl.outcome', 'DELIVERY_FAILED')->where('dl.notes', 'like', 'REFUSED:%')
            ->selectRaw('o.buyer_id, COUNT(DISTINCT p.id) AS refused_parcels')->groupBy('o.buyer_id');

        return DB::table('users as buyers')->joinSub($orders, 'activity', 'activity.buyer_id', '=', 'buyers.id')
            ->leftJoinSub($refusals, 'refusals', 'refusals.buyer_id', '=', 'buyers.id')
            ->whereNull('buyers.deleted_at')->where('buyers.role', 'buyer')
            ->select('buyers.id', 'buyers.first_name', 'buyers.last_name', 'buyers.email', 'buyers.status',
                'activity.order_count', 'activity.buyer_cancellations', 'activity.failed_payments', 'activity.hourly_checkouts')
            ->selectRaw('COALESCE(refused_parcels, 0) AS refused_parcels, '.self::SCORE.' AS score');
    }

    public function filterLevel(Builder $query, string $level): Builder
    {
        return match ($level) {
            'high' => $query->whereRaw(self::SCORE.' >= 40'),
            'medium' => $query->whereRaw(self::SCORE.' >= 15 AND '.self::SCORE.' < 40'),
            'low' => $query->whereRaw(self::SCORE.' < 15'),
            'all' => $query,
            default => $query->whereRaw(self::SCORE.' >= 15'),
        };
    }

    public function present(object $row): array
    {
        $facts = [];
        if ($row->buyer_cancellations >= 3 && $row->buyer_cancellations * 2 >= $row->order_count) {
            $facts[] = ['code' => 'buyer_cancellations', 'label' => 'Repeated buyer cancellations',
                'detail' => "{$row->buyer_cancellations} of {$row->order_count} orders were cancelled by the buyer."];
        }
        if ($row->refused_parcels >= 2) {
            $facts[] = ['code' => 'refused_parcels', 'label' => 'Repeated parcel refusals',
                'detail' => "{$row->refused_parcels} distinct parcels recorded as refused by the recipient."];
        }
        if ($row->failed_payments >= 3) {
            $facts[] = ['code' => 'failed_payments', 'label' => 'Repeated payment failures',
                'detail' => "{$row->failed_payments} orders have a failed payment. Check for gateway problems first."];
        }
        if ($row->hourly_checkouts >= 5) {
            $facts[] = ['code' => 'checkout_burst', 'label' => 'Unusual checkout activity',
                'detail' => "{$row->hourly_checkouts} separate checkouts in the last hour. Multi-shop orders count once per checkout."];
        }

        return [
            'id' => (int) $row->id, 'name' => trim($row->first_name.' '.$row->last_name),
            'email' => $row->email, 'status' => $row->status,
            'score' => (int) $row->score, 'level' => $row->score >= 40 ? 'high' : ($row->score >= 15 ? 'medium' : 'low'),
            'order_count' => (int) $row->order_count, 'buyer_cancellations' => (int) $row->buyer_cancellations,
            'failed_payments' => (int) $row->failed_payments, 'refused_parcels' => (int) $row->refused_parcels,
            'hourly_checkouts' => (int) $row->hourly_checkouts, 'signals' => $facts,
        ];
    }

    public function detail(User $buyer): array
    {
        abort_unless($buyer->role === 'buyer', 404);
        $row = $this->query()->where('buyers.id', $buyer->id)->first();
        $data = $row ? $this->present($row) : [
            'id' => $buyer->id, 'name' => trim($buyer->first_name.' '.$buyer->last_name), 'email' => $buyer->email,
            'status' => $buyer->status, 'score' => 0, 'level' => 'low', 'order_count' => 0,
            'buyer_cancellations' => 0, 'failed_payments' => 0, 'refused_parcels' => 0, 'hourly_checkouts' => 0, 'signals' => [],
        ];
        $data['orders'] = Order::where('buyer_id', $buyer->id)->with('parcel')->latest('id')->limit(50)->get()->map(fn (Order $order) => [
            'id' => $order->id, 'order_number' => $order->order_number, 'status' => $order->status->value,
            'total' => (float) $order->total, 'payment_status' => $order->payment_status,
            'payment_method' => $order->payment_method, 'created_at' => $order->created_at->toIso8601String(),
            'can_cancel' => self::canCancel($order),
        ])->all();

        return $data;
    }

    /** Risk review only cancels before courier pickup; in-transit issues belong in the existing order workflow. */
    public static function canCancel(Order $order): bool
    {
        return in_array($order->status, OrderCanceller::SELLER_CANCELLABLE, true)
            && ($order->relationLoaded('parcel') ? $order->parcel?->picked_up_at === null : ! $order->parcel()->whereNotNull('picked_up_at')->exists());
    }
}
