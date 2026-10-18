<?php

namespace App\Console\Commands;

use App\Models\FlashSaleReminder;
use App\Services\Notifier;
use Illuminate\Console\Command;

/**
 * Tells each buyer who set a reminder that a flash sale is about to start (BUY-CHAT-004). Runs every minute; a
 * reminder goes out once, up to 10 minutes before the slot starts, and links to the product.
 */
class SendFlashSaleReminders extends Command
{
    protected $signature = 'flash-sales:remind';

    protected $description = 'Notify buyers whose flash sale starts within 10 minutes';

    public function handle(Notifier $notifier): int
    {
        $sent = 0;
        FlashSaleReminder::with(['flashSale.product:id,name', 'user'])
            ->whereNull('notified_at')
            ->whereHas('flashSale', fn ($q) => $q->whereNull('ended_at')
                ->where('slot_start', '<=', now()->addMinutes(10))
                ->where('slot_end', '>', now()))
            ->chunkById(200, function ($reminders) use ($notifier, &$sent) {
                foreach ($reminders as $reminder) {
                    $sale = $reminder->flashSale;
                    if (! $sale?->product || ! $reminder->user) {
                        $reminder->update(['notified_at' => now()]);
                        continue;
                    }
                    $when = $sale->slot_start->isPast() ? 'is live now' : 'starts at ' . $sale->slot_start->setTimezone('Asia/Manila')->format('g:i A');
                    $notifier->send($reminder->user, 'flash.reminder', 'Flash sale starting',
                        "{$sale->product->name} {$when}: ₱" . number_format((float) $sale->flash_price, 2) . " for {$sale->remaining()} units only.",
                        "/products/{$sale->product_id}", ['flash_sale_id' => $sale->id, 'product_id' => $sale->product_id]);
                    $reminder->update(['notified_at' => now()]);
                    $sent++;
                }
            });

        $this->info("Sent {$sent} flash sale reminder(s).");

        return self::SUCCESS;
    }
}
