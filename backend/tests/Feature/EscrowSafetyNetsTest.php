<?php

namespace Tests\Feature;

use App\Console\Commands\CheckSchedulerRunning;
use App\Enums\OrderStatus;
use App\Models\PayoutRequest;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Support\BuildsEscrowOrders;
use Tests\TestCase;

/**
 * Safety nets around the 2.8 escrow rule: money that cannot get stuck, a way to tell whether the
 * scheduler is running, and a dashboard balance that agrees with the earnings page.
 */
class EscrowSafetyNetsTest extends TestCase
{
    use BuildsEscrowOrders;
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Carbon::setTestNow(Carbon::parse('2026-10-20 12:00:00'));
        Cache::flush();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── stuck money: items with no release date ──────────────────────────────

    public function test_release_due_dates_and_releases_an_item_that_has_no_release_date_once_the_hold_is_over(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $order->forceFill(['completed_at' => now()->subDays(8)])->save(); // hold is 7 days
        $before = $this->moneySnapshot($order);

        $this->artisan('payouts:release-due')
            ->expectsOutputToContain('released 1 item(s) (1 had no release date and were dated from completed_at)')
            ->assertSuccessful();

        $item = $order->items()->first();
        $this->assertSame('available', $item->payout_status);
        // The date it would have had: completed_at plus the hold, not "now".
        $this->assertEquals(now()->subDays(8)->addDays(7)->getTimestamp(), $item->escrow_release_at->getTimestamp());
        $this->assertEquals($before, $this->moneySnapshot($order));

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 0 item(s)')->assertSuccessful();
    }

    public function test_release_due_leaves_an_undated_item_alone_while_the_hold_is_still_running(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $order->forceFill(['completed_at' => now()->subDays(3)])->save();

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 0 item(s)')->assertSuccessful();

        $this->assertSame('pending_release', $order->items()->first()->payout_status);
        $this->assertNull($order->items()->first()->escrow_release_at);
    }

    public function test_release_due_never_guesses_a_date_for_an_order_without_completed_at_and_warns(): void
    {
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']); // completed_at is null

        $this->artisan('payouts:release-due')
            ->expectsOutputToContain('released 0 item(s)')
            ->expectsOutputToContain('neither a release date nor a completion time')
            ->assertSuccessful();

        $this->assertSame('pending_release', $order->items()->first()->payout_status);
    }

    public function test_the_repair_never_touches_orders_that_are_not_completed_or_items_that_are_not_pending(): void
    {
        $delivered = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release']);
        $cancelled = $this->makeOrder(OrderStatus::CANCELLED, ['pending_release']);
        $returned = $this->makeOrder(OrderStatus::RETURNED, ['pending_release']);
        $disputed = $this->makeOrder(OrderStatus::DISPUTED, ['pending_release']);
        $disbursed = $this->makeOrder(OrderStatus::COMPLETED, ['disbursed']);
        foreach ([$delivered, $cancelled, $returned, $disputed, $disbursed] as $order) {
            $order->forceFill(['completed_at' => now()->subDays(30)])->save();
        }

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 0 item(s)')->assertSuccessful();

        foreach ([$delivered, $cancelled, $returned, $disputed] as $order) {
            $this->assertSame('pending_release', $order->items()->first()->payout_status);
        }
        $this->assertSame('disbursed', $disbursed->items()->first()->payout_status);
    }

    public function test_the_repair_uses_the_configured_hold_length(): void
    {
        config(['payouts.escrow_hold_days' => 0]);
        $order = $this->makeOrder(OrderStatus::COMPLETED, ['pending_release']);
        $order->forceFill(['completed_at' => now()->subMinute()])->save();

        $this->artisan('payouts:release-due')->expectsOutputToContain('released 1 item(s)')->assertSuccessful();

        $this->assertSame('available', $order->items()->first()->payout_status);
    }

    // ─── scheduler check ──────────────────────────────────────────────────────

    public function test_scheduler_check_fails_when_there_is_no_heartbeat(): void
    {
        $this->artisan('scheduler:check')
            ->expectsOutputToContain('does not appear to be running')
            ->assertFailed();
    }

