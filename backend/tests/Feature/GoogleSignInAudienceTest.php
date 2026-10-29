<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * "Continue with Google" accepts only tokens Google issued to Loved-IT's own OAuth clients (amaru.md, security
 * checklist). It used to read the profile of any access token, so a token another app got from the same Google user
 * could sign in here. The website's access token and the mobile app's ID token both still work.
 */
class GoogleSignInAudienceTest extends TestCase
{
    use DatabaseTransactions;

    private const OUR_CLIENT = 'loved-it-web.apps.googleusercontent.com';
    private const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Mail::fake();
        config(['services.google.client_ids' => [self::OUR_CLIENT]]);
    }

    private function member(): User
    {
        return User::forceCreate([
            'first_name' => 'Maya', 'last_name' => 'Reyes', 'email' => 'maya.' . Str::lower(Str::random(8)) . '@gmail.com',
            'phone' => '0917' . random_int(1000000, 9999999), 'date_of_birth' => '1998-03-10', 'sex' => 'female',
            'government_id_type' => 'national_id', 'password' => Hash::make('Password123!'), 'role' => 'buyer',
            'status' => 'active',
        ]);
    }

    /** tokeninfo answering for an ID token. */
    private function idTokenInfo(string $email, array $overrides = []): array
    {
        return array_merge([
            'iss' => 'https://accounts.google.com', 'aud' => self::OUR_CLIENT, 'azp' => 'loved-it-android.apps.googleusercontent.com',
            'email' => $email, 'email_verified' => 'true', 'given_name' => 'Maya', 'family_name' => 'Reyes', 'exp' => (string) (time() + 3600),
        ], $overrides);
    }

    public function test_the_apps_id_token_for_our_client_signs_in(): void
    {
        $user = $this->member();
        Http::fake(['https://oauth2.googleapis.com/*' => Http::response($this->idTokenInfo($user->email))]);

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])
            ->assertOk()
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonStructure(['token']);

        Http::assertSent(fn (HttpRequest $request) => str_starts_with($request->url(), 'https://oauth2.googleapis.com/tokeninfo')
            && $request['id_token'] === self::ID_TOKEN);
        // An ID token carries the profile: no userinfo call.
        Http::assertNotSent(fn (HttpRequest $request) => str_contains($request->url(), 'userinfo'));
    }

    public function test_an_id_token_made_for_another_app_is_refused(): void
    {
        $user = $this->member();
        Http::fake(['https://oauth2.googleapis.com/*' => Http::response($this->idTokenInfo($user->email, [
            'aud' => 'someone-else.apps.googleusercontent.com', 'azp' => 'someone-else.apps.googleusercontent.com',
        ]))]);

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Invalid Google token.')
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_an_id_token_with_an_unverified_email_or_a_foreign_issuer_is_refused(): void
    {
        $user = $this->member();
        foreach ([['email_verified' => 'false'], ['iss' => 'https://evil.example.com']] as $override) {
            Http::fake(['https://oauth2.googleapis.com/*' => Http::response($this->idTokenInfo($user->email, $override))]);

            $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])->assertUnauthorized();
        }
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_a_token_google_rejects_is_refused(): void
    {
        Http::fake(['https://oauth2.googleapis.com/*' => Http::response(['error_description' => 'Invalid Value'], 400)]);

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])->assertUnauthorized();
    }

    public function test_the_websites_access_token_for_our_client_still_signs_in(): void
    {
        $user = $this->member();
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response(['aud' => self::OUR_CLIENT, 'azp' => self::OUR_CLIENT, 'scope' => 'email profile']),
            'https://www.googleapis.com/*' => Http::response(['email' => $user->email, 'given_name' => 'Maya', 'family_name' => 'Reyes']),
        ]);

        $this->postJson('/api/v1/auth/google', ['credential' => 'ya29.website-access-token'])
            ->assertOk()
            ->assertJsonStructure(['token']);

        Http::assertSent(fn (HttpRequest $request) => str_starts_with($request->url(), 'https://oauth2.googleapis.com/tokeninfo')
            && $request['access_token'] === 'ya29.website-access-token');
    }

    public function test_an_access_token_another_app_obtained_is_refused_before_reading_the_profile(): void
    {
        $user = $this->member();
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response(['aud' => 'other-app', 'azp' => 'other-app']),
            'https://www.googleapis.com/*' => Http::response(['email' => $user->email]),
        ]);

        $this->postJson('/api/v1/auth/google', ['credential' => 'ya29.someone-elses-token'])->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_a_new_google_account_from_the_app_finishes_its_profile(): void
    {
        $email = 'new.' . Str::lower(Str::random(8)) . '@gmail.com';
        Http::fake(['https://oauth2.googleapis.com/*' => Http::response($this->idTokenInfo($email, ['given_name' => 'Nico', 'family_name' => 'Tan']))]);

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])
            ->assertCreated()
            ->assertJsonPath('profile_incomplete', true)
            ->assertJsonPath('data.first_name', 'Nico');

        $this->assertDatabaseHas('users', ['email' => $email, 'role' => 'buyer']);
    }

    public function test_without_configured_client_ids_google_sign_in_is_off(): void
    {
        config(['services.google.client_ids' => []]);
        Http::fake();

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_google_unreachable_says_so(): void
    {
        Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('timeout'));

        $this->postJson('/api/v1/auth/google', ['credential' => self::ID_TOKEN])->assertStatus(502);
    }
}
