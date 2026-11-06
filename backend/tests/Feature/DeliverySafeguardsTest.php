<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Mail\NoticeMail;
use App\Models\Conversation;
use App\Models\DeliveryLog;
use App\Models\Message;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Commerce\CodRefusals;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Delivery safeguards: a rider contacts the buyer before "not at home"; refused parcels turn cash on delivery off;
 * handovers are confirmed (hub → pickup rider, shop → return rider); and the shop is emailed about its pickups.
 */
class DeliverySafeguardsTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private SortingCenter $hub;
    private User $hubUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        $this->hubUser = $this->person('buyer', 'Hub');
        $this->hub = SortingCenter::create([
            'user_id' => $this->hubUser->id, 'hub_name' => 'Pila Hub ' . uniqid(), 'address_province' => 'Laguna', 'address_city' => 'Pila',
            'address_barangay' => 'Santa Clara', 'address_street' => '1 Hub St', 'status' => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043424015'],
        ]);
    }

    private function person(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Tester', 'email' => strtolower($first) . '.' . Str::lower(Str::random(10)) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active', 'buyer_application_status' => 'approved',
        ]);
    }

    /** @return array{0: User, 1: Rider} */
    private function rider(): array
    {
        $user = $this->person('rider', 'Juan');
        $rider = Rider::create([
            'user_id' => $user->id, 'sorting_center_id' => $this->hub->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE,
            'plate_number' => 'AB-' . rand(1000, 9999), 'or_cr_path' => 'ids/or.pdf', 'drivers_license_path' => 'ids/dl.pdf',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);

        return [$user, $rider];
    }

    private function parcel(User $buyer, ?User $seller, string $status, OrderStatus $orderStatus, array $overrides = []): Parcel
    {
        $seller ??= $this->person('buyer', 'Maria');
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => $orderStatus->value,
            'subtotal' => 450.00, 'shipping_fee' => 50.00, 'total' => 500.00, 'payment_method' => 'cod',
            'shipping_name' => 'Ana Buyer', 'shipping_phone' => '09998887777', 'shipping_address' => '12 Sampaguita St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara', 'shipping_barangay_code' => '043424015',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Rattan Basket', 'variant_label' => 'Default',
            'unit_price' => 450.00, 'quantity' => 1, 'subtotal' => 450.00, 'commission_rate' => 0.05, 'commission_amount' => 22.50,
            'seller_earnings' => 427.50, 'payout_status' => 'pending_release',
        ]);

        return Parcel::create($overrides + [
            'tracking_number' => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id, 'seller_id' => $seller->id,
            'status' => $status, 'destination_barangay' => 'Santa Clara', 'destination_barangay_code' => '043424015',
            'pickup_barangay' => 'Bubukal', 'pickup_address_snapshot' => ['shop_name' => 'Maria Shop'],
            'recipient_snapshot' => ['name' => 'Ana Buyer', 'phone' => '09998887777', 'barangay' => 'Santa Clara', 'city' => 'Pila'],
            'cod_amount' => 500.00, 'sorting_center_id' => $this->hub->id,
        ]);
    }

    private function outForDelivery(Rider $rider, ?User $buyer = null): Parcel
    {
        return $this->parcel($buyer ?? $this->person('buyer', 'Ana'), null, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, [
            'assigned_rider_id' => $rider->id, 'assigned_at' => now()->subHours(2), 'out_for_delivery_at' => now()->subHour(),
            'picked_up_at' => now()->subHours(5), 'scanned_in_at' => now()->subHours(4),
        ]);
    }

    // ── Contact the buyer before "not at home" ───────────────────────────────

    public function test_not_at_home_and_could_not_contact_need_a_call_or_message_on_this_trip_first(): void
    {
        [$user, $rider] = $this->rider();
        $buyer = $this->person('buyer', 'Ana');
        $parcel = $this->outForDelivery($rider, $buyer);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rider/deliveries?view=out_for_delivery')->assertOk()
            ->assertJsonPath('data.0.parcels.0.buyer_contacted', false);
        foreach (['RECIPIENT_UNAVAILABLE', 'CANNOT_CONTACT'] as $reason) {
            $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/failed", ['reason' => $reason])
                ->assertStatus(422)->assertJsonPath('code', 'contact_required');
        }
        $this->assertSame(0, $parcel->fresh()->delivery_attempts);

        // A wrong address does not need a call.
        $other = $this->outForDelivery($rider);
        $this->postJson("/api/v1/rider/deliveries/{$other->tracking_number}/failed", ['reason' => 'WRONG_ADDRESS'])->assertOk();

        // The rider taps Call: the buyer hears about it once, even if the rider taps twice.
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/contact", ['method' => 'fax'])->assertStatus(422);
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/contact", ['method' => 'call'])->assertOk();
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/contact", ['method' => 'call'])->assertOk();
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'order.rider_calling')->count());

        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/failed", ['reason' => 'RECIPIENT_UNAVAILABLE'])->assertOk();
    }

    public function test_a_call_on_an_earlier_trip_does_not_count_but_a_chat_message_on_this_one_does(): void
    {
        [$user, $rider] = $this->rider();
        $parcel = $this->outForDelivery($rider);
        $parcel->forceFill(['buyer_contacted_at' => now()->subHours(3)])->save();
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/failed", ['reason' => 'CANNOT_CONTACT'])->assertStatus(422);

        $thread = Conversation::create(['type' => Conversation::TYPE_RIDER_BUYER, 'status' => 'open', 'parcel_id' => $parcel->id,
            'rider_id' => $user->id, 'buyer_id' => $parcel->order->buyer_id, 'order_id' => $parcel->order_id, 'subject' => 'Delivery', 'last_message_at' => now()]);
        Message::create(['conversation_id' => $thread->id, 'sender_id' => $user->id, 'sender_kind' => 'rider', 'body' => 'I am at your gate.']);

        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/failed", ['reason' => 'CANNOT_CONTACT'])->assertOk();
    }

    public function test_only_the_parcels_own_rider_can_record_a_contact_and_only_while_it_is_out(): void
    {
        [$user, $rider] = $this->rider();
        [$otherUser] = $this->rider();
        $parcel = $this->outForDelivery($rider);

        Sanctum::actingAs($otherUser);
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/contact")->assertNotFound();

        $parcel->forceFill(['status' => Parcel::STATUS_DELIVERED])->save();
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/contact")->assertStatus(409);
    }

    // ── Refused parcels turn cash on delivery off ────────────────────────────

    public function test_three_refused_parcels_turn_cod_off_until_an_admin_turns_it_back_on(): void
    {
        [$riderUser, $rider] = $this->rider();
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($seller, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $payload = ['address_id' => $addr->id, 'items' => [['variant_id' => $basket['Default']->id, 'quantity' => 1]]];

        // Two refusals: still allowed. "Not at home" never counts.
        Sanctum::actingAs($riderUser);
        foreach ([1, 2] as $i) {
            $p = $this->outForDelivery($rider, $buyer);
            $this->postJson("/api/v1/rider/deliveries/{$p->tracking_number}/failed", ['reason' => 'REFUSED'])->assertOk();
        }
        $p = $this->outForDelivery($rider, $buyer);
        $this->postJson("/api/v1/rider/deliveries/{$p->tracking_number}/failed", ['reason' => 'WRONG_ADDRESS'])->assertOk();
        $this->assertSame(2, CodRefusals::count($buyer->fresh()));
        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()->assertJsonPath('data.limits.cod_blocked', false);

        // The third refusal: the buyer is told once, and checkout refuses COD with the reason.
        Mail::fake();
        Sanctum::actingAs($riderUser);
        $p = $this->outForDelivery($rider, $buyer);
        $this->postJson("/api/v1/rider/deliveries/{$p->tracking_number}/failed", ['reason' => 'REFUSED'])->assertOk();
        $this->assertSame(1, $buyer->notifications()->where('data->kind', 'account.cod_off')->count());
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($buyer->email) && str_contains($m->subjectLine, 'Cash on delivery'));

        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()
            ->assertJsonPath('data.limits.cod_blocked', true)->assertJsonPath('data.limits.cod_available', false);
        $this->postJson('/api/v1/checkout/place-order', $payload + ['payment_method' => 'cod'])
            ->assertStatus(422)->assertJsonValidationErrors(['payment_method']);

        // The admin sees it and turns COD back on; a buyer cannot.
        $this->postJson("/api/v1/admin/users/{$buyer->id}/restore-cod")->assertForbidden();
        Sanctum::actingAs($this->person('admin', 'Admin'));
        $this->getJson('/api/v1/admin/users?role=buyer&search=' . urlencode($buyer->email))->assertOk()
            ->assertJsonPath('data.0.cod.refusals', 3)->assertJsonPath('data.0.cod.blocked', true);
        $this->postJson("/api/v1/admin/users/{$buyer->id}/restore-cod")->assertOk()->assertJsonPath('data.cod.blocked', false);
        $this->postJson("/api/v1/admin/users/{$buyer->id}/restore-cod")->assertStatus(409);

        Sanctum::actingAs($buyer->fresh());
        $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()->assertJsonPath('data.limits.cod_blocked', false);
    }

    // ── Handovers are confirmed ──────────────────────────────────────────────

    public function test_the_pickup_rider_is_told_when_the_hub_scans_their_parcel_in(): void
    {
        [$riderUser, $rider] = $this->rider();
        $parcel = $this->parcel($this->person('buyer', 'Ana'), null, Parcel::STATUS_PICKED_UP, OrderStatus::PICKED_UP, [
            'pickup_rider_id' => $rider->id, 'picked_up_at' => now()->subHour(),
        ]);

        Sanctum::actingAs($this->hubUser->fresh());
        $this->postJson("/api/v1/hub/parcels/{$parcel->tracking_number}/receive")->assertOk();

        $notice = $riderUser->notifications()->where('data->kind', 'rider.handover_confirmed')->first();
        $this->assertNotNull($notice);
        $this->assertStringContainsString($parcel->tracking_number, $notice->data['body']);
        $this->assertStringContainsString($this->hub->hub_name, $notice->data['body']);
    }

    public function test_the_return_rider_is_told_when_the_shop_confirms_the_parcel_came_back(): void
    {
        [$riderUser, $rider] = $this->rider();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $parcel = $this->parcel($this->person('buyer', 'Ana'), $seller, Parcel::STATUS_RETURNED, OrderStatus::CANCELLED, [
            'rts_rider_id' => $rider->id, 'returned_at' => now(),
        ]);
        Order::whereKey($parcel->order_id)->update(['cancel_reason' => \App\Services\Courier\ReturnToSender::CANCEL_REASON]);

        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$parcel->order_id}/confirm-return-received")->assertOk();
        $this->assertSame(1, $riderUser->notifications()->where('data->kind', 'rider.return_confirmed')->count());
    }

    // ── The shop hears about its pickups by email ────────────────────────────

    public function test_the_shop_is_emailed_who_is_coming_and_when_the_parcel_was_picked_up(): void
    {
        Mail::fake();
        [$riderUser, $rider] = $this->rider();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $parcel = $this->parcel($this->person('buyer', 'Ana'), $seller, Parcel::STATUS_READY_FOR_PICKUP, OrderStatus::READY_FOR_PICKUP, [
            'pickup_rider_id' => $rider->id, 'pickup_accepted_at' => now(),
        ]);

        app(\App\Services\MailNotifier::class)->sellerPickupAssigned($parcel, 'Juan T.', 'Motorcycle · AB-1234');
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email) && str_contains($m->subjectLine, 'A rider is coming'));

        app(OrderStateMachine::class)->transition($parcel->order, OrderStatus::PICKED_UP, 'rider', $riderUser->id, 'Picked up');
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email) && str_contains($m->subjectLine, 'Order picked up'));

        // The seller's order shows who to message.
        $parcel->refresh();
        Sanctum::actingAs($seller);
        $this->getJson("/api/v1/seller/orders/{$parcel->order_id}")->assertOk()
            ->assertJsonPath('data.rider_chat.leg', 'pickup')->assertJsonPath('data.rider_chat.rider_first_name', 'Juan');
    }

    public function test_a_shop_that_turned_order_emails_off_gets_no_pickup_email(): void
    {
        Mail::fake();
        [, $rider] = $this->rider();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $seller->forceFill(['notification_preferences' => ['order_updates' => ['app' => true, 'email' => false]]])->save();
        $parcel = $this->parcel($this->person('buyer', 'Ana'), $seller, Parcel::STATUS_READY_FOR_PICKUP, OrderStatus::READY_FOR_PICKUP);

        app(\App\Services\MailNotifier::class)->sellerPickupAssigned($parcel, 'Juan T.');
        Mail::assertNotQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email));
    }
}
