<?php

namespace Tests\Feature;

use App\Mail\NoticeMail;
use App\Mail\SellerApplicationMail;
use App\Models\EmailOtp;
use App\Models\LogisticsCompany;
use App\Models\SellerProfile;
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
 * Account creation (Buyer, Seller and Logistics Account Creation workbooks, A2 to A12): field rules, consent, the
 * 6-digit email code and the Unverified → Active / Pending Approval flow.
 */
class AccountRegistrationTest extends TestCase
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

    private function buyer(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Juan Miguel', 'last_name' => 'Dela Cruz',
            'email' => 'juan.' . Str::lower(Str::random(6)) . '@example.com', 'phone' => '0917' . random_int(1000000, 9999999),
            'date_of_birth' => '1998-05-14', 'password' => 'Mamimili@2026', 'password_confirmation' => 'Mamimili@2026',
            'accept_terms' => true,
        ], $overrides);
    }

    private function codeFor(string $email): string
    {
        $code = null;
        Mail::assertSent(NoticeMail::class, function (NoticeMail $mail) use ($email, &$code) {
            if ($mail->kind !== 'verification_code' || ! $mail->hasTo($email)) {
                return false;
            }
            $code = str_replace(' ', '', $mail->notice['highlight']['body']);

            return true;
        });

        return (string) $code;
    }

    public function test_a_buyer_registers_unverified_gets_a_code_and_is_active_after_it(): void
    {
        $this->postJson('/api/v1/auth/register', $this->buyer(['email' => 'JuanMiguel.DelaCruz@Example.com ']))
            ->assertCreated()->assertJsonPath('verification_required', true)->assertJsonMissingPath('token');

        $user = User::where('email', 'juanmiguel.delacruz@example.com')->firstOrFail();
        $this->assertSame('unverified', $user->status);
        $this->assertNotNull($user->terms_accepted_at);
        $code = $this->codeFor('juanmiguel.delacruz@example.com');
        $this->assertMatchesRegularExpression('/^\d{6}$/', $code);

        // Unverified accounts cannot sign in.
        $this->postJson('/api/v1/auth/login', ['identifier' => $user->email, 'password' => 'Mamimili@2026'])
            ->assertForbidden()->assertJsonPath('code', 'email_unverified');

        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $code === '000000' ? '111111' : '000000'])
            ->assertStatus(422)->assertJsonValidationErrors('code');
        foreach (['48291', '4829137', '48A91B', ''] as $bad) {
            $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $bad])->assertStatus(422)->assertJsonValidationErrors('code');
        }
        $this->assertSame('unverified', $user->fresh()->status);

        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $code])->assertOk()->assertJsonStructure(['token']);
        $this->assertSame('active', $user->fresh()->status);
        $this->postJson('/api/v1/auth/login', ['identifier' => $user->email, 'password' => 'Mamimili@2026'])->assertOk();
    }

    public function test_an_expired_code_is_refused_and_a_resend_cancels_the_old_code(): void
    {
        $data = $this->buyer();
        $this->postJson('/api/v1/auth/register', $data)->assertCreated();
        $first = $this->codeFor($data['email']);
        $user = User::where('email', $data['email'])->firstOrFail();

        $this->travel(5)->minutes();
        $this->travel(1)->seconds();
        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $first])
            ->assertStatus(422)->assertJsonPath('errors.code.0', 'This code has expired. Tap Resend code to get a new one.');
        $this->travelBack();

        Mail::fake();
        $this->postJson('/api/v1/auth/resend-verification', ['email' => $user->email])->assertOk();
        $second = $this->codeFor($user->email);
        if ($second !== $first) {
            $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $first])->assertStatus(422);
        }
        $this->assertSame(1, EmailOtp::where('user_id', $user->id)->whereNull('superseded_at')->whereNull('consumed_at')->count());
        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $second])->assertOk();
    }

    public function test_every_required_field_is_reported_at_once(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [])->assertStatus(422);
        foreach (['first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'password', 'password_confirmation', 'accept_terms'] as $field) {
            $response->assertJsonValidationErrors($field);
        }
        $this->assertSame(0, User::where('status', 'unverified')->where('created_at', '>=', now()->subMinute())->count());
    }

    public function test_name_rules(): void
    {
        foreach (['Juan Miguel123', 'J', str_repeat('a', 51), 'Dela Cruz@#'] as $bad) {
            $this->postJson('/api/v1/auth/register', $this->buyer(['first_name' => $bad]))->assertStatus(422)->assertJsonValidationErrors('first_name');
        }
        foreach (['Jo', 'Maria Cristina Angelica Bernadette Josefina Leonor', "Ma. Niño O'Neil-Santos"] as $good) {
            $this->postJson('/api/v1/auth/register', $this->buyer(['first_name' => $good]))->assertCreated();
        }
    }

    public function test_mobile_numbers_are_normalized_and_unique_in_either_format(): void
    {
        foreach (['0917ABC4567', '0917-123-456', '12345678901', '02-8123-4567', '0917123456', '091712345678'] as $bad) {
            $this->postJson('/api/v1/auth/register', $this->buyer(['phone' => $bad]))->assertStatus(422)
                ->assertJsonPath('errors.phone.0', 'Enter a valid Philippine mobile number: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.');
        }

        $this->postJson('/api/v1/auth/register', $this->buyer(['phone' => '09171230001']))->assertCreated();
        $this->assertTrue(User::where('phone', '+639171230001')->exists());
        $this->postJson('/api/v1/auth/register', $this->buyer(['phone' => '+639171230001']))->assertStatus(422)
            ->assertJsonPath('errors.phone.0', 'This mobile number is already in use by another account.');
    }

    public function test_terms_must_be_accepted_and_age_is_checked_on_manila_dates(): void
    {
        $this->postJson('/api/v1/auth/register', $this->buyer(['accept_terms' => false]))->assertStatus(422)->assertJsonValidationErrors('accept_terms');

        $today = CarbonImmutable::now('Asia/Manila');
        $this->postJson('/api/v1/auth/register', $this->buyer(['date_of_birth' => $today->subYears(18)->addDay()->toDateString()]))->assertStatus(422);
        $this->postJson('/api/v1/auth/register', $this->buyer(['date_of_birth' => $today->subYears(18)->toDateString()]))->assertCreated();
    }

    private function sellerPayload(array $overrides = []): array
    {
        return array_merge($this->buyer(['first_name' => 'Maria Clara', 'last_name' => 'Santos']), [
            'shop_name' => 'MCH ' . Str::random(5), 'shop_category' => \App\Models\Category::whereNull('parent_id')->value('name') ?? 'Home & Living',
            'seller_type' => 'sole_proprietorship', 'tin' => implode('-', str_split((string) random_int(100000000000, 999999999999), 3)),
            'address_region' => 'National Capital Region (NCR)', 'address_region_code' => '130000000',
            'address_province' => 'Metro Manila', 'address_province_code' => '130000000',
            'address_city' => 'Quezon City', 'address_city_code' => '137404000',
            'address_barangay' => 'Commonwealth', 'address_barangay_code' => '137404061',
            'address_street' => 'Blk 12 Lot 8, Sampaguita St.', 'address_postal_code' => '1121',
            'government_id_image' => UploadedFile::fake()->create('govt_id_front.jpg', 1200, 'image/jpeg'),
            'dti_certificate' => UploadedFile::fake()->create('dti_certificate.pdf', 850, 'application/pdf'),
            'bir_2303' => UploadedFile::fake()->create('bir_2303.pdf', 1100, 'application/pdf'),
        ], $overrides);
    }

    public function test_a_visitor_applies_as_a_seller_and_reaches_the_admin_only_after_verifying(): void
    {
        if (! \App\Models\Category::whereNull('parent_id')->exists()) {
            \App\Models\Category::create(['slug' => 'home-living-' . Str::random(4), 'name' => 'Home & Living', 'is_active' => true]);
        }
        $payload = $this->sellerPayload(['email' => 'mariaclara.santos@example.com', 'shop_name' => 'Maria Clara Crafts']);
        $this->post('/api/v1/auth/register-seller', $payload, ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('verification_required', true);

        $user = User::where('email', 'mariaclara.santos@example.com')->firstOrFail();
        $profile = SellerProfile::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('pending', $profile->application_status);
        $this->assertSame('1121', $profile->address_postal_code);
        Mail::assertNotQueued(SellerApplicationMail::class);

        Sanctum::actingAs(User::forceCreate(['first_name' => 'Ad', 'last_name' => 'Min', 'email' => Str::random(8) . '@example.com', 'password' => Hash::make('x'), 'role' => 'admin', 'status' => 'active']));
        $ids = collect($this->getJson('/api/v1/admin/seller-applications?status=pending')->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($profile->id));

        app('auth')->forgetGuards();
        $this->postJson('/api/v1/auth/verify-email', ['email' => $user->email, 'code' => $this->codeFor($user->email)])->assertOk()
            ->assertJsonPath('message', 'Your email is verified. Your seller application is now Pending Approval: an admin will review it and email you the result.');
        Mail::assertQueued(SellerApplicationMail::class);
    }

    public function test_seller_documents_depend_on_the_seller_type_and_limits_apply(): void
    {
        $individual = $this->sellerPayload(['seller_type' => 'individual']);
        unset($individual['dti_certificate'], $individual['bir_2303']);
        $this->post('/api/v1/auth/register-seller', $individual, ['Accept' => 'application/json'])->assertCreated();

        $corp = $this->sellerPayload(['seller_type' => 'corporation']);
        unset($corp['dti_certificate']);
        $this->post('/api/v1/auth/register-seller', $corp, ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('sec_certificate');
        $corp['sec_certificate'] = UploadedFile::fake()->create('sec_certificate.pdf', 900, 'application/pdf');
        $corp['email'] = 'corp.' . Str::random(5) . '@example.com';
        $corp['phone'] = '0918' . random_int(1000000, 9999999);
        $this->post('/api/v1/auth/register-seller', $corp, ['Accept' => 'application/json'])->assertCreated();

        foreach (['MC', 'Maria Clara Handicrafts, Manila'] as $name) {
            $this->post('/api/v1/auth/register-seller', $this->sellerPayload(['shop_name' => $name]), ['Accept' => 'application/json'])
                ->assertStatus(422)->assertJsonValidationErrors('shop_name');
        }
        foreach (['123-456-789-00', '123-456-789-0001', '123-456-78A-000'] as $tin) {
            $this->post('/api/v1/auth/register-seller', $this->sellerPayload(['tin' => $tin]), ['Accept' => 'application/json'])
                ->assertStatus(422)->assertJsonPath('errors.tin.0', 'Enter the TIN as 12 digits in the format 000-000-000-000.');
        }
        foreach (['112', '11210', '11A1'] as $postal) {
            $this->post('/api/v1/auth/register-seller', $this->sellerPayload(['address_postal_code' => $postal]), ['Accept' => 'application/json'])
                ->assertStatus(422)->assertJsonValidationErrors('address_postal_code');
        }
        $this->post('/api/v1/auth/register-seller', $this->sellerPayload(['tin' => $individual['tin']]), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.tin.0', 'This TIN is already registered to another seller or logistics account.');
        $this->post('/api/v1/auth/register-seller', $this->sellerPayload([
            'government_id_image' => UploadedFile::fake()->create('size_5.1MB.jpg', 5222, 'image/jpeg'),
        ]), ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('government_id_image');
    }

    public function test_a_visitor_applies_as_a_courier_company_with_its_business_details(): void
    {
        $payload = array_merge($this->buyer(['email' => 'operations.bilishatid@example.com', 'phone' => '09285551234']), [
            'contact_first_name' => 'Carlos Antonio', 'contact_last_name' => 'Mendoza', 'contact_position' => 'Operations Manager',
            'name' => 'Bilis Hatid Express Inc. ' . Str::random(3), 'sec_registration_no' => 'cs' . random_int(100000000, 999999999),
            'tin' => implode('-', str_split((string) random_int(100000000000, 999999999999), 3)),
            'address_region' => 'National Capital Region (NCR)', 'address_region_code' => '130000000',
            'address_province' => 'Metro Manila', 'address_province_code' => '130000000',
            'address_city' => 'Pasig City', 'address_city_code' => '137403000',
            'address_barangay' => 'Kapitolyo', 'address_barangay_code' => '137403017',
            'address_street' => 'Unit 5B, 88 West Capitol Drive', 'address_postal_code' => '1603',
            'service_regions' => ['130000000', '040000000'],
            'sec_certificate' => UploadedFile::fake()->create('sec_certificate.pdf', 1000, 'application/pdf'),
            'bir_2303' => UploadedFile::fake()->create('bir_2303.pdf', 1100, 'application/pdf'),
            'business_permit' => UploadedFile::fake()->create('mayors_permit.pdf', 1300, 'application/pdf'),
            'representative_id' => UploadedFile::fake()->create('govt_id_front.jpg', 1200, 'image/jpeg'),
        ]);
        unset($payload['first_name'], $payload['last_name'], $payload['date_of_birth']);

        $this->post('/api/v1/auth/register-courier', $payload, ['Accept' => 'application/json'])->assertCreated();
        $company = LogisticsCompany::where('contact_email', 'operations.bilishatid@example.com')->firstOrFail();
        $this->assertSame(['130000000', '040000000'], $company->service_regions);
        $this->assertSame(strtoupper($payload['sec_registration_no']), $company->sec_registration_no);
        $this->assertSame('Carlos Antonio', $company->owner->first_name);

        foreach (['CS20201234', '202012345CS', 'CS2020-12345', '12345678901'] as $sec) {
            $this->post('/api/v1/auth/register-courier', array_merge($payload, ['sec_registration_no' => $sec, 'email' => Str::random(6) . '@example.com']), ['Accept' => 'application/json'])
                ->assertStatus(422)->assertJsonValidationErrors('sec_registration_no');
        }
        $this->post('/api/v1/auth/register-courier', array_merge($payload, ['email' => Str::random(6) . '@example.com', 'phone' => '0928' . random_int(1000000, 9999999), 'name' => 'Another Co']), ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('errors.sec_registration_no.0', 'This SEC registration number is already in use by another company.');
    }

    private function signedIn(): User
    {
        $user = User::forceCreate([
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan.' . Str::random(6) . '@example.com',
            'phone' => '+63917' . random_int(1000000, 9999999), 'password' => Hash::make('Mamimili@2026'), 'role' => 'buyer', 'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_change_password_checks_the_current_password_and_the_rules(): void
    {
        $user = $this->signedIn();

        $this->postJson('/api/v1/auth/change-password', ['current_password' => 'Wrong@2026', 'password' => 'Mamimili@2027', 'password_confirmation' => 'Mamimili@2027'])
            ->assertStatus(422)->assertJsonPath('errors.current_password.0', 'The current password is incorrect.');
        foreach (['Mami@26', 'mamimili@2027', 'MAMIMILI@2027', 'Mamimili@abcd', 'Mamimili2027'] as $weak) {
            $this->postJson('/api/v1/auth/change-password', ['current_password' => 'Mamimili@2026', 'password' => $weak, 'password_confirmation' => $weak])
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        $this->postJson('/api/v1/auth/change-password', ['current_password' => 'Mamimili@2026', 'password' => 'Mamimili@2027', 'password_confirmation' => 'Mamimili@2028'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/v1/auth/change-password', ['current_password' => 'Mamimili@2026', 'password' => 'Mamimili@2026', 'password_confirmation' => 'Mamimili@2026'])
            ->assertStatus(422)->assertJsonPath('errors.password.0', 'The new password must be different from your current password.');
        $this->assertTrue(Hash::check('Mamimili@2026', $user->fresh()->password));

        $this->postJson('/api/v1/auth/change-password', ['current_password' => 'Mamimili@2026', 'password' => 'Mamimili@2027', 'password_confirmation' => 'Mamimili@2027'])->assertOk();
        $this->assertTrue(Hash::check('Mamimili@2027', $user->fresh()->password));
    }

    public function test_email_change_waits_for_the_code_sent_to_the_new_address(): void
    {
        $user = $this->signedIn();
        $taken = User::forceCreate(['first_name' => 'Maria', 'last_name' => 'Santos', 'email' => 'mariaclara.santos.' . Str::random(4) . '@example.com', 'password' => Hash::make('x'), 'role' => 'buyer', 'status' => 'active']);

        $this->postJson('/api/v1/auth/email-change', ['email' => strtoupper($taken->email)])->assertStatus(422)->assertJsonPath('errors.email.0', 'This email is already in use by another account.');
        Mail::assertNotSent(NoticeMail::class);

        $old = $user->email;
        $this->postJson('/api/v1/auth/email-change', ['email' => 'buyer.test01@example.com'])->assertOk();
        $this->assertSame($old, $user->fresh()->email);
        $code = $this->codeFor('buyer.test01@example.com');

        $this->postJson('/api/v1/auth/email-change/confirm', ['code' => $code === '000000' ? '111111' : '000000'])->assertStatus(422);
        $this->postJson('/api/v1/auth/email-change/confirm', ['code' => $code])->assertOk();
        $this->assertSame('buyer.test01@example.com', $user->fresh()->email);
    }

    public function test_phone_change_is_validated_and_saved_only_after_the_code(): void
    {
        $user = $this->signedIn();
        $other = User::forceCreate(['first_name' => 'Ana', 'last_name' => 'Reyes', 'email' => Str::random(8) . '@example.com', 'phone' => '+639173456789', 'password' => Hash::make('x'), 'role' => 'buyer', 'status' => 'active']);

        $this->postJson('/api/v1/auth/phone-change', ['phone' => '0917123'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->postJson('/api/v1/auth/phone-change', ['phone' => '09173456789'])->assertStatus(422)->assertJsonPath('errors.phone.0', 'This mobile number is already in use by another account.');
        Mail::assertNotSent(NoticeMail::class);

        $before = $user->phone;
        $this->postJson('/api/v1/auth/phone-change', ['phone' => '09170000001'])->assertOk();
        $this->assertSame($before, $user->fresh()->phone);
        $this->postJson('/api/v1/auth/phone-change/confirm', ['code' => $this->codeFor($user->email)])->assertOk();
        $this->assertSame('+639170000001', $user->fresh()->phone);
        $this->assertNotSame($other->phone, $user->fresh()->phone);
    }

    public function test_profile_names_and_photo_are_validated(): void
    {
        $user = $this->signedIn();
        foreach (['', 'Juan123', 'J'] as $bad) {
            $this->patchJson('/api/v1/auth/profile', ['first_name' => $bad])->assertStatus(422)->assertJsonValidationErrors('first_name');
        }
        $this->assertSame('Juan', $user->fresh()->first_name);

        $this->post('/api/v1/auth/avatar', ['avatar' => UploadedFile::fake()->create('size_5.1MB.jpg', 5222, 'image/jpeg')], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/v1/auth/avatar', ['avatar' => UploadedFile::fake()->create('renamed_exe.jpg', 2100, 'application/x-msdownload')], ['Accept' => 'application/json'])->assertStatus(422);
        $this->patchJson('/api/v1/auth/profile', ['first_name' => 'Juan Miguel Jr.'])->assertOk()->assertJsonPath('data.first_name', 'Juan Miguel Jr.');
        $this->post('/api/v1/auth/avatar', ['avatar' => UploadedFile::fake()->create('review_photo.jpg', 1500, 'image/jpeg')], ['Accept' => 'application/json'])->assertOk();
    }
}
