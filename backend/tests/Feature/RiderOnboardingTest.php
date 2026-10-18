<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Riders cannot register themselves (A13): an approved courier company adds each rider, who starts Pending
 * Activation and sets a password from a one-time emailed link valid for 24 hours (Rider Account Creation workbook).
 */
class RiderOnboardingTest extends TestCase
{
    use DatabaseTransactions;

    private LogisticsCompany $company;
    private User $owner;
    private SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Mail::fake();

        $this->owner = $this->user();
        $code = strtoupper(Str::random(4));
        $this->company = LogisticsCompany::create([
            'name' => 'Bilis Hatid ' . $code, 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $this->owner->id,
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->owner->id, 'role' => 'owner']);
        $this->hub = SortingCenter::create([
            'logistics_company_id' => $this->company->id, 'user_id' => $this->user()->id, 'hub_name' => 'Pasig Hub ' . $code,
            'address_province' => 'Metro Manila', 'address_city' => 'Pasig', 'address_barangay' => 'Kapitolyo', 'address_street' => '88 West Capitol',
            'coverage_barangays' => ['137403017'], 'status' => SortingCenter::STATUS_APPROVED,
        ]);
    }

    private function user(string $role = 'buyer'): User
    {
        return User::forceCreate([
            'first_name' => 'Carlos', 'last_name' => 'Mendoza', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Hatid@2026'), 'role' => $role, 'status' => 'active',
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Pedro Jose', 'last_name' => 'Garcia', 'date_of_birth' => '1995-03-22',
            'email' => 'pedro.' . Str::random(6) . '@example.com', 'phone' => '0945' . random_int(1000000, 9999999),
            'license_number' => 'N01-23-' . random_int(100000, 999999), 'license_expiry' => '2030-03-22',
            'vehicle_type' => 'Motorcycle', 'plate_number' => strtoupper(Str::random(3)) . random_int(100, 999),
            'drivers_license_image' => UploadedFile::fake()->create('drivers_license.jpg', 1500, 'image/jpeg'),
            'or_cr_image' => UploadedFile::fake()->create('or_cr.pdf', 900, 'application/pdf'),
        ], $overrides);
    }

    private function add(array $overrides = [])
    {
        Sanctum::actingAs($this->owner);

        return $this->post('/api/v1/logistics/riders', $this->payload($overrides), ['Accept' => 'application/json']);
    }

    private function activationToken(string $email): string
    {
        $token = null;
        Mail::assertSent(NoticeMail::class, function (NoticeMail $mail) use ($email, &$token) {
            if ($mail->kind !== 'rider_activation' || ! $mail->hasTo($email)) {
                return false;
            }
            parse_str((string) parse_url($mail->notice['actionUrl'], PHP_URL_QUERY), $q);
            $token = $q['token'] ?? null;

            return true;
        });

        return (string) $token;
    }

    public function test_riders_cannot_apply_themselves(): void
    {
        Sanctum::actingAs($this->user());
        $this->postJson('/api/v1/auth/apply-rider', [])->assertForbidden();
    }

    public function test_the_company_adds_a_rider_who_starts_pending_activation_and_gets_one_email(): void
    {
        $response = $this->add(['email' => 'pedrojose.garcia@example.com'])->assertCreated()
            ->assertJsonPath('data.status', Rider::STATUS_PENDING_ACTIVATION)
            ->assertJsonPath('data.hub_id', $this->hub->id);

        $rider = Rider::findOrFail($response->json('data.id'));
        $this->assertSame($this->company->id, $rider->logistics_company_id);
        $this->assertSame('pending_activation', $rider->user->status);
        $this->assertSame('rider', $rider->user->role);
        $this->assertNotEmpty($this->activationToken('pedrojose.garcia@example.com'));
        Mail::assertSent(NoticeMail::class, fn (NoticeMail $m) => $m->kind === 'rider_activation' && $m->hasTo('pedrojose.garcia@example.com'));
        $this->assertTrue(AuditLog::where('action', 'rider.added')->where('subject_id', $rider->id)->exists());

        $ids = collect($this->getJson('/api/v1/logistics/riders')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($rider->id));
    }

    public function test_each_field_is_validated_with_its_own_message(): void
    {
        $today = CarbonImmutable::now('Asia/Manila');
        $cases = [
            'first_name' => ['Pedro Jose99', 'P', str_repeat('a', 51)],
            'last_name' => ['Dela Cruz@#'],
            'date_of_birth' => [$today->subYears(18)->addDay()->toDateString(), $today->addDay()->toDateString()],
            'phone' => ['0917ABC4567', '0917-123-456', '12345678901', '02-8123-4567', '0917123456', '091712345678'],
            'license_number' => ['N01-23-45678', 'N01-23-4567890', '101-23-456789', 'N0123456789X'],
            'license_expiry' => [$today->subDay()->toDateString()],
            'vehicle_type' => ['Bicycle'],
        ];
        foreach ($cases as $field => $values) {
            foreach ($values as $value) {
                $this->add([$field => $value])->assertStatus(422)->assertJsonValidationErrors($field);
            }
        }
        foreach (['first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'license_number', 'license_expiry', 'vehicle_type', 'plate_number', 'drivers_license_image', 'or_cr_image'] as $field) {
            $payload = $this->payload();
            unset($payload[$field]);
            Sanctum::actingAs($this->owner);
            $this->post('/api/v1/logistics/riders', $payload, ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors($field);
        }
        $this->assertSame(0, Rider::where('logistics_company_id', $this->company->id)->count());
    }

    public function test_age_and_expiry_boundaries_follow_manila_dates(): void
    {
        $today = CarbonImmutable::now('Asia/Manila');
        $this->add(['date_of_birth' => $today->subYears(18)->toDateString()])->assertCreated();
        $this->add(['date_of_birth' => $today->subYears(18)->subDay()->toDateString()])->assertCreated();
        $this->add(['license_expiry' => $today->toDateString()])->assertCreated();
        $this->add(['license_expiry' => $today->addDay()->toDateString()])->assertCreated();
    }

    public function test_duplicate_license_plate_email_and_mobile_are_refused(): void
    {
        $this->add(['license_number' => 'N01-23-456789', 'plate_number' => '123ABC', 'email' => 'first@example.com', 'phone' => '09451239876'])->assertCreated();

        $this->add(['license_number' => 'N01-23-456789'])->assertStatus(422)->assertJsonValidationErrors('license_number');
        $this->add(['plate_number' => '123abc'])->assertStatus(422)->assertJsonValidationErrors('plate_number');
        $this->add(['email' => 'FIRST@example.com'])->assertStatus(422)->assertJsonValidationErrors('email');
        $this->add(['phone' => '+639451239876'])->assertStatus(422)->assertJsonValidationErrors('phone');
    }

    public function test_buyers_and_sellers_cannot_add_riders(): void
    {
        foreach (['buyer', 'seller'] as $role) {
            Sanctum::actingAs($this->user($role));
            $this->post('/api/v1/logistics/riders', $this->payload(), ['Accept' => 'application/json'])->assertForbidden();
        }
        $this->post('/api/v1/logistics/riders', $this->payload(), ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_activation_sets_the_password_once_and_login_is_denied_before_it(): void
    {
        $this->add(['email' => 'rider.one@example.com'])->assertCreated();
        $token = $this->activationToken('rider.one@example.com');
        app('auth')->forgetGuards();

        $this->postJson('/api/v1/auth/login', ['identifier' => 'rider.one@example.com', 'password' => 'Rider@2026'])
            ->assertForbidden()->assertJsonPath('code', 'pending_activation');

        $this->getJson('/api/v1/auth/rider-activation?token=' . $token)->assertOk()->assertJsonPath('data.company', $this->company->name);

        foreach (['Ride@26', 'rider@2026', 'RIDER@2026', 'Rider@abcd', 'Rider2026'] as $weak) {
            $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => $weak, 'password_confirmation' => $weak])
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => 'Rider@2026', 'password_confirmation' => 'Rider@2027'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertSame(Rider::STATUS_PENDING_ACTIVATION, Rider::whereHas('user', fn ($q) => $q->where('email', 'rider.one@example.com'))->value('status'));

        $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => 'Rider@2026', 'password_confirmation' => 'Rider@2026'])->assertOk();

        $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => 'Other@2026', 'password_confirmation' => 'Other@2026'])->assertNotFound();
        $this->getJson('/api/v1/auth/rider-activation?token=' . $token)->assertNotFound();

        $login = $this->postJson('/api/v1/auth/login', ['identifier' => 'rider.one@example.com', 'password' => 'Rider@2026'])->assertOk();
        $this->withToken($login->json('token'))->getJson('/api/v1/rider/me')->assertOk()
            ->assertJsonPath('data.full_name', 'Pedro Jose Garcia')
            ->assertJsonPath('data.company.name', $this->company->name)
            ->assertJsonPath('data.status', Rider::STATUS_ACTIVE);
    }

    public function test_an_expired_link_cannot_set_a_password(): void
    {
        $response = $this->add(['email' => 'late.rider@example.com'])->assertCreated();
        $token = $this->activationToken('late.rider@example.com');
        Rider::whereKey($response->json('data.id'))->update(['activation_expires_at' => now()->subMinute()]);

        $this->getJson('/api/v1/auth/rider-activation?token=' . $token)->assertStatus(410);
        $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => 'Rider@2026', 'password_confirmation' => 'Rider@2026'])->assertStatus(410);
        $this->assertSame(Rider::STATUS_PENDING_ACTIVATION, Rider::find($response->json('data.id'))->status);
    }

    public function test_resending_the_activation_email_cancels_the_first_link(): void
    {
        $response = $this->add(['email' => 'resend.rider@example.com'])->assertCreated();
        $first = $this->activationToken('resend.rider@example.com');

        $this->postJson('/api/v1/logistics/riders/' . $response->json('data.id') . '/resend-activation')->assertOk();
        $second = null;
        Mail::assertSent(NoticeMail::class, function (NoticeMail $mail) use (&$second, $first) {
            parse_str((string) parse_url($mail->notice['actionUrl'] ?? '', PHP_URL_QUERY), $q);
            if (($q['token'] ?? $first) !== $first) {
                $second = $q['token'];
            }

            return true;
        });

        $this->assertNotNull($second);
        $this->getJson('/api/v1/auth/rider-activation?token=' . $first)->assertNotFound();
        $this->getJson('/api/v1/auth/rider-activation?token=' . $second)->assertOk();
    }
}
