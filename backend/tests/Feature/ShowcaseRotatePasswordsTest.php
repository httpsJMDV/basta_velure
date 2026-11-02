<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** The showcase passwords are public in the repository, so a live site has to be able to leave them. */
class ShowcaseRotatePasswordsTest extends TestCase
{
    use DatabaseTransactions;

    private string $envDir;

    protected function setUp(): void
    {
        parent::setUp();

        // Never the real .env: the command writes the new passwords to whatever file the app is pointed at.
        $this->envDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'rotate-' . uniqid();
        mkdir($this->envDir);
        file_put_contents($this->envDir . '/.env', "APP_NAME=Test\n");
        $this->app->useEnvironmentPath($this->envDir);
    }

    protected function tearDown(): void
    {
        @unlink($this->envDir . '/.env');
        @rmdir($this->envDir);
        parent::tearDown();
    }

    private function account(string $username, string $password, ?string $domain = null): User
    {
        return User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'username' => $username,
            'email' => $username . '@' . ($domain ?? config('showcase.email_domain')),
            'password' => Hash::make($password), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    public function test_accounts_on_a_public_password_move_to_a_new_one(): void
    {
        $public = (string) config('showcase.public_passwords.seller');
        $seller = $this->account('rot' . uniqid(), $public);
        $token = $seller->createToken('auth_token');
        $ownChoice = $this->account('rot' . uniqid(), 'Chosen-By-Them-2026');
        $stranger = $this->account('rot' . uniqid(), $public, 'elsewhere.example');

        $this->artisan('showcase:rotate-passwords')->assertSuccessful();

        $env = (string) file_get_contents($this->envDir . '/.env');
        $this->assertSame(1, preg_match('/^SHOWCASE_PASSWORD_SELLER=(.+)$/m', $env, $match));
        $new = trim($match[1]);

        $this->assertFalse(Hash::check($public, $seller->fresh()->getRawOriginal('password')));
        $this->assertTrue(Hash::check($new, $seller->fresh()->getRawOriginal('password')));
        $this->assertNull(\Laravel\Sanctum\PersonalAccessToken::find($token->accessToken->id));

        $this->assertTrue(Hash::check('Chosen-By-Them-2026', $ownChoice->fresh()->getRawOriginal('password')));
        $this->assertTrue(Hash::check($public, $stranger->fresh()->getRawOriginal('password')), 'Only showcase accounts change.');
    }

    public function test_a_new_password_meets_the_password_rule(): void
    {
        $this->account('rot' . uniqid(), (string) config('showcase.public_passwords.rider'));

        $this->artisan('showcase:rotate-passwords')->assertSuccessful();

        preg_match('/^SHOWCASE_PASSWORD_RIDER=(.+)$/m', (string) file_get_contents($this->envDir . '/.env'), $match);
        $this->assertMatchesRegularExpression('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/', trim($match[1]));
    }
}
