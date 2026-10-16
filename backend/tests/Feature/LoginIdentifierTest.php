<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Sign-in with ONE identifier (email or username, any letter case), and the rule that a username is only ever written
 * by the demo seeder: registration, profile update and mass assignment ignore it, and no payload shows it.
 */
class LoginIdentifierTest extends TestCase
{
    use DatabaseTransactions;

    private const PASSWORD = 'Password123!';
    private const GENERIC = 'Invalid credentials.';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('ids');
        Storage::fake('public');
        // The throttle has its own test; everywhere else the 5-per-minute limit would only get in the way.
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    private function makeUser(string $role = 'buyer', ?string $username = null, array $attributes = []): User
    {
        $user = new User(array_merge([
            'first_name'    => 'Test',
            'last_name'     => ucfirst($role),
            'email'         => $role . '.' . uniqid() . '@example.com',
            'phone'         => '+63917' . random_int(1000000, 9999999),
            'password'      => Hash::make(self::PASSWORD),
            'date_of_birth' => '1990-01-01',
            'sex'           => 'male',
        ], $attributes));
        $user->role = $role;
        $user->status = 'active';
        $user->username = $username;
        $user->save();

        return $user;
    }

    private function makeHub(User $owner, string $status = SortingCenter::STATUS_APPROVED): SortingCenter
    {
        return SortingCenter::create([
            'user_id'            => $owner->id,
            'hub_name'           => 'Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '1 Hub St',
            'status'             => $status,
            'coverage_barangays' => ['043405001'],
        ]);
    }

    private function makeRider(User $user, SortingCenter $hub, string $status): Rider
    {
        return Rider::create([
            'user_id'              => $user->id,
            'sorting_center_id'    => $hub->id,
            'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'         => 'AB-' . random_int(1000, 9999),
            'or_cr_path'           => 'ids/or_cr.pdf',
            'drivers_license_path' => 'ids/license.pdf',
            'status'               => $status,
            'submitted_at'         => now(),
        ]);
    }

    private function login(array $credentials)
    {
        return $this->postJson('/api/v1/auth/login', $credentials);
    }

    // ── Signing in ──────────────────────────────────────────────────────────

    public function test_sign_in_by_email_by_username_and_by_mixed_case_all_work_and_return_the_same_account(): void
    {
        $user = $this->makeUser('buyer', 'sample.user');
        $email = $user->email;

        $attempts = [
            'email key, email'          => ['email' => $email],
            'identifier key, email'     => ['identifier' => $email],
            'identifier, username'      => ['identifier' => 'sample.user'],
            'email key, username'       => ['email' => 'sample.user'],
            'upper-case username'       => ['identifier' => 'SAMPLE.USER'],
            'mixed-case username'       => ['identifier' => 'SaMpLe.UsEr'],
            'mixed-case email'          => ['identifier' => strtoupper($email)],
            'padded username'           => ['identifier' => '  sample.user  '],
        ];
        foreach ($attempts as $label => $identity) {
            $response = $this->login($identity + ['password' => self::PASSWORD]);
            $response->assertOk();
            $this->assertSame($user->id, $response->json('data.id'), $label);
            $this->assertNotEmpty($response->json('token'), $label);
        }
    }

    public function test_a_wrong_password_and_an_unknown_identifier_get_the_same_generic_answer(): void
    {
        $this->makeUser('buyer', 'real.user');

        $wrongPassword = $this->login(['identifier' => 'real.user', 'password' => 'WrongPass1!']);
        $unknownUser = $this->login(['identifier' => 'nobody.here', 'password' => self::PASSWORD]);
        $unknownEmail = $this->login(['identifier' => 'nobody@example.com', 'password' => self::PASSWORD]);
        $oldKeyUnknown = $this->login(['email' => 'nobody@example.com', 'password' => self::PASSWORD]);
        $malformed = $this->login(['identifier' => str_repeat('x', 200) . ' <script>', 'password' => self::PASSWORD]);

        foreach ([$wrongPassword, $unknownUser, $unknownEmail, $oldKeyUnknown, $malformed] as $response) {
            $response->assertStatus(401)->assertExactJson(['message' => self::GENERIC]);
        }
    }

    public function test_the_identifier_and_password_are_required(): void
    {
        $this->login(['password' => self::PASSWORD])->assertStatus(422)->assertJsonValidationErrors(['identifier', 'email']);
        $this->login(['identifier' => 'real.user'])->assertStatus(422)->assertJsonValidationErrors(['password']);
        $this->login(['identifier' => ['array']])->assertStatus(422);
    }

