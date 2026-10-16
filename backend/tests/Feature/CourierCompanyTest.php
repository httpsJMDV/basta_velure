<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
use App\Mail\SortingCenterApplicationMail;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\Parcel;
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
 * Courier companies (like J&T or Flash): a buyer applies to run one, the admin reviews it, and the approved
 * company's team runs its own portal: it approves the hubs that chose it and sees only its own network. Riders are
 * only offered the pickups of their own courier's parcels.
 */
class CourierCompanyTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Storage::fake('public');
        Mail::fake();
    }

    private function user(string $role = 'buyer', array $extra = []): User
    {
        return User::forceCreate(array_merge([
            'first_name' => 'Jose', 'last_name' => 'Rizal', 'email' => Str::random(8) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ], $extra));
    }

    private function company(string $status = LogisticsCompany::STATUS_APPROVED, ?User $owner = null): LogisticsCompany
    {
        $owner ??= $this->user();
        $code = strtoupper(Str::random(4));
        $company = LogisticsCompany::create([
            'name' => 'Courier ' . $code, 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $owner->id,
            'status' => $status, 'submitted_at' => now(),
        ]);
        LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $owner->id, 'role' => 'owner']);

        return $company;
    }

    private function hub(LogisticsCompany $company, string $status = SortingCenter::STATUS_APPROVED, array $coverage = ['043404001']): SortingCenter
    {
        return SortingCenter::create([
            'logistics_company_id' => $company->id, 'user_id' => $this->user()->id, 'hub_name' => 'Hub ' . Str::random(5),
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion I', 'address_street' => '1 St',
            'dti_permit_path' => 'dti_permits/p.pdf', 'coverage_barangays' => $coverage, 'status' => $status,
        ]);
    }

    private function applyPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Flash Padala ' . Str::random(4), 'code' => strtoupper(Str::random(4)),
            'contact_email' => 'ops@flash.example', 'contact_phone' => '09171234567',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '9 Logistics Ave',
            'business_permit' => UploadedFile::fake()->create('permit.pdf', 200, 'application/pdf'),
        ], $overrides);
    }

    public function test_a_buyer_applies_and_the_admin_approves_the_courier_company(): void
    {
        $owner = $this->user();
        Sanctum::actingAs($owner);
        $res = $this->postJson('/api/v1/auth/apply-courier', $this->applyPayload(['name' => 'Flash Padala', 'code' => 'flp']))
            ->assertCreated()
            ->assertJsonPath('data.company.status', 'PENDING')
            ->assertJsonPath('data.company.code', 'FLP')
            ->assertJsonPath('data.user.logistics_company.status', 'PENDING');
        $companyId = $res->json('data.company.id');
        $this->assertSame('buyer', $owner->fresh()->role);
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($owner->email) && $m->kind === 'courier_received');

        // While pending, the portal is closed and a second application is refused.
        $this->getJson('/api/v1/logistics/me')->assertForbidden();
        $this->postJson('/api/v1/auth/apply-courier', $this->applyPayload())->assertStatus(422)->assertJsonValidationErrors(['account']);

        Sanctum::actingAs($this->user());
        $this->postJson("/api/v1/admin/courier-applications/{$companyId}/approve")->assertForbidden();

        Sanctum::actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/courier-applications?status=PENDING')->assertOk()->assertJsonFragment(['name' => 'Flash Padala']);
        $this->postJson("/api/v1/admin/courier-applications/{$companyId}/approve")->assertOk()->assertJsonPath('data.status', 'APPROVED');
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($owner->email) && $m->kind === 'courier_approved');

        Sanctum::actingAs($owner->fresh());
        $this->getJson('/api/v1/logistics/me')->assertOk()->assertJsonPath('data.name', 'Flash Padala');
        $this->getJson('/api/v1/logistics/couriers')->assertOk()->assertJsonFragment(['code' => 'FLP']);
    }

    public function test_a_rejected_company_reapplies_on_the_same_row_and_guests_cannot_apply(): void
    {
        $this->postJson('/api/v1/auth/apply-courier', $this->applyPayload())->assertUnauthorized();

        $owner = $this->user();
        $company = $this->company(LogisticsCompany::STATUS_REJECTED, $owner);
        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/auth/apply-courier', $this->applyPayload(['name' => 'Second Try Couriers', 'code' => $company->code]))
            ->assertCreated()->assertJsonPath('data.company.id', $company->id)->assertJsonPath('data.company.status', 'PENDING');
        $this->assertSame(1, LogisticsCompany::where('owner_user_id', $owner->id)->count());
    }

    public function test_the_admin_rejects_and_suspends_with_a_reason(): void
    {
        $pending = $this->company(LogisticsCompany::STATUS_PENDING);
        $approved = $this->company();
        Sanctum::actingAs($this->user('admin'));

        $this->postJson("/api/v1/admin/courier-applications/{$pending->id}/reject")->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->postJson("/api/v1/admin/courier-applications/{$pending->id}/reject", ['reason' => 'Permit expired'])->assertOk()->assertJsonPath('data.status', 'REJECTED');
        $this->postJson("/api/v1/admin/courier-applications/{$approved->id}/suspend", ['reason' => 'Complaints'])->assertOk()->assertJsonPath('data.status', 'SUSPENDED');

        // A suspended company's team is locked out of its portal.
        Sanctum::actingAs($approved->owner);
        $this->getJson('/api/v1/logistics/dashboard')->assertForbidden();
    }

    public function test_the_courier_approves_its_own_hubs_and_cannot_see_another_couriers(): void
    {
        $mine = $this->company();
        $theirs = $this->company();
        $applicant = $this->hub($mine, SortingCenter::STATUS_PENDING);
        $foreign = $this->hub($theirs, SortingCenter::STATUS_PENDING);
        Sanctum::actingAs($mine->owner);

        $ids = collect($this->getJson('/api/v1/logistics/network/hubs')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($applicant->id));
        $this->assertFalse($ids->contains($foreign->id));

        $this->getJson("/api/v1/logistics/network/hubs/{$foreign->id}")->assertNotFound();
        $this->postJson("/api/v1/logistics/network/hubs/{$foreign->id}/approve")->assertNotFound();

        $this->postJson("/api/v1/logistics/network/hubs/{$applicant->id}/reject")->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->postJson("/api/v1/logistics/network/hubs/{$applicant->id}/approve")->assertOk();
        $this->assertSame(SortingCenter::STATUS_APPROVED, $applicant->fresh()->status);
        Mail::assertQueued(SortingCenterApplicationMail::class, fn ($m) => $m->hasTo($applicant->user->email) && $m->decision === 'approved');

        $this->postJson("/api/v1/logistics/network/hubs/{$applicant->id}/suspend", ['reason' => 'Late deliveries'])->assertOk();
        $this->assertSame(SortingCenter::STATUS_SUSPENDED, $applicant->fresh()->status);
        $this->postJson("/api/v1/logistics/network/hubs/{$applicant->id}/reactivate")->assertOk();
        $this->assertSame(SortingCenter::STATUS_APPROVED, $applicant->fresh()->status);

        $this->getJson('/api/v1/logistics/dashboard')->assertOk()->assertJsonPath('data.hubs.approved', 1);
        $this->getJson('/api/v1/logistics/reports')->assertOk()->assertJsonPath('data.hubs.0.hub_id', $applicant->id);
    }

    public function test_a_hub_applies_to_a_chosen_courier_and_its_team_is_told(): void
    {
        $courier = $this->company();
        $applicant = $this->user('buyer', ['government_id_image_path' => 'ids/front.jpg']);
        Sanctum::actingAs($applicant);

        $this->postJson('/api/v1/auth/apply-hub', [
            'logistics_company_id' => $courier->id, 'hub_name' => 'Pagsanjan Station',
            'address_province' => 'Laguna', 'address_city' => 'Pagsanjan', 'address_barangay' => 'Poblacion', 'address_street' => '2 St',
            'dti_permit' => UploadedFile::fake()->create('dti.pdf', 100, 'application/pdf'), 'coverage_barangays' => ['043422001'],
        ])->assertCreated();

        $this->assertSame($courier->id, SortingCenter::where('user_id', $applicant->id)->value('logistics_company_id'));
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($courier->owner->email) && $m->kind === 'courier_new_hub');

        // A courier that is not approved cannot be chosen.
        $pending = $this->company(LogisticsCompany::STATUS_PENDING);
        Sanctum::actingAs($this->user('buyer', ['government_id_image_path' => 'ids/front.jpg']));
        $this->postJson('/api/v1/auth/apply-hub', ['logistics_company_id' => $pending->id])->assertStatus(422)->assertJsonValidationErrors(['logistics_company_id']);
    }

    public function test_riders_are_only_offered_pickups_of_their_own_courier(): void
    {
        $jnt = $this->company();
        $flash = $this->company();
        $jntHub = $this->hub($jnt);
        $this->hub($flash);
        $riderUser = $this->user();
        $rider = Rider::create([
            'user_id' => $riderUser->id, 'sorting_center_id' => $jntHub->id, 'vehicle_type' => 'Motorcycle', 'plate_number' => 'JNT 1',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        $seller = $this->user();
        $make = function (LogisticsCompany $company) use ($seller) {
            $order = Order::forceCreate([
                'logistics_company_id' => $company->id, 'buyer_id' => $this->user()->id, 'order_number' => 'VEL-' . Str::random(8),
                'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'cod', 'payment_status' => 'pending', 'status' => 'READY_FOR_PICKUP',
            ]);

            return Parcel::create([
                'logistics_company_id' => $company->id, 'tracking_number' => 'LIT-' . Str::upper(Str::random(10)), 'order_id' => $order->id,
                'seller_id' => $seller->id, 'status' => Parcel::STATUS_READY_FOR_PICKUP, 'pickup_barangay_code' => '043404001', 'ready_at' => now(),
            ]);
        };
        $jntParcel = $make($jnt);
        $flashParcel = $make($flash);

        $visible = Parcel::availableForRider($rider->load('sortingCenter'), ['043404001'])->pluck('id');
        $this->assertTrue($visible->contains($jntParcel->id));
        $this->assertFalse($visible->contains($flashParcel->id));

        // A parcel without a company belongs to the default courier: its rider sees it, a J&T rider does not.
        $legacy = $make($jnt);
        $legacy->forceFill(['logistics_company_id' => null])->save();
        $this->assertFalse(Parcel::availableForRider($rider, ['043404001'])->pluck('id')->contains($legacy->id));
        $defaultHub = $this->hub(LogisticsCompany::find(LogisticsCompany::defaultId()));
        $defaultRider = Rider::create([
            'user_id' => $this->user()->id, 'sorting_center_id' => $defaultHub->id, 'vehicle_type' => 'Motorcycle', 'plate_number' => 'DCC 1',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);
        $this->assertTrue(Parcel::availableForRider($defaultRider->load('sortingCenter'), ['043404001'])->pluck('id')->contains($legacy->id));
    }
}
