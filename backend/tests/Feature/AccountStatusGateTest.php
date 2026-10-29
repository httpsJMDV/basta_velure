<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * An account that is not active cannot use the site through a token it still holds, and "Continue with Google" does
 * not skip the email code: a buyer once registered with the form, never entered the code, signed in with Google on
 * the same Gmail and placed an order while still unverified.
 */
class AccountStatusGateTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Mail::fake();
    }

    private function account(string $status): User
    {
        return User::forceCreate([
            'first_name' => 'Lennon', 'last_name' => 'Cruz', 'email' => 'lennon.' . Str::lower(Str::random(8)) . '@gmail.com',
            'phone' => '0917' . random_int(1000000, 9999999), 'date_of_birth' => '2000-01-15',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => $status,
        ]);
    }

    public function test_an_unverified_or_suspended_account_cannot_use_a_token_it_holds(): void
    {
        foreach (['unverified' => 'email_unverified', 'suspended' => 'account_suspended'] as $status => $code) {
            Sanctum::actingAs($this->account($status));

            $this->getJson('/api/v1/buyer/orders')->assertForbidden()->assertJsonPath('code', $code);
            $this->getJson('/api/v1/cart')->assertForbidden()->assertJsonPath('code', $code);
            // The app can still read who is signed in (to show the right screen) and sign out.
            $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.status', $status);
        }

        Sanctum::actingAs($this->account('active'));
        $this->getJson('/api/v1/buyer/orders')->assertOk();
    }

    public function test_continue_with_google_does_not_skip_the_email_code(): void
    {
        $user = $this->account('unverified');
        config(['services.google.client_ids' => ['loved-it-web']]);
        Http::fake([
            'https://oauth2.googleapis.com/*' => Http::response(['aud' => 'loved-it-web', 'azp' => 'loved-it-web']),
            'https://www.googleapis.com/*' => Http::response([
                'email' => $user->email, 'given_name' => 'Lennon', 'family_name' => 'Cruz', 'email_verified' => true,
            ]),
        ]);

        $this->postJson('/api/v1/auth/google', ['credential' => 'google-access-token'])
            ->assertForbidden()
            ->assertJsonPath('code', 'email_unverified')
            ->assertJsonPath('email', $user->email)
            ->assertJsonMissingPath('token');

        $this->assertSame(0, $user->tokens()->count());
        $this->assertSame('unverified', $user->fresh()->status);
    }
}
