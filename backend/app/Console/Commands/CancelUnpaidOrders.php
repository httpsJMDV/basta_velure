<?php

namespace App\Console\Commands;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\PaymentSession;
use App\Services\Commerce\OrderCanceller;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Cancels e-wallet and card orders not paid within 1 hour of being placed (A6, B9): stock and vouchers come back
 * (OrderCanceller), and the open payment attempts close. Safe to run repeatedly; scheduled every minute.
 */
class CancelUnpaidOrders extends Command
{
    protected $signature = 'orders:cancel-unpaid';

    protected $description = 'Cancel e-wallet and card orders that were not paid within 1 hour';

    public function handle(OrderCanceller $canceller): int
    {
        $cancelled = 0;
        Order::whereIn('payment_method', Order::GATEWAY_METHODS)
            ->whereIn('payment_status', ['pending', 'failed'])
            ->where('status', OrderStatus::PLACED->value)
            ->whereNotNull('payment_due_at')
            ->where('payment_due_at', '<=', now())
            ->orderBy('id')
            ->chunkById(100, function ($orders) use ($canceller, &$cancelled) {
                foreach ($orders as $order) {
                    try {
                        $canceller->cancel($order, 'system', null, 'Not paid within 1 hour');
                        $cancelled++;
                    } catch (\Throwable $e) {
                        Log::warning('Could not cancel an unpaid order.', ['order_id' => $order->id, 'error' => $e->getMessage()]);
                    }
                }
            });
        PaymentSession::where('status', 'pending')->where('expires_at', '<=', now())->update(['status' => 'expired']);

        $this->info("orders:cancel-unpaid: cancelled {$cancelled} order(s).");

        return self::SUCCESS;
    }
}
