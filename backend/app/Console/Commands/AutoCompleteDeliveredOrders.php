<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Services\OrderStateMachine;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Completes orders whose buyer never confirmed receipt, so a forgetful buyer cannot hold a seller's
 * money forever. Only DELIVERED orders are considered: disputed, cancelled, returned and already
 * completed orders are never touched. Safe to run repeatedly.
 */
class AutoCompleteDeliveredOrders extends Command
{
    protected $signature = 'orders:auto-complete';

    protected $description = 'Complete DELIVERED orders the buyer has not confirmed within orders.auto_complete_days';

    public function handle(OrderStateMachine $stateMachine): int
    {
        $days = max(0, (int) config('orders.auto_complete_days', 3));
        $cutoff = now()->subDays($days);

        $completed = 0;
        $skipped = 0;

        // "Delivered long enough ago", judged by the parcel's or the items' delivered_at.
        Order::where('status', OrderStatus::DELIVERED->value)
            ->where(function ($q) use ($cutoff) {
                $q->whereHas('parcel', fn ($p) => $p->where('delivered_at', '<=', $cutoff))
                    ->orWhereHas('items', fn ($i) => $i->where('delivered_at', '<=', $cutoff));
            })
            ->chunkById(100, function (Collection $orders) use ($stateMachine, $days, &$completed, &$skipped) {
                foreach ($orders as $order) {
                    try {
                        // The state machine re-checks the order's status under a row lock, so an order that
                        // was confirmed, disputed or completed in the meantime is simply skipped.
                        $stateMachine->transition(
                            $order,
                            OrderStatus::COMPLETED,
                            'system',
                            null,
                            "Auto-completed after {$days} days"
                        );
                        $completed++;
                    } catch (HttpException $e) {
                        $skipped++;
                    } catch (\Throwable $e) {
                        $skipped++;
                        Log::error("orders:auto-complete failed for order #{$order->id}: {$e->getMessage()}");
                    }
                }
            });

        $message = "orders:auto-complete: completed {$completed} order(s), skipped {$skipped} (window: {$days} day(s)).";
        $this->info($message);
        Log::info($message);

        return self::SUCCESS;
    }
}
