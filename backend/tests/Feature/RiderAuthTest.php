<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderAuthTest extends TestCase
{
    use DatabaseTransactions;

    protected SortingCenter $hub;
    protected User $hubUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->hubUser = new User([
            'first_name'    => 'Hub',
            'last_name'     => 'Manager',
            'email'         => 'hub.mgr.' . uniqid() . '@example.com',
            'phone'         => '+63917' . rand(1000000, 9999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1985-05-10',
            'sex'           => 'male',
        ]);
        $this->hubUser->role = 'admin';
        $this->hubUser->status = 'active';
        $this->hubUser->save();

        $this->hub = SortingCenter::create([
            'user_id'            => $this->hubUser->id,
            'hub_name'           => 'Test Hub ' . uniqid(),
            'address_province'   => 'Laguna',
            'address_city'       => 'Calamba',
            'address_barangay'   => 'Real',
            'address_street'     => '123 Hub St',
            'status'             => SortingCenter::STATUS_APPROVED,
            'coverage_barangays' => ['043405001', '043405002', '043405003'],
        ]);
    }

    protected function createRiderUser(string $status = Rider::STATUS_ACTIVE): array
    {
        $rawPassword = 'Password123!';
        $user = new User([
            'first_name'    => 'Courier',
            'last_name'     => 'Tester',
            'email'         => 'courier.' . uniqid() . '@example.com',
            'phone'         => '+63918' . rand(1000000, 9999999),
            'password'      => Hash::make($rawPassword),
            'date_of_birth' => '1995-06-15',
            'sex'           => 'male',
        ]);
        $user->role = 'rider';
        $user->status = 'active';
        $user->save();

        $rider = Rider::create([
            'user_id'             => $user->id,
            'sorting_center_id'   => $this->hub->id,
            'vehicle_type'        => Rider::VEHICLE_MOTORCYCLE,
            'plate_number'        => 'AB-' . rand(1000, 9999),
            'or_cr_path'          => 'ids/or_cr_test.pdf',
            'drivers_license_path'=> 'ids/license_test.pdf',
            'status'              => $status,
            'submitted_at'        => now(),
        ]);

        return [$user, $rider, $rawPassword];
    }

    public function test_authenticated_active_rider_can_call_rider_me_and_gets_only_their_own_data(): void
    {
        [$user, $rider] = $this->createRiderUser(Rider::STATUS_ACTIVE);

        // Assign an active delivery area
        RiderAreaAssignment::create([
            'rider_id'           => $rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Area Alpha',
            'coverage_barangays' => ['043405001', '043405002'],
            'is_active'          => true,
        ]);

        // Create an unrelated second rider
        [$otherUser, $otherRider] = $this->createRiderUser(Rider::STATUS_ACTIVE);

        $token = $user->createToken('test_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me');

        $response->assertOk()
            ->assertJsonPath('data.id', $rider->id)
            ->assertJsonPath('data.user_id', $user->id)
            ->assertJsonPath('data.first_name', 'Courier')
            ->assertJsonPath('data.last_name', 'Tester')
            ->assertJsonPath('data.status', 'ACTIVE')
            ->assertJsonPath('data.vehicle_type', 'Motorcycle')
            ->assertJsonPath('data.plate_number', $rider->plate_number)
            ->assertJsonPath('data.hub.id', $this->hub->id)
            ->assertJsonPath('data.hub.hub_name', $this->hub->hub_name)
            ->assertJsonPath('data.active_areas_count', 1)
            ->assertJsonPath('data.active_areas.0.area_label', 'Area Alpha')
            ->assertJsonPath('data.active_areas.0.barangays_count', 2);

        // Ensure sensitive document paths and other rider's data are strictly omitted
        $content = $response->getContent();
        $this->assertStringNotContainsString('ids/or_cr_test.pdf', $content);
        $this->assertStringNotContainsString('ids/license_test.pdf', $content);
        $this->assertStringNotContainsString($otherRider->plate_number, $content);
        $this->assertStringNotContainsString($otherUser->email, $content);
    }

    public function test_pending_and_disapproved_riders_get_403_on_rider_routes(): void
    {
        // 1. Pending rider
        [$pendingUser] = $this->createRiderUser(Rider::STATUS_PENDING);
        $pendingToken = $pendingUser->createToken('pending_token')->plainTextToken;

        $pendingRes = $this->withHeader('Authorization', "Bearer {$pendingToken}")
            ->getJson('/api/v1/rider/me');

        $pendingRes->assertStatus(403)
            ->assertJsonPath('message', 'Your rider account is waiting for your courier company to verify it.');

        // 2. Disapproved rider
        app('auth')->forgetGuards();
        [$disapprovedUser] = $this->createRiderUser(Rider::STATUS_DISAPPROVED);
        $disapprovedToken = $disapprovedUser->createToken('disapproved_token')->plainTextToken;

        $disapprovedRes = $this->withHeader('Authorization', "Bearer {$disapprovedToken}")
            ->getJson('/api/v1/rider/me');

        $disapprovedRes->assertStatus(403)
            ->assertJsonPath('message', 'Your rider account was not approved.');
    }

    public function test_rider_logged_in_while_active_gets_403_immediately_when_status_changes_mid_session(): void
    {
        [$user, $rider] = $this->createRiderUser(Rider::STATUS_ACTIVE);
        $token = $user->createToken('session_token')->plainTextToken;

        // Active request passes
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me')
            ->assertOk();

        // Change status to DISAPPROVED in DB
        $rider->update(['status' => Rider::STATUS_DISAPPROVED]);

        // Next request with same active token is blocked immediately
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Your rider account was not approved.');

        // Change status to PENDING in DB
        $rider->update(['status' => Rider::STATUS_PENDING]);

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Your rider account is waiting for your courier company to verify it.');
    }

    public function test_buyer_seller_hub_owner_and_admin_each_get_403_on_rider_routes(): void
    {
        $buyer = new User([
            'first_name' => 'Buyer', 'last_name' => 'User', 'email' => 'buyer.' . uniqid() . '@example.com',
            'phone' => '+63917' . rand(1000000, 9999999), 'password' => Hash::make('secret'),
        ]);
        $buyer->role = 'buyer'; $buyer->status = 'active'; $buyer->save();

        $seller = new User([
            'first_name' => 'Seller', 'last_name' => 'User', 'email' => 'seller.' . uniqid() . '@example.com',
            'phone' => '+63917' . rand(1000000, 9999999), 'password' => Hash::make('secret'),
        ]);
        $seller->role = 'seller'; $seller->status = 'active'; $seller->save();

        $admin = new User([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'admin.' . uniqid() . '@example.com',
            'phone' => '+63917' . rand(1000000, 9999999), 'password' => Hash::make('secret'),
        ]);
        $admin->role = 'admin'; $admin->status = 'active'; $admin->save();

        $roles = [
            'buyer'  => $buyer,
            'seller' => $seller,
            'hub'    => $this->hubUser,
            'admin'  => $admin,
        ];

        foreach ($roles as $type => $user) {
            app('auth')->forgetGuards();
            $token = $user->createToken("{$type}_token")->plainTextToken;
            $res = $this->withHeader('Authorization', "Bearer {$token}")
                ->getJson('/api/v1/rider/me');

            // A buyer could become a courier (the riders row decides), so a buyer without one is told the profile is
            // missing; any other role is refused outright.
            $res->assertStatus(403)
                ->assertJsonPath('message', $type === 'buyer' || ($type === 'hub' && $user->role === 'buyer')
                    ? 'Rider profile not found.'
                    : 'Access denied. Rider account required.');
        }
    }

    public function test_unauthenticated_request_to_rider_routes_returns_401(): void
    {
        $this->getJson('/api/v1/rider/me')
            ->assertStatus(401);
    }

    public function test_rider_cannot_access_hub_or_admin_routes(): void
    {
        [$user] = $this->createRiderUser(Rider::STATUS_ACTIVE);
        $token = $user->createToken('rider_token')->plainTextToken;

        // Hub route
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/hub/riders')
            ->assertStatus(403);

        // Admin route
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/admin/users')
            ->assertStatus(403);
    }

    public function test_logout_revokes_token_and_revoked_token_gets_401(): void
    {
        [$user] = $this->createRiderUser(Rider::STATUS_ACTIVE);
        $token = $user->createToken('logout_test_token')->plainTextToken;

        // Verify valid token works
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me')
            ->assertOk();

        // Logout
        $logoutRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/logout');

        $logoutRes->assertOk()
            ->assertJsonPath('message', 'Logged out.');

        app('auth')->forgetGuards();

        // Re-using the same revoked token must receive 401
        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/rider/me')
            ->assertStatus(401);
    }

    public function test_login_gating_from_feature_2_2_still_functions(): void
    {
        // 1. A pending applicant signs in (an application never blocks sign-in) and sees the status
        [$pendingUser, , $pendingPass] = $this->createRiderUser(Rider::STATUS_PENDING);
        $this->postJson('/api/v1/auth/login', [
            'email'    => $pendingUser->email,
            'password' => $pendingPass,
        ])->assertOk()->assertJsonPath('data.rider.status', 'PENDING');

        // 2. So does a disapproved one; the rider routes stay closed to both (see the middleware tests above)
        [$disapprovedUser, , $disapprovedPass] = $this->createRiderUser(Rider::STATUS_DISAPPROVED);
        $this->postJson('/api/v1/auth/login', [
            'email'    => $disapprovedUser->email,
            'password' => $disapprovedPass,
        ])->assertOk()->assertJsonPath('data.rider.status', 'DISAPPROVED');

        // 3. Active rider login succeeds
        [$activeUser, , $activePass] = $this->createRiderUser(Rider::STATUS_ACTIVE);
        $res = $this->postJson('/api/v1/auth/login', [
            'email'    => $activeUser->email,
            'password' => $activePass,
        ])->assertOk();

        $this->assertNotEmpty($res->json('token'));
        $this->assertEquals('rider', $res->json('data.role'));
        $this->assertEquals('ACTIVE', $res->json('data.rider.status'));
    }
}