    public function test_scheduler_check_passes_with_a_fresh_heartbeat_and_fails_when_it_goes_stale(): void
    {
        Cache::put(CheckSchedulerRunning::HEARTBEAT_KEY, now()->subMinutes(2)->toIso8601String(), now()->addDay());
        $this->artisan('scheduler:check')->expectsOutputToContain('is running')->assertSuccessful();

        Carbon::setTestNow(now()->addMinutes(10));
        $this->artisan('scheduler:check')->expectsOutputToContain('appears to have stopped')->assertFailed();
        // The limit is adjustable.
        $this->artisan('scheduler:check', ['--max-age' => 30])->assertSuccessful();
    }

    public function test_the_scheduler_writes_the_heartbeat_every_minute(): void
    {
        $this->artisan('schedule:list')->expectsOutputToContain('scheduler-heartbeat')->assertSuccessful();

        $this->artisan('schedule:run')->assertSuccessful();

        $this->assertNotNull(Cache::get(CheckSchedulerRunning::HEARTBEAT_KEY));
        $this->artisan('scheduler:check')->assertSuccessful();
    }

    // ─── dashboard balance agrees with the earnings page ──────────────────────

    public function test_the_dashboard_balance_is_real_and_matches_the_earnings_page(): void
    {
        $seller = $this->makeApprovedSeller();
        $buyer = $this->makeUser('buyer');

        // Money in three states: released, still in escrow (delivered), and in transit.
        $this->makeOrder(OrderStatus::COMPLETED, ['available', 'available'], now()->subDays(9), $buyer, $seller);
        $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now()->subDay(), $buyer, $seller);
        $this->makeOrder(OrderStatus::OUT_FOR_DELIVERY, ['pending_release'], null, $buyer, $seller);
        // Cancelled and returned orders count for nothing. (Under the 2.8 rule a returned order's money never
        // left escrow, so it stays pending and is excluded from the pending balance too.)
        $this->makeOrder(OrderStatus::CANCELLED, ['pending_release'], null, $buyer, $seller);
        $this->makeOrder(OrderStatus::RETURNED, ['pending_release'], now()->subDays(5), $buyer, $seller);

        // A P500 payout already requested and a P200 one completed.
        PayoutRequest::create(['seller_id' => $seller->id, 'reference_code' => 'PO-T-1', 'amount' => 500, 'gcash_number' => '09171111111', 'gcash_name' => 'S', 'status' => 'pending']);
        PayoutRequest::create(['seller_id' => $seller->id, 'reference_code' => 'PO-T-2', 'amount' => 200, 'gcash_number' => '09171111111', 'gcash_name' => 'S', 'status' => 'completed']);

        $earnings = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/earnings')->assertOk()->json('data');
        $balance = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/dashboard/stats')->assertOk()->json('data.balance');

        // 2 released items (2 x 1035) minus requests (500 + 200); 2 items in escrow; 200 paid out.
        $this->assertEquals(1370.0, $earnings['available_balance']);
        $this->assertEquals(2070.0, $earnings['pending_balance']);
        $this->assertEquals(200.0, $earnings['total_paid_out']);

        $this->assertEquals($earnings['available_balance'], $balance['available']);
        $this->assertEquals($earnings['pending_balance'], $balance['pending']);
        $this->assertEquals($earnings['total_paid_out'], $balance['total_paid_out']);

        // The earnings summary keeps exactly the keys it had before.
        $this->assertEqualsCanonicalizing(
            ['available_balance', 'pending_balance', 'total_paid_out', 'lifetime_earnings', 'total_commission_paid'],
            array_keys($earnings)
        );
    }

    public function test_a_seller_with_nothing_sees_zeros_not_a_made_up_balance(): void
    {
        $seller = $this->makeApprovedSeller();

        $balance = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/dashboard/stats')->assertOk()->json('data.balance');

        $this->assertEquals(['pending' => 0, 'available' => 0, 'total_paid_out' => 0], $balance);
    }
}
