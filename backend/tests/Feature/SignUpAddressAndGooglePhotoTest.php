<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\User;
use App\Support\GoogleAvatar;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The address given while signing up lands in the address book ready for checkout (with its PSGC codes), and a
 * "Continue with Google" account gets its Google picture as the profile photo. Only Google's own photo hosts are
 * ever fetched.
 */
class SignUpAddressAndGooglePhotoTest extends TestCase
{
    use DatabaseTransactions;

    private const OUR_CLIENT = 'loved-it-web.apps.googleusercontent.com';
    private const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
    private const PICTURE = 'https://lh3.googleusercontent.com/a/ACg8ocJ-example=s96-c';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        Storage::fake('local');
        Mail::fake();
        config(['services.google.client_ids' => [self::OUR_CLIENT]]);
    }

    /** Santa Cruz, Laguna (real PSGC codes). */
    private function place(): array
    {
        return [
            'region' => 'Region IV-A (CALABARZON)', 'region_code' => '040000000',
            'province' => 'Laguna', 'province_code' => '043400000',
            'city_municipality' => 'Santa Cruz', 'city_code' => '043426000',
            'barangay' => 'Poblacion I', 'barangay_code' => '043426017',
            'street_address' => '12 Rizal Street',
        ];
    }

    private function signUp(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Liza', 'last_name' => 'Manalo',
            'email' => 'liza.' . Str::lower(Str::random(6)) . '@example.com', 'phone' => '0917' . random_int(1000000, 9999999),
            'date_of_birth' => '1997-02-11', 'password' => 'Mamimili@2026', 'password_confirmation' => 'Mamimili@2026',
            'accept_terms' => true,
        ], $overrides);
    }

    public function test_the_address_given_at_sign_up_becomes_the_default_home_address(): void
    {
        $payload = $this->signUp(['address' => $this->place()]);
        $this->postJson('/api/v1/auth/register', $payload)->assertCreated();

        $user = User::where('email', $payload['email'])->firstOrFail();
        $address = $user->addresses()->sole();
        $this->assertSame('Liza Manalo', $address->full_name);
        $this->assertSame($user->phone, $address->phone);
        $this->assertSame('12 Rizal Street', $address->address);
        $this->assertSame(['Laguna', 'Santa Cruz', 'Poblacion I'], [$address->province, $address->district, $address->ward]);
        $this->assertSame(['040000000', '043400000', '043426000', '043426017'], [$address->region_code, $address->province_code, $address->city_code, $address->barangay_code]);
        $this->assertSame('home', $address->label);
        $this->assertTrue($address->is_default);
        $this->assertFalse($address->address_needs_update);
    }

    public function test_sign_up_without_an_address_still_works_and_a_half_address_is_refused(): void
    {
        $payload = $this->signUp();
        $this->postJson('/api/v1/auth/register', $payload)->assertCreated();
        $this->assertSame(0, User::where('email', $payload['email'])->firstOrFail()->addresses()->count());

        $half = $this->place();
        unset($half['barangay_code']);
        $half['city_code'] = 'Santa Cruz';
        $errors = $this->postJson('/api/v1/auth/register', $this->signUp(['address' => $half]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['address.barangay_code', 'address.city_code'])
            ->json('errors');
        $this->assertSame('Choose the barangay.', $errors['address.barangay_code'][0]);
    }

    private function googleSignUp(): User
    {
        return User::forceCreate([
            'first_name' => 'Nico', 'last_name' => 'Tan', 'email' => 'nico.' . Str::lower(Str::random(8)) . '@gmail.com',
            'password' => Hash::make(Str::random(32)), 'role' => 'buyer', 'status' => 'active', 'email_verified_at' => now(),
        ]);
    }

    private function profile(array $extra = []): array
    {
        return [
            'phone' => '0918' . random_int(1000000, 9999999), 'date_of_birth' => '1996-07-21', 'sex' => 'male',
            ...$this->place(),
            'government_id_type' => 'passport',
            'government_id_image' => UploadedFile::fake()->image('passport.jpg', 800, 500),
            ...$extra,
        ];
    }

    public function test_complete_profile_keeps_the_place_codes_so_the_address_is_ready_for_checkout(): void
    {
        $user = $this->googleSignUp();
        Sanctum::actingAs($user);
        Http::fake();

        $this->post('/api/v1/auth/complete-profile', $this->profile(), ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.default_address.barangay_code', '043426017')
            ->assertJsonPath('data.default_address.address_needs_update', false);

        $address = $user->addresses()->sole();
        $this->assertSame('043426000', $address->city_code);
        $this->assertTrue($address->is_default);
        $this->assertSame('pending', $user->fresh()->buyer_application_status);
    }

    public function test_complete_profile_without_codes_still_saves_the_address_as_before(): void
    {
        $user = $this->googleSignUp();
        Sanctum::actingAs($user);
        $fields = $this->profile();
        unset($fields['region'], $fields['region_code'], $fields['province_code'], $fields['city_code'], $fields['barangay_code']);

        $this->post('/api/v1/auth/complete-profile', $fields, ['Accept' => 'application/json'])->assertOk();

        $this->assertTrue($user->addresses()->sole()->address_needs_update);
    }

    public function test_complete_profile_never_fetches_a_photo_link_outside_google(): void
    {
        $user = $this->googleSignUp();
        Sanctum::actingAs($user);
        Http::fake();

        $this->post('/api/v1/auth/complete-profile', $this->profile(['google_avatar_url' => 'http://169.254.169.254/latest/meta-data']), ['Accept' => 'application/json'])
            ->assertOk();

        Http::assertNothingSent();
        $this->assertNull($user->fresh()->avatar_path);
    }

    public function test_a_photo_chosen_on_complete_profile_replaces_the_google_picture(): void
    {
        $user = $this->googleSignUp();
        Storage::disk('public')->put('avatars/google.jpg', 'old');
        $user->forceFill(['avatar_path' => 'avatars/google.jpg'])->save();
        Sanctum::actingAs($user);

        $this->post('/api/v1/auth/complete-profile', $this->profile(['avatar' => UploadedFile::fake()->image('me.jpg', 300, 300)]), ['Accept' => 'application/json'])
            ->assertOk();

        $path = $user->fresh()->avatar_path;
        $this->assertNotSame('avatars/google.jpg', $path);
        Storage::disk('public')->assertExists($path);
        Storage::disk('public')->assertMissing('avatars/google.jpg');
    }

    private function tokenInfo(string $email, ?string $picture): array
    {
        return [
            'iss' => 'https://accounts.google.com', 'aud' => self::OUR_CLIENT, 'azp' => 'loved-it-android.apps.googleusercontent.com',
            'email' => $email, 'email_verified' => 'true', 'given_name' => 'Nico', 'family_name' => 'Tan', 'exp' => (string) (time() + 3600),
            'picture' => $picture,
        ];
    }

    public function test_a_new_google_account_gets_its_google_picture_as_the_profile_photo(): void
    {
        $email = 'new.' . Str::lower(Str::random(8)) . '@gmail.com';
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response($this->tokenInfo($email, self::PICTURE)),
            'https://lh3.googleusercontent.com/*' => Http::response('JPEGDATA', 200, ['Content-Type' => 'image/jpeg']),
        ]);

        $response = $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])
            ->assertCreated()
            ->assertJsonPath('profile_incomplete', true);

        $user = User::where('email', $email)->firstOrFail();
        $this->assertNotNull($user->avatar_path);
        Storage::disk('public')->assertExists($user->avatar_path);
        $this->assertSame($user->avatar_url, $response->json('data.avatar_url'));
        // A larger copy than Google's 96 px default.
        Http::assertSent(fn (HttpRequest $request) => $request->url() === 'https://lh3.googleusercontent.com/a/ACg8ocJ-example=s400-c');
    }

    public function test_a_picture_google_cannot_serve_leaves_the_account_without_a_photo(): void
    {
        $email = 'new.' . Str::lower(Str::random(8)) . '@gmail.com';
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response($this->tokenInfo($email, self::PICTURE)),
            'https://lh3.googleusercontent.com/*' => Http::response('<html>Not found</html>', 404, ['Content-Type' => 'text/html']),
        ]);

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])->assertCreated();

        $this->assertNull(User::where('email', $email)->firstOrFail()->avatar_path);
    }

    public function test_only_https_links_on_google_photo_hosts_are_fetched(): void
    {
        $this->assertTrue(GoogleAvatar::isGooglePhoto(self::PICTURE));
        $this->assertTrue(GoogleAvatar::isGooglePhoto('https://lh5.googleusercontent.com/-abc/photo.jpg'));
        foreach ([
            null, '', 'http://lh3.googleusercontent.com/a/x', 'https://googleusercontent.com.evil.test/a',
            'https://evil.test/?u=lh3.googleusercontent.com', 'https://user@lh3.googleusercontent.com/a',
            'https://lh3.googleusercontent.com:8443/a', 'file:///etc/passwd', 'https://127.0.0.1/a',
        ] as $url) {
            $this->assertFalse(GoogleAvatar::isGooglePhoto($url), (string) $url);
        }
        $this->assertSame('https://lh3.googleusercontent.com/a/x=s400-c', GoogleAvatar::sized('https://lh3.googleusercontent.com/a/x=s96-c'));
        $this->assertSame('https://lh3.googleusercontent.com/a/x', GoogleAvatar::sized('https://lh3.googleusercontent.com/a/x'));
    }
}
