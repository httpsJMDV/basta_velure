<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Refund;
use App\Models\User;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Refunds the shop sends by hand (GCash and cash-on-delivery orders): the buyer's account, the shop's transfer with a
 * receipt, the buyer's confirmation or report, Loved-IT's decision and the deadlines. Plus the "Parcel not received"
 * claim, which goes straight to Loved-IT with the rider's delivery evidence.
 */
class ManualRefundsTest extends TestCase
{
    use \Tests\Support\BuildsCommerce;
    use DatabaseTransactions;

    private function shop(): User
    {
        return $this->seller('Maria Clara Handicrafts', $this->qc);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Storage::fake('public');
    }

    private function user(string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => ucfirst($role), 'last_name' => Str::random(5), 'email' => $role . '.' . Str::lower(Str::random(10)) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active', 'buyer_application_status' => 'approved',
        ]);
    }

    /** A direct order of one shop, at $status, with a parcel. */
    private function order(User $buyer, User $seller, string $method, OrderStatus $status, bool $paid = false): Order
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => $status->value,
            'subtotal' => 450.00, 'shipping_fee' => 50.00, 'total' => 500.00, 'payment_method' => $method,
            'payment_status' => $paid ? 'paid' : 'pending', 'settlement' => Order::SETTLEMENT_DIRECT,
            'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09998887777', 'shipping_address' => '12 Sampaguita St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
            'shipping_barangay_code' => '043424015',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Rattan Basket', 'variant_label' => 'Default',
            'unit_price' => 450.00, 'quantity' => 1, 'subtotal' => 450.00, 'commission_rate' => 0.05, 'commission_amount' => 22.50,
            'seller_earnings' => 427.50, 'payout_status' => 'pending_release',
        ]);
        Parcel::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'tracking_number' => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'status' => $status === OrderStatus::DELIVERED ? Parcel::STATUS_DELIVERED : Parcel::STATUS_READY_FOR_PICKUP,
            'destination_barangay' => 'Santa Clara', 'pickup_barangay' => 'Bubukal',
            'delivered_at' => $status === OrderStatus::DELIVERED ? now()->subHour() : null,
            'delivery_proof_path' => $status === OrderStatus::DELIVERED ? 'delivery-proofs/a.jpg' : null,
            'delivery_proof_path_2' => $status === OrderStatus::DELIVERED ? 'delivery-proofs/b.jpg' : null,
            'received_by' => $status === OrderStatus::DELIVERED ? 'Ana' : null,
        ]);

        return $order->fresh();
    }

    private function png(string $name = 'receipt.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    private function sendRefund(User $seller, Order $order, array $fields = [])
    {
        Sanctum::actingAs($seller);

        return $this->post("/api/v1/seller/orders/{$order->id}/refund/sent", $fields + ['reference' => '1234 567 890123', 'receipt' => $this->png()], ['Accept' => 'application/json']);
    }

    /** A paid GCash order the shop cancels: the shop owes the buyer the exact amount. */
    private function cancelledGcashOrder(): array
    {
        $buyer = $this->user();
        $seller = $this->shop();
        $order = $this->order($buyer, $seller, 'gcash', OrderStatus::CONFIRMED, paid: true);
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$order->id}/cancel", ['reason' => 'Out of stock'])->assertOk();

        return [$buyer, $seller, $order->fresh()];
    }

    public function test_a_cancelled_gcash_order_waits_for_the_buyers_account_then_the_shop_then_the_buyer(): void
    {
        [$buyer, $seller, $order] = $this->cancelledGcashOrder();

        $refund = Refund::where('order_id', $order->id)->firstOrFail();
        $this->assertSame(Refund::STATUS_AWAITING_ACCOUNT, $refund->status);
        $this->assertEqualsWithDelta(500.00, (float) $refund->amount, 0.001);
        $this->assertSame('pending', $order->refund_status);
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'refund.account_needed')->count());

        // The shop cannot send before it knows where.
        $this->sendRefund($seller, $order)->assertStatus(409);

        // The buyer gives a real GCash number and a name.
        Sanctum::actingAs($buyer);
        $this->getJson("/api/v1/buyer/orders/{$order->id}")->assertOk()
            ->assertJsonPath('data.refund.status', 'awaiting_account')->assertJsonPath('data.refund.can_set_account', true);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '12345', 'gcash_name' => 'Ana Buyer'])
            ->assertStatus(422)->assertJsonValidationErrors(['gcash_number']);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '0917 123 4567', 'gcash_name' => ''])
            ->assertStatus(422)->assertJsonValidationErrors(['gcash_name']);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '+63 917 123 4567', 'gcash_name' => 'Ana Buyer'])
            ->assertOk()->assertJsonPath('data.refund.status', 'awaiting_shop')->assertJsonPath('data.refund.gcash_number', '0917 123 4567');
        $this->assertSame(1, $seller->notifications()->where('data->kind', 'refund.to_send')->count());

        // Another buyer cannot touch it.
        Sanctum::actingAs($this->user());
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '09170000000', 'gcash_name' => 'Someone Else'])->assertNotFound();

        // The shop needs the 13-digit reference and a receipt; another shop is a 404.
        $this->sendRefund($this->shop(), $order)->assertNotFound();
        $this->sendRefund($seller, $order, ['reference' => '12345'])->assertStatus(422)->assertJsonValidationErrors(['reference']);
        Sanctum::actingAs($seller);
        $this->post("/api/v1/seller/orders/{$order->id}/refund/sent", ['reference' => '1234567890123'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['receipt']);
        $this->sendRefund($seller, $order)->assertOk()->assertJsonPath('data.status', 'sent')->assertJsonPath('data.reference', '1234567890123');
        $this->sendRefund($seller, $order)->assertStatus(409);
        $this->getJson("/api/v1/seller/orders/{$order->id}")->assertOk()->assertJsonPath('data.refund.status', 'sent');
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'refund.sent')->count());

        // The account can no longer change; the receipt is private to the two sides and admins.
        Sanctum::actingAs($buyer);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '09170000000', 'gcash_name' => 'Ana Buyer'])->assertStatus(409);
        $refundId = $refund->id;
        $this->get("/api/v1/refunds/{$refundId}/receipt")->assertOk();
        Sanctum::actingAs($this->user());
        $this->get("/api/v1/refunds/{$refundId}/receipt", ['Accept' => 'application/json'])->assertNotFound();

        // The buyer confirms it arrived: the order shows the refund as done, once.
        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/confirm")->assertOk()->assertJsonPath('data.refund_status', 'refunded')
            ->assertJsonPath('data.refund.status', 'received');
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/confirm")->assertStatus(409);
        $this->assertNotNull($order->fresh()->refunded_at);
        $this->assertSame(1, $seller->notifications()->where('data->kind', 'refund.received')->count());
    }

    public function test_a_reported_refund_goes_to_loved_it_which_can_ask_the_shop_to_send_it_again(): void
    {
        [$buyer, $seller, $order] = $this->cancelledGcashOrder();
        $admin = $this->user('admin');
        Sanctum::actingAs($buyer);
        // Nothing to report before the shop sends it.
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/report", ['note' => 'Nothing arrived in my GCash yet.'])->assertStatus(409);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '09171234567', 'gcash_name' => 'Ana Buyer'])->assertOk();
        $this->sendRefund($seller, $order)->assertOk();

        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/report", ['note' => '1234567'])->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/report", ['note' => 'Nothing arrived in my GCash, I checked twice.'])
            ->assertOk()->assertJsonPath('data.refund.status', 'not_received');
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/report", ['note' => 'Still nothing in my GCash account.'])->assertStatus(409);

        $this->assertSame(1, $admin->notifications()->where('data->kind', 'refund.not_received')->count());
        $refund = Refund::where('order_id', $order->id)->firstOrFail();

        // Only admins; a decision needs a reason in words.
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/resolve", ['decision' => 'received', 'note' => 'The receipt looks right to me.'])->assertForbidden();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/refunds')->assertOk()->assertJsonPath('data.0.id', $refund->id)->assertJsonPath('meta.attention', 1);
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/resolve", ['decision' => 'send_again', 'note' => 'abc'])->assertStatus(422);
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/resolve", ['decision' => 'send_again', 'note' => 'The receipt shows a different number.'])
            ->assertOk()->assertJsonPath('data.status', 'awaiting_shop')->assertJsonPath('data.times_sent_before', 1);

        // The shop sends again; this time the buyer says nothing, so it counts as received after 3 days.
        $this->sendRefund($seller, $order, ['reference' => '9999 888 777666', 'receipt' => $this->png('second.png')])->assertOk();
        $this->travel(2)->days();
        $this->artisan('refunds:process-deadlines')->assertSuccessful();
        $this->assertSame(Refund::STATUS_SENT, $refund->fresh()->status);
        $this->travel(1)->days();
        $this->travel(1)->minutes();
        $this->artisan('refunds:process-deadlines')->assertSuccessful();
        $refund->refresh();
        $this->assertSame(Refund::STATUS_RECEIVED, $refund->status);
        $this->assertTrue($refund->auto_confirmed);
        $this->assertSame('refunded', $order->fresh()->refund_status);
    }

    public function test_a_shop_late_to_send_is_flagged_once(): void
    {
        [$buyer, $seller, $order] = $this->cancelledGcashOrder();
        Sanctum::actingAs($buyer);
        $this->putJson("/api/v1/buyer/orders/{$order->id}/refund/account", ['gcash_number' => '09171234567', 'gcash_name' => 'Ana Buyer'])->assertOk();
        $admin = $this->user('admin');

        $this->travel(3)->days();
        $this->travel(1)->minutes();
        $this->artisan('refunds:process-deadlines')->assertSuccessful();
        $this->artisan('refunds:process-deadlines')->assertSuccessful();

        $this->assertSame(1, $admin->notifications()->where('data->kind', 'refund.overdue')->count());
        $this->assertSame(1, $seller->notifications()->where('data->kind', 'refund.overdue')->count());
        Sanctum::actingAs($seller);
        $this->getJson('/api/v1/seller/refunds')->assertOk()->assertJsonPath('meta.to_send', 1)->assertJsonPath('data.0.overdue', true);
    }

    public function test_an_approved_cod_return_is_a_refund_the_shop_sends_not_an_instant_one(): void
    {
        $buyer = $this->user();
        $seller = $this->shop();
        $order = $this->order($buyer, $seller, 'cod', OrderStatus::DELIVERED);

        Sanctum::actingAs($buyer);
        $this->post("/api/v1/buyer/orders/{$order->id}/request-return",
            ['reason' => 'Damaged item', 'description' => 'The basket arrived with a broken rim.', 'photos' => [$this->png('a.png')]],
            ['Accept' => 'application/json'])->assertOk();
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$order->id}/respond-return", ['action' => 'approve'])->assertOk();

        $order->refresh();
        $this->assertSame(OrderStatus::RETURNED, $order->status);
        // Before, a COD return was marked refunded although nobody paid the buyer back.
        $this->assertSame('pending', $order->refund_status);
        $this->assertSame(Refund::CAUSE_RETURN, Refund::where('order_id', $order->id)->value('cause'));
        $this->assertSame(Refund::STATUS_AWAITING_ACCOUNT, Refund::where('order_id', $order->id)->value('status'));
    }

    public function test_a_card_refund_stays_instant_and_has_no_manual_refund(): void
    {
        $buyer = $this->user();
        $seller = $this->shop();
        $order = $this->order($buyer, $seller, 'card', OrderStatus::CONFIRMED, paid: true);
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$order->id}/cancel", ['reason' => 'Out of stock'])->assertOk();

        $this->assertSame('refunded', $order->fresh()->refund_status);
        $this->assertFalse(Refund::where('order_id', $order->id)->exists());
        Sanctum::actingAs($buyer);
        $this->getJson("/api/v1/buyer/orders/{$order->id}")->assertOk()->assertJsonPath('data.refund', null);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/refund/confirm")->assertNotFound();
    }

    public function test_parcel_not_received_needs_no_photo_and_goes_straight_to_loved_it_with_the_delivery_evidence(): void
    {
        $buyer = $this->user();
        $seller = $this->shop();
        $admin = $this->user('admin');
        $order = $this->order($buyer, $seller, 'cod', OrderStatus::DELIVERED);

        Sanctum::actingAs($buyer);
        // Any other reason still needs a photo.
        $this->post("/api/v1/buyer/orders/{$order->id}/request-return", ['reason' => 'Damaged item', 'description' => 'The basket arrived broken.'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors(['photos']);
        $this->post("/api/v1/buyer/orders/{$order->id}/request-return", ['reason' => Dispute::REASON_NOT_RECEIVED, 'description' => 'It says delivered but nobody came to our house.'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.dispute.status', 'escalated');

        $dispute = Dispute::where('order_id', $order->id)->firstOrFail();
        $this->assertNull($dispute->respond_by);
        $this->assertSame(1, $admin->notifications()->where('data->kind', 'dispute.not_received')->count());

        // The shop does not decide it, and the 3-day rule does not approve it.
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$order->id}/respond-return", ['action' => 'reject', 'reason' => 'We handed it to the courier on time.'])->assertStatus(409);
        $this->travel(4)->days();
        $this->artisan('returns:process-deadlines')->assertSuccessful();
        $this->assertSame('escalated', $dispute->fresh()->status);

        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/disputes/{$dispute->id}")->assertOk()
            ->assertJsonPath('data.can_decide', true)
            ->assertJsonPath('data.delivery.proof_photo_count', 2)
            ->assertJsonPath('data.delivery.received_by', 'Ana');
        $this->patchJson("/api/v1/admin/disputes/{$dispute->id}/resolve", ['decision' => 'reject', 'resolution_note' => 'Both proof photos show the parcel at the gate.'])->assertOk();
        $this->assertSame(OrderStatus::COMPLETED, $order->fresh()->status);
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'return.decided')->count());
    }

    public function test_auto_complete_waits_for_the_return_window(): void
    {
        config(['orders.auto_complete_days' => 3]);
        $this->assertSame(\App\Models\PlatformSetting::returnWindowDays(), \App\Console\Commands\AutoCompleteDeliveredOrders::days());
        config(['orders.auto_complete_days' => 30]);
        $this->assertSame(30, \App\Console\Commands\AutoCompleteDeliveredOrders::days());
        config(['orders.auto_complete_days' => 0]);
        $this->assertSame(0, \App\Console\Commands\AutoCompleteDeliveredOrders::days());

        // An order delivered 4 days ago is not completed while the 7-day return window is still open.
        config(['orders.auto_complete_days' => 3]);
        $order = $this->order($this->user(), $this->user(), 'cod', OrderStatus::DELIVERED);
        Parcel::where('order_id', $order->id)->update(['delivered_at' => now()->subDays(4)]);
        $this->artisan('orders:auto-complete')->assertSuccessful();
        $this->assertSame(OrderStatus::DELIVERED, $order->fresh()->status);
        app(OrderStateMachine::class); // the state machine is untouched by this rule
    }
}
