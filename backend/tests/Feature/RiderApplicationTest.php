<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The public "Become a rider" form: a visitor applies to ride for a hub, the hub (or its courier company) approves or
 * rejects the application, and only an approved applicant gets the link to set a password. A rejected applicant can
 * apply again with the same email.
 */
class RiderApplicationTest extends TestCase
{
    use DatabaseTransactions;

    private LogisticsCompany $company;
    private User $courierOwner;
    private User $hubOwner;
    private SortingCenter $hub;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Mail::fake();

        $this->courierOwner = $this->user();
        $code = strtoupper(Str::random(4));
        $this->company = LogisticsCompany::create([
            'name' => 'Bilis Hatid ' . $code, 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $this->courierOwner->id,
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->courierOwner->id, 'role' => 'owner']);
        $this->hubOwner = $this->user();
        $this->hub = $this->hub($this->hubOwner, SortingCenter::STATUS_APPROVED);
    }

    private function user(): User
    {
        return User::forceCreate([
            'first_name' => 'Carlos', 'last_name' => 'Mendoza', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Hatid@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    private function hub(User $owner, string $status): SortingCenter
    {
        return SortingCenter::create([
            'logistics_company_id' => $this->company->id, 'user_id' => $owner->id, 'hub_name' => 'Pasig Hub ' . Str::random(4),
            'address_province' => 'Metro Manila', 'address_city' => 'Pasig', 'address_barangay' => 'Kapitolyo', 'address_street' => '88 West Capitol',
            'coverage_barangays' => ['137403017'], 'status' => $status,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'sorting_center_id' => $this->hub->id,
            'first_name' => 'Pedro Jose', 'last_name' => 'Garcia', 'date_of_birth' => '1995-03-22',
            'email' => 'pedro.' . Str::lower(Str::random(6)) . '@example.com', 'phone' => '0945' . random_int(1000000, 9999999),
            'license_number' => 'N01-23-' . random_int(100000, 999999), 'license_expiry' => '2030-03-22',
            'vehicle_type' => 'Motorcycle', 'plate_number' => strtoupper(Str::random(3)) . random_int(100, 999),
            'drivers_license_image' => UploadedFile::fake()->create('drivers_license.jpg', 1500, 'image/jpeg'),
            'or_cr_image' => UploadedFile::fake()->create('or_cr.pdf', 900, 'application/pdf'),
            'accept_terms' => '1',
        ], $overrides);
    }

    private function apply(array $payload)
    {
        return $this->post('/api/v1/auth/register-rider', $payload, ['Accept' => 'application/json']);
    }

    private function activationToken(string $email): ?string
    {
        $token = null;
        Mail::sent(NoticeMail::class, function (NoticeMail $mail) use ($email, &$token) {
            if ($mail->kind === 'rider_activation' && $mail->hasTo($email)) {
                parse_str((string) parse_url($mail->notice['actionUrl'], PHP_URL_QUERY), $q);
                $token = $q['token'] ?? null;
            }

            return true;
        });

        return $token;
    }

    private function login(string $email)
    {
        return $this->postJson('/api/v1/auth/login', ['identifier' => $email, 'password' => 'Anything@2026']);
    }

    public function test_a_visitor_applies_and_waits_for_the_hub_without_a_usable_account(): void
    {
        $payload = $this->payload(['email' => 'Pedro.Applies@Example.com']);
        $this->apply($payload)->assertCreated()
            ->assertJsonPath('data.email', 'pedro.applies@example.com')
            ->assertJsonPath('data.hub', $this->hub->hub_name)
            ->assertJsonPath('data.reapplied', false);

        $user = User::where('email', 'pedro.applies@example.com')->firstOrFail();
        $rider = Rider::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('pending_activation', $user->status);
        $this->assertSame('rider', $user->role);
        $this->assertSame(Rider::STATUS_PENDING, $rider->status);
        $this->assertSame($this->hub->id, $rider->sorting_center_id);
        $this->assertSame($this->company->id, $rider->logistics_company_id);
        $this->assertTrue($rider->isApplicant());
        Storage::disk('ids')->assertExists([$rider->drivers_license_path, $rider->or_cr_path]);
        $this->assertTrue(AuditLog::where('action', 'rider.applied')->where('subject_id', $rider->id)->exists());

        // A "we got it" email, no activation link yet, and the hub owner is told.
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->kind === 'rider_received' && $m->hasTo('pedro.applies@example.com'));
        $this->assertNull($this->activationToken('pedro.applies@example.com'));
        $this->assertTrue($this->hubOwner->notifications()->where('data->kind', 'rider.application')->exists());

        // The applicant cannot sign in, and is told why.
        $this->login('pedro.applies@example.com')->assertForbidden()->assertJsonPath('code', 'rider_application_pending');

        // Both the hub and the courier see it waiting.
        Sanctum::actingAs($this->hubOwner);
        $hubList = $this->getJson('/api/v1/hub/riders?status=PENDING')->assertOk();
        $this->assertTrue(collect($hubList->json('data'))->contains(fn ($r) => $r['id'] === $rider->id && $r['applicant'] === true));

        Sanctum::actingAs($this->courierOwner);
        $courierList = $this->getJson('/api/v1/logistics/riders')->assertOk();
        $this->assertTrue(collect($courierList->json('data'))->contains(fn ($r) => $r['id'] === $rider->id && $r['applicant'] === true));
        $this->assertSame(1, $courierList->json('summary.applications'));
    }

    public function test_the_hub_approves_and_the_rider_sets_a_password_from_the_email(): void
    {
        $payload = $this->payload();
        $this->apply($payload)->assertCreated();
        $rider = Rider::whereHas('user', fn ($q) => $q->where('email', $payload['email']))->firstOrFail();

        Sanctum::actingAs($this->hubOwner);
        $this->postJson("/api/v1/hub/riders/{$rider->id}/approve", ['area_label' => 'Kapitolyo Loop', 'coverage_barangays' => ['137403017']])
            ->assertOk()->assertJsonPath('data.status', Rider::STATUS_PENDING_ACTIVATION);

        $rider->refresh();
        $this->assertSame(Rider::STATUS_PENDING_ACTIVATION, $rider->status);
        $this->assertSame($this->hubOwner->id, $rider->reviewed_by);
        $this->assertSame(1, $rider->areaAssignments()->where('is_active', true)->count());
        $this->assertTrue(AuditLog::where('action', 'rider.application_approved')->where('subject_id', $rider->id)->exists());

        $token = $this->activationToken($payload['email']);
        $this->assertNotEmpty($token);
        $this->postJson('/api/v1/auth/rider-activation', ['token' => $token, 'password' => 'Hatid@2026', 'password_confirmation' => 'Hatid@2026'])->assertOk();
        $this->assertSame(Rider::STATUS_ACTIVE, $rider->fresh()->status);
        $this->postJson('/api/v1/auth/login', ['identifier' => $payload['email'], 'password' => 'Hatid@2026'])->assertOk();

        // Decided once: approving again is refused.
        $this->postJson("/api/v1/hub/riders/{$rider->id}/approve")->assertStatus(422);
    }

    public function test_the_courier_company_can_approve_an_application_too(): void
    {
        $payload = $this->payload();
        $this->apply($payload)->assertCreated();
        $rider = Rider::whereHas('user', fn ($q) => $q->where('email', $payload['email']))->firstOrFail();

        Sanctum::actingAs($this->courierOwner);
        $this->postJson("/api/v1/logistics/riders/{$rider->id}/suspend", ['reason' => 'Testing the suspend rule'])->assertStatus(409);
        $this->postJson("/api/v1/logistics/riders/{$rider->id}/approve")->assertOk()
            ->assertJsonPath('data.status', Rider::STATUS_PENDING_ACTIVATION)
            ->assertJsonPath('data.applicant', false);

        $this->assertNotEmpty($this->activationToken($payload['email']));
        $this->postJson("/api/v1/logistics/riders/{$rider->id}/approve")->assertStatus(409);
    }

    public function test_a_rejected_applicant_is_told_why_and_can_apply_again_with_the_same_details(): void
    {
        $payload = $this->payload();
        $this->apply($payload)->assertCreated();
        $rider = Rider::whereHas('user', fn ($q) => $q->where('email', $payload['email']))->firstOrFail();
        $oldLicensePath = $rider->drivers_license_path;

        Sanctum::actingAs($this->hubOwner);
        $this->postJson("/api/v1/hub/riders/{$rider->id}/disapprove", ['reason' => 'The OR/CR photo is too blurry to read.'])->assertOk();
        $this->assertSame(Rider::STATUS_DISAPPROVED, $rider->fresh()->status);
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->kind === 'rider_application_rejected' && $m->hasTo($payload['email'])
            && $m->notice['highlight']['body'] === 'The OR/CR photo is too blurry to read.');
        $this->assertNull($this->activationToken($payload['email']));

        // Signing in says it was not approved, without showing the reason to whoever typed the email.
        $this->app['auth']->forgetGuards();
        $login = $this->login($payload['email'])->assertForbidden()->assertJsonPath('code', 'rider_application_rejected');
        $this->assertStringNotContainsString('blurry', $login->json('message'));

        // Same email, mobile, license and plate: the old application is updated, not duplicated.
        $again = $this->payload(array_intersect_key($payload, array_flip(['email', 'phone', 'license_number', 'plate_number'])));
        $this->apply($again)->assertCreated()->assertJsonPath('data.reapplied', true);
        $fresh = $rider->fresh();
        $this->assertSame(Rider::STATUS_PENDING, $fresh->status);
        $this->assertNull($fresh->rejection_reason);
        $this->assertTrue($fresh->isApplicant());
        $this->assertSame(1, User::where('email', $payload['email'])->count());
        Storage::disk('ids')->assertMissing($oldLicensePath);
    }

    public function test_the_email_must_be_new_and_one_application_waits_at_a_time(): void
    {
        $payload = $this->payload();
        $this->apply($payload)->assertCreated();

        $this->apply($this->payload(['email' => $payload['email']]))->assertStatus(422)
            ->assertJsonValidationErrors('email')
            ->assertJsonFragment(['email' => ['You already applied with this email. ' . $this->hub->hub_name . ' is reviewing it, and we will email you their decision.']]);

        $buyer = $this->user();
        $this->apply($this->payload(['email' => $buyer->email]))->assertStatus(422)->assertJsonValidationErrors('email');
        $this->apply($this->payload(['license_number' => $payload['license_number']]))->assertStatus(422)->assertJsonValidationErrors('license_number');
        $this->apply($this->payload(['plate_number' => $payload['plate_number']]))->assertStatus(422)->assertJsonValidationErrors('plate_number');
    }

    public function test_only_an_approved_hub_can_be_chosen_and_the_terms_must_be_accepted(): void
    {
        $pending = $this->hub($this->user(), SortingCenter::STATUS_PENDING);
        $this->apply($this->payload(['sorting_center_id' => $pending->id]))->assertStatus(422)->assertJsonValidationErrors('sorting_center_id');
        $this->apply($this->payload(['sorting_center_id' => 999999999]))->assertStatus(422)->assertJsonValidationErrors('sorting_center_id');

        $this->company->forceFill(['status' => LogisticsCompany::STATUS_SUSPENDED])->save();
        $this->apply($this->payload())->assertStatus(422)->assertJsonValidationErrors('sorting_center_id');
        $this->company->forceFill(['status' => LogisticsCompany::STATUS_APPROVED])->save();

        $payload = $this->payload();
        unset($payload['accept_terms']);
        $this->apply($payload)->assertStatus(422)->assertJsonValidationErrors('accept_terms');
        $this->apply($this->payload(['date_of_birth' => now('Asia/Manila')->subYears(17)->toDateString()]))->assertStatus(422)->assertJsonValidationErrors('date_of_birth');
    }

    public function test_a_signed_in_buyer_is_pointed_to_the_public_form(): void
    {
        Sanctum::actingAs($this->user());
        $this->postJson('/api/v1/auth/apply-rider', [])->assertForbidden();
    }
}
