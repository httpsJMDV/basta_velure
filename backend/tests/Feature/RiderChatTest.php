<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Feature 2.10: rider delivery chat. Covers who may open a thread, the phase rules, the read-only state
 * after a parcel finishes, isolation, limits, unread counters and privacy.
 */
class RiderChatTest extends TestCase
{
    use DatabaseTransactions;

    protected User $hubUser;
    protected SortingCenter $hub;
    protected User $buyer;
    protected User $seller;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('ids');

        $this->hubUser = $this->makeUser('buyer', 'Hub');   // a hub owner may hold the buyer role
        $this->hub = $this->makeHub($this->hubUser);
        $this->buyer = $this->makeUser('buyer', 'Ana');
        $this->seller = $this->makeUser('seller', 'Maria');
    }

    protected function tearDown(): void
    {
        foreach ($this->riderUserIds ?? [] as $id) {
            RateLimiter::clear('rider-chat-send:' . $id);
        }
        parent::tearDown();
    }

    /** @var array<int, int> */
    protected array $riderUserIds = [];

    // ── Fixtures ─────────────────────────────────────────────────────────────

    protected function makeUser(string $role, string $first): User
    {
        $user = User::forceCreate([
            'first_name' => $first,
            'last_name'  => 'Tester' . substr(uniqid(), -4),
            'email'      => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone'      => '0917' . rand(1000000, 9999999),
            'password'   => Hash::make('Password123!'),
            'role'       => $role,
            'status'     => 'active',
        ]);
        $this->riderUserIds[] = $user->id;

        return $user;
    }

    protected function makeHub(User $owner, string $status = SortingCenter::STATUS_APPROVED): SortingCenter
    {
        return SortingCenter::create([
            'user_id'            => $owner->id,
            'hub_name'           => 'Central Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => $status,
            'coverage_barangays' => ['043405001'],
        ]);
    }

    /** @return array{0: User, 1: Rider} */
    protected function makeRider(string $status = Rider::STATUS_ACTIVE, ?SortingCenter $hub = null): array
    {
        $user = $this->makeUser('rider', 'Juan');
        $rider = Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => ($hub ?? $this->hub)->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-' . rand(1000, 9999),
            'or_cr_path'           => 'ids/or_cr_test.pdf',
            'drivers_license_path' => 'ids/license_test.pdf',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);

        return [$user, $rider];
    }

    protected function makeParcel(?Rider $pickupRider, ?Rider $deliveryRider, string $status, array $overrides = [], string $payment = 'gcash'): Parcel
    {
        $order = Order::forceCreate([
            'order_number'           => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'               => $this->buyer->id,
            'status'                 => OrderStatus::OUT_FOR_DELIVERY->value,
            'subtotal'               => 1150.00,
            'shipping_fee'           => 100.00,
            'total'                  => 1250.00,
            'payment_method'         => $payment,
            'shipping_name'          => 'Ana Buyer',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Makati City',
            'shipping_barangay'      => 'Real',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => '043405001',
        ]);

        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->seller->id,
            'product_name' => 'Floral Summer Dress', 'variant_label' => 'M / Red',
            'unit_price' => 500.00, 'quantity' => 1, 'subtotal' => 500.00,
            'commission_rate' => 0.10, 'commission_amount' => 50.00,
            'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
        ]);

        return Parcel::create(array_merge([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $this->seller->id,
            'status'                    => $status,
            'destination_barangay'      => 'Real',
            'destination_barangay_code' => '043405001',
            'pickup_barangay'           => 'Real',
            'pickup_barangay_code'      => '043405001',
            'pickup_address_snapshot'   => ['shop_name' => "Maria's Shop"],
            'recipient_snapshot'        => [
                'name' => 'Ana Buyer', 'phone' => '09998887777', 'street' => '12 Sampaguita St',
                'barangay' => 'Real', 'city' => 'Makati City', 'province' => 'Metro Manila',
                'full_address' => '12 Sampaguita St, Real, Makati City, Metro Manila',
            ],
            'ready_at'                  => now()->subHours(9),
            'pickup_rider_id'           => $pickupRider?->id,
            'assigned_rider_id'         => $deliveryRider?->id,
            'sorting_center_id'         => $this->hub->id,
        ], $overrides));
    }

    protected function deliveryParcel(Rider $rider, string $status = Parcel::STATUS_OUT_FOR_DELIVERY): Parcel
    {
        return $this->makeParcel(null, $rider, $status, ['out_for_delivery_at' => now()]);
    }

    protected function pickupParcel(Rider $rider, string $status = Parcel::STATUS_READY_FOR_PICKUP): Parcel
    {
        return $this->makeParcel($rider, null, $status);
    }

    protected function openThread(User $riderUser, Parcel $parcel, string $counterpart)
    {
        return $this->actingAs($riderUser, 'sanctum')
            ->postJson("/api/v1/rider/chat/parcels/{$parcel->tracking_number}/threads", ['counterpart' => $counterpart]);
    }

    protected function riderSend(User $riderUser, int $threadId, string $body)
    {
        return $this->actingAs($riderUser, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$threadId}/messages", ['body' => $body]);
    }

    protected function viaConversations(User $user, int $threadId, ?string $body = null)
    {
        $user = $this->actingAs($user, 'sanctum');

        return $body === null
            ? $user->getJson("/api/v1/conversations/{$threadId}/messages")
            : $user->postJson("/api/v1/conversations/{$threadId}/messages", ['body' => $body]);
    }

    // ── Who may open a thread ────────────────────────────────────────────────

    public function test_a_rider_opens_a_thread_for_their_own_active_parcel_and_reopening_returns_the_same_one(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);

        $first = $this->openThread($user, $parcel, 'buyer')->assertCreated()
            ->assertJsonPath('data.type', Conversation::TYPE_RIDER_BUYER)
            ->assertJsonPath('data.counterpart', 'buyer')
            ->assertJsonPath('data.parcel.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.is_closed', false)
            ->assertJsonPath('data.can_send', true)
            ->assertJsonPath('data.recipient.name', 'Ana Buyer')
            ->assertJsonPath('data.unread', 0);

        $again = $this->openThread($user, $parcel, 'buyer')->assertOk();
        $this->assertSame($first->json('data.id'), $again->json('data.id'));
        $this->assertSame(1, Conversation::where('parcel_id', $parcel->id)->where('type', Conversation::TYPE_RIDER_BUYER)->count());

        // The tracking number is accepted in any case.
        $lower = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/rider/chat/parcels/' . strtolower($parcel->tracking_number) . '/threads', ['counterpart' => 'buyer'])
            ->assertOk();
        $this->assertSame($first->json('data.id'), $lower->json('data.id'));
    }

    public function test_a_rider_cannot_open_a_thread_for_another_riders_or_an_unknown_or_unclaimed_parcel(): void
    {
        [$userA, $riderA] = $this->makeRider();
        [, $riderB] = $this->makeRider();

        $bParcel = $this->deliveryParcel($riderB);
        $unclaimed = $this->pickupParcel($riderB);
        $unclaimed->update(['pickup_rider_id' => null]);

        $this->openThread($userA, $bParcel, 'buyer')->assertNotFound();
        $this->openThread($userA, $bParcel, 'hub')->assertNotFound();
        $this->openThread($userA, $unclaimed, 'seller')->assertNotFound();
        $this->actingAs($userA, 'sanctum')
            ->postJson('/api/v1/rider/chat/parcels/LIT-000000-NOPE00/threads', ['counterpart' => 'hub'])->assertNotFound();

        $this->assertSame(0, Conversation::whereIn('type', Conversation::RIDER_TYPES)->count());
        $this->assertNotNull($riderA);
    }

    #[DataProvider('inactiveStatuses')]
    public function test_a_rider_cannot_open_a_new_thread_once_the_parcel_is_no_longer_active_for_them(string $status): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider, $status);

        $this->openThread($user, $parcel, 'buyer')->assertStatus(409)
            ->assertJsonPath('message', 'This parcel is no longer active for you, so a new conversation cannot be started.');
        $this->assertSame(0, Conversation::whereIn('type', Conversation::RIDER_TYPES)->count());
    }

    /** @return array<string, array{0: string}> */
    public static function inactiveStatuses(): array
    {
        return [
            'delivered' => [Parcel::STATUS_DELIVERED],
            'failed'    => [Parcel::STATUS_DELIVERY_FAILED],
            'returned'  => [Parcel::STATUS_RETURNED],
            'sorted'    => [Parcel::STATUS_SORTED],
        ];
    }

    // ── Counterpart by phase ─────────────────────────────────────────────────

    public function test_during_pickup_the_rider_can_message_the_seller_and_the_hub_but_not_the_buyer(): void
    {
        [$user, $rider] = $this->makeRider();

        foreach ([Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP] as $status) {
            $parcel = $this->pickupParcel($rider, $status);

            $this->openThread($user, $parcel, 'seller')->assertCreated()
                ->assertJsonPath('data.type', Conversation::TYPE_RIDER_SELLER)
                ->assertJsonPath('data.recipient.name', "Maria's Shop");
            $this->openThread($user, $parcel, 'hub')->assertCreated()->assertJsonPath('data.type', Conversation::TYPE_RIDER_HUB);
            $this->openThread($user, $parcel, 'buyer')->assertStatus(422)->assertJsonValidationErrors('counterpart');
        }
    }

    public function test_during_delivery_the_rider_can_message_the_buyer_and_the_hub_but_not_the_seller(): void
    {
        [$user, $rider] = $this->makeRider();

        foreach ([Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY] as $status) {
            $parcel = $this->deliveryParcel($rider, $status);

            $this->openThread($user, $parcel, 'buyer')->assertCreated()->assertJsonPath('data.type', Conversation::TYPE_RIDER_BUYER);
            $this->openThread($user, $parcel, 'hub')->assertCreated()->assertJsonPath('data.type', Conversation::TYPE_RIDER_HUB);
            $this->openThread($user, $parcel, 'seller')->assertStatus(422)->assertJsonValidationErrors('counterpart');
        }
    }

    public function test_an_unknown_counterpart_is_a_validation_error(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);

        $this->openThread($user, $parcel, 'admin')->assertStatus(422)->assertJsonValidationErrors('counterpart');
        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/rider/chat/parcels/{$parcel->tracking_number}/threads", [])->assertStatus(422);
    }

    public function test_a_hub_thread_needs_an_approved_hub_that_owns_the_parcel(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);

        $this->hub->update(['status' => SortingCenter::STATUS_SUSPENDED]);
        $this->openThread($user, $parcel, 'hub')->assertStatus(422)->assertJsonValidationErrors('counterpart');

        $this->hub->update(['status' => SortingCenter::STATUS_APPROVED]);
        $otherHub = $this->makeHub($this->makeUser('buyer', 'Other'));
        $parcel->update(['sorting_center_id' => $otherHub->id]);
        $this->openThread($user, $parcel, 'hub')->assertStatus(422);
    }

    // ── Sending, and the read-only state ────────────────────────────────────

    public function test_both_sides_can_send_while_the_parcel_is_active(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'buyer')->json('data.id');

        $this->riderSend($user, $threadId, 'I am at the gate')->assertCreated()
            ->assertJsonPath('data.body', 'I am at the gate')
            ->assertJsonPath('data.sender_role', 'rider')
            ->assertJsonPath('data.sender_name', 'You');

        $this->viaConversations($this->buyer, $threadId, 'Coming down now')->assertCreated()
            ->assertJsonPath('data.sender_role', 'buyer');

        $this->assertSame(2, Message::where('conversation_id', $threadId)->count());
    }

    #[DataProvider('finishedStatuses')]
    public function test_after_the_parcel_finishes_the_thread_is_read_only_for_both_sides_but_still_readable(string $status): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'buyer')->json('data.id');
        $this->riderSend($user, $threadId, 'On my way')->assertCreated();
        $this->viaConversations($this->buyer, $threadId, 'Thanks')->assertCreated();

        $parcel->update(['status' => $status]);

        $this->riderSend($user, $threadId, 'one more')->assertStatus(409);
        $this->viaConversations($this->buyer, $threadId, 'and me too')->assertStatus(409);
        $this->assertSame(2, Message::where('conversation_id', $threadId)->count());

        // Still readable on both sides, with the closed state spelled out.
        $riderView = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages")->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.is_closed', true)
            ->assertJsonPath('meta.can_send', false);
        $this->assertStringContainsString('closed', $riderView->json('meta.closed_message'));

        $this->viaConversations($this->buyer, $threadId)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.is_closed', true);

        $listed = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads')->assertOk();
        $this->assertTrue($listed->json('data.0.is_closed'));
    }

    /** @return array<string, array{0: string}> */
    public static function finishedStatuses(): array
    {
        return [
            'delivered' => [Parcel::STATUS_DELIVERED],
            'failed'    => [Parcel::STATUS_DELIVERY_FAILED],
            'returned'  => [Parcel::STATUS_RETURNED],
        ];
    }

    public function test_a_closed_thread_reopens_if_the_same_rider_gets_the_parcel_again_but_not_for_a_different_rider(): void
    {
        [$user, $rider] = $this->makeRider();
        [, $otherRider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'buyer')->json('data.id');

        $parcel->update(['status' => Parcel::STATUS_DELIVERY_FAILED]);
        $this->riderSend($user, $threadId, 'x')->assertStatus(409);

        // Rescheduled to the same rider: the conversation continues.
        $parcel->update(['status' => Parcel::STATUS_ASSIGNED_TO_RIDER]);
        $this->riderSend($user, $threadId, 'Back again')->assertCreated();

        // Rescheduled to someone else: this rider's thread stays closed.
        $parcel->update(['assigned_rider_id' => $otherRider->id]);
        $this->riderSend($user, $threadId, 'still me?')->assertStatus(409);
        $this->viaConversations($this->buyer, $threadId, 'hello?')->assertStatus(409);
    }

    public function test_a_seller_thread_closes_when_the_pickup_phase_ends_and_when_the_pickup_is_released(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->pickupParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'seller')->json('data.id');

        $this->viaConversations($this->seller, $threadId, 'Ready at the counter')->assertCreated();

        // Rider drops it at the hub: no longer active, so the seller thread is read-only.
        $parcel->update(['status' => Parcel::STATUS_AT_SORTING_CENTER]);
        $this->viaConversations($this->seller, $threadId, 'thanks')->assertStatus(409);

        // Releasing the pickup closes it too.
        $parcel->update(['status' => Parcel::STATUS_READY_FOR_PICKUP, 'pickup_rider_id' => null]);
        $this->riderSend($user, $threadId, 'hello')->assertStatus(409);
    }

    public function test_the_hub_thread_follows_the_parcel_into_delivery_and_a_seller_thread_does_not(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->makeParcel($rider, $rider, Parcel::STATUS_PICKED_UP);
        $seller = $this->openThread($user, $parcel, 'seller')->json('data.id');
        $hub = $this->openThread($user, $parcel, 'hub')->json('data.id');

        $parcel->update(['status' => Parcel::STATUS_ASSIGNED_TO_RIDER]);

        $this->riderSend($user, $hub, 'Collecting from the hub')->assertCreated();
        $this->riderSend($user, $seller, 'Seller, are you there')->assertStatus(409);
    }

    // ── Isolation ────────────────────────────────────────────────────────────

    public function test_non_participants_get_404_everywhere(): void
    {
        [$user, $rider] = $this->makeRider();
        [$otherRiderUser] = $this->makeRider();
        $outsider = $this->makeUser('buyer', 'Eve');
        $otherSeller = $this->makeUser('seller', 'Other');
        $admin = $this->makeUser('admin', 'Root');
        $otherHubOwner = $this->makeUser('buyer', 'Hub2');
        $this->makeHub($otherHubOwner);

        $parcel = $this->deliveryParcel($rider);
        $buyerThread = $this->openThread($user, $parcel, 'buyer')->json('data.id');
        $hubThread = $this->openThread($user, $parcel, 'hub')->json('data.id');

        // Another rider, through the rider endpoints.
        $this->actingAs($otherRiderUser, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$buyerThread}")->assertNotFound();
        $this->actingAs($otherRiderUser, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$buyerThread}/messages")->assertNotFound();
        $this->riderSend($otherRiderUser, $buyerThread, 'hi')->assertNotFound();
        $this->actingAs($otherRiderUser, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$buyerThread}/read")->assertNotFound();

        // Unrelated users, an admin, and the wrong seller, through the existing endpoints.
        foreach ([$outsider, $otherSeller, $admin, $this->seller, $otherRiderUser, $user] as $stranger) {
            $this->viaConversations($stranger, $buyerThread)->assertNotFound();
            $this->viaConversations($stranger, $buyerThread, 'hi')->assertNotFound();
            $this->actingAs($stranger, 'sanctum')->getJson("/api/v1/conversations/{$buyerThread}")->assertNotFound();
        }
        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/conversations/{$buyerThread}/messages")->assertNotFound();

        // The buyer cannot use the rider endpoints, and the hub is not a party to the buyer thread.
        $this->actingAs($this->buyer, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$buyerThread}")->assertForbidden();
        $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$buyerThread}/messages")->assertNotFound();

        // Another hub cannot see this hub's thread; the right hub can.
        $this->actingAs($otherHubOwner, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$hubThread}/messages")->assertNotFound();
        $this->actingAs($otherHubOwner, 'sanctum')->postJson("/api/v1/hub/chat/threads/{$hubThread}/messages", ['body' => 'x'])->assertNotFound();
        $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$hubThread}/messages")->assertOk();

        // Listings never show strangers' threads.
        $this->assertSame([], $this->actingAs($outsider, 'sanctum')->getJson('/api/v1/conversations')->json('data'));
        $this->assertSame([], $this->actingAs($otherRiderUser, 'sanctum')->getJson('/api/v1/rider/chat/threads')->json('data'));
        $this->assertSame([], $this->actingAs($otherHubOwner, 'sanctum')->getJson('/api/v1/hub/chat/threads')->json('data'));
        $this->assertNotContains($buyerThread, collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/conversations')->json('data'))->pluck('id')->all());
    }

    public function test_a_rider_thread_is_not_exposed_through_the_other_conversation_actions(): void
    {
        [$user, $rider] = $this->makeRider();
        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id');

        $this->actingAs($this->buyer, 'sanctum')->patchJson("/api/v1/conversations/{$threadId}/status", ['status' => 'resolved'])->assertNotFound();
        $this->actingAs($this->buyer, 'sanctum')->getJson("/api/v1/conversations/{$threadId}/attachable-orders")->assertNotFound();
        $this->actingAs($this->buyer, 'sanctum')->getJson("/api/v1/conversations/{$threadId}/attachable-products")->assertNotFound();
        $this->assertSame('open', Conversation::find($threadId)->status);
    }

    public function test_the_websocket_channel_allows_only_the_two_participants(): void
    {
        [$user, $rider] = $this->makeRider();
        $conversation = Conversation::find($this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id'));
        $service = app(\App\Services\RiderChatService::class);

        $this->assertSame('rider', $service->roleOf($user, $conversation));
        $this->assertSame('buyer', $service->roleOf($this->buyer, $conversation));
        $this->assertNull($service->roleOf($this->makeUser('admin', 'Root'), $conversation));
        $this->assertNull($service->roleOf($this->seller, $conversation));
        $this->assertNull($service->roleOf($this->hubUser, $conversation));
    }

    // ── Access control by account state ──────────────────────────────────────

    public function test_pending_and_disapproved_riders_get_403(): void
    {
        // Route-model binding runs before the role middleware, so use a thread that really exists.
        [$activeUser, $activeRider] = $this->makeRider();
        $realThread = $this->openThread($activeUser, $this->deliveryParcel($activeRider), 'hub')->json('data.id');

        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            [$user] = $this->makeRider($status);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads')->assertForbidden();
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread')->assertForbidden();
            $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/chat/parcels/LIT-1/threads', ['counterpart' => 'hub'])->assertForbidden();
            $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$realThread}/messages", ['body' => 'x'])->assertForbidden();
            $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$realThread}/messages")->assertForbidden();
            $this->actingAs($user, 'sanctum')->putJson('/api/v1/rider/vehicle', ['vehicle_type' => 'Car', 'plate_number' => 'ABC 123'])->assertForbidden();
        }
    }

    public function test_guests_get_a_json_401_on_every_chat_endpoint_even_without_an_accept_header(): void
    {
        foreach ([
            ['GET', '/api/v1/rider/chat/threads'],
            ['GET', '/api/v1/rider/chat/unread'],
            ['POST', '/api/v1/rider/chat/parcels/LIT-1/threads'],
            ['GET', '/api/v1/rider/chat/threads/1/messages'],
            ['POST', '/api/v1/rider/chat/threads/1/messages'],
            ['POST', '/api/v1/rider/chat/threads/1/read'],
            ['PUT', '/api/v1/rider/vehicle'],
            ['GET', '/api/v1/hub/chat/threads'],
            ['GET', '/api/v1/hub/chat/threads/1/messages'],
            ['POST', '/api/v1/hub/chat/threads/1/messages'],
            ['POST', '/api/v1/hub/chat/threads/1/read'],
        ] as [$method, $uri]) {
            // No Accept header on purpose: a guest still gets a JSON 401.
            $this->call($method, $uri)->assertStatus(401);
        }
    }

    public function test_only_approved_hubs_reach_the_hub_chat_endpoints_and_non_hubs_are_refused(): void
    {
        $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/hub/chat/threads')->assertForbidden();

        $this->hub->update(['status' => SortingCenter::STATUS_SUSPENDED]);
        $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads')->assertForbidden();

        $pendingOwner = $this->makeUser('buyer', 'Pending');
        $this->makeHub($pendingOwner, SortingCenter::STATUS_PENDING);
        $this->actingAs($pendingOwner, 'sanctum')->getJson('/api/v1/hub/chat/threads')->assertForbidden();
    }

    public function test_a_user_who_is_not_a_rider_cannot_use_the_rider_chat_endpoints(): void
    {
        foreach ([$this->buyer, $this->seller, $this->hubUser] as $user) {
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads')->assertForbidden();
        }
    }

    // ── Limits ───────────────────────────────────────────────────────────────

    public function test_the_length_cap_is_1000_characters_and_blank_messages_are_refused(): void
    {
        [$user, $rider] = $this->makeRider();
        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id');

        $this->riderSend($user, $threadId, str_repeat('a', 1000))->assertCreated();
        $this->riderSend($user, $threadId, str_repeat('a', 1001))->assertStatus(422)->assertJsonValidationErrors('body');
        $this->riderSend($user, $threadId, '   ')->assertStatus(422)->assertJsonValidationErrors('body');
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$threadId}/messages", [])->assertStatus(422);
        $this->viaConversations($this->buyer, $threadId, str_repeat('b', 1001))->assertStatus(422);

        $this->assertSame(1, Message::where('conversation_id', $threadId)->count());
    }

    public function test_sending_is_rate_limited_per_user_across_every_endpoint(): void
    {
        config(['logistics.chat.sends_per_minute' => 3]);
        [$user, $rider] = $this->makeRider();
        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id');

        for ($i = 1; $i <= 3; $i++) {
            $this->riderSend($user, $threadId, "message {$i}")->assertCreated();
        }
        $limited = $this->riderSend($user, $threadId, 'message 4')->assertStatus(429);
        $this->assertNotNull($limited->headers->get('Retry-After'));
        $this->assertSame(3, Message::where('conversation_id', $threadId)->count());

        // Another user is not affected, and reading is never limited.
        $this->viaConversations($this->buyer, $threadId, 'reply')->assertCreated();
        $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages")->assertOk();
    }

    // ── Unread counters and marking read ─────────────────────────────────────

    public function test_unread_counts_and_mark_read_for_both_sides(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'buyer')->json('data.id');

        $this->riderSend($user, $threadId, 'one')->assertCreated();
        $this->riderSend($user, $threadId, 'two')->assertCreated();

        // The buyer sees 2 unread in the list and the badge; the rider has none.
        $list = $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations')->assertOk();
        $row = collect($list->json('data'))->firstWhere('id', $threadId);
        $this->assertSame(2, $row['unread']);
        $this->assertSame('rider_buyer', $row['type']);
        $this->assertSame('Delivery rider · ' . $parcel->tracking_number, $row['subject']);
        $this->assertSame('rider', $row['recipient']['role']);
        $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations/unread-count')->assertJsonPath('data.unread_count', 2);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread')->assertOk()->assertJsonPath('meta.unread_total', 0);

        // The buyer opening the messages (existing behaviour) marks them read.
        $this->viaConversations($this->buyer, $threadId)->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations/unread-count')->assertJsonPath('data.unread_count', 0);
        $this->assertNotNull(Message::where('conversation_id', $threadId)->first()->read_at);

        // The buyer replies: now the rider has 1 unread, shown per tracking number for the stop cards.
        $this->viaConversations($this->buyer, $threadId, 'Be right there')->assertCreated();
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread')->assertOk()
            ->assertJsonPath('meta.unread_total', 1)
            ->assertJsonPath('data.0.tracking_number', $parcel->tracking_number)
            ->assertJsonPath('data.0.counterpart', 'buyer')
            ->assertJsonPath('data.0.unread', 1);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads')->assertOk()
            ->assertJsonPath('data.0.unread', 1)->assertJsonPath('meta.unread_total', 1);

        // Polling the messages does NOT mark them read; the explicit call does.
        $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages")->assertOk();
        $this->assertSame(1, Conversation::find($threadId)->rider_unread);
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$threadId}/read")->assertOk()->assertJsonPath('data.marked', 1);
        $this->assertSame(0, Conversation::find($threadId)->rider_unread);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread')->assertJsonPath('meta.unread_total', 0)->assertJsonCount(0, 'data');
        // Marking read again is harmless.
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$threadId}/read")->assertOk()->assertJsonPath('data.marked', 0);
    }

    public function test_incremental_polling_by_after_id_returns_only_newer_messages(): void
    {
        [$user, $rider] = $this->makeRider();
        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'hub')->json('data.id');

        $ids = [];
        foreach (['a', 'b', 'c'] as $text) {
            $ids[] = $this->riderSend($user, $threadId, $text)->json('data.id');
        }

        $all = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages")->assertOk();
        $this->assertSame($ids, collect($all->json('data'))->pluck('id')->all());

        $newer = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages?after_id={$ids[0]}")->assertOk();
        $this->assertSame([$ids[1], $ids[2]], collect($newer->json('data'))->pluck('id')->all());

        $none = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages?after_id={$ids[2]}")->assertOk();
        $this->assertSame([], $none->json('data'));

        $latestOne = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages?limit=1")->assertOk();
        $this->assertSame([$ids[2]], collect($latestOne->json('data'))->pluck('id')->all());

        $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages?limit=500")->assertStatus(422);
    }

    // ── Plain text and privacy ───────────────────────────────────────────────

    public function test_messages_are_stored_and_returned_as_plain_text(): void
    {
        [$user, $rider] = $this->makeRider();
        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id');
        $payload = '<script>alert("x")</script> <b>bold</b> & "quotes" <3';

        $sent = $this->actingAs($user, 'sanctum')->postJson("/api/v1/rider/chat/threads/{$threadId}/messages", [
            'body'            => $payload,
            'attachment_type' => 'image',
            'attachment_data' => ['url' => 'http://evil.example/x.png'],
        ])->assertCreated();

        $sent->assertJsonPath('data.body', $payload)->assertJsonPath('data.attachment_type', null)->assertJsonPath('data.attachment_data', null);
        $this->assertSame($payload, Message::find($sent->json('data.id'))->body);
        $this->assertNull(Message::find($sent->json('data.id'))->attachment_type);

        $fetched = $this->viaConversations($this->buyer, $threadId)->assertOk();
        $this->assertSame($payload, $fetched->json('data.0.body'));
        $this->assertStringContainsString('application/json', $fetched->headers->get('Content-Type'));
    }

    public function test_payloads_never_expose_phone_numbers_emails_or_addresses(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $buyerThread = $this->openThread($user, $parcel, 'buyer')->json('data.id');
        $hubThread = $this->openThread($user, $parcel, 'hub')->json('data.id');
        $this->riderSend($user, $buyerThread, 'hello')->assertCreated();
        $this->riderSend($user, $hubThread, 'hello hub')->assertCreated();
        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/chat/threads/{$hubThread}/messages", ['body' => 'hi rider'])->assertCreated();
        $this->viaConversations($this->buyer, $buyerThread, 'hi')->assertCreated();

        $responses = [
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads'),
            $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$buyerThread}/messages"),
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread'),
            $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations'),
            $this->actingAs($this->buyer, 'sanctum')->getJson("/api/v1/conversations/{$buyerThread}"),
            $this->viaConversations($this->buyer, $buyerThread),
            $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads'),
            $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$hubThread}/messages"),
        ];

        $secrets = [
            $user->email, $user->phone, $this->buyer->email, $this->buyer->phone, $this->seller->email, $this->seller->phone,
            $this->hubUser->email, $this->hubUser->phone, '09998887777', 'Sampaguita', 'Makati', 'Metro Manila',
        ];
        foreach ($responses as $response) {
            $response->assertOk();
            $body = $response->getContent();
            foreach ($secrets as $secret) {
                $this->assertStringNotContainsString((string) $secret, $body, "leaked {$secret}");
            }
            $this->assertStringNotContainsString('"email"', $body);
            $this->assertStringNotContainsString('"phone"', $body);
        }

        // The buyer sees the rider by first name only.
        $row = collect($this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations')->json('data'))->firstWhere('id', $buyerThread);
        $this->assertSame('Juan', $row['recipient']['name']);
    }

    // ── Hub side ─────────────────────────────────────────────────────────────

    public function test_the_hub_lists_reads_replies_and_marks_read(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'hub')->json('data.id');
        $this->riderSend($user, $threadId, 'Where do I collect?')->assertCreated();

        $list = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads')->assertOk()
            ->assertJsonPath('meta.unread_total', 1)
            ->assertJsonPath('data.0.id', $threadId)
            ->assertJsonPath('data.0.unread', 1)
            ->assertJsonPath('data.0.counterpart', 'hub')
            ->assertJsonPath('data.0.parcel.tracking_number', $parcel->tracking_number);
        $this->assertStringStartsWith('Juan ', $list->json('data.0.recipient.name'));

        $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads?unread_only=1')->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$threadId}/messages")->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.sender_role', 'rider');
        $this->assertSame(1, Conversation::find($threadId)->hub_unread); // reading by polling does not mark read
        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/chat/threads/{$threadId}/read")->assertOk();
        $this->assertSame(0, Conversation::find($threadId)->hub_unread);
        $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads?unread_only=1')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/chat/threads/{$threadId}/messages", ['body' => 'Window 2, bring the slip'])
            ->assertCreated()->assertJsonPath('data.sender_role', 'hub')->assertJsonPath('data.sender_name', 'You');
        $this->assertSame(1, Conversation::find($threadId)->rider_unread);

        // Buyer-thread rows never appear in the hub's list, and a finished parcel closes the thread for the hub too.
        $this->openThread($user, $parcel, 'buyer')->assertCreated();
        $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/chat/threads')->assertJsonCount(1, 'data');
        $parcel->update(['status' => Parcel::STATUS_DELIVERED]);
        $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/chat/threads/{$threadId}/messages", ['body' => 'late'])->assertStatus(409);
        $this->actingAs($this->hubUser, 'sanctum')->getJson("/api/v1/hub/chat/threads/{$threadId}/messages")->assertOk()->assertJsonPath('meta.is_closed', true);
    }

    public function test_the_seller_sees_a_pickup_thread_in_their_inbox_and_replies(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->pickupParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'seller')->json('data.id');
        $this->riderSend($user, $threadId, 'Outside your shop')->assertCreated();

        $list = $this->actingAs($this->seller, 'sanctum')->getJson('/api/v1/conversations?scope=seller')->assertOk();
        $row = collect($list->json('data'))->firstWhere('id', $threadId);
        $this->assertSame('rider_seller', $row['type']);
        $this->assertSame(1, $row['unread']);
        $this->assertTrue($row['can_send']);
        $this->actingAs($this->seller, 'sanctum')->getJson('/api/v1/conversations/unread-count?scope=seller')->assertJsonPath('data.unread_count', 1);

        $this->viaConversations($this->seller, $threadId, 'Coming out now')->assertCreated()->assertJsonPath('data.sender_role', 'seller');
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/unread')->assertJsonPath('meta.unread_total', 1);
    }

    // ── End to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_rider_messages_the_buyer_and_the_thread_closes_after_delivery(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);

        // 1. The rider messages the buyer during delivery.
        $threadId = $this->openThread($user, $parcel, 'buyer')->assertCreated()->json('data.id');
        $firstId = $this->riderSend($user, $threadId, 'I am outside, are you home?')->assertCreated()->json('data.id');

        // 2. The buyer sees it in the existing inbox, labelled as a delivery rider, and replies there.
        $inbox = $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations')->assertOk();
        $row = collect($inbox->json('data'))->firstWhere('id', $threadId);
        $this->assertSame('Delivery rider · ' . $parcel->tracking_number, $row['subject']);
        $this->assertSame(1, $row['unread']);
        $this->viaConversations($this->buyer, $threadId)->assertOk()->assertJsonPath('data.0.body', 'I am outside, are you home?');
        $replyId = $this->viaConversations($this->buyer, $threadId, 'Yes, coming down')->assertCreated()->json('data.id');

        // 3. The rider's next poll picks up only the reply.
        $poll = $this->actingAs($user, 'sanctum')->getJson("/api/v1/rider/chat/threads/{$threadId}/messages?after_id={$firstId}")->assertOk();
        $this->assertSame([$replyId], collect($poll->json('data'))->pluck('id')->all());
        $this->assertSame('buyer', $poll->json('data.0.sender_role'));

        // 4. The rider completes the delivery through the real endpoint.
        $proof = UploadedFile::fake()->createWithContent('proof.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='));
        $this->actingAs($user, 'sanctum')
            ->post("/api/v1/rider/deliveries/{$parcel->tracking_number}/delivered", ['proof_photo' => $proof], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertSame(Parcel::STATUS_DELIVERED, $parcel->fresh()->status);

        // 5. The thread is now read-only for both, and still readable.
        $this->riderSend($user, $threadId, 'Thanks!')->assertStatus(409);
        $this->viaConversations($this->buyer, $threadId, 'Thank you')->assertStatus(409);
        $this->viaConversations($this->buyer, $threadId)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.is_closed', true);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/chat/threads')->assertOk()->assertJsonPath('data.0.is_closed', true);
    }

    public function test_end_to_end_a_failed_delivery_closes_the_thread(): void
    {
        [$user, $rider] = $this->makeRider();
        $parcel = $this->deliveryParcel($rider);
        $threadId = $this->openThread($user, $parcel, 'buyer')->json('data.id');
        $this->riderSend($user, $threadId, 'Hello?')->assertCreated();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/rider/deliveries/{$parcel->tracking_number}/failed", ['reason' => 'REFUSED'])->assertOk();

        $this->assertSame(Parcel::STATUS_DELIVERY_FAILED, $parcel->fresh()->status);
        $this->riderSend($user, $threadId, 'Please answer')->assertStatus(409);
        $this->viaConversations($this->buyer, $threadId, 'sorry')->assertStatus(409);
    }

    // ── Existing chat is untouched ───────────────────────────────────────────

    public function test_rider_threads_do_not_change_the_existing_buyer_seller_inbox(): void
    {
        [$user, $rider] = $this->makeRider();
        $existing = $this->actingAs($this->buyer, 'sanctum')->postJson('/api/v1/conversations/start', [
            'type' => 'buyer_seller', 'seller_id' => $this->seller->id, 'initial_message' => 'Hello shop',
        ])->assertCreated()->json('data.id');

        $threadId = $this->openThread($user, $this->deliveryParcel($rider), 'buyer')->json('data.id');
        $this->riderSend($user, $threadId, 'Hi')->assertCreated();

        $ids = collect($this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations')->json('data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$existing, $threadId], $ids);

        $sellerIds = collect($this->actingAs($this->seller, 'sanctum')->getJson('/api/v1/conversations?scope=seller')->json('data'))->pluck('id')->all();
        $this->assertSame([$existing], $sellerIds);

        // The buyer's badge counts both kinds.
        $this->actingAs($this->buyer, 'sanctum')->getJson('/api/v1/conversations/unread-count')->assertJsonPath('data.unread_count', 1);
        $this->assertSame('buyer_seller', Conversation::find($existing)->type);
    }
}
