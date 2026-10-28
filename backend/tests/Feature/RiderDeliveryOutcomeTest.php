<?php

namespace Tests\Feature;

use App\Enums\DeliveryFailureReason;
use App\Enums\OrderStatus;
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
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RiderDeliveryOutcomeTest extends TestCase
{
    use DatabaseTransactions;

    private const CODE_A = '043405001'; // leading zero on purpose
    private const CODE_C = '137404001';

    protected User $hubUser;
    protected SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');

        [$this->hubUser, $this->hub] = $this->createHub('Central Hub');
    }

    /** A real hub user has role "buyer" plus a sorting center, so the admin check cannot match them. */
    protected function createHub(string $name): array
    {
        $user = $this->makeUser('buyer', 'Hub');
        $hub = SortingCenter::create([
            'user_id'            => $user->id,
            'hub_name'           => $name . ' ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => [self::CODE_A, self::CODE_C],
        ]);

        return [$user, $hub];
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

    protected function createRider(string $status = Rider::STATUS_ACTIVE, ?SortingCenter $hub = null): array
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

    /**
     * @param array<string, mixed> $overrides
     */
    protected function createParcel(
        ?Rider $rider,
        string $payment = 'cod',
        string $status = Parcel::STATUS_OUT_FOR_DELIVERY,
        OrderStatus $orderStatus = OrderStatus::OUT_FOR_DELIVERY,
        ?User $buyer = null,
        ?User $seller = null,
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
            'payment_method'         => $payment,
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
            'cod_amount'                => $payment === 'cod' ? 1250.00 : null,
            'ready_at'                  => now()->subHours(9),
            'picked_up_at'              => now()->subHours(8),
            'scanned_in_at'             => now()->subHours(6),
            'sorted_at'                 => now()->subHours(5),
            'assigned_at'               => now()->subHours(4),
            'out_for_delivery_at'       => now()->subHour(),
            'assigned_rider_id'         => $rider?->id,
            'sorting_center_id'         => $this->hub->id,
        ], $overrides));
    }

    /**
     * A tiny but genuine image, built from bytes so the tests do not need the GD extension.
     * The server checks the real content type, so the bytes must be a real file of that type.
     */
    protected function fakeImage(string $name): UploadedFile
    {
        $bytes = match (strtolower(pathinfo($name, PATHINFO_EXTENSION))) {
            'jpg', 'jpeg' => base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='),
            'webp'        => base64_decode('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='),
            'gif'         => base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
            default       => base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
        };

        return UploadedFile::fake()->createWithContent($name, $bytes);
    }

    protected function photo(string $name = 'proof.jpg'): UploadedFile
    {
        return $this->fakeImage($name);
    }

    /** A second genuine image whose bytes differ from every fakeImage(), because the two proof photos must differ. */
    protected function secondPhoto(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('proof-2.jpg', base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=') . 'x');
    }

    protected function deliver(User $user, string $tracking, array $fields = [], bool $withPhoto = true)
    {
        $payload = $fields;
        // The rider now types the cash collected (R6); the older checkbox stands for "the exact amount".
        if (array_key_exists('cod_collected', $payload)) {
            if (filter_var($payload['cod_collected'], FILTER_VALIDATE_BOOLEAN) && ! array_key_exists('cod_amount', $payload)) {
                $amount = Parcel::where('tracking_number', strtoupper($tracking))->value('cod_amount');
                if ($amount !== null) {
                    $payload['cod_amount'] = (string) $amount;
                }
            }
            unset($payload['cod_collected']);
        }
        if ($withPhoto && ! array_key_exists('proof_photo', $payload)) {
            $payload['proof_photo'] = $this->photo();
        }
        if ($withPhoto && ! array_key_exists('proof_photo_2', $payload)) {
            $payload['proof_photo_2'] = $this->secondPhoto();
        }

        return $this->actingAs($user, 'sanctum')->post('/api/v1/rider/deliveries/' . $tracking . '/delivered', $payload, ['Accept' => 'application/json']);
    }

    protected function markFailed(User $user, string $tracking, array $payload)
    {
        return $this->actingAs($user, 'sanctum')->postJson('/api/v1/rider/deliveries/' . $tracking . '/failed', $payload);
    }

    // ─── failure reasons ──────────────────────────────────────────────────────

    public function test_failure_reasons_endpoint_lists_every_reason_and_only_other_requires_a_note(): void
    {
        [$user] = $this->createRider();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/deliveries/failure-reasons')->assertOk();
        $data = collect($response->json('data'));

        $this->assertEqualsCanonicalizing(
            array_map(fn (DeliveryFailureReason $r) => $r->value, DeliveryFailureReason::cases()),
            $data->pluck('code')->all()
        );
        $this->assertSame(['OTHER'], $data->where('requires_note', true)->pluck('code')->values()->all());
        foreach ($data as $row) {
            $this->assertNotSame('', $row['label']);
        }
    }

    // ─── delivered ────────────────────────────────────────────────────────────

    public function test_delivered_moves_order_and_parcel_stores_private_proof_and_writes_history_and_log(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash');

        $response = $this->deliver($user, strtolower($parcel->tracking_number), ['received_by' => '  Ana Buyer  '])
            ->assertOk()
            ->assertJsonPath('tracking_number', $parcel->tracking_number)
            ->assertJsonPath('cod_collected', false);
        $this->assertStringNotContainsString('delivery-proofs', $response->getContent()); // path never leaks

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_DELIVERED, $parcel->status);
        $this->assertNotNull($parcel->delivered_at);
        $this->assertSame('Ana Buyer', $parcel->received_by);
        $this->assertNull($parcel->cod_collected_at);
        $this->assertEquals($rider->id, $parcel->assigned_rider_id);
        $this->assertEquals(OrderStatus::DELIVERED, $parcel->order->fresh()->status);

        // Stored on the private disk, in delivery-proofs/, and nowhere public.
        $this->assertStringStartsWith('delivery-proofs/', $parcel->delivery_proof_path);
        $this->assertTrue(Storage::disk('ids')->exists($parcel->delivery_proof_path));
        $this->assertFalse(Storage::disk('public')->exists($parcel->delivery_proof_path));

        $history = OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::DELIVERED->value)->first();
        $this->assertNotNull($history);
        $this->assertEquals(OrderStatus::OUT_FOR_DELIVERY->value, $history->from_status);
        $this->assertEquals('rider', $history->actor_type);
        $this->assertEquals($user->id, $history->actor_id);

        $log = DeliveryLog::where('parcel_id', $parcel->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals(DeliveryLog::OUTCOME_DELIVERED, $log->outcome);
        $this->assertEquals($rider->id, $log->rider_id);
    }

    public function test_delivered_no_longer_releases_escrow_and_changes_no_money(): void
    {
        // Changed on purpose in Feature 2.8: funds used to become available the moment the rider marked
        // DELIVERED. Now DELIVERED only records the delivery time; release waits for COMPLETED plus the hold.
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash');
        $item = $parcel->order->items()->first();
        $this->assertSame('pending_release', $item->payout_status);
        $this->assertNull($item->delivered_at);

        $this->deliver($user, $parcel->tracking_number)->assertOk();

        $item->refresh();
        $this->assertSame('pending_release', $item->payout_status);
        $this->assertNull($item->escrow_release_at);
        $this->assertNotNull($item->delivered_at);
        // Money is exactly what it was; the rider flow touches none of it.
        $this->assertEquals(1035.00, (float) $item->seller_earnings);
        $this->assertEquals(115.00, (float) $item->commission_amount);

        // A failed delivery must NOT release escrow.
        $other = $this->createParcel($rider, 'gcash');
        $this->markFailed($user, $other->tracking_number, ['reason' => 'REFUSED'])->assertOk();
        $this->assertSame('pending_release', $other->order->items()->first()->payout_status);
    }

    public function test_cod_parcel_needs_the_exact_cash_amount_and_records_when_it_was_collected(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'cod');

        // Missing, a centavo short or over (RID-DLV-005): 422 and nothing stored or changed.
        $this->deliver($user, $parcel->tracking_number)->assertStatus(422)->assertJsonValidationErrors(['cod_amount']);
        // "1250.004" has a third decimal: refused rather than rounded into a match with ₱1,250.00.
        foreach (['1249.99', '1250.01', 'abc', '1250.004'] as $wrong) {
            $this->deliver($user, $parcel->tracking_number, ['cod_amount' => $wrong])->assertStatus(422)->assertJsonValidationErrors(['cod_amount']);
        }
        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->fresh()->status);
        $this->assertSame([], Storage::disk('ids')->allFiles());

        $this->deliver($user, $parcel->tracking_number, ['cod_amount' => '1250.00'])
            ->assertOk()->assertJsonPath('cod_collected', true)->assertJsonPath('cod_amount', 1250)->assertJsonPath('pay', '50.00');

        $parcel->refresh();
        $this->assertNotNull($parcel->cod_collected_at);
        $this->assertEquals(1250.00, (float) $parcel->cod_collected_amount);
    }

    public function test_a_wrong_cod_amount_never_changes_the_parcel_amount(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'cod');

        $this->deliver($user, $parcel->tracking_number, ['cod_amount' => '1', 'amount' => '1'])->assertStatus(422);

        $this->assertEquals(1250.00, (float) $parcel->fresh()->cod_amount);
        $this->assertNull($parcel->fresh()->cod_collected_amount);
    }

    public function test_prepaid_parcels_ignore_the_cod_flag(): void
    {
        [$user, $rider] = $this->createRider();
        $without = $this->createParcel($rider, 'gcash');
        $with = $this->createParcel($rider, 'gcash');

        $this->deliver($user, $without->tracking_number)->assertOk();
        $this->deliver($user, $with->tracking_number, ['cod_collected' => '1'])->assertOk();

        $this->assertNull($without->fresh()->cod_collected_at);
        $this->assertNull($with->fresh()->cod_collected_at);
    }

    public function test_one_photo_is_enough_and_a_second_must_be_a_different_picture(): void
    {
        [$user, $rider] = $this->createRider();
        $admin = $this->makeUser('admin', 'Admin');
        $parcel = $this->createParcel($rider, 'gcash');
        $single = $this->createParcel($rider, 'gcash');

        // One proof photo is enough (R6).
        $this->actingAs($user, 'sanctum')
            ->post('/api/v1/rider/deliveries/' . $single->tracking_number . '/delivered', ['proof_photo' => $this->photo()], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertNull($single->fresh()->delivery_proof_path_2);

        // The same picture twice is refused, and nothing is kept.
        $this->deliver($user, $parcel->tracking_number, ['proof_photo_2' => $this->photo('again.jpg')])
            ->assertStatus(422)->assertJsonValidationErrors(['proof_photo_2']);
        $parcel->refresh();
        $this->assertSame(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->status);
        $this->assertNull($parcel->delivery_proof_path);
        $this->assertNull($parcel->delivery_proof_path_2);

        // Two different photos are accepted and both land on the private disk.
        $this->deliver($user, $parcel->tracking_number)->assertOk();
        $parcel->refresh();
        $this->assertNotSame($parcel->delivery_proof_path, $parcel->delivery_proof_path_2);
        $this->assertTrue(Storage::disk('ids')->exists($parcel->delivery_proof_path));
        $this->assertTrue(Storage::disk('ids')->exists($parcel->delivery_proof_path_2));
        $this->assertFalse(Storage::disk('public')->exists($parcel->delivery_proof_path_2));

        // The authorized endpoint serves each photo.
        $url = '/api/v1/parcels/' . $parcel->tracking_number . '/delivery-proof';
        $first = $this->actingAs($admin, 'sanctum')->get($url);
        $second = $this->actingAs($admin, 'sanctum')->get($url . '?photo=2');
        $first->assertOk();
        $second->assertOk();
        $this->assertNotSame(file_get_contents($first->baseResponse->getFile()->getPathname()), file_get_contents($second->baseResponse->getFile()->getPathname()));
    }

    public function test_the_photo_is_required_and_must_be_a_small_image(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash');

        $this->deliver($user, $parcel->tracking_number, [], withPhoto: false)
            ->assertStatus(422)->assertJsonValidationErrors(['proof_photo']);

        $this->deliver($user, $parcel->tracking_number, ['proof_photo' => UploadedFile::fake()->create('proof.pdf', 100, 'application/pdf')])
            ->assertStatus(422)->assertJsonValidationErrors(['proof_photo']);

        // A genuine GIF is a real image but not an allowed type.
        $this->deliver($user, $parcel->tracking_number, ['proof_photo' => $this->fakeImage('proof.gif')])
            ->assertStatus(422)->assertJsonValidationErrors(['proof_photo']);

        // A script renamed to .jpg is judged by its content, not its name. Laravel's fake uploads guess the
        // type from the file name, so this one uses a real temp file the way a browser upload arrives.
        $tmp = tempnam(sys_get_temp_dir(), 'proof');
        file_put_contents($tmp, '<?php echo "not an image";');
        try {
            $disguised = new UploadedFile($tmp, 'proof.jpg', 'image/jpeg', null, true);
            $this->deliver($user, $parcel->tracking_number, ['proof_photo' => $disguised])
                ->assertStatus(422)->assertJsonValidationErrors(['proof_photo']);
        } finally {
            @unlink($tmp);
        }

        // Over 8 MB (8192 KB is the limit).
        $this->deliver($user, $parcel->tracking_number, ['proof_photo' => $this->fakeImage('big.jpg')->size(8193)])
            ->assertStatus(422)->assertJsonValidationErrors(['proof_photo']);
        $this->deliver($user, $parcel->tracking_number, ['proof_photo' => $this->fakeImage('edge.jpg')->size(8192)])
            ->assertOk();

        // jpg, png and webp are all accepted (the 8192 KB case above is the one that finally succeeds).
        foreach (['a.jpg', 'b.png', 'c.webp'] as $name) {
            $p = $this->createParcel($rider, 'gcash');
            $this->deliver($user, $p->tracking_number, ['proof_photo' => $this->fakeImage($name)])->assertOk();
        }
    }

    public function test_received_by_must_be_a_name(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash');

        // Names follow the shared rule (A2): 2 to 50 characters, letters, spaces, hyphens, apostrophes and periods.
        foreach ([str_repeat('x', 51), '12345', '...', 'J', 'Ana <b>'] as $bad) {
            $this->deliver($user, $parcel->tracking_number, ['received_by' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors(['received_by']);
        }
        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->fresh()->status);

        $this->deliver($user, $parcel->tracking_number, ['received_by' => "Ma. Niña O'Brien-Santos"])->assertOk();
        $this->assertSame("Ma. Niña O'Brien-Santos", $parcel->fresh()->received_by);
    }

    public function test_a_failure_after_the_photo_was_stored_leaves_no_file_and_no_changes(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash');

        $this->mock(OrderStateMachine::class, function ($mock) {
            $mock->shouldReceive('canTransition')->andReturn(true);
            $mock->shouldReceive('transition')->andThrow(new \RuntimeException('simulated failure after the photo was stored'));
        });

        $this->deliver($user, $parcel->tracking_number)->assertStatus(500);

        $this->assertSame([], Storage::disk('ids')->allFiles());
        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->status);
        $this->assertNull($parcel->delivered_at);
        $this->assertNull($parcel->delivery_proof_path);
        $this->assertSame(0, DeliveryLog::where('parcel_id', $parcel->id)->count());
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
    public function test_failed_persists_the_reason_history_note_log_and_increments_attempts(string $code): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider);
        $reason = DeliveryFailureReason::from($code);
        $note = $reason->requiresNote() ? 'Gate is locked, nobody answers.' : null;

        $this->markFailed($user, $parcel->tracking_number, array_filter(['reason' => $code, 'note' => $note]))
            ->assertOk()
            ->assertJsonPath('reason.code', $code)
            ->assertJsonPath('reason.label', $reason->label())
            ->assertJsonPath('delivery_attempts', 1);

        $parcel->refresh();
        // A refusal goes straight back to the seller (RID-FAIL-003); any other reason waits for attempt 2.
        $this->assertEquals($code === 'REFUSED' ? Parcel::STATUS_RETURN_TO_SENDER : Parcel::STATUS_DELIVERY_FAILED, $parcel->status);
        $this->assertEquals(OrderStatus::DELIVERY_FAILED, $parcel->order->fresh()->status);
        $this->assertNotNull($parcel->failed_at);
        $this->assertSame($code, $parcel->failure_reason);
        $this->assertSame($note, $parcel->failure_note);
        $this->assertSame(1, $parcel->delivery_attempts);
        $this->assertNull($parcel->delivered_at);
        $this->assertEquals($rider->id, $parcel->assigned_rider_id); // stays with the rider until the hub acts (1.9)

        $history = OrderStatusHistory::where('order_id', $parcel->order_id)
            ->where('to_status', OrderStatus::DELIVERY_FAILED->value)->first();
        $this->assertNotNull($history);
        $this->assertEquals('rider', $history->actor_type);
        $this->assertEquals($user->id, $history->actor_id);
        $this->assertStringContainsString($reason->label(), (string) $history->note);
        // The buyer can read history notes, so the rider's free text must not be in it.
        if ($note) {
            $this->assertStringNotContainsString($note, (string) $history->note);
        }

        $log = DeliveryLog::where('parcel_id', $parcel->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals(DeliveryLog::OUTCOME_DELIVERY_FAILED, $log->outcome);
        $this->assertStringContainsString($code, (string) $log->notes);
        $this->assertStringContainsString($reason->label(), (string) $log->notes);
    }

    public function test_other_requires_a_note_and_an_unknown_reason_is_rejected(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider);

        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'OTHER'])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'OTHER', 'note' => '   '])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'BECAUSE'])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->markFailed($user, $parcel->tracking_number, [])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'REFUSED', 'note' => str_repeat('x', 501)])
            ->assertStatus(422)->assertJsonValidationErrors(['note']);
        // The hub and the company read the note: it must be words, not symbols, digits or a fragment.
        foreach (['.....', '1234567', 'abc', '!!! ???'] as $bad) {
            $this->markFailed($user, $parcel->tracking_number, ['reason' => 'OTHER', 'note' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors(['note']);
            $this->markFailed($user, $parcel->tracking_number, ['reason' => 'RECIPIENT_UNAVAILABLE', 'note' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors(['note']);
        }

        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->fresh()->status);
        $this->assertSame(0, $parcel->fresh()->delivery_attempts);
    }

    public function test_a_second_failed_attempt_on_a_reassigned_parcel_increments_attempts_again(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, overrides: ['delivery_attempts' => 1]);

        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'WRONG_ADDRESS'])
            ->assertOk()->assertJsonPath('delivery_attempts', 2);
    }

    // ─── both endpoints ───────────────────────────────────────────────────────

    public function test_another_riders_or_unknown_parcel_is_the_same_404_for_both_endpoints(): void
    {
        [$user] = $this->createRider();
        [, $other] = $this->createRider();
        $theirs = $this->createParcel($other);

        $a = $this->deliver($user, $theirs->tracking_number, ['cod_collected' => '1']);
        $b = $this->deliver($user, 'LIT-000000-NOPE00', ['cod_collected' => '1']);
        $c = $this->markFailed($user, $theirs->tracking_number, ['reason' => 'REFUSED']);
        $d = $this->markFailed($user, 'LIT-000000-NOPE00', ['reason' => 'REFUSED']);

        foreach ([$a, $b, $c, $d] as $response) {
            $response->assertStatus(404);
        }
        $this->assertEquals($a->json('message'), $b->json('message'));
        $this->assertEquals($c->json('message'), $d->json('message'));
        $this->assertEquals($a->json('message'), $c->json('message'));

        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $theirs->fresh()->status);
        $this->assertSame([], Storage::disk('ids')->allFiles());
    }

    public function test_a_parcel_that_is_not_out_for_delivery_returns_409_including_on_a_double_submit(): void
    {
        [$user, $rider] = $this->createRider();

        foreach ([[Parcel::STATUS_ASSIGNED_TO_RIDER, OrderStatus::ASSIGNED_TO_RIDER], [Parcel::STATUS_SORTED, OrderStatus::SORTED]] as [$status, $orderStatus]) {
            $p = $this->createParcel($rider, 'gcash', $status, $orderStatus);
            $this->deliver($user, $p->tracking_number)->assertStatus(409);
            $this->markFailed($user, $p->tracking_number, ['reason' => 'REFUSED'])->assertStatus(409);
            $this->assertEquals($status, $p->fresh()->status);
        }
        $this->assertSame([], Storage::disk('ids')->allFiles());

        // Double submit of "delivered": the second must not apply twice or keep a second file.
        $d = $this->createParcel($rider, 'gcash');
        $this->deliver($user, $d->tracking_number)->assertOk();
        $this->deliver($user, $d->tracking_number)->assertStatus(409);
        $this->assertSame(1, OrderStatusHistory::where('order_id', $d->order_id)->where('to_status', 'DELIVERED')->count());
        $this->assertSame(1, DeliveryLog::where('parcel_id', $d->id)->count());
        $this->assertCount(2, Storage::disk('ids')->allFiles());

        // Double submit of "failed".
        $f = $this->createParcel($rider);
        $this->markFailed($user, $f->tracking_number, ['reason' => 'REFUSED'])->assertOk();
        $this->markFailed($user, $f->tracking_number, ['reason' => 'REFUSED'])->assertStatus(409);
        $this->assertSame(1, $f->fresh()->delivery_attempts);

        // Cross-outcome: a delivered parcel cannot then be failed, and the other way round.
        $this->markFailed($user, $d->tracking_number, ['reason' => 'REFUSED'])->assertStatus(409);
        $this->deliver($user, $f->tracking_number, ['cod_collected' => '1'])->assertStatus(409);
    }

    public function test_a_disputed_order_is_rejected_with_nothing_written_and_no_file_kept(): void
    {
        [$user, $rider] = $this->createRider();
        $parcel = $this->createParcel($rider, 'gcash', orderStatus: OrderStatus::DISPUTED);

        $this->deliver($user, $parcel->tracking_number)->assertStatus(422);
        $this->markFailed($user, $parcel->tracking_number, ['reason' => 'REFUSED'])->assertStatus(422);

        $parcel->refresh();
        $this->assertEquals(Parcel::STATUS_OUT_FOR_DELIVERY, $parcel->status);
        $this->assertEquals(OrderStatus::DISPUTED, $parcel->order->fresh()->status);
        $this->assertNull($parcel->delivered_at);
        $this->assertNull($parcel->failed_at);
        $this->assertSame(0, $parcel->delivery_attempts);
        $this->assertSame(0, DeliveryLog::where('parcel_id', $parcel->id)->count());
        $this->assertSame(0, OrderStatusHistory::where('order_id', $parcel->order_id)->count());
        $this->assertSame([], Storage::disk('ids')->allFiles());
    }

    public function test_pending_and_disapproved_riders_are_forbidden_and_unauthenticated_gets_401(): void
    {
        foreach ([Rider::STATUS_PENDING, Rider::STATUS_DISAPPROVED] as $status) {
            [$user] = $this->createRider($status);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/rider/deliveries/failure-reasons')->assertStatus(403);
            $this->deliver($user, 'LIT-000000-AAAAAA')->assertStatus(403);
            $this->markFailed($user, 'LIT-000000-AAAAAA', ['reason' => 'REFUSED'])->assertStatus(403);
        }

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/rider/deliveries/failure-reasons')->assertStatus(401);
        $this->postJson('/api/v1/rider/deliveries/LIT-1/delivered')->assertStatus(401);
        $this->postJson('/api/v1/rider/deliveries/LIT-1/failed', ['reason' => 'REFUSED'])->assertStatus(401);
    }

    // ─── proof endpoint ───────────────────────────────────────────────────────

    public function test_the_proof_endpoint_authorization_matrix(): void
    {
        [$riderUser, $rider] = $this->createRider();
        [$otherRiderUser] = $this->createRider();
        [$otherHubUser] = $this->createHub('Other Hub');
        $seller = $this->makeUser('seller', 'Selena');
        $otherSeller = $this->makeUser('seller', 'Other');
        $buyer = $this->makeUser('buyer', 'Bea');
        $otherBuyer = $this->makeUser('buyer', 'Otto');
        $admin = $this->makeUser('admin', 'Admin');

        $parcel = $this->createParcel($rider, 'gcash', buyer: $buyer, seller: $seller);
        $this->deliver($riderUser, $parcel->tracking_number)->assertOk();
        $url = '/api/v1/parcels/' . $parcel->tracking_number . '/delivery-proof';

        $allowed = ['assigned rider' => $riderUser, 'own hub' => $this->hubUser, "order's seller" => $seller, "order's buyer" => $buyer, 'admin' => $admin];
        foreach ($allowed as $who => $user) {
            $response = $this->actingAs($user, 'sanctum')->get($url);
            $response->assertOk();
            $this->assertStringStartsWith('image/', (string) $response->headers->get('Content-Type'), "content type for $who");
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }

        $denied = ['another rider' => $otherRiderUser, 'another hub' => $otherHubUser, 'another seller' => $otherSeller, 'another buyer' => $otherBuyer];
        foreach ($denied as $who => $user) {
            $this->actingAs($user, 'sanctum')->get($url)->assertStatus(404);
        }

        // Case and whitespace in the tracking number do not matter.
        $this->actingAs($admin, 'sanctum')->get('/api/v1/parcels/' . strtolower($parcel->tracking_number) . '/delivery-proof')->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson($url)->assertStatus(401);
    }

    public function test_the_proof_is_never_reachable_by_a_public_path_and_a_parcel_without_proof_is_404(): void
    {
        [$riderUser, $rider] = $this->createRider();
        $admin = $this->makeUser('admin', 'Admin');
        $parcel = $this->createParcel($rider, 'gcash');
        $this->deliver($riderUser, $parcel->tracking_number)->assertOk();
        $path = $parcel->fresh()->delivery_proof_path;

        // Not on the public disk, and the public /storage route does not serve it.
        $this->assertFalse(Storage::disk('public')->exists($path));
        // (Laravel's built-in storage route answers 403 to unsigned requests; a 404 is just as good. What
        // matters is that the bytes are never served without going through the authorized endpoint.)
        foreach (['/storage/' . $path, '/storage/ids/' . $path, '/' . $path, '/ids/' . $path] as $publicUrl) {
            $response = $this->get($publicUrl);
            $this->assertContains($response->getStatusCode(), [403, 404], "public path $publicUrl must not be served");
            $this->assertStringNotContainsString('image/', (string) $response->headers->get('Content-Type'));
        }
        // No proof yet (still out for delivery), unknown parcel: same 404 for admin.
        $pending = $this->createParcel($rider, 'gcash');
        $this->actingAs($admin, 'sanctum')->get('/api/v1/parcels/' . $pending->tracking_number . '/delivery-proof')->assertStatus(404);
        $this->actingAs($admin, 'sanctum')->get('/api/v1/parcels/LIT-000000-NOPE00/delivery-proof')->assertStatus(404);

        // A proof row pointing at a missing file is a clean 404, not a 500.
        Storage::disk('ids')->delete($path);
        $this->actingAs($admin, 'sanctum')->get('/api/v1/parcels/' . $parcel->tracking_number . '/delivery-proof')->assertStatus(404);
    }

    // ─── end to end ───────────────────────────────────────────────────────────

    public function test_end_to_end_one_parcel_delivered_and_one_failed_and_both_sides_see_the_right_statuses(): void
    {
        Mail::fake();
        [$riderUser, $rider] = $this->createRider();
        RiderAreaAssignment::create([
            'rider_id' => $rider->id, 'sorting_center_id' => $this->hub->id, 'area_label' => 'Area',
            'coverage_barangays' => [self::CODE_A, self::CODE_C], 'is_active' => true,
        ]);

        $buyer = $this->makeUser('buyer', 'Bea');
        $seller = $this->makeUser('seller', 'Selena');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'E2E Shop ' . uniqid(), 'shop_category' => 'Fashion',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', uniqid()), 'government_id_image_path' => 'uploads/id1.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'address_street' => '456 Burgos St', 'address_province_code' => '040000000', 'address_city_code' => '043405000',
            'address_barangay_code' => self::CODE_A, 'shop_contact_number' => '09171112222',
        ]);

        $orders = [];
        foreach (['cod', 'gcash'] as $i => $payment) {
            $order = Order::create([
                'buyer_id' => $buyer->id, 'order_number' => 'VEL-E2E-' . $i . substr(uniqid(), -6),
                'subtotal' => 500.00, 'shipping_fee' => 99.00, 'total' => 599.00,
                'payment_method' => $payment, 'payment_status' => $payment === 'gcash' ? 'paid' : 'pending',
                'status' => OrderStatus::PREPARING,
                'shipping_name' => 'Maria Santos', 'shipping_phone' => '09187654321', 'shipping_address' => '12 Sampaguita St',
                'shipping_province' => 'Metro Manila', 'shipping_city' => 'Quezon City', 'shipping_barangay' => 'Batasan Hills',
                'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => self::CODE_C,
            ]);
            OrderItem::create([
                'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => 'Floral Summer Dress',
                'variant_label' => 'Medium / Red', 'unit_price' => 500.00, 'quantity' => 1, 'subtotal' => 500.00,
                'commission_rate' => 0.10, 'commission_amount' => 50.00, 'seller_earnings' => 450.00, 'payout_status' => 'pending_release',
            ]);
            $this->actingAs($seller, 'sanctum')
                ->patchJson("/api/v1/seller/orders/{$order->id}/status", ['status' => 'READY_FOR_PICKUP'])->assertOk();
            $orders[] = $order;
        }
        [$codOrder, $prepaidOrder] = $orders;
        $trackings = Parcel::whereIn('order_id', [$codOrder->id, $prepaidOrder->id])->orderBy('order_id')->pluck('tracking_number')->all();
        [$codTracking, $prepaidTracking] = $trackings;

        $this->actingAs($riderUser, 'sanctum')->postJson("/api/v1/rider/pickups/sellers/{$seller->id}/accept")->assertOk();
        $this->actingAs($riderUser, 'sanctum')->postJson('/api/v1/rider/pickups/confirm', ['tracking_numbers' => $trackings])->assertOk();
        foreach ($trackings as $tn) {
            $this->actingAs($this->hubUser, 'sanctum')->postJson("/api/v1/hub/parcels/{$tn}/receive")->assertOk();
        }
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/sorting/sort', ['tracking_numbers' => $trackings])->assertOk();
        $this->actingAs($this->hubUser, 'sanctum')->postJson('/api/v1/hub/dispatch/assign', ['rider_id' => $rider->id, 'tracking_numbers' => $trackings])->assertOk();
        $this->actingAs($riderUser, 'sanctum')->postJson('/api/v1/rider/deliveries/start', ['tracking_numbers' => $trackings])->assertOk();

        // Not allowed to skip a step: COD needs the cash confirmation.
        $this->deliver($riderUser, $codTracking)->assertStatus(422);
        $this->deliver($riderUser, $codTracking, ['cod_collected' => '1', 'received_by' => 'Maria'])->assertOk();
        $this->markFailed($riderUser, $prepaidTracking, ['reason' => 'RECIPIENT_UNAVAILABLE'])->assertOk();

        $codView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$codOrder->id}");
        $codView->assertOk()->assertJsonPath('data.status', OrderStatus::DELIVERED->value);
        $failedView = $this->actingAs($seller, 'sanctum')->getJson("/api/v1/seller/orders/{$prepaidOrder->id}");
        $failedView->assertOk()->assertJsonPath('data.status', OrderStatus::DELIVERY_FAILED->value);

        $buyerCod = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$codOrder->id}");
        $buyerCod->assertOk()->assertJsonPath('data.status', OrderStatus::DELIVERED->value);
        $buyerFailed = $this->actingAs($buyer, 'sanctum')->getJson("/api/v1/buyer/orders/{$prepaidOrder->id}");
        $buyerFailed->assertOk()->assertJsonPath('data.status', OrderStatus::DELIVERY_FAILED->value);

        $notes = collect($buyerFailed->json('data.status_history'))->pluck('note')->filter()->implode(' | ');
        $this->assertStringContainsString('Recipient unavailable', $notes);

        // The buyer and seller can fetch the proof; the failed one has none.
        $this->actingAs($buyer, 'sanctum')->get("/api/v1/parcels/{$codTracking}/delivery-proof")->assertOk();
        $this->actingAs($seller, 'sanctum')->get("/api/v1/parcels/{$codTracking}/delivery-proof")->assertOk();
        $this->actingAs($buyer, 'sanctum')->get("/api/v1/parcels/{$prepaidTracking}/delivery-proof")->assertStatus(404);

        // The rider's lists no longer show either stop.
        $this->actingAs($riderUser, 'sanctum')->getJson('/api/v1/rider/deliveries?view=out_for_delivery')
            ->assertOk()->assertJsonPath('meta.out_for_delivery_count', 0)->assertJsonCount(0, 'data');
    }
}