    public function test_a_username_cannot_be_used_to_sign_in_as_someone_elses_email(): void
    {
        $this->makeUser('buyer', 'alice');
        $bob = $this->makeUser('buyer', 'bob');

        // Alice's username with Bob's password is just a wrong password.
        $this->login(['identifier' => 'alice', 'password' => self::PASSWORD])->assertOk();
        $this->login(['identifier' => 'alice', 'password' => 'Other1!pass'])->assertStatus(401);
        $this->login(['identifier' => $bob->email, 'password' => self::PASSWORD])->assertOk()->assertJsonPath('data.id', $bob->id);
    }

    // ── Gating is unchanged, whichever way the person identifies themselves ─

    public function test_suspended_accounts_are_blocked_and_applicants_sign_in_by_username_and_by_email(): void
    {
        $owner = $this->makeUser('buyer', 'hub.owner');
        $hub = $this->makeHub($owner);

        $suspended = $this->makeUser('buyer', 'suspended.user');
        $suspended->status = 'suspended';
        $suspended->save();

        $pendingHubOwner = $this->makeUser('buyer', 'pending.hub');
        $pendingHub = $this->makeHub($pendingHubOwner, SortingCenter::STATUS_PENDING);
        $rejectedHubOwner = $this->makeUser('buyer', 'rejected.hub');
        $this->makeHub($rejectedHubOwner, SortingCenter::STATUS_REJECTED);
        $suspendedHubOwner = $this->makeUser('buyer', 'suspended.hub');
        $this->makeHub($suspendedHubOwner, SortingCenter::STATUS_SUSPENDED);

        $pendingRider = $this->makeUser('rider', 'pending.rider');
        $this->makeRider($pendingRider, $hub, Rider::STATUS_PENDING);
        $rejectedRider = $this->makeUser('rider', 'rejected.rider');
        $this->makeRider($rejectedRider, $hub, Rider::STATUS_DISAPPROVED);
        $activeRider = $this->makeUser('rider', 'active.rider');
        $this->makeRider($activeRider, $hub, Rider::STATUS_ACTIVE);

        // A suspended account or hub is an admin decision: refused, however the person identifies themselves.
        $blocked = [
            [$suspended, 'suspended.user', 'has been suspended'],
            [$suspendedHubOwner, 'suspended.hub', 'hub account has been suspended'],
        ];
        foreach ($blocked as [$user, $username, $text]) {
            foreach ([['identifier' => $username], ['identifier' => strtoupper($username)], ['email' => $user->email]] as $identity) {
                $response = $this->login($identity + ['password' => self::PASSWORD]);
                $response->assertStatus(403);
                $this->assertStringContainsString($text, $response->json('message'), $username);
                $this->assertNull($response->json('token'));
            }
        }

        // Hub and courier applicants apply from their own account, so a pending or refused application never blocks
        // sign-in; the payload carries the status the hub or courier page shows.
        $applicants = [
            [$pendingHubOwner, 'pending.hub', 'data.sorting_center.status', 'PENDING'],
            [$rejectedHubOwner, 'rejected.hub', 'data.sorting_center.status', 'REJECTED'],
            [$pendingRider, 'pending.rider', 'data.rider.status', 'PENDING'],
            [$rejectedRider, 'rejected.rider', 'data.rider.status', 'DISAPPROVED'],
        ];
        foreach ($applicants as [$user, $username, $path, $status]) {
            foreach ([['identifier' => $username], ['email' => $user->email]] as $identity) {
                $this->login($identity + ['password' => self::PASSWORD])->assertOk()->assertJsonPath($path, $status);
            }
        }
        $this->assertGreaterThan(0, $pendingHub->fresh()->user->tokens()->count());

        // The approved hub owner and the active rider get in, with their portals' data.
        $this->login(['identifier' => 'hub.owner', 'password' => self::PASSWORD])->assertOk()->assertJsonPath('data.sorting_center.status', 'APPROVED');
        $this->login(['identifier' => 'active.rider', 'password' => self::PASSWORD])->assertOk()->assertJsonPath('data.rider.status', 'ACTIVE');
    }

    public function test_the_throttle_still_applies_to_every_way_of_signing_in(): void
    {
        $this->withMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->makeUser('buyer', 'throttled.user');
        RateLimiter::clear(md5('127.0.0.1'));

        // 5 attempts per minute per address, mixing the three ways to identify yourself.
        $this->login(['identifier' => 'throttled.user', 'password' => 'Wrong1!pass'])->assertStatus(401);
        $this->login(['identifier' => 'THROTTLED.USER', 'password' => 'Wrong1!pass'])->assertStatus(401);
        $this->login(['email' => 'throttled@example.com', 'password' => 'Wrong1!pass'])->assertStatus(401);
        $this->login(['identifier' => 'nobody', 'password' => 'Wrong1!pass'])->assertStatus(401);
        $this->login(['identifier' => 'throttled.user', 'password' => self::PASSWORD])->assertOk();

        $this->login(['identifier' => 'throttled.user', 'password' => self::PASSWORD])->assertStatus(429);
        $this->login(['email' => 'throttled@example.com', 'password' => 'x'])->assertStatus(429);
    }

