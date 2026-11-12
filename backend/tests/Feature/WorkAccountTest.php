<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
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
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Hub, courier company, rider and truck driver accounts do deliveries and never shop; only a seller switches between
 * selling and buying. A hub registers with its own account (POST /auth/register-hub), like riders and couriers.
 */
class WorkAccountTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        Mail::fake();
    }

    private function variant()
    {
        $shop = $this->seller('Work Test Shop', $this->qc);
        [, $variants] = $this->product($shop, 'Rice Cooker ' . uniqid(), ['Default' => [1495, 50]], 3);

        return $variants['Default'];
    }

    private function hubOwner(string $status = SortingCenter::STATUS_APPROVED): User
    {
        $user = $this->buyer();
        SortingCenter::forceCreate([
            'user_id' => $user->id, 'logistics_company_id' => LogisticsCompany::defaultId(), 'hub_name' => 'Work Test Hub ' . Str::random(4),
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion I', 'address_street' => '1 Hub St',
            'dti_permit_path' => 'dti_permits/x.pdf', 'coverage_barangays' => ['043404001'], 'status' => $status,
        ]);

        return $user;
    }

    private function addToCart(User $user, $variant)
    {
        Sanctum::actingAs($user->fresh());

        return $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1]);
    }

    public function test_hub_courier_and_rider_accounts_cannot_buy(): void
    {
        $variant = $this->variant();

        $hub = $this->hubOwner();
        $this->addToCart($hub, $variant)->assertForbidden()->assertJsonPath('code', 'work_account');
        $this->postJson('/api/v1/checkout/quote', [])->assertForbidden()->assertJsonPath('code', 'work_account');
        $this->postJson('/api/v1/wishlist/toggle', ['product_id' => $variant->product_id])->assertForbidden();
        // What the account already has stays readable.
        $this->getJson('/api/v1/cart')->assertOk();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.work_account', true);

        $courier = $this->buyer();
        $company = LogisticsCompany::findOrFail(LogisticsCompany::defaultId());
        LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $courier->id, 'role' => 'owner']);
        $this->addToCart($courier, $variant)->assertForbidden()->assertJsonPath('code', 'work_account');

        $rider = User::forceCreate([
            'first_name' => 'Rico', 'last_name' => 'Rider', 'email' => 'rider.' . Str::lower(Str::random(8)) . '@example.com',
            'password' => Hash::make('Rider@2026'), 'role' => 'rider', 'status' => 'active',
        ]);
        $this->addToCart($rider, $variant)->assertForbidden()->assertJsonPath('code', 'work_account');
    }

    public function test_buyers_sellers_and_refused_applicants_still_shop(): void
    {
        $variant = $this->variant();

        $this->addToCart($this->buyer(), $variant)->assertCreated();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.work_account', false);
        $this->addToCart($this->seller('Seller Who Shops', $this->cebu), $variant)->assertCreated();
        $this->addToCart($this->hubOwner(SortingCenter::STATUS_REJECTED), $variant)->assertCreated();
    }

    public function test_a_work_account_cannot_open_a_shop_and_a_seller_cannot_run_a_hub_or_courier(): void
    {
        Sanctum::actingAs($this->hubOwner()->fresh());
        $this->postJson('/api/v1/auth/apply-seller', ['shop_name' => 'Hub Side Shop'])
            ->assertStatus(422)->assertJsonPath('errors.account.0', 'A hub, courier or rider account cannot open a shop. Register the shop with its own email.');

        $seller = $this->seller('No Hub Shop', $this->qc);
        $seller->forceFill(['government_id_type' => 'national_id', 'government_id_image_path' => 'ids/front.jpg'])->save();
        Sanctum::actingAs($seller->fresh());
        $this->postJson('/api/v1/auth/apply-hub', ['logistics_company_id' => LogisticsCompany::defaultId()])
            ->assertStatus(422)->assertJsonPath('errors.account.0', 'A seller account cannot also run a logistics hub. Register the hub with its own email.');
        $this->postJson('/api/v1/auth/apply-courier', [])
            ->assertStatus(422)->assertJsonPath('errors.account.0', 'A seller account cannot also run a courier company. Register the company with its own email.');
    }

    private function hubSignUp(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Lorna', 'last_name' => 'Villanueva', 'email' => 'Lorna.Hub.' . Str::random(5) . '@Example.com ',
            'phone' => '0917' . random_int(1000000, 9999999), 'date_of_birth' => '1988-03-02',
            'password' => 'Bodega@2026', 'password_confirmation' => 'Bodega@2026', 'accept_terms' => true,
            'government_id_type' => 'national_id', 'government_id_image' => UploadedFile::fake()->image('id.jpg'),
            'logistics_company_id' => LogisticsCompany::defaultId(), 'hub_name' => '  Pagsanjan   Sorting Hub ',
            'address_province' => 'Laguna', 'address_city' => 'Pagsanjan', 'address_barangay' => 'Poblacion I',
            'address_street' => '12 Rizal Street', 'dti_permit' => UploadedFile::fake()->create('permit.pdf', 300, 'application/pdf'),
            'coverage_barangays' => ['043422001', '043422002'],
        ], $overrides);
    }

    public function test_a_visitor_registers_a_hub_with_its_own_account_and_the_courier_hears_after_the_email_code(): void
    {
        $data = $this->hubSignUp();
        $this->postJson('/api/v1/auth/register-hub', $data)
            ->assertCreated()->assertJsonPath('verification_required', true)->assertJsonMissingPath('token');

        $user = User::where('email', strtolower(trim($data['email'])))->firstOrFail();
        $this->assertSame('unverified', $user->status);
        $this->assertSame('national_id', $user->government_id_type);
        Storage::disk('ids')->assertExists($user->government_id_image_path);
        $hub = SortingCenter::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('PENDING', $hub->status);
        $this->assertSame('Pagsanjan Sorting Hub', $hub->hub_name);
        $this->assertTrue($user->fresh()->isWorkAccount());
        $hubMail = fn () => Mail::queued(NoticeMail::class, fn (NoticeMail $m) => $m->kind === 'hub_received' && $m->hasTo($user->email))
            ->merge(Mail::sent(NoticeMail::class, fn (NoticeMail $m) => $m->kind === 'hub_received' && $m->hasTo($user->email)));
        $this->assertCount(0, $hubMail());

        $code = null;
        Mail::assertSent(NoticeMail::class, function (NoticeMail $mail) use ($user, &$code) {
            if ($mail->kind !== 'verification_code' || ! $mail->hasTo($user->email)) {
                return false;
            }
            $code = str_replace(' ', '', $mail->notice['highlight']['body']);

            return true;
        });
        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $code])
            ->assertOk()->assertJsonPath('data.sorting_center.status', 'PENDING')->assertJsonPath('data.work_account', true)
            ->assertJsonPath('message', 'Your email is verified. Your hub application is now Pending Approval: the courier company will review it and email you the result.');
        $this->assertCount(1, $hubMail());
    }

    public function test_the_hub_sign_up_checks_the_account_and_id_fields(): void
    {
        $this->postJson('/api/v1/auth/register-hub', $this->hubSignUp([
            'password' => '        1Ba', 'password_confirmation' => '        1Ba', 'government_id_image' => null, 'hub_name' => '12',
        ]))->assertStatus(422)->assertJsonValidationErrors(['password', 'government_id_image', 'hub_name']);

        $this->postJson('/api/v1/auth/register-hub', $this->hubSignUp(['government_id_type' => 'drivers_license']))
            ->assertStatus(422)->assertJsonValidationErrors(['government_id_image_back']);
    }
}
