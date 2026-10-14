<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Dispute;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Support\BuildsEscrowOrders;
use Tests\TestCase;

class BuyerConfirmReceiptTest extends TestCase
{
    use BuildsEscrowOrders;
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    protected function confirm(Order $order, $as)
    {
        return $this->actingAs($as, 'sanctum')->postJson("/api/v1/buyer/orders/{$order->id}/confirm-receipt");
    }

    // ─── confirm-receipt ──────────────────────────────────────────────────────

    public function test_confirming_completes_the_order_and_schedules_the_escrow_release_without_releasing_it(): void
    {
        $buyer = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release', 'pending_release'], now()->subDay(), $buyer);
        $before = $this->moneySnapshot($order);

        $response = $this->confirm($order, $buyer)->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.id', $order->id);
        $this->assertNotNull($response->json('data.completed_at'));
        $this->assertArrayHasKey('status_history', $response->json('data'));

        $order->refresh();
        $this->assertEquals(OrderStatus::COMPLETED, $order->status);
        $this->assertNotNull($order->completed_at);

        $history = OrderStatusHistory::where('order_id', $order->id)->where('to_status', 'COMPLETED')->first();
        $this->assertNotNull($history);
        $this->assertEquals('DELIVERED', $history->from_status);
        $this->assertEquals('buyer', $history->actor_type);
        $this->assertEquals($buyer->id, $history->actor_id);

        foreach ($order->items as $item) {
            // Still in escrow, with a release date one hold period away.
            $this->assertSame('pending_release', $item->payout_status);
            $this->assertNotNull($item->escrow_release_at);
            $this->assertEqualsWithDelta(
                now()->addDays(7)->getTimestamp(),
                $item->escrow_release_at->getTimestamp(),
                5
            );
        }

        // Not one money value moved.
        $this->assertEquals($before, $this->moneySnapshot($order));
    }

    public function test_the_hold_length_follows_the_config_including_zero_for_demos(): void
    {
        $buyer = $this->makeUser('buyer');

        config(['payouts.escrow_hold_days' => 0]);
        $now = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);
        $this->confirm($now, $buyer)->assertOk();
        $this->assertEqualsWithDelta(now()->getTimestamp(), $now->items()->first()->escrow_release_at->getTimestamp(), 5);