    // ── A username is only ever written by the demo seeder ──────────────────

    public function test_registration_endpoints_ignore_a_submitted_username(): void
    {
        // The hub and courier applications act on the signed-in account; a smuggled username or role is ignored.
        $hubApplicant = $this->makeUser('buyer');
        $hubApplicant->forceFill(['government_id_image_path' => 'ids/front.jpg', 'date_of_birth' => '1990-01-01'])->save();
        $this->actingAs($hubApplicant, 'sanctum')->postJson('/api/v1/auth/apply-hub', [
            'hub_name'              => 'Hub Z', 'address_province' => 'Laguna', 'address_city' => 'Santa Cruz',
            'address_barangay'      => 'Poblacion I', 'address_street' => '1 Street',
            'dti_permit'            => UploadedFile::fake()->create('permit.pdf', 100, 'application/pdf'),
            'coverage_barangays'    => ['043404001'],
            'username'              => 'sneaky.hub',
            'role'                  => 'admin',
        ])->assertCreated();
        $this->assertNull($hubApplicant->fresh()->username);
        $this->assertSame('buyer', $hubApplicant->fresh()->role);

        $hub = $this->makeHub($this->makeUser('buyer'));
        $riderApplicant = $this->makeUser('buyer');
        $riderApplicant->forceFill(['date_of_birth' => '1995-03-20'])->save();
        $this->actingAs($riderApplicant, 'sanctum')->postJson('/api/v1/auth/apply-rider', [
            'sorting_center_id'     => $hub->id, 'vehicle_type' => 'Motorcycle', 'plate_number' => 'ND 1234',
            'or_cr_image'           => UploadedFile::fake()->create('or_cr.jpg', 100, 'image/jpeg'),
            'drivers_license_image' => UploadedFile::fake()->create('license.pdf', 100, 'application/pdf'),
            'username'              => 'sneaky.rider',
            'role'                  => 'admin',
        ])->assertCreated();
        $this->assertNull($riderApplicant->fresh()->username);
        $this->assertSame('buyer', $riderApplicant->fresh()->role);
        $this->assertSame(0, User::whereIn('username', ['sneaky.hub', 'sneaky.rider'])->count());
    }

    public function test_profile_update_and_mass_assignment_ignore_a_username(): void
    {
        $user = $this->makeUser('buyer', 'original.name');

        $this->actingAs($user, 'sanctum')
            ->patchJson('/api/v1/auth/profile', ['first_name' => 'Renamed', 'username' => 'taken.over', 'role' => 'admin'])
            ->assertOk()->assertJsonPath('data.first_name', 'Renamed');
        $this->assertSame('original.name', $user->fresh()->username);
        $this->assertSame('buyer', $user->fresh()->role);

        // Mass assignment through the model, create and update alike.
        $fresh = User::create([
            'first_name' => 'Mass', 'last_name' => 'Assigned', 'email' => 'mass.' . uniqid() . '@example.com',
            'phone' => '+63917' . random_int(1000000, 9999999), 'password' => self::PASSWORD,
            'username' => 'mass.assigned',
        ]);
        $this->assertNull($fresh->fresh()->username);
        $fresh->update(['username' => 'mass.updated']);
        $fresh->fill(['username' => 'mass.filled'])->save();
        $this->assertNull($fresh->fresh()->username);
        $this->assertFalse((new User())->isFillable('username'));
    }

    public function test_the_username_is_absent_from_every_payload_that_shows_a_user(): void
    {
        $secret = 'zq.hidden.handle';
        $user = $this->makeUser('buyer', $secret);
        $admin = $this->makeUser('admin');

        $login = $this->login(['identifier' => $secret, 'password' => self::PASSWORD])->assertOk();
        $this->assertArrayNotHasKey('username', $login->json('data'));
        $this->assertStringNotContainsStringIgnoringCase($secret, $login->getContent());

        $me = $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
        $this->assertStringNotContainsStringIgnoringCase($secret, $me->getContent());

        $this->actingAs($admin, 'sanctum');
        foreach (['/api/v1/admin/users', '/api/v1/admin/users?search=zq', '/api/v1/admin/contacts/search?q=Test', '/api/v1/admin/buyer-applications?status=pending'] as $url) {
            $response = $this->getJson($url);
            $this->assertLessThan(500, $response->status(), $url);
            $this->assertStringNotContainsStringIgnoringCase($secret, $response->getContent(), $url);
        }

        // Even a raw model serialisation hides it.
        $this->assertArrayNotHasKey('username', $user->fresh()->toArray());
    }

    public function test_usernames_are_unique_in_any_letter_case(): void
    {
        $this->makeUser('buyer', 'sole.owner');
        $this->expectException(\Illuminate\Database\QueryException::class);
        $this->makeUser('buyer', 'SOLE.OWNER');
    }
}
