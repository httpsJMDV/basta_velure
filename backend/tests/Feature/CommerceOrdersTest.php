<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\PayoutRequest;
use App\Models\User;
use App\Models\Voucher;
use App\Services\Commerce\SandboxGateway;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * After Place Order (Buyer B9 to B12, Seller S8, S12, S13): payment, cancellation, returns, earnings and payouts.
 */
class CommerceOrdersTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private function setUpShop(): array
    {
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($seller, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);

        return [$buyer, $addr, $seller, $basket['Default']];
    }

    private function place($addr, $variant, int $qty, string $method, array $extra = []): array
    {
        return $this->postJson('/api/v1/checkout/place-order', $extra + [
            'address_id' => $addr->id, 'items' => [['variant_id' => $variant->id, 'quantity' => $qty]], 'payment_method' => $method,
        ])->assertCreated()->json();
    }

    private function png(string $name = 'photo.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    private function deliver(Order $order): Order
    {
        $order->update(['status' => OrderStatus::OUT_FOR_DELIVERY->value]);

        return app(OrderStateMachine::class)->transition($order->fresh(), OrderStatus::DELIVERED, 'admin', null, 'Delivered');
    }

    public function test_a_cod_order_goes_straight_to_to_ship_and_a_wallet_order_waits_in_to_pay(): void
    {
        [$buyer, $addr, , $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);

        $cod = $this->place($addr, $variant, 1, 'cod');
        $this->assertSame('to_ship', $cod['data']['tab']);
        $this->assertNull($cod['payment']);

        $wallet = $this->place($addr, $variant, 1, 'e_wallet');
        $this->assertSame('to_pay', $wallet['data']['tab']);
        $this->assertNotNull($wallet['payment']['token']);
        $this->assertEqualsWithDelta(500.00, $wallet['payment']['amount'], 0.001);

        $counts = $this->getJson('/api/v1/buyer/orders')->json('counts');
        $this->assertSame(1, $counts['to_pay']);
        $this->assertSame(1, $counts['to_ship']);
        $this->assertCount(1, $this->getJson('/api/v1/buyer/orders?tab=to_pay')->json('data'));
    }

    public function test_the_sandbox_gateway_pays_declines_and_cancels_once(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'card');
        $token = $res['payment']['token'];
        $orderId = $res['data']['id'];

        $this->postJson("/api/v1/payments/sessions/{$token}/complete", ['outcome' => 'cancel'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame('to_pay', $this->getJson("/api/v1/buyer/orders/{$orderId}")->json('data.tab'));

        $token = $this->postJson("/api/v1/buyer/orders/{$orderId}/pay-again")->assertOk()->json('data.token');
        $this->postJson("/api/v1/payments/sessions/{$token}/complete", ['outcome' => 'decline'])->assertOk()->assertJsonPath('data.status', 'failed');
        $this->assertSame('failed', Order::find($orderId)->payment_status);

        // The seller cannot accept an unpaid order.
        Sanctum::actingAs($seller);
        $this->patchJson("/api/v1/seller/orders/{$orderId}/status", ['status' => 'confirmed'])->assertStatus(422);

        Sanctum::actingAs($buyer);
        $token = $this->postJson("/api/v1/buyer/orders/{$orderId}/pay-again")->assertOk()->json('data.token');
        $this->postJson("/api/v1/payments/sessions/{$token}/complete", ['outcome' => 'success'])->assertOk()->assertJsonPath('data.status', 'paid');
        $order = Order::find($orderId);
        $this->assertSame('paid', $order->payment_status);
        $this->assertNotNull($order->payment_reference);
        $this->assertSame('to_ship', $this->getJson("/api/v1/buyer/orders/{$orderId}")->json('data.tab'));
        // A second success changes nothing (charged once).
        $this->postJson("/api/v1/payments/sessions/{$token}/complete", ['outcome' => 'success'])->assertOk()->assertJsonPath('message', 'This payment was already received.');
        $this->assertSame('pending_release', OrderItem::where('order_id', $orderId)->value('payout_status'));
    }

    public function test_the_signed_callback_marks_a_payment_after_the_browser_closed(): void
    {
        [$buyer, $addr, , $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'e_wallet');
        $token = $res['payment']['token'];

        $this->postJson('/api/v1/payments/sandbox/callback', ['token' => $token, 'status' => 'paid', 'reference' => 'GW-1', 'signature' => 'wrong'])->assertStatus(403);
        $sig = SandboxGateway::signature($token, 'paid', 'GW-1');
        $this->postJson('/api/v1/payments/sandbox/callback', ['token' => $token, 'status' => 'paid', 'reference' => 'GW-1', 'signature' => $sig])->assertOk();
        $this->postJson('/api/v1/payments/sandbox/callback', ['token' => $token, 'status' => 'paid', 'reference' => 'GW-1', 'signature' => $sig])->assertOk();
        $this->assertSame('GW-1', Order::find($res['data']['id'])->payment_reference);
    }

    public function test_an_unpaid_order_cancels_after_an_hour_and_gives_back_stock_and_voucher(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $seller, 'fixed', 50, 300, ['total_limit' => 100]);
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'e_wallet', ['vouchers' => ['store' => [$seller->id => $mch50->code]]]);
        $this->assertSame(19, $variant->fresh()->stock_quantity);
        $this->assertSame(1, $mch50->fresh()->used_count);

        // At 59 minutes the payment still goes through for another order.
        $other = $this->place($addr, $variant, 1, 'e_wallet');
        $this->travel(59)->minutes();
        $this->postJson("/api/v1/payments/sessions/{$other['payment']['token']}/complete", ['outcome' => 'success'])->assertJsonPath('data.status', 'paid');

        $this->travel(2)->minutes();
        $this->artisan('orders:cancel-unpaid')->assertSuccessful();
        $order = Order::find($res['data']['id']);
        $this->assertSame(OrderStatus::CANCELLED, $order->status);
        $this->assertSame('Not paid within 1 hour', $order->cancel_reason);
        $this->assertSame(19, $variant->fresh()->stock_quantity);
        $this->assertSame(0, $mch50->fresh()->used_count);
        $this->assertContains($mch50->code, collect($this->getJson('/api/v1/buyer/vouchers')->json('data'))->pluck('code'));
        // Paying it now is refused.
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertStatus(409);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/pay-again")->assertStatus(409);
        $this->assertSame(OrderStatus::PLACED, Order::find($other['data']['id'])->status);
    }

    public function test_the_buyer_cancels_with_a_reason_until_ready_for_pickup(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $seller, 'fixed', 50, 300, ['total_limit' => 100]);
        Sanctum::actingAs($buyer);
        $id = $this->place($addr, $variant, 2, 'cod', ['vouchers' => ['store' => [$seller->id => $mch50->code]]])['data']['id'];
        Sanctum::actingAs($seller);
        $this->patchJson("/api/v1/seller/orders/{$id}/status", ['status' => 'confirmed'])->assertOk();
        $this->assertSame(18, $variant->fresh()->stock_quantity);

        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$id}/cancel", [])->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->postJson("/api/v1/buyer/orders/{$id}/cancel", ['reason' => 'Other', 'details' => 'short'])->assertStatus(422)->assertJsonValidationErrors(['details']);
        $this->postJson("/api/v1/buyer/orders/{$id}/cancel", ['reason' => 'Changed my mind'])->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->postJson("/api/v1/buyer/orders/{$id}/cancel", ['reason' => 'Changed my mind'])->assertStatus(409);
        $this->assertSame(20, $variant->fresh()->stock_quantity);
        $this->assertSame(0, $mch50->fresh()->used_count);
        $this->assertTrue($seller->notifications()->where('data->title', 'Order cancelled')->get()->contains(fn ($n) => str_contains($n->data['body'], 'Changed my mind')));

        // Once the seller marks it Ready for Pickup there is no buyer cancel.
        $id2 = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        Order::find($id2)->update(['status' => OrderStatus::READY_FOR_PICKUP->value]);
        $this->assertFalse($this->getJson("/api/v1/buyer/orders/{$id2}")->json('data.can_cancel'));
        $this->postJson("/api/v1/buyer/orders/{$id2}/cancel", ['reason' => 'Changed my mind'])->assertStatus(409);
        $this->assertSame(OrderStatus::READY_FOR_PICKUP, Order::find($id2)->status);
    }

    public function test_cancelling_a_paid_order_refunds_the_exact_amount(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'e_wallet');
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertOk();

        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$res['data']['id']}/cancel", [])->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->postJson("/api/v1/seller/orders/{$res['data']['id']}/cancel", ['reason' => 'Out of stock'])->assertOk();
        $order = Order::find($res['data']['id']);
        $this->assertSame('refunded', $order->refund_status);
        $this->assertEqualsWithDelta(500.00, (float) $order->refund_amount, 0.001);
        $this->assertSame('Out of stock', $order->cancel_reason);
        $this->assertEqualsWithDelta(0.00, app(\App\Services\SellerBalanceCalculator::class)->forSeller($seller->id)['lifetime_earnings'], 0.001);
    }

    public function test_the_seller_can_cancel_until_the_courier_picks_up(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $id = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        Order::find($id)->update(['status' => OrderStatus::READY_FOR_PICKUP->value]);
        Parcel::create(['order_id' => $id, 'seller_id' => $seller->id, 'tracking_number' => 'TRK' . $id, 'status' => 'PICKED_UP', 'picked_up_at' => now(),
            'pickup_barangay' => 'Central', 'destination_barangay' => 'Central']);

        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$id}/cancel", ['reason' => 'Out of stock'])->assertStatus(409);
    }

    public function test_returns_need_delivery_evidence_and_follow_the_three_day_rules(): void
    {
        Storage::fake('public');
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $id = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $ok = fn () => ['reason' => 'Damaged item', 'description' => 'Basket arrived with a broken rim.', 'photos' => [$this->png('a.png'), $this->png('b.png')]];

        // Not before delivery.
        $this->post("/api/v1/buyer/orders/{$id}/request-return", $ok(), ['Accept' => 'application/json'])->assertStatus(422);
        $this->deliver(Order::find($id));

        // Evidence and description rules.
        $this->post("/api/v1/buyer/orders/{$id}/request-return", ['reason' => 'Damaged item', 'description' => 'Broken rim on arrival.', 'photos' => []], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['photos']);
        $six = array_map(fn ($i) => $this->png("p{$i}.png"), range(1, 6));
        $this->post("/api/v1/buyer/orders/{$id}/request-return", ['reason' => 'Damaged item', 'description' => 'Broken rim on arrival.', 'photos' => $six], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['photos']);
        $this->post("/api/v1/buyer/orders/{$id}/request-return", ['reason' => 'Damaged item', 'description' => '123456789', 'photos' => [$this->png()]], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['description']);

        $this->post("/api/v1/buyer/orders/{$id}/request-return", $ok(), ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.tab', 'return_refund')->assertJsonPath('data.dispute.status', 'pending');
        $this->assertCount(2, Dispute::where('order_id', $id)->first()->photos);

        // The seller rejects: a reason of 10 to 300 characters; the buyer escalates once.
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$id}/respond-return", ['action' => 'reject', 'reason' => 'Item used'])->assertStatus(422);
        $this->postJson("/api/v1/seller/orders/{$id}/respond-return", ['action' => 'reject', 'reason' => 'Item shows signs of use and the tag is removed.'])->assertOk();
        Sanctum::actingAs($buyer);
        $this->assertSame('Item shows signs of use and the tag is removed.', $this->getJson("/api/v1/buyer/orders/{$id}")->json('data.dispute.seller_reason'));
        $this->assertTrue($this->getJson("/api/v1/buyer/orders/{$id}")->json('data.dispute.can_escalate'));
        $this->postJson("/api/v1/buyer/orders/{$id}/escalate-return")->assertOk()->assertJsonPath('data.dispute.status', 'escalated');
        $this->postJson("/api/v1/buyer/orders/{$id}/escalate-return")->assertStatus(409);
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$id}/respond-return", ['action' => 'approve'])->assertStatus(409);

        // Loved-IT decides the escalated return (A31): a refund of the exact amount paid, once.
        Sanctum::actingAs(User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => Str::random(8) . '@example.com', 'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']));
        $disputeId = Dispute::where('order_id', $id)->value('id');
        $this->assertGreaterThanOrEqual(1, $this->getJson('/api/v1/admin/disputes/stats')->json('data.escalated'));
        $this->getJson("/api/v1/admin/disputes/{$disputeId}")->assertOk()
            ->assertJsonPath('data.can_decide', true)->assertJsonPath('data.seller_reason', 'Item shows signs of use and the tag is removed.')
            ->assertJsonCount(2, 'data.photos');
        $this->patchJson("/api/v1/admin/disputes/{$disputeId}/resolve", ['decision' => 'refund', 'resolution_note' => 'Photos show the rim was broken in transit.'])->assertOk();
        $order = Order::find($id);
        $this->assertSame(OrderStatus::RETURNED, $order->status);
        $this->assertSame('refunded', $order->refund_status);
        $this->assertEqualsWithDelta((float) $order->total, (float) $order->refund_amount, 0.001);
        $this->patchJson("/api/v1/admin/disputes/{$disputeId}/resolve", ['decision' => 'reject', 'resolution_note' => 'Second decision.'])->assertStatus(409);
    }

    public function test_an_unanswered_return_is_approved_after_three_days_and_refunded(): void
    {
        Storage::fake('public');
        [$buyer, $addr, , $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'e_wallet');
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertOk();
        $this->deliver(Order::find($res['data']['id']));
        $this->post("/api/v1/buyer/orders/{$res['data']['id']}/request-return", ['reason' => 'Wrong item', 'description' => 'I received a different basket.', 'photos' => [$this->png()]], ['Accept' => 'application/json'])->assertOk();

        $this->travel(2)->days();
        $this->artisan('returns:process-deadlines')->assertSuccessful();
        $this->assertSame('pending', Dispute::where('order_id', $res['data']['id'])->value('status'));
        $this->travelTo(now()->addDays(1)->addMinute());
        $this->artisan('returns:process-deadlines')->assertSuccessful();
        $order = Order::find($res['data']['id']);
        $this->assertSame(OrderStatus::RETURNED, $order->status);
        $this->assertSame('refunded', $order->refund_status);
        $this->assertTrue((bool) Dispute::where('order_id', $order->id)->value('auto_approved'));
    }

    public function test_the_return_window_closes_seven_days_after_delivery(): void
    {
        Storage::fake('public');
        [$buyer, $addr, , $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $a = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $b = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $this->deliver(Order::find($a));
        $this->deliver(Order::find($b));
        $payload = fn () => ['reason' => 'Damaged item', 'description' => 'Basket arrived with a broken rim.', 'photos' => [$this->png()]];

        $this->travel(7)->days();
        $this->post("/api/v1/buyer/orders/{$a}/request-return", $payload(), ['Accept' => 'application/json'])->assertOk();
        $this->travel(1)->hours();
        $this->post("/api/v1/buyer/orders/{$b}/request-return", $payload(), ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_earnings_become_available_when_the_buyer_confirms_receipt(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'e_wallet');
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertOk();
        $id = $res['data']['id'];
        $this->deliver(Order::find($id));

        $balances = fn () => app(\App\Services\SellerBalanceCalculator::class)->forSeller($seller->id);
        $this->assertEqualsWithDelta(427.50, $balances()['pending_balance'], 0.001);
        $this->assertEqualsWithDelta(0.00, $balances()['available_balance'], 0.001);
        $this->postJson("/api/v1/buyer/orders/{$id}/confirm-receipt")->assertOk();
        $this->assertEqualsWithDelta(427.50, $balances()['available_balance'], 0.001);
        $this->assertEqualsWithDelta(0.00, $balances()['pending_balance'], 0.001);

        // A delivered order completes on its own after 7 days, not before.
        $id2 = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $this->deliver(Order::find($id2));
        $this->travelTo(now()->addDays(7)->subMinute());
        $this->artisan('orders:auto-complete');
        $this->assertSame(OrderStatus::DELIVERED, Order::find($id2)->status);
        $this->travel(2)->minutes();
        $this->artisan('orders:auto-complete');
        $this->assertSame(OrderStatus::COMPLETED, Order::find($id2)->status);
    }

    public function test_only_one_payout_request_can_be_pending(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 1, 'card');
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertOk();
        $this->deliver(Order::find($res['data']['id']));
        $this->postJson("/api/v1/buyer/orders/{$res['data']['id']}/confirm-receipt")->assertOk();

        Sanctum::actingAs($seller);
        $payload = ['amount' => 100, 'gcash_number' => '09171234567', 'gcash_name' => 'Maria Clara Santos'];
        $this->postJson('/api/v1/seller/payouts/request', $payload)->assertCreated();
        $this->postJson('/api/v1/seller/payouts/request', $payload)->assertStatus(422);
        $this->assertSame(1, PayoutRequest::where('seller_id', $seller->id)->count());
    }

    public function test_sales_reports_filter_by_day_include_both_ends_and_refuse_a_reversed_range(): void
    {
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $today = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $early = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $late = $this->place($addr, $variant, 2, 'cod')['data']['id'];
        $old = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        // Start and end of one Manila day, 10 days back, plus an order 40 days back.
        $day = now('Asia/Manila')->subDays(10);
        Order::whereKey($early)->update(['created_at' => $day->copy()->startOfDay()->addMinute()->utc()]);
        Order::whereKey($late)->update(['created_at' => $day->copy()->endOfDay()->subMinute()->utc()]);
        Order::whereKey($old)->update(['created_at' => now('Asia/Manila')->subDays(40)->utc()]);

        Sanctum::actingAs($seller);
        $sum = fn (string $q) => $this->getJson("/api/v1/seller/reports/summary?{$q}")->assertOk()->json('data');

        // Gross is the item subtotal, without the ₱65 shipping (A9).
        $this->assertEqualsWithDelta(450.00, $sum('range=today')['gross_sales'], 0.001);
        $this->assertSame(1, $sum('range=today')['total_orders']);
        $this->assertSame(1, $sum('range=7d')['total_orders']);
        $this->assertSame(3, $sum('range=30d')['total_orders']);

        $d = $day->toDateString();
        $custom = $sum("from={$d}&to={$d}");
        $this->assertSame(2, $custom['total_orders']);
        $this->assertEqualsWithDelta(1350.00, $custom['gross_sales'], 0.001);
        $this->assertSame($d, $custom['from']);
        $this->assertSame($d, $custom['to']);

        // The chart covers the same window and adds up to the same gross.
        $chart = $this->getJson("/api/v1/seller/reports/revenue-chart?from={$d}&to={$d}")->assertOk()->json('data');
        $this->assertCount(1, $chart);
        $this->assertEqualsWithDelta(1350.00, $chart[0]['gross_sales'], 0.001);
        $this->assertEqualsWithDelta($custom['net_earnings'], $chart[0]['net_earnings'], 0.001);

        $this->assertSame(2, $this->getJson("/api/v1/seller/reports/payment-methods?from={$d}&to={$d}")->json('data.cod.count'));

        $reversed = now('Asia/Manila')->subDays(11)->toDateString();
        $this->getJson("/api/v1/seller/reports/summary?from={$d}&to={$reversed}")->assertStatus(422)->assertJsonValidationErrors(['to']);
        $this->getJson("/api/v1/seller/reports/revenue-chart?from={$d}&to={$reversed}")->assertStatus(422);
        $this->getJson('/api/v1/seller/reports/summary?from=18-10-2026')->assertStatus(422)->assertJsonValidationErrors(['from']);
        $this->assertSame(4, Order::whereKey([$today, $early, $late, $old])->count());
    }

    /** SEL-INV-008 (A29): sales from 7 down: no alert at 6, one at 5, none at 4; a restock above 5 re-arms it. */
    public function test_the_low_stock_alert_fires_once_when_sales_reach_five_and_rearms_after_a_restock(): void
    {
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Low Stock Crafts', $this->qc);
        [, $variants] = $this->product($seller, 'Bamboo Serving Tray', ['Default' => [300, 7]], 0.5);
        $variant = $variants['Default'];
        $alerts = fn () => $seller->notifications()->where('data->kind', 'stock.low')->count();

        Sanctum::actingAs($buyer);
        $first = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $this->assertSame([6, 0], [$variant->fresh()->stock_quantity, $alerts()]);
        $second = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $this->assertSame([5, 1], [$variant->fresh()->stock_quantity, $alerts()]);
        $this->assertStringContainsString('has 5 left', $seller->notifications()->where('data->kind', 'stock.low')->first()->data['body']);
        $this->place($addr, $variant, 1, 'cod');
        $this->assertSame([4, 1], [$variant->fresh()->stock_quantity, $alerts()]);

        // Two cancellations put stock back to 6: the alert re-arms, and the next sale down to 5 alerts again.
        $this->postJson("/api/v1/buyer/orders/{$first}/cancel", ['reason' => 'Changed my mind'])->assertOk();
        $this->postJson("/api/v1/buyer/orders/{$second}/cancel", ['reason' => 'Changed my mind'])->assertOk();
        $this->assertSame(6, $variant->fresh()->stock_quantity);
        $this->assertNull($variant->fresh()->low_stock_alerted_at);
        $this->place($addr, $variant, 1, 'cod');
        $this->assertSame([5, 2], [$variant->fresh()->stock_quantity, $alerts()]);

        // The seller's own stock edit follows the same rule.
        Sanctum::actingAs($seller);
        $variant->update(['stock_quantity' => 20]);
        $variant->update(['stock_quantity' => 3]);
        $this->assertSame(3, $alerts());
        $this->assertSame(1, $this->getJson('/api/v1/seller/dashboard/stats')->json('data.low_stock_count'));
    }

    /** A29 per shop and per product: the shop's own level, a one-off laptop alerted when it sells out, and no alert. */
    public function test_a_shop_and_each_product_can_set_their_own_low_stock_level(): void
    {
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Level Test Appliances', $this->qc);

        // The shop's level: 0 to 999.
        Sanctum::actingAs($seller);
        $this->postJson('/api/v1/seller/shop-profile', ['low_stock_threshold' => 1000])->assertStatus(422)->assertJsonValidationErrors(['low_stock_threshold']);
        $this->postJson('/api/v1/seller/shop-profile', ['low_stock_threshold' => 2])->assertOk()->assertJsonPath('data.low_stock_threshold', 2);

        [, $a] = $this->product($seller, 'Stand Fan 16 inch', ['Default' => [1500, 3]], 4.0);                                        // follows the shop (2)
        [, $b] = $this->product($seller, 'Gaming Laptop 15', ['Default' => [45000, 1]], 2.2, ['low_stock_alert' => 'custom', 'low_stock_threshold' => 0]); // one unit: tell me when sold
        [, $c] = $this->product($seller, 'Rice Cooker 1L', ['Default' => [1200, 3]], 2.0, ['low_stock_alert' => 'off']);             // no alert
        [, $d] = $this->product($seller, 'Wall Clock', ['Default' => [600, 1]], 0.5);                                                 // listed below the level
        $alerts = fn () => $seller->notifications()->where('data->kind', 'stock.low')->get();

        Sanctum::actingAs($buyer);
        foreach ([$a, $b, $c, $d] as $variants) {
            $this->place($addr, $variants['Default'], 1, 'cod');
        }

        // Only the fan (3 → 2, the shop's level) and the laptop (1 → 0, its own level of 0) alert.
        $this->assertEqualsCanonicalizing(['Low stock', 'Sold out'], $alerts()->pluck('data.title')->all());
        $this->assertStringContainsString('Gaming Laptop 15 is sold out', $alerts()->firstWhere('data.title', 'Sold out')->data['body']);

        // The dashboard counts each product against its own level: the fan, the laptop and the clock; not the rice cooker.
        Sanctum::actingAs($seller);
        $this->assertSame(3, $this->getJson('/api/v1/seller/dashboard/stats')->json('data.low_stock_count'));

        // The product form: a custom level needs a number from 0 to 999, and the product shows what is in force.
        $slug = $a['Default']->product->category->slug;
        $this->postJson('/api/v1/seller/products', ['name' => 'Gaming Laptop 17', 'category_slug' => $slug, 'publish' => false, 'low_stock_alert' => 'custom'])
            ->assertStatus(422)->assertJsonValidationErrors(['low_stock_threshold']);
        $this->postJson('/api/v1/seller/products', ['name' => 'Gaming Laptop 17', 'category_slug' => $slug, 'publish' => false, 'low_stock_alert' => 'custom', 'low_stock_threshold' => 1000])
            ->assertStatus(422)->assertJsonValidationErrors(['low_stock_threshold']);
        $id = $this->postJson('/api/v1/seller/products', ['name' => 'Gaming Laptop 17', 'category_slug' => $slug, 'publish' => false, 'low_stock_alert' => 'custom', 'low_stock_threshold' => 0])
            ->assertSuccessful()->json('data.id');
        $this->getJson("/api/v1/seller/products/{$id}")->assertOk()
            ->assertJsonPath('data.low_stock_alert', 'custom')->assertJsonPath('data.low_stock_level', 0)->assertJsonPath('data.shop_low_stock_level', 2);
        $this->getJson("/api/v1/seller/products/{$a['Default']->product_id}")->assertJsonPath('data.low_stock_level', 2)
            ->assertJsonPath('data.variants.0.low_stock', true);
    }

    public function test_the_admin_finds_a_case_by_buyer_or_shop_and_can_side_with_the_shop(): void
    {
        Storage::fake('public');
        [$buyer, $addr, $seller, $variant] = $this->setUpShop();
        Sanctum::actingAs($buyer);
        $id = $this->place($addr, $variant, 1, 'cod')['data']['id'];
        $this->deliver(Order::find($id));
        $this->post("/api/v1/buyer/orders/{$id}/request-return", ['reason' => 'Not as described', 'description' => 'The basket is smaller than in the photos.', 'photos' => [$this->png()]], ['Accept' => 'application/json'])->assertOk();
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$id}/respond-return", ['action' => 'reject', 'reason' => 'The size is written in the description.'])->assertOk();

        Sanctum::actingAs(User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => Str::random(8) . '@example.com', 'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']));
        $this->assertGreaterThanOrEqual(1, $this->getJson('/api/v1/admin/disputes/stats')->json('data.rejected'));

        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$id}/escalate-return")->assertOk();
        Sanctum::actingAs(User::where('role', 'admin')->latest('id')->first());
        $disputeId = Dispute::where('order_id', $id)->value('id');

        // Found by the buyer's name, the shop's name and the reason; listed under "needs a decision".
        foreach (["{$buyer->first_name} {$buyer->last_name}", 'Maria Clara', 'smaller than'] as $search) {
            $this->assertContains($disputeId, $this->getJson('/api/v1/admin/disputes?search=' . urlencode($search))->json('data.*.id'), $search);
        }
        $this->assertContains($disputeId, $this->getJson('/api/v1/admin/disputes?status=escalated,open,in_progress')->json('data.*.id'));
        $this->assertNotContains($disputeId, $this->getJson('/api/v1/admin/disputes?status=pending,rejected')->json('data.*.id'));
        $this->assertGreaterThanOrEqual(1, $this->getJson('/api/v1/admin/disputes/stats')->json('data.needs_decision'));
        $case = $this->getJson("/api/v1/admin/disputes/{$disputeId}")->assertOk()->json('data');
        $this->assertArrayHasKey('image_url', $case['order']['items'][0]);
        $this->assertNotNull($case['escalate_by']);

        // Siding with the shop closes the case and completes the order, so the shop is paid.
        $this->patchJson("/api/v1/admin/disputes/{$disputeId}/resolve", ['decision' => 'reject', 'resolution_note' => 'The size was in the description.'])->assertOk()
            ->assertJsonPath('data.status', 'closed');
        $this->assertSame(OrderStatus::COMPLETED, Order::find($id)->status);
        $this->assertDatabaseHas('admin_activity_logs', ['action' => 'resolve_dispute', 'target_id' => $disputeId]);
    }
}
