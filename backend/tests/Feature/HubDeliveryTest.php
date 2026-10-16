<?php

namespace Tests\Feature;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
use App\Mail\ParcelReturnedMail;
use App\Mail\ParcelsAssignedMail;
use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class HubDeliveryTest extends TestCase
{
    use DatabaseTransactions;

    private const CODE_A = '043405001'; // leading zero on purpose
    private const CODE_B = '137602015';

    protected User $hubUser;
    protected SortingCenter $hub;
    protected User $otherHubUser;
    protected SortingCenter $otherHub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        [$this->hubUser, $this->hub] = $this->createHub('Central Hub');
        [$this->otherHubUser, $this->otherHub] = $this->createHub('Other Hub');
    }

    protected function makeUser(string $role, string $first): User
    {
        return User::forceCreate([
            'first_name'    => $first,
            'last_name'     => 'User' . substr(uniqid(), -4),
            'email'         => strtolower($role) . '.' . uniqid() . '@example.com',
            'phone'         => '09' . rand(100000000, 999999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1992-02-02',
            'sex'           => 'male',
            'role'          => $role,
            'status'        => 'active',
        ]);
    }

    /** A real hub user has role "buyer" plus a sorting center. */
    protected function createHub(string $name, string $status = SortingCenter::STATUS_APPROVED): array
    {
        $user = $this->makeUser('buyer', 'Hub');
        $hub = SortingCenter::create([
            'user_id'            => $user->id,
            'hub_name'           => $name . ' ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => $status,
            'coverage_barangays' => [self::CODE_A, self::CODE_B],
        ]);

        return [$user, $hub];
    }

    protected function createRider(?SortingCenter $hub = null, string $status = Rider::STATUS_ACTIVE, string $first = 'Juan'): array
    {
        $user = $this->makeUser('rider', $first);
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

    protected function cover(Rider $rider, array $codes = [self::CODE_A], bool $active = true, ?SortingCenter $hub = null): void
    {
        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => ($hub ?? $this->hub)->id,
            'area_label'         => 'Area ' . uniqid(),
            'coverage_barangays' => $codes,
            'is_active'          => $active,
        ]);
    }

    /** An ACTIVE rider of this hub who covers the given codes. */
    protected function eligibleRider(string $first = 'Juan', array $codes = [self::CODE_A]): array
    {
        [$user, $rider] = $this->createRider(null, Rider::STATUS_ACTIVE, $first);
        $this->cover($rider, $codes);

        return [$user, $rider];
    }

    /**
     * @param array<string, mixed> $overrides
     */
    protected function createParcel(
        ?Rider $rider,
        string $status = Parcel::STATUS_DELIVERY_FAILED,
        OrderStatus $orderStatus = OrderStatus::DELIVERY_FAILED,
        ?SortingCenter $hub = null,
        ?User $seller = null,
        ?User $buyer = null,
        array $overrides = []
    ): Parcel {
        $seller ??= $this->makeUser('seller', 'Maria');
        $buyer ??= $this->makeUser('buyer', 'Ana');

        $order = Order::forceCreate([
            'order_number'           => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'               => $buyer->id,
            'status'                 => $orderStatus->value,
            'subtotal'               => 1150.00,
            'shipping_fee'           => 100.00,
            'total'                  => 1250.00,
            'payment_method'         => 'cod',
            'shipping_name'          => 'Ana Buyer',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Makati City',
            'shipping_barangay'      => 'Real',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => self::CODE_A,
        ]);

        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $seller->id,
            'product_name' => 'Floral Summer Dress', 'variant_label' => 'M / Red',
            'unit_price' => 575.00, 'quantity' => 2, 'subtotal' => 1150.00,
            'commission_rate' => 0.10, 'commission_amount' => 115.00,
            'seller_earnings' => 1035.00, 'payout_status' => 'pending_release',
        ]);

        $failed = $status === Parcel::STATUS_DELIVERY_FAILED;

        return Parcel::create(array_merge([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => $status,
            'destination_barangay'      => 'Real',
            'destination_barangay_code' => self::CODE_A,
            'pickup_barangay'           => 'Real',
            'pickup_barangay_code'      => self::CODE_A,
            'pickup_address_snapshot'   => ['shop_name' => "Maria's Shop"],
            'recipient_snapshot'        => [
                'name' => 'Ana Buyer', 'phone' => '09998887777', 'street' => '12 Sampaguita St',
                'barangay' => 'Real', 'city' => 'Makati City', 'province' => 'Metro Manila',
            ],
            'cod_amount'                => 1250.00,
            'ready_at'                  => now()->subHours(9),
            'picked_up_at'              => now()->subHours(8),
            'scanned_in_at'             => now()->subHours(6),
            'sorted_at'                 => now()->subHours(5),
            'assigned_at'               => now()->subHours(4),
            'out_for_delivery_at'       => now()->subHour(),
            'assigned_rider_id'         => $rider?->id,
            'sorting_center_id'         => ($hub ?? $this->hub)->id,
            'failed_at'                 => $failed ? now()->subMinutes(20) : null,
            'failure_reason'            => $failed ? 'RECIPIENT_UNAVAILABLE' : null,
            'failure_note'              => $failed ? 'Gate locked, nobody answered.' : null,
            'delivery_attempts'         => $failed ? 1 : 0,
        ], $overrides));
    }

    protected function hubGet(string $url, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')->getJson('/api/v1/hub/deliveries/' . $url);
    }

    protected function reschedule(string $tracking, ?int $riderId, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')
            ->postJson('/api/v1/hub/deliveries/' . $tracking . '/reschedule', ['rider_id' => $riderId]);
    }

    protected function returnIt(string $tracking, array $body = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->hubUser, 'sanctum')
            ->postJson('/api/v1/hub/deliveries/' . $tracking . '/return-to-seller', $body);
    }

    protected function png(string $name = 'proof.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        ));
    }

    // ─── out ──────────────────────────────────────────────────────────────────

    public function test_out_lists_only_this_hubs_out_for_delivery_parcels_with_rider_destination_and_elapsed_time(): void
    {
        [, $riderA] = $this->eligibleRider('Alpha');
        [, $riderB] = $this->eligibleRider('Bravo');
        [, $otherRider] = $this->createRider($this->otherHub);

        $a1 = $this->createParcel($riderA, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, overrides: ['out_for_delivery_at' => now()->subMinutes(90)]);
        $a2 = $this->createParcel($riderA, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, overrides: ['out_for_delivery_at' => now()->subMinutes(30)]);
        $b1 = $this->createParcel($riderB, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);

        // Excluded: other statuses, another hub's parcel.
        $this->createParcel($riderA);                                                             // failed
        $this->createParcel($riderA, Parcel::STATUS_ASSIGNED_TO_RIDER, OrderStatus::ASSIGNED_TO_RIDER);
        $this->createParcel($riderA, Parcel::STATUS_DELIVERED, OrderStatus::DELIVERED);
        $foreign = $this->createParcel($otherRider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, $this->otherHub);

        $response = $this->hubGet('out')->assertOk()->assertJsonPath('meta.total', 3);
        $rows = collect($response->json('data'))->keyBy('tracking_number');

        $this->assertEqualsCanonicalizing(
            [$a1->tracking_number, $a2->tracking_number, $b1->tracking_number],
            $rows->keys()->all()
        );
        $this->assertStringNotContainsString($foreign->tracking_number, $response->getContent());

        $row = $rows[$a1->tracking_number];
        $this->assertSame($a1->order->order_number, $row['order_number']);
        $this->assertSame($riderA->plate_number, $row['rider']['plate_number']);
        $this->assertStringStartsWith('Alpha', $row['rider']['name']);
        $this->assertSame('Real', $row['destination']['barangay_name']);
        $this->assertSame('Makati City', $row['destination']['city']);
        $this->assertSame('Ana Buyer', $row['recipient_name']);
        $this->assertNotNull($row['out_for_delivery_at']);
        $this->assertEqualsWithDelta(90, $row['elapsed_minutes'], 1);
        $this->assertEqualsWithDelta(30, $rows[$a2->tracking_number]['elapsed_minutes'], 1);

        // Counts per rider.
        $perRider = collect($response->json('meta.riders'))->keyBy('rider_id');
        $this->assertSame(2, $perRider[$riderA->id]['count']);
        $this->assertSame(1, $perRider[$riderB->id]['count']);
        $this->assertSame($riderA->plate_number, $perRider[$riderA->id]['plate_number']);
    }

    public function test_out_supports_search_and_rider_filter_and_keeps_rider_counts_stable(): void
    {
        [, $riderA] = $this->eligibleRider('Alpha');
        [, $riderB] = $this->eligibleRider('Bravo');
        $a = $this->createParcel($riderA, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, overrides: [
            'recipient_snapshot' => ['name' => 'Zacharias Quill', 'phone' => '0900', 'street' => 's', 'barangay' => 'Real', 'city' => 'Makati City', 'province' => 'Metro Manila'],
        ]);
        $b = $this->createParcel($riderB, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);

        $ids = fn ($r) => collect($r->json('data'))->pluck('tracking_number')->all();

        $this->assertSame([$b->tracking_number], $ids($this->hubGet('out?rider_id=' . $riderB->id)));
        $this->assertSame([$a->tracking_number], $ids($this->hubGet('out?search=zachar')));
        $this->assertSame([$a->tracking_number], $ids($this->hubGet('out?search=' . strtolower($a->tracking_number))));
        $this->assertSame([$b->tracking_number], $ids($this->hubGet('out?search=' . $b->order->order_number)));
        $this->assertSame([$a->tracking_number], $ids($this->hubGet('out?search=Alpha')));
        $this->assertSame([], $ids($this->hubGet('out?search=nobody-matches-this')));

        // The rider options do not shrink when a filter is applied.
        $this->assertCount(2, $this->hubGet('out?rider_id=' . $riderB->id)->json('meta.riders'));
        $this->assertSame(1, $this->hubGet('out?rider_id=' . $riderB->id)->json('meta.total'));
        // A SQL wildcard in the search is just text.
        $this->assertSame([], $ids($this->hubGet('out?search=%25')));
    }

    // ─── failed ───────────────────────────────────────────────────────────────

    /** @return array<string, array{0: string}> */
    public static function reasonCodes(): array
    {
        $cases = [];
        foreach (DeliveryFailureReason::cases() as $reason) {
            $cases[$reason->value] = [$reason->value];
        }

        return $cases;
    }

    #[DataProvider('reasonCodes')]
    public function test_failed_shows_every_reason_with_code_label_and_the_riders_note(string $code): void
    {
        [, $rider] = $this->eligibleRider();
        $reason = DeliveryFailureReason::from($code);
        $parcel = $this->createParcel($rider, overrides: [
            'failure_reason'    => $code,
            'failure_note'      => "Note for {$code}",
            'delivery_attempts' => 2,
        ]);

        $response = $this->hubGet('failed')->assertOk();
        $row = collect($response->json('data'))->firstWhere('tracking_number', $parcel->tracking_number);

        $this->assertNotNull($row);
        $this->assertSame($code, $row['failure_reason']['code']);
        $this->assertSame($reason->label(), $row['failure_reason']['label']);
        $this->assertSame("Note for {$code}", $row['failure_note']);
        $this->assertSame(2, $row['delivery_attempts']);
        $this->assertSame(3, $row['max_attempts']);
        $this->assertTrue($row['can_reschedule']);
        $this->assertNotNull($row['failed_at']);
        $this->assertSame($rider->plate_number, $row['rider']['plate_number']);
        $this->assertSame($parcel->order->order_number, $row['order_number']);
        $this->assertSame('Ana Buyer', $row['recipient_name']);

        // The reason filter finds it.
        $filtered = $this->hubGet('failed?reason=' . $code)->assertOk();
        $this->assertContains($parcel->tracking_number, collect($filtered->json('data'))->pluck('tracking_number')->all());
    }

    public function test_failed_is_scoped_to_this_hub_filters_by_reason_and_search_and_paginates(): void
    {
        [, $rider] = $this->eligibleRider();
        [, $otherRider] = $this->createRider($this->otherHub);

        $refused = $this->createParcel($rider, overrides: ['failure_reason' => 'REFUSED', 'failed_at' => now()->subHours(2)]);
        $wrong = $this->createParcel($rider, overrides: ['failure_reason' => 'WRONG_ADDRESS', 'failed_at' => now()->subHour()]);
        $foreign = $this->createParcel($otherRider, hub: $this->otherHub);
        $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);

        $all = $this->hubGet('failed')->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('meta.max_attempts', 3);
        // Newest failure first.
        $this->assertSame([$wrong->tracking_number, $refused->tracking_number], collect($all->json('data'))->pluck('tracking_number')->all());
        $this->assertStringNotContainsString($foreign->tracking_number, $all->getContent());

        $this->assertSame([$refused->tracking_number], collect($this->hubGet('failed?reason=REFUSED')->json('data'))->pluck('tracking_number')->all());
        $this->assertSame([$wrong->tracking_number], collect($this->hubGet('failed?search=' . $wrong->tracking_number)->json('data'))->pluck('tracking_number')->all());
        $this->hubGet('failed?reason=NOT_A_REASON')->assertStatus(422)->assertJsonValidationErrors(['reason']);

        // The filter options come from the same enum the rider's reasons use.
        $this->assertSame(DeliveryFailureReason::options(), $all->json('meta.reasons'));

        $this->hubGet('failed?per_page=1&page=2')->assertOk()->assertJsonPath('meta.last_page', 2)->assertJsonCount(1, 'data');
    }

    public function test_failed_can_reschedule_follows_the_attempt_limit_and_the_config(): void
    {
        [, $rider] = $this->eligibleRider();
        $two = $this->createParcel($rider, overrides: ['delivery_attempts' => 2]);
        $three = $this->createParcel($rider, overrides: ['delivery_attempts' => 3]);

        $rows = collect($this->hubGet('failed')->json('data'))->keyBy('tracking_number');
        $this->assertTrue($rows[$two->tracking_number]['can_reschedule']);
        $this->assertFalse($rows[$three->tracking_number]['can_reschedule']);

        config(['logistics.max_delivery_attempts' => 2]);
        $rows = collect($this->hubGet('failed')->json('data'))->keyBy('tracking_number');
        $this->assertFalse($rows[$two->tracking_number]['can_reschedule']);
        $this->assertSame(2, $rows[$two->tracking_number]['max_attempts']);
    }

    public function test_lists_never_expose_the_recipient_phone_or_cod_amount(): void
    {
        [, $rider] = $this->eligibleRider();
        $this->createParcel($rider);
        $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY);

        foreach (['out', 'failed'] as $endpoint) {
            $body = $this->hubGet($endpoint)->assertOk()->getContent();
            $this->assertStringNotContainsString('09998887777', $body);
            $this->assertStringNotContainsString('1250.00', $body);
            $this->assertStringNotContainsString('"cod_amount"', $body);
            $this->assertStringNotContainsString('"phone"', $body);
        }
    }

    public function test_non_approved_hubs_are_forbidden_and_unauthenticated_gets_401(): void
    {
        foreach ([SortingCenter::STATUS_PENDING, SortingCenter::STATUS_REJECTED, SortingCenter::STATUS_SUSPENDED] as $status) {
            [$user] = $this->createHub('Hub ' . $status, $status);

            $this->hubGet('out', $user)->assertStatus(403);
            $this->hubGet('failed', $user)->assertStatus(403);
            $this->reschedule('LIT-000000-AAAAAA', 1, $user)->assertStatus(403);
            $this->returnIt('LIT-000000-AAAAAA', [], $user)->assertStatus(403);
        }

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/hub/deliveries/out')->assertStatus(401);
        $this->getJson('/api/v1/hub/deliveries/failed')->assertStatus(401);
        $this->postJson('/api/v1/hub/deliveries/LIT-1/reschedule', ['rider_id' => 1])->assertStatus(401);
        $this->postJson('/api/v1/hub/deliveries/LIT-1/return-to-seller')->assertStatus(401);
    }

    // ─── reschedule ───────────────────────────────────────────────────────────

    public function test_reschedule_moves_the_parcel_back_to_assigned_to_rider_and_emails_the_rider_after_commit(): void
    {
        Mail::fake();
        [, $previous] = $this->eligibleRider('Previous');
        [$newUser, $new] = $this->eligibleRider('Newbie');
        $parcel = $this->createParcel($previous, overrides: ['delivery_attempts' => 2]);

        $this->reschedule(strtolower($parcel->tracking_number), $new->id)
            ->assertOk()
            ->assertJsonPath('rider.id', $new->id)
            ->assertJsonPath('delivery_attempts', 2)
            ->assertJsonPath('max_attempts', 3);

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $parcel->status);
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $parcel->order->fresh()->status);
        $this->assertEquals($new->id, $parcel->assigned_rider_id);
        $this->assertNotNull($parcel->assigned_at);
        $this->assertTrue($parcel->assigned_at->greaterThan(now()->subMinute()));

        // The record of the last failure is kept.
        $this->assertSame('RECIPIENT_UNAVAILABLE', $parcel->failure_reason);
        $this->assertSame('Gate locked, nobody answered.', $parcel->failure_note);
        $this->assertNotNull($parcel->failed_at);
        $this->assertSame(2, $parcel->delivery_attempts);

        $history = OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::ASSIGNED_TO_RIDER->value)->first();
        $this->assertNotNull($history);
        $this->assertEquals(OrderStatus::DELIVERY_FAILED->value, $history->from_status);
        $this->assertEquals('hub', $history->actor_type);
        $this->assertEquals($this->hubUser->id, $history->actor_id);

        $this->assertSame(1, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // hub mails only; order-status notices are NoticeMail
        Mail::assertQueued(ParcelsAssignedMail::class, function (ParcelsAssignedMail $mail) use ($newUser) {
            $this->assertTrue($mail->hasTo($newUser->email));
            $html = $mail->render();
            $this->assertStringContainsString('Hi ' . $newUser->first_name . ',', $html);
            $this->assertStringContainsString('1 parcel', $html);
            $this->assertStringContainsString('Real', $html);

            return true;
        });
    }

    public function test_reschedule_may_use_the_same_rider_again(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider);

        $this->reschedule($parcel->tracking_number, $rider->id)->assertOk();

        $this->assertEquals($rider->id, $parcel->fresh()->assigned_rider_id);
        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $parcel->fresh()->status);
    }

    public function test_reschedule_is_refused_once_the_attempt_limit_is_reached(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $atLimit = $this->createParcel($rider, overrides: ['delivery_attempts' => 3]);

        $response = $this->reschedule($atLimit->tracking_number, $rider->id)->assertStatus(422);
        $this->assertStringContainsString('3 of 3', $response->json('message'));
        $this->assertStringContainsString('returned to the seller', $response->json('message'));
        $this->assertNothingRescheduled($atLimit);

        // The limit is configurable.
        config(['logistics.max_delivery_attempts' => 2]);
        $two = $this->createParcel($rider, overrides: ['delivery_attempts' => 2]);
        $this->reschedule($two->tracking_number, $rider->id)->assertStatus(422);
        $one = $this->createParcel($rider, overrides: ['delivery_attempts' => 1]);
        $this->reschedule($one->tracking_number, $rider->id)->assertOk();

        // Returning is still possible at the limit.
        $this->returnIt($atLimit->tracking_number)->assertOk();
        Mail::assertQueued(ParcelReturnedMail::class);
    }

    public function test_reschedule_rejects_a_rider_who_is_not_eligible_for_the_barangay(): void
    {
        Mail::fake();
        [, $wrongArea] = $this->eligibleRider('Wrong', [self::CODE_B]);
        [, $pending] = $this->createRider(null, Rider::STATUS_PENDING);
        $this->cover($pending);
        [, $disapproved] = $this->createRider(null, Rider::STATUS_DISAPPROVED);
        $this->cover($disapproved);
        [, $inactive] = $this->createRider();
        $this->cover($inactive, [self::CODE_A], false);
        [, $noArea] = $this->createRider();

        $parcel = $this->createParcel($wrongArea);

        foreach ([$wrongArea, $pending, $disapproved, $inactive, $noArea] as $rider) {
            $this->reschedule($parcel->tracking_number, $rider->id)
                ->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
        }

        $this->assertNothingRescheduled($parcel);
        Mail::assertNothingQueued();
    }

    public function test_reschedule_treats_another_hubs_parcel_or_rider_and_unknowns_as_the_same_404(): void
    {
        [, $rider] = $this->eligibleRider();
        [, $otherRider] = $this->createRider($this->otherHub);
        $this->cover($otherRider, [self::CODE_A], true, $this->otherHub);
        $mine = $this->createParcel($rider);
        $foreign = $this->createParcel($otherRider, hub: $this->otherHub);

        $responses = [
            $this->reschedule($foreign->tracking_number, $rider->id),          // another hub's parcel
            $this->reschedule($mine->tracking_number, $otherRider->id),        // another hub's rider
            $this->reschedule('LIT-000000-NOPE00', $rider->id),                // unknown parcel
            $this->reschedule($mine->tracking_number, 99999999),               // unknown rider
        ];

        foreach ($responses as $response) {
            $response->assertStatus(404);
            $this->assertSame($responses[0]->json('message'), $response->json('message'));
        }
        $this->assertNothingRescheduled($mine);
        $this->assertEquals(Parcel::STATUS_DELIVERY_FAILED, $foreign->fresh()->status);

        $this->reschedule($mine->tracking_number, null)->assertStatus(422)->assertJsonValidationErrors(['rider_id']);
    }

    public function test_actions_on_a_parcel_that_is_not_failed_return_the_conflict_response(): void
    {
        [, $rider] = $this->eligibleRider();

        foreach ([[Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY], [Parcel::STATUS_DELIVERED, OrderStatus::DELIVERED], [Parcel::STATUS_SORTED, OrderStatus::SORTED]] as [$status, $orderStatus]) {
            $parcel = $this->createParcel($rider, $status, $orderStatus);
            $this->reschedule($parcel->tracking_number, $rider->id)->assertStatus(409);
            $this->returnIt($parcel->tracking_number)->assertStatus(409);
            $this->assertEquals($status, $parcel->fresh()->status);
            $this->assertEquals($orderStatus, $parcel->order->fresh()->status);
        }
    }

    public function test_a_disputed_order_is_rejected_with_nothing_written(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider, orderStatus: OrderStatus::DISPUTED);

        $this->reschedule($parcel->tracking_number, $rider->id)->assertStatus(422);
        $this->returnIt($parcel->tracking_number)->assertStatus(422);

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_DELIVERY_FAILED, $parcel->status);
        $this->assertEquals(OrderStatus::DISPUTED, $parcel->order->fresh()->status);
        $this->assertNull($parcel->returned_at);
        $this->assertSame(0, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
        Mail::assertNothingQueued();
    }

    public function test_a_mail_failure_does_not_undo_a_reschedule(): void
    {
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider);

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));
        Log::spy();

        $this->reschedule($parcel->tracking_number, $rider->id)->assertOk();

        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $parcel->fresh()->status);
        Log::shouldHaveReceived('error')->withArgs(fn ($m) => str_contains($m, 'smtp is down'))->once();
    }

    // ─── return to seller ─────────────────────────────────────────────────────

    public function test_return_to_seller_marks_the_parcel_returned_and_changes_no_money(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider, overrides: ['delivery_attempts' => 3]);
        $item = $parcel->order->items()->first();
        $orderBefore = $parcel->order->only(['subtotal', 'shipping_fee', 'total', 'payment_status']);

        $this->returnIt(strtolower($parcel->tracking_number), ['note' => '  Buyer unreachable after three tries.  '])
            ->assertOk()->assertJsonPath('tracking_number', $parcel->tracking_number);

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_RETURNED, $parcel->status);
        $this->assertEquals(OrderStatus::RETURNED, $parcel->order->fresh()->status);
        $this->assertNotNull($parcel->returned_at);
        $this->assertSame('Buyer unreachable after three tries.', $parcel->return_note);
        $this->assertSame('RECIPIENT_UNAVAILABLE', $parcel->failure_reason); // last failure kept

        $history = OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::RETURNED->value)->first();
        $this->assertNotNull($history);
        $this->assertEquals(OrderStatus::DELIVERY_FAILED->value, $history->from_status);
        $this->assertEquals('hub', $history->actor_type);
        $this->assertEquals($this->hubUser->id, $history->actor_id);
        // Buyers read history notes; the hub's private note must not be in it.
        $this->assertStringNotContainsString('unreachable', (string) $history->note);

        // No refunds, escrow or money fields are touched.
        $item->refresh();
        $this->assertSame('pending_release', $item->payout_status);
        $this->assertNull($item->delivered_at);
        $this->assertEquals(1035.00, (float) $item->seller_earnings);
        $this->assertEquals(115.00, (float) $item->commission_amount);
        $this->assertEquals($orderBefore, $parcel->order->fresh()->only(['subtotal', 'shipping_fee', 'total', 'payment_status']));
    }

    public function test_the_note_is_optional_and_limited_to_500_characters(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();
        $a = $this->createParcel($rider);
        $b = $this->createParcel($rider);

        $this->returnIt($a->tracking_number, ['note' => str_repeat('x', 501)])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->assertEquals(Parcel::STATUS_DELIVERY_FAILED, $a->fresh()->status);

        $this->returnIt($b->tracking_number)->assertOk();
        $this->assertNull($b->fresh()->return_note);
        $this->returnIt($a->tracking_number, ['note' => str_repeat('x', 500)])->assertOk();
    }

    public function test_the_seller_is_emailed_with_real_data_after_the_return(): void
    {
        Mail::fake();
        config(['app.frontend_url' => 'https://app.lovedit.example', 'app.url' => 'https://api.lovedit.example']);

        $seller = $this->makeUser('seller', 'Selena');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'Selena Boutique', 'shop_category' => 'Fashion',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', uniqid()), 'government_id_image_path' => 'uploads/id1.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'address_street' => '456 Burgos St', 'address_province_code' => '040000000', 'address_city_code' => '043405000',
            'address_barangay_code' => self::CODE_A, 'shop_contact_number' => '09171112222',
        ]);
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider, seller: $seller, overrides: ['failure_reason' => 'REFUSED', 'failure_note' => 'Rider-only secret note']);

        $this->returnIt($parcel->tracking_number, ['note' => 'Hub-only internal note'])->assertOk();

        $this->assertSame(1, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // hub mails only; order-status notices are NoticeMail
        Mail::assertQueued(ParcelReturnedMail::class, function (ParcelReturnedMail $mail) use ($seller, $parcel) {
            $html = $mail->render();

            $this->assertTrue($mail->hasTo($seller->email));
            $this->assertStringContainsString('Hi Selena,', $html);
            $this->assertStringContainsString('Selena Boutique', $html);
            $this->assertStringContainsString($parcel->order->order_number, $html);
            $this->assertStringContainsString($parcel->tracking_number, $html);
            $this->assertStringContainsString(DeliveryFailureReason::REFUSED->label(), $html);
            $this->assertStringContainsString($this->hub->hub_name, $html);
            $this->assertStringContainsString('https://app.lovedit.example/login', $html);
            $this->assertStringNotContainsString('localhost', $html);
            // Private notes are not sent to the seller.
            $this->assertStringNotContainsString('Rider-only secret note', $html);
            $this->assertStringNotContainsString('Hub-only internal note', $html);

            return true;
        });
    }

    public function test_a_mail_failure_does_not_undo_the_return(): void
    {
        [, $rider] = $this->eligibleRider();
        $parcel = $this->createParcel($rider);

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp is down'));
        Log::spy();

        $this->returnIt($parcel->tracking_number)->assertOk();

        $this->assertEquals(Parcel::STATUS_RETURNED, $parcel->fresh()->status);
        $this->assertNotNull($parcel->fresh()->returned_at);
        $this->assertEquals(OrderStatus::RETURNED, $parcel->order->fresh()->status);
        Log::shouldHaveReceived('error')->withArgs(fn ($m) => str_contains($m, 'smtp is down'))->once();
    }

    public function test_return_treats_another_hubs_and_unknown_parcels_as_the_same_404(): void
    {
        [, $otherRider] = $this->createRider($this->otherHub);
        $foreign = $this->createParcel($otherRider, hub: $this->otherHub);

        $a = $this->returnIt($foreign->tracking_number)->assertStatus(404);
        $b = $this->returnIt('LIT-000000-NOPE00')->assertStatus(404);
        $this->assertSame($a->json('message'), $b->json('message'));
        $this->assertEquals(Parcel::STATUS_DELIVERY_FAILED, $foreign->fresh()->status);
    }

    public function test_repeated_and_competing_actions_on_one_parcel_yield_exactly_one_success(): void
    {
        Mail::fake();
        [, $rider] = $this->eligibleRider();

        // Sequential stand-in for simultaneous requests: each later request must observe the
        // earlier one's result under the row lock. A true parallel run needs two DB connections,
        // which DatabaseTransactions cannot provide.
        $returned = $this->createParcel($rider);
        $codes = [];
        foreach (range(1, 3) as $_) {
            $codes[] = $this->returnIt($returned->tracking_number)->getStatusCode();
        }
        $this->assertSame([200, 409, 409], $codes);
        $this->assertSame(1, OrderStatusHistory::where('order_id', $returned->order_id)->where('to_status', 'RETURNED')->count());

        $rescheduled = $this->createParcel($rider);
        $codes = [
            $this->reschedule($rescheduled->tracking_number, $rider->id)->getStatusCode(),
            $this->reschedule($rescheduled->tracking_number, $rider->id)->getStatusCode(),
            $this->returnIt($rescheduled->tracking_number)->getStatusCode(),
        ];
        $this->assertSame([200, 409, 409], $codes);
        $this->assertEquals(Parcel::STATUS_ASSIGNED_TO_RIDER, $rescheduled->fresh()->status);
        $this->assertNull($rescheduled->fresh()->returned_at);

        $this->returnIt($returned->tracking_number)->assertStatus(409);
        $this->reschedule($returned->tracking_number, $rider->id)->assertStatus(409);
        $this->assertSame(2, Mail::queued(\App\Mail\ParcelsAssignedMail::class)->count() + Mail::queued(\App\Mail\ParcelReturnedMail::class)->count()); // one rider mail + one seller mail (order-status notices are NoticeMail)
    }

    // ─── metrics ──────────────────────────────────────────────────────────────

    public function test_metrics_gain_two_keys_and_keep_every_existing_key_unchanged(): void
    {
        [, $rider] = $this->eligibleRider();
        // Only the parcel at the hub counts as scanned in today; the others have no scan time.
        $this->createParcel($rider, overrides: ['scanned_in_at' => null]);
        $this->createParcel($rider, overrides: ['scanned_in_at' => null]);
        $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, overrides: ['scanned_in_at' => null]);
        $this->createParcel($rider, Parcel::STATUS_AT_SORTING_CENTER, OrderStatus::AT_SORTING_CENTER, overrides: ['scanned_in_at' => now()]);
        [, $otherRider] = $this->createRider($this->otherHub);
        $this->createParcel($otherRider, hub: $this->otherHub);

        $data = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->assertOk()->json('data');

        $this->assertSame(1, $data['out_for_delivery']);
        $this->assertSame(2, $data['failed_deliveries']);

        // Every key that existed before 1.9 is still there with the same meaning.
        $this->assertSame(1, $data['inbound_today']);
        $this->assertSame(1, $data['in_sorting']);
        $this->assertSame(1, $data['active_riders']);
        $this->assertSame($this->hub->id, $data['hub']['id']);
        $this->assertSame($this->hub->hub_name, $data['hub']['hub_name']);
        $this->assertSame(SortingCenter::STATUS_APPROVED, $data['hub']['status']);
        $this->assertSame(2, $data['hub']['coverage_barangays_count']);
        foreach (['inbound_today', 'in_sorting', 'active_riders', 'hub', 'out_for_delivery', 'failed_deliveries'] as $key) {
            $this->assertArrayHasKey($key, $data);
        }

        // Acting on a failed parcel moves the numbers.
        $parcel = Parcel::where('status', Parcel::STATUS_DELIVERY_FAILED)->where('sorting_center_id', $this->hub->id)->first();
        $this->returnIt($parcel->tracking_number)->assertOk();
        $after = $this->actingAs($this->hubUser, 'sanctum')->getJson('/api/v1/hub/dashboard/metrics')->json('data');
        $this->assertSame(1, $after['failed_deliveries']);
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_fail_then_reschedule_then_deliver_and_fail_then_return_to_seller(): void
    {
        Mail::fake();
        [$riderUser, $rider] = $this->eligibleRider('Uno');
        [$secondUser, $second] = $this->eligibleRider('Dos');

        $buyer = $this->makeUser('buyer', 'Bea');
        $seller = $this->makeUser('seller', 'Selena');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'E2E Shop', 'shop_category' => 'Fashion',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', uniqid()), 'government_id_image_path' => 'uploads/id1.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'address_street' => '456 Burgos St', 'address_province_code' => '040000000', 'address_city_code' => '043405000',
            'address_barangay_code' => self::CODE_A, 'shop_contact_number' => '09171112222',
        ]);

        $retry = $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, seller: $seller, buyer: $buyer);
        $giveUp = $this->createParcel($rider, Parcel::STATUS_OUT_FOR_DELIVERY, OrderStatus::OUT_FOR_DELIVERY, seller: $seller, buyer: $buyer);

        // The hub sees both on the road.
        $this->hubGet('out')->assertOk()->assertJsonPath('meta.total', 2);

        // Both fail on the rider's first attempt.
        foreach ([$retry, $giveUp] as $p) {
            $this->actingAs($riderUser, 'sanctum')
                ->postJson("/api/v1/rider/deliveries/{$p->tracking_number}/failed", ['reason' => 'RECIPIENT_UNAVAILABLE', 'note' => 'Nobody home'])
                ->assertOk()->assertJsonPath('delivery_attempts', 1);
        }
        $this->hubGet('out')->assertOk()->assertJsonPath('meta.total', 0);
        $this->hubGet('failed')->assertOk()->assertJsonPath('meta.total', 2);

        // 1) Reschedule to a different rider, who collects it, starts again, and delivers.
        $this->reschedule($retry->tracking_number, $second->id)->assertOk();
        $this->assertEquals(OrderStatus::ASSIGNED_TO_RIDER, $retry->order->fresh()->status);

        $secondList = $this->actingAs($secondUser, 'sanctum')->getJson('/api/v1/rider/deliveries')->assertOk();
        $this->assertSame([$retry->tracking_number], collect($secondList->json('data'))->pluck('parcels')->flatten(1)->pluck('tracking_number')->all());
        // The original rider no longer has it.
        $this->actingAs($riderUser, 'sanctum')->getJson('/api/v1/rider/deliveries')->assertJsonPath('meta.assigned_count', 0);

        $this->actingAs($secondUser, 'sanctum')
            ->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => [$retry->tracking_number]])->assertOk();
        $this->actingAs($secondUser, 'sanctum')
            ->post("/api/v1/rider/deliveries/{$retry->tracking_number}/delivered", ['proof_photo' => $this->png(), 'proof_photo_2' => UploadedFile::fake()->createWithContent('proof-2.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=') . 'x'), 'cod_collected' => '1'], ['Accept' => 'application/json'])
            ->assertOk();

        $retry->refresh();
        $this->assertEquals(Parcel::STATUS_DELIVERED, $retry->status);
        $this->assertEquals($second->id, $retry->assigned_rider_id);
        $this->assertSame(1, $retry->delivery_attempts);             // the failed attempt stays on record
        $this->assertSame('RECIPIENT_UNAVAILABLE', $retry->failure_reason);
        $this->assertNotNull($retry->delivered_at);

        // 2) Give up on the other one and return it to the seller.
        $this->returnIt($giveUp->tracking_number, ['note' => 'Returned after the first failure.'])->assertOk();

        foreach ([$retry->order_id => OrderStatus::DELIVERED, $giveUp->order_id => OrderStatus::RETURNED] as $orderId => $expected) {
            $sellerView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$orderId}");
            $sellerView->assertOk()->assertJsonPath('data.status', $expected->value);
            $this->assertContains($expected->value, collect($sellerView->json('data.status_history'))->pluck('to_status')->all());

            $buyerView = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$orderId}");
            $buyerView->assertOk()->assertJsonPath('data.status', $expected->value);
        }

        $this->hubGet('failed')->assertOk()->assertJsonPath('meta.total', 0);
        $this->hubGet('out')->assertOk()->assertJsonPath('meta.total', 0);
        Mail::assertQueued(ParcelsAssignedMail::class, 1);
        Mail::assertQueued(ParcelReturnedMail::class, 1);
    }

    private function assertNothingRescheduled(Parcel $parcel): void
    {
        $fresh = $parcel->fresh();
        $this->assertEquals(Parcel::STATUS_DELIVERY_FAILED, $fresh->status);
        $this->assertEquals($parcel->assigned_rider_id, $fresh->assigned_rider_id);
        $this->assertEquals(OrderStatus::DELIVERY_FAILED, $parcel->order->fresh()->status);
        $this->assertSame(0, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
    }
}