        config(['payouts.escrow_hold_days' => 10]);
        $later = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);
        $this->confirm($later, $buyer)->assertOk();
        $this->assertEqualsWithDelta(now()->addDays(10)->getTimestamp(), $later->items()->first()->escrow_release_at->getTimestamp(), 5);
    }

    public function test_items_already_available_or_disbursed_are_never_moved_backwards(): void
    {
        $buyer = $this->makeUser('buyer');
        // An order delivered before 2.8 still has items that were released at DELIVERED.
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['available', 'disbursed', 'pending_release'], now()->subDay(), $buyer);
        $before = $this->moneySnapshot($order);

        $this->confirm($order, $buyer)->assertOk();

        $items = $order->items()->orderBy('id')->get();
        $this->assertSame('available', $items[0]->payout_status);
        $this->assertNull($items[0]->escrow_release_at);
        $this->assertSame('disbursed', $items[1]->payout_status);
        $this->assertNull($items[1]->escrow_release_at);
        $this->assertSame('pending_release', $items[2]->payout_status);
        $this->assertNotNull($items[2]->escrow_release_at);
        $this->assertEquals($before, $this->moneySnapshot($order));
    }

    public function test_another_buyers_order_is_a_404_and_nothing_changes(): void
    {
        $owner = $this->makeUser('buyer');
        $other = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $owner);

        $this->confirm($order, $other)->assertStatus(404);
        $this->actingAs($other, 'sanctum')->postJson('/api/v1/buyer/orders/99999999/confirm-receipt')->assertStatus(404);

        $this->assertEquals(OrderStatus::DELIVERED, $order->fresh()->status);
        $this->assertNull($order->fresh()->completed_at);
        $this->assertNull($order->items()->first()->escrow_release_at);
    }

    public function test_an_order_that_is_not_delivered_returns_the_conflict_response(): void
    {
        $buyer = $this->makeUser('buyer');

        foreach ([OrderStatus::PLACED, OrderStatus::PREPARING, OrderStatus::OUT_FOR_DELIVERY, OrderStatus::DELIVERY_FAILED, OrderStatus::CANCELLED, OrderStatus::RETURNED] as $status) {
            $order = $this->makeOrder($status, ['pending_release'], null, $buyer);
            $this->confirm($order, $buyer)->assertStatus(409);
            $this->assertEquals($status, $order->fresh()->status);
            $this->assertNull($order->items()->first()->escrow_release_at);
        }
    }

    public function test_a_double_submit_is_rejected_and_the_hold_is_not_restarted(): void
    {
        $buyer = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);

        $this->confirm($order, $buyer)->assertOk();
        $firstRelease = $order->items()->first()->escrow_release_at;
        $firstCompletedAt = $order->fresh()->completed_at;

        $this->confirm($order, $buyer)->assertStatus(409);
        $this->confirm($order, $buyer)->assertStatus(409);

        $this->assertEquals($firstRelease, $order->items()->first()->escrow_release_at);
        $this->assertEquals($firstCompletedAt, $order->fresh()->completed_at);
        $this->assertSame(1, OrderStatusHistory::where('order_id', $order->id)->where('to_status', 'COMPLETED')->count());
    }

    public function test_a_disputed_order_cannot_be_confirmed(): void
    {
        $buyer = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DISPUTED, ['pending_release'], now(), $buyer);
        Dispute::create(['order_id' => $order->id, 'buyer_id' => $buyer->id, 'reason' => 'Damaged', 'description' => 'Box crushed', 'status' => 'open']);

        $this->confirm($order, $buyer)->assertStatus(409);

        $this->assertEquals(OrderStatus::DISPUTED, $order->fresh()->status);
        $this->assertNull($order->items()->first()->escrow_release_at);
    }

    public function test_sellers_riders_and_admins_get_403_and_unauthenticated_gets_401(): void
    {
        $buyer = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);

        foreach (['seller', 'rider', 'admin'] as $role) {
            $this->confirm($order, $this->makeUser($role))->assertStatus(403);
        }
        $this->assertEquals(OrderStatus::DELIVERED, $order->fresh()->status);

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/v1/buyer/orders/{$order->id}/confirm-receipt")->assertStatus(401);
    }

    // ─── state machine ────────────────────────────────────────────────────────

    public function test_delivered_does_not_release_and_completed_by_any_actor_schedules_the_same_hold(): void
    {
        $machine = app(OrderStateMachine::class);

        foreach (['system', 'admin', 'buyer'] as $actor) {
            $order = $this->makeOrder(OrderStatus::OUT_FOR_DELIVERY, ['pending_release'], null);
            $before = $this->moneySnapshot($order);

            $machine->transition($order, OrderStatus::DELIVERED, 'rider', 1, 'Delivered');
            $item = $order->items()->first();
            $this->assertSame('pending_release', $item->payout_status, 'DELIVERED must not release');
            $this->assertNotNull($item->delivered_at);
            $this->assertNull($item->escrow_release_at);

            $machine->transition($order->fresh(), OrderStatus::COMPLETED, $actor, 1, 'Completed');
            $item->refresh();
            $this->assertSame('pending_release', $item->payout_status, "COMPLETED by {$actor} schedules but does not release");
            $this->assertNotNull($item->escrow_release_at, "COMPLETED by {$actor} sets the release date");
            $this->assertNotNull($order->fresh()->completed_at);
            $this->assertEquals($before, $this->moneySnapshot($order));
        }
    }

    public function test_an_admin_finalizing_a_disputed_order_also_starts_the_hold(): void
    {
        $order = $this->makeOrder(OrderStatus::DISPUTED, ['pending_release'], now()->subDay());

        app(OrderStateMachine::class)->transition($order, OrderStatus::COMPLETED, 'admin', 1, 'Claim rejected');

        $item = $order->items()->first();
        $this->assertSame('pending_release', $item->payout_status);
        $this->assertNotNull($item->escrow_release_at);
    }

    // ─── returns are only possible while DELIVERED ────────────────────────────

    public function test_a_return_can_be_requested_while_delivered_but_not_after_completion(): void
    {
        $buyer = $this->makeUser('buyer');
        $payload = ['reason' => 'Damaged', 'description' => 'The box arrived crushed.'];

        $delivered = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);
        $this->actingAs($buyer, 'sanctum')->postJson("/api/v1/buyer/orders/{$delivered->id}/request-return", $payload)->assertOk();
        $this->assertEquals(OrderStatus::DISPUTED, $delivered->fresh()->status);

        $completed = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);
        $this->confirm($completed, $buyer)->assertOk();

        $this->actingAs($buyer, 'sanctum')->postJson("/api/v1/buyer/orders/{$completed->id}/request-return", $payload)->assertStatus(422);
        $this->assertEquals(OrderStatus::COMPLETED, $completed->fresh()->status);
        // The refused request must not leave an open dispute behind.
        $this->assertSame(0, Dispute::where('order_id', $completed->id)->count());
    }

    // ─── buyer and seller payloads ────────────────────────────────────────────

    public function test_the_buyer_payload_exposes_the_confirm_window_and_proof_availability(): void
    {
        $buyer = $this->makeUser('buyer');
        $deliveredAt = now()->subHours(5)->startOfSecond();
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], $deliveredAt, $buyer, parcelOverrides: [
            'delivery_proof_path' => 'delivery-proofs/example.png',
        ]);

        $data = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}")->assertOk()->json('data');

        $this->assertSame('DELIVERED', $data['status']);
        $this->assertTrue($data['delivery_proof_available']);
        $this->assertEquals($deliveredAt->getTimestamp(), \Carbon\Carbon::parse($data['delivered_at'])->getTimestamp());
        $this->assertEquals($deliveredAt->copy()->addDays(3)->getTimestamp(), \Carbon\Carbon::parse($data['auto_complete_at'])->getTimestamp());
        $this->assertNull($data['completed_at']);
        $this->assertSame($order->parcel->tracking_number, $data['tracking_number']);

        // Once completed there is no countdown any more, and the list reflects the new status.
        $this->confirm($order, $buyer)->assertOk();
        $after = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$order->id}")->json('data');
        $this->assertNull($after['auto_complete_at']);
        $this->assertNotNull($after['completed_at']);

        $list = $this->actingAs($buyer, 'sanctum')->getJson('/api/v1/buyer/orders?status=completed')->assertOk();
        $this->assertContains($order->id, collect($list->json('data'))->pluck('id')->all());
        $noProof = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer);
        $this->assertFalse($this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$noProof->id}")->json('data.delivery_proof_available'));
    }

    public function test_the_seller_earnings_payload_gains_escrow_release_at_and_keeps_every_existing_key(): void
    {
        $seller = $this->makeApprovedSeller();
        $buyer = $this->makeUser('buyer');
        $order = $this->makeOrder(OrderStatus::DELIVERED, ['pending_release'], now(), $buyer, $seller);

        $row = fn () => $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/earnings/orders')->assertOk()->json('data.0');

        // Delivered, not yet confirmed: no release date, and the money is still pending, not available.
        $before = $row();
        $this->assertArrayHasKey('escrow_release_at', $before);
        $this->assertNull($before['escrow_release_at']);
        $this->assertSame('pending_release', $before['payout_status']);

        $summary = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/earnings')->json('data');
        $this->assertSame(0, (int) $summary['available_balance']);
        $this->assertEquals(1035.0, $summary['pending_balance']);

        $this->confirm($order, $buyer)->assertOk();
        $after = $row();
        $this->assertNotNull($after['escrow_release_at']);
        $this->assertSame('pending_release', $after['payout_status']);

        // Every key that existed before 2.8 is still there with the same value; one key was added.
        $existing = [
            'id', 'order_id', 'order_number', 'order_status', 'payment_status', 'product_name', 'variant_label',
            'quantity', 'item_subtotal', 'commission_rate', 'commission_pct', 'commission_amount',
            'seller_earnings', 'payout_status', 'order_date', 'delivered_date',
        ];
        $this->assertEqualsCanonicalizing(array_merge($existing, ['escrow_release_at']), array_keys($after));
        foreach ($existing as $key) {
            if ($key === 'order_status') {
                continue; // changes from DELIVERED to COMPLETED by design
            }
            $this->assertEquals($before[$key], $after[$key], "existing key {$key} must not change");
        }
        $this->assertSame('COMPLETED', $after['order_status']);
        $this->assertEquals(1035.0, $after['seller_earnings']);
        $this->assertEquals(115.0, $after['commission_amount']);
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_from_seller_ready_to_funds_available_after_the_hold(): void
    {
        \Illuminate\Support\Facades\Mail::fake();
        \Illuminate\Support\Facades\Storage::fake('ids');

        $hubUser = $this->makeUser('buyer', 'Hub'); // a real hub user has role "buyer" plus a sorting center
        $hub = \App\Models\SortingCenter::create([
            'user_id' => $hubUser->id, 'hub_name' => 'E2E Hub ' . uniqid(), 'address_province' => 'Laguna', 'address_city' => 'Calamba',
            'address_barangay' => 'Real', 'address_street' => '1 Hub St', 'status' => \App\Models\SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001', '137404001'],
        ]);
        $riderUser = $this->makeUser('rider', 'Uno');
        $rider = \App\Models\Rider::create([
            'user_id' => $riderUser->id, 'sorting_center_id' => $hub->id, 'vehicle_type' => 'Motorcycle', 'plate_number' => 'E2E-111',
            'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf', 'status' => \App\Models\Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        \App\Models\RiderAreaAssignment::create([
            'rider_id' => $rider->id, 'sorting_center_id' => $hub->id, 'area_label' => 'Area',
            'coverage_barangays' => ['043405001', '137404001'], 'is_active' => true,
        ]);

        $buyer = $this->makeUser('buyer', 'Bea');
        $seller = $this->makeUser('seller', 'Selena');
        \App\Models\SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'E2E Shop ' . uniqid(), 'shop_category' => 'Fashion',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', uniqid()), 'government_id_image_path' => 'uploads/id1.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'address_street' => '456 Burgos St', 'address_province_code' => '040000000', 'address_city_code' => '043405000',
            'address_barangay_code' => '043405001', 'shop_contact_number' => '09171112222',
        ]);

        $order = Order::create([
            'buyer_id' => $buyer->id, 'order_number' => 'VEL-E2E-' . substr(uniqid(), -8), 'subtotal' => 500.00, 'shipping_fee' => 99.00,
            'total' => 599.00, 'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => OrderStatus::PREPARING,
            'shipping_name' => 'Maria Santos', 'shipping_phone' => '09187654321', 'shipping_address' => '12 Sampaguita St',
            'shipping_province' => 'Metro Manila', 'shipping_city' => 'Quezon City', 'shipping_barangay' => 'Batasan Hills',
            'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => '137404001',
        ]);
        \App\Models\OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Floral Summer Dress', 'variant_label' => 'Medium / Red',
            'unit_price' => 500.00, 'quantity' => 1, 'subtotal' => 500.00, 'commission_rate' => 0.10, 'commission_amount' => 50.00,
            'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
        ]);

        $this->actingAs($seller, 'sanctum')->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'])->assertOk();
        $tracking = Parcel::where('order_id', $order->id)->value('tracking_number');

        $this->actingAs($riderUser, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")->assertOk();
        $this->actingAs($riderUser, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => [$tracking]])->assertOk();
        $this->actingAs($hubUser, 'sanctum')->postJson("/api/v1/hub/parcels/{$tracking}/receive")->assertOk();
        $this->actingAs($hubUser, 'sanctum')->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => [$tracking]])->assertOk();
        $this->actingAs($hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', ['rider_id' => $rider->id, 'tracking_numbers' => [$tracking]])->assertOk();
        $this->actingAs($riderUser, 'sanctum')->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$tracking]])->assertOk();

        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        $this->actingAs($riderUser, 'sanctum')
            ->post("/api/v1/rider/deliveries/{$tracking}/delivered", [
                'proof_photo'   => \Illuminate\Http\UploadedFile::fake()->createWithContent('proof.png', $png),
                'cod_collected' => '1',
            ], ['Accept' => 'application/json'])->assertOk();

        // Delivered: the rider is done, but the seller's money is NOT released.
        $item = $order->items()->first();
        $this->assertSame('pending_release', $item->payout_status);
        $summary = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/earnings')->json('data');
        $this->assertEquals(0, $summary['available_balance']);
        $this->assertEquals(450.0, $summary['pending_balance']);

        // The buyer sees the proof (the 2.7 endpoint allows them) and confirms receipt.
        $this->actingAs($buyer, 'sanctum')->get("/api/v1/parcels/{$tracking}/delivery-proof")->assertOk();
        $this->confirm($order, $buyer)->assertOk()->assertJsonPath('data.status', 'COMPLETED');

        // Completed, but still inside the hold: the release command changes nothing yet.
        $this->artisan('payouts:release-due')->assertSuccessful();
        $this->assertSame('pending_release', $item->fresh()->payout_status);

        // Move the clock past the hold. Now the command makes the money available, and only then.
        \Carbon\Carbon::setTestNow(now()->addDays(8));
        try {
            $this->artisan('payouts:release-due')->assertSuccessful();
        } finally {
            \Carbon\Carbon::setTestNow();
        }

        $this->assertSame('available', $item->fresh()->payout_status);
        $summary = $this->actingAs($seller, 'sanctum')->getJson('/api/v1/seller/earnings')->json('data');
        $this->assertEquals(450.0, $summary['available_balance']);
        $this->assertEquals(0, $summary['pending_balance']);
        $this->assertEquals(450.0, (float) $item->fresh()->seller_earnings);
        $this->assertEquals(50.0, (float) $item->fresh()->commission_amount);
    }
}
