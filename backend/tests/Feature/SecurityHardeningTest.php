<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use App\Support\SafeHtml;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** The things someone tries first when told to attack the site. */
class SecurityHardeningTest extends TestCase
{
    use DatabaseTransactions;

    public function test_scripts_cannot_survive_in_a_description(): void
    {
        $attacks = [
            '<script>alert(1)</script>',
            '<img src=x onerror=alert(1)>',
            '<svg onload=alert(1)></svg>',
            '<svg><script>alert(1)</script></svg>',
            '<iframe src="javascript:alert(1)"></iframe>',
            '<a href="javascript:alert(1)">click</a>',
            '<p onclick="alert(1)">x</p>',
            '<p style="background:url(javascript:alert(1))">x</p>',
            '<body onload=alert(1)>',
            '<math><mtext></mtext></math>',
            '<!--><img src=x onerror=alert(1)>-->',
            '<form action="https://evil.example"><input name="password"></form>',
            '<base href="https://evil.example/">',
            '<meta http-equiv="refresh" content="0;url=https://evil.example">',
            '<img src="javascript:alert(1)">',
            '<img src="https://evil.example/storage/pixel.png">',
            '<img src="//evil.example/storage/pixel.png">',
            '<IMG SRC=x OnErRoR=alert(1)>',
            '</body></html><script>alert(1)</script>',
            '<div><p><span onmouseover=alert(1)>x</span></p></div>',
        ];

        foreach ($attacks as $attack) {
            $clean = (string) SafeHtml::clean($attack);
            $this->assertDoesNotMatchRegularExpression(
                '/<(script|svg|iframe|math|form|input|base|meta|a)\b|\son\w+\s*=|javascript:|style\s*=|evil\.example/i',
                $clean,
                "Not cleaned: {$attack}",
            );
        }
    }

    public function test_real_formatting_and_own_images_are_kept(): void
    {
        $own = rtrim((string) config('app.url'), '/') . '/storage/products/descriptions/a.jpg';
        $html = '<p><b>Soft</b> <i>cotton</i> &amp; <u>linen</u></p><ul><li>One</li></ul><p><img src="' . $own . '" alt="Front"></p>';

        $this->assertSame($html, SafeHtml::clean($html));
        $this->assertSame('Plain text & no tags', SafeHtml::clean('Plain text & no tags'));
        $this->assertSame('', SafeHtml::clean(''));
        $this->assertNull(SafeHtml::clean(null));
        $this->assertSame('<p>₱100 señorita</p>', SafeHtml::clean('<p>₱100 señorita</p>'));
    }

    public function test_an_old_description_is_clean_when_read_even_if_the_row_is_not(): void
    {
        $seller = User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => 'old.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
        $product = Product::forceCreate(['seller_id' => $seller->id, 'name' => 'Old listing', 'description' => 'x', 'status' => 'draft', 'base_price' => 100]);

        // Written straight to the table, as a row saved before this fix would be.
        DB::table('products')->where('id', $product->id)->update(['description' => '<p>Hi</p><img src=x onerror=alert(1)>']);

        $this->assertSame('<p>Hi</p>', $product->fresh()->description);
    }

    public function test_a_negative_page_size_cannot_return_the_whole_table(): void
    {
        foreach (['-1', '0', '100000', 'abc'] as $size) {
            $response = $this->getJson('/api/v1/products?per_page=' . $size)->assertOk();
            $this->assertGreaterThan(0, $response->json('meta.per_page'));
            $this->assertLessThanOrEqual(100, $response->json('meta.per_page'));
            $this->assertLessThanOrEqual(100, count($response->json('data')));
        }
    }

    public function test_strange_query_values_do_not_crash_the_catalog(): void
    {
        $queries = [
            'q[]=a', 'q[a][b]=c', 'per_page[]=1', 'page[]=1', 'category[]=x', 'sort[]=x', 'min_price[]=1', 'max_price[]=1',
            'q=' . str_repeat('a', 20000), 'q=%27%20OR%201%3D1--', 'page=-5', 'page=99999999', 'sort=%27;DROP',
        ];

        foreach ($queries as $query) {
            $status = $this->getJson('/api/v1/products?' . $query)->status();
            $this->assertContains($status, [200, 422], substr($query, 0, 40) . " answered {$status}");
        }
    }

    public function test_not_found_does_not_name_the_code(): void
    {
        $body = $this->getJson('/api/v1/products/999999999')->assertNotFound()->getContent();
        $this->assertStringNotContainsString('App\\', $body);
        $this->assertStringNotContainsString('Models', $body);

        $this->getJson('/api/v1/no-such-route')->assertNotFound()->assertExactJson(['message' => 'Not found.']);
    }

    public function test_responses_carry_the_hardening_headers(): void
    {
        $this->getJson('/api/v1/categories')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->assertHeaderMissing('X-Powered-By');
    }

    public function test_password_guessing_on_one_account_is_stopped(): void
    {
        $identifier = 'nobody.' . uniqid() . '@example.com';
        $codes = [];
        for ($i = 0; $i < 7; $i++) {
            $codes[] = $this->postJson('/api/v1/auth/login', ['identifier' => $identifier, 'password' => 'wrong' . $i])->status();
        }

        $this->assertSame([401, 401, 401, 401, 401, 429, 429], $codes);

        // Someone else from the same address can still try.
        $this->postJson('/api/v1/auth/login', ['identifier' => 'other.' . uniqid() . '@example.com', 'password' => 'wrong'])->assertUnauthorized();
    }

    public function test_reset_emails_to_one_address_are_limited_without_saying_so(): void
    {
        $email = 'nobody.' . uniqid() . '@example.com';
        for ($i = 0; $i < 7; $i++) {
            $this->postJson('/api/v1/auth/forgot-password', ['email' => $email])
                ->assertOk()
                ->assertJsonPath('message', 'If that email exists, a reset link has been sent.');
        }
    }

    public function test_an_expired_token_stops_working(): void
    {
        $user = User::forceCreate([
            'first_name' => 'A', 'last_name' => 'B', 'email' => 'token.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        $token = $user->createToken('auth_token');

        $this->withToken($token->plainTextToken)->getJson('/api/v1/auth/me')->assertOk();

        $token->accessToken->forceFill(['created_at' => now()->subDays(31)])->save();
        $this->app['auth']->forgetGuards();

        $this->withToken($token->plainTextToken)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_the_public_admin_password_is_never_seeded_on_a_live_site(): void
    {
        DB::table('users')->where('role', 'admin')->update(['role' => 'buyer']);
        $this->app['env'] = 'production';

        (new \Database\Seeders\AdminSeeder)->run();
        $this->app['env'] = 'testing';

        $this->assertFalse(User::where('role', 'admin')->exists());
    }

    public function test_role_and_status_cannot_be_set_in_bulk(): void
    {
        $user = new User(['role' => 'admin', 'status' => 'active', 'email' => 'x@example.com']);

        $this->assertNotSame('admin', $user->role);
        $this->assertNotSame('active', $user->status);
    }
}
