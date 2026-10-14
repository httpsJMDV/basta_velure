<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Tests\Support\BuildsEscrowOrders;
use Tests\TestCase;

class EscrowCommandsTest extends TestCase
{
    use BuildsEscrowOrders;
    use DatabaseTransactions;

    private const NOW = '2026-10-20 12:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse(self::NOW));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ago(int $days, int $hours = 0): Carbon
    {
        return now()->subDays($days)->subHours($hours);
    }

    // ─── orders:auto-complete ─────────────────────────────────────────────────

    public function test_auto_complete_completes_only_delivered_orders_past_the_window(): void
    {
        $old = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(4));
        $justPast = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(3, 1));
        $recent = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(2));
        $today = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(0, 2));

        $this->artisan('orders:auto-complete')->expectsOutputToContain('completed 2 order(s)')->assertSuccessful();

        $this->assertEquals(OrderStatus::COMPLETED, $old->fresh()->status);
        $this->assertEquals(OrderStatus::COMPLETED, $justPast->fresh()->status);
        $this->assertEquals(OrderStatus::DELIVERED, $recent->fresh()->status);
        $this->assertEquals(OrderStatus::DELIVERED, $today->fresh()->status);
    }

    public function test_auto_complete_records_the_system_actor_the_note_and_starts_the_hold(): void
    {
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release', 'available'], $this->ago(5));
        $before = $this->moneySnapshot($order);

        $this->artisan('orders:auto-complete')->assertSuccessful();

        $history = OrderStatusHistory::where('order_id', $order->id)->where('to_status', 'COMPLETED')->first();
        $this->assertNotNull($history);
        $this->assertEquals('DELIVERED', $history->from_status);
        $this->assertEquals('system', $history->actor_type);
        $this->assertNull($history->actor_id);
        $this->assertSame('Auto-completed after 3 days', $history->note);

        $order->refresh();
        $this->assertEquals(self::NOW, $order->completed_at->format('Y-m-d H:i:s'));

        $items = $order->items()->orderBy('id')->get();
        $this->assertSame('pending_release', $items[0]->payout_status);
        $this->assertEquals(now()->addDays(7)->getTimestamp(), $items[0]->escrow_release_at->getTimestamp());
        // An item already available stays exactly as it was.
        $this->assertSame('available', $items[1]->payout_status);
        $this->assertNull($items[1]->escrow_release_at);

        $this->assertEquals($before, $this->moneySnapshot($order));
    }

    public function test_auto_complete_never_touches_disputed_cancelled_returned_failed_or_in_flight_orders(): void
    {
        $untouchable = [];
        foreach ([OrderStatus::DISPUTED, OrderStatus::CANCELLED, OrderStatus::RETURNED, OrderStatus::DELIVERY_FAILED, OrderStatus::OUT_FOR_DELIVERY, OrderStatus::COMPLETED] as $status) {
            // Even with a delivery time far in the past.
            $untouchable[$status->value] = $this->makeOrder($status, ['pending_release'], $this->ago(30));
        }
        $historyBefore = OrderStatusHistory::count();

        $this->artisan('orders:auto-complete')->expectsOutputToContain('completed 0 order(s)')->assertSuccessful();

        foreach ($untouchable as $status => $order) {
            $this->assertEquals(OrderStatus::from($status), $order->fresh()->status, "{$status} must not change");
            $this->assertNull($order->items()->first()->escrow_release_at, "{$status} must not get a release date");
        }
        $this->assertSame($historyBefore, OrderStatusHistory::count());
    }

    public function test_auto_complete_is_idempotent(): void
    {
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(4));

        $this->artisan('orders:auto-complete')->expectsOutputToContain('completed 1 order(s)')->assertSuccessful();
        $firstRelease = $order->items()->first()->escrow_release_at;
        $history = OrderStatusHistory::where('order_id', $order->id)->count();

        Carbon::setTestNow(now()->addHours(2));
        $this->artisan('orders:auto-complete')->expectsOutputToContain('completed 0 order(s)')->assertSuccessful();
        $this->artisan('orders:auto-complete')->assertSuccessful();

        $this->assertEquals($firstRelease, $order->items()->first()->escrow_release_at, 'the hold must not restart');
        $this->assertSame($history, OrderStatusHistory::where('order_id', $order->id)->count());
        $this->assertSame(1, OrderStatusHistory::where('order_id', $order->id)->where('to_status', 'COMPLETED')->count());
    }

    public function test_auto_complete_follows_the_configured_window_and_can_use_item_delivery_time(): void
    {
        // Delivery time only on the items (no parcel timestamp): still found.
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $this->ago(1), parcelOverrides: ['delivered_at' => null]);

        $this->artisan('orders:auto-complete')->assertSuccessful();
        $this->assertEquals(OrderStatus::DELIVERED, $order->fresh()->status, '1 day is inside the 3 day window');

        config(['orders.auto_complete_days' => 0]);
        $this->artisan('orders:auto-complete')->assertSuccessful();
        $this->assertEquals(OrderStatus::COMPLETED, $order->fresh()->status);
        $this->assertSame('Auto-completed after 0 days', OrderStatusHistory::where('order_id', $order->id)->where('to_status', 'COMPLETED')->value('note'));
    }

    // ─── payouts:release-due ──────────────────────────────────────────────────

    public function test_release_due_releases_only_due_items_on_completed_orders(): void
    {
        $due = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release', 'pending_release']);
        $due->items()->update(['escrow_release_at' => $this->ago(1)]);

        $exactlyNow = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $exactlyNow->items()->update(['escrow_release_at' => now()]);

        $notYet = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $notYet->items()->update(['escrow_release_at' => now()->addSecond()]);

        $noDate = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']); // never scheduled

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 3 item(s)')->assertSuccessful();

        foreach ($due->items as $item) {
            $this->assertSame('available', $item->fresh()->payout_status);
        }
        $this->assertSame('available', $exactlyNow->items()->first()->payout_status);
        $this->assertSame('pending_release', $notYet->items()->first()->payout_status);
        $this->assertSame('pending_release', $noDate->items()->first()->payout_status);
    }

    public function test_release_due_never_touches_orders_that_are_not_completed(): void
    {
        $orders = [];
        foreach ([OrderStatus::DELIVERED, OrderStatus::DISPUTED, OrderStatus::CANCELLED, OrderStatus::RETURNED, OrderStatus::DELIVERY_FAILED] as $status) {
            $order = $this->makeOrder($status, ['pending_release']);
            $order->items()->update(['escrow_release_at' => $this->ago(10)]); // long overdue, but the order is not completed
            $orders[$status->value] = $order;
        }

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 0 item(s)')->assertSuccessful();

        foreach ($orders as $status => $order) {
            $this->assertSame('pending_release', $order->items()->first()->payout_status, "{$status} must stay in escrow");
        }
    }

    public function test_release_due_never_touches_disbursed_or_already_available_items_or_any_money(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['disbursed', 'available', 'pending_release']);
        $order->items()->update(['escrow_release_at' => $this->ago(2)]);
        $before = $this->moneySnapshot($order);

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 1 item(s)')->assertSuccessful();

        $items = $order->items()->orderBy('id')->get();
        $this->assertSame('disbursed', $items[0]->payout_status);
        $this->assertSame('available', $items[1]->payout_status);
        $this->assertSame('available', $items[2]->payout_status);
        $this->assertEquals($before, $this->moneySnapshot($order));
        $this->assertEquals(2, (int) $order->items()->where('payout_status', 'available')->count());
    }

    public function test_release_due_is_idempotent(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $order->items()->update(['escrow_release_at' => $this->ago(1)]);

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 1 item(s)')->assertSuccessful();
        $this->artisan('payouts:release-due')->expectsOutputToContain('released 0 item(s)')->assertSuccessful();
        $this->artisan('payouts:release-due')->assertSuccessful();

        $this->assertSame('available', $order->items()->first()->payout_status);
    }

    public function test_release_due_handles_more_items_than_one_chunk(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, array_fill(0, 5, 'pending_release'));
        $order->items()->update(['escrow_release_at' => $this->ago(1)]);

        // Extra orders to push past a single 200-item chunk.
        $extra = [];
        for ($i = 0; $i < 41; $i++) {
            $extra[] = $this->makeOrder(OrderStatus::COMPLETED, array_fill(0, 5, 'pending_release'));
        }
        OrderItem::whereIn('order_id', collect($extra)->pluck('id'))->update(['escrow_release_at' => $this->ago(1)]);

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 210 item(s)')->assertSuccessful();

        $this->assertSame(0, OrderItem::whereIn('order_id', collect($extra)->pluck('id')->push($order->id))->where('payout_status', 'pending_release')->count());
    }

    // ─── scheduler ────────────────────────────────────────────────────────────

    public function test_both_commands_are_scheduled_hourly(): void
    {
        Artisan::call('schedule:list');
        $output = Artisan::output();

        foreach (['orders:auto-complete', 'payouts:release-due'] as $command) {
            $line = collect(explode("\n", $output))->first(fn ($l) => str_contains($l, $command));
            $this->assertNotNull($line, "{$command} must be on the schedule");
            $this->assertStringContainsString('0 * * * *', $line, "{$command} must run hourly");
        }
    }

    public function test_the_escrow_defaults_are_seven_hold_days_and_three_auto_complete_days(): void
    {
        $this->assertSame(7, config('payouts.escrow_hold_days'));
        $this->assertSame(3, config('orders.auto_complete_days'));
    }
}
