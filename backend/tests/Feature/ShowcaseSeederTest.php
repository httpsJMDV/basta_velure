<?php

namespace Tests\Feature;

use App\Listeners\SkipShowcaseMail;
use App\Models\LogisticsCompany;
use App\Models\Product;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Demo\PlaceholderImage;
use App\Models\Category;
use App\Services\Showcase\ShowcaseAudit;
use App\Services\Showcase\ShowcaseRepair;
use App\Services\Showcase\ShowcaseSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * php artisan showcase:seed: 300 accounts, real products with photos and a courier network. The photo downloads are
 * faked, so the test never calls the network.
 */
class ShowcaseSeederTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('public');
        Storage::fake('ids');
        Storage::fake('local');
        Http::fake(['*' => Http::response(PlaceholderImage::png(64, 64, [200, 120, 80]), 200, ['Content-Type' => 'image/png'])]);
    }

    public function test_it_seeds_one_admin_300_accounts_real_products_with_photos_and_a_courier_network(): void
    {
        $result = app(ShowcaseSeeder::class)->run('A-Strong-Admin-Pass-2026');

        $this->assertSame(['admin' => 1, 'sellers' => 40, 'couriers' => 3, 'hubs' => 9, 'riders' => 27, 'buyers' => 220], $result['accounts']);
        $this->assertSame(300, User::where('email', 'like', '%@' . config('showcase.email_domain'))->whereNotNull('username')->count());
        $this->assertSame([], $result['skipped_products']);
        $this->assertGreaterThanOrEqual(250, $result['products']);

        // One admin, with the password given (never the easy pattern).
        $admin = User::where('username', 'admin')->sole();
        $this->assertSame('admin', $admin->role);
        $this->assertTrue(Hash::check('A-Strong-Admin-Pass-2026', $admin->password));
        $this->postJson('/api/v1/auth/login', ['identifier' => 'admin', 'password' => 'admin123'])->assertStatus(401);
        $this->postJson('/api/v1/auth/login', ['identifier' => 'admin', 'password' => 'A-Strong-Admin-Pass-2026'])->assertOk();

        // Every other account signs in with its username and the shared password of its kind, and lands complete.
        $this->postJson('/api/v1/auth/login', ['identifier' => 'buyer1', 'password' => 'Buyer@123'])->assertOk()
            ->assertJsonPath('data.buyer_application_status', 'approved');
        $this->postJson('/api/v1/auth/login', ['identifier' => 'buyer220', 'password' => 'Buyer@123'])->assertOk();
        $this->postJson('/api/v1/auth/login', ['identifier' => 'buyer1', 'password' => 'buyer123'])->assertStatus(401);
        $this->postJson('/api/v1/auth/login', ['identifier' => 'seller40', 'password' => 'Seller@123'])->assertOk()
            ->assertJsonPath('data.seller_profile.application_status', 'approved');
        $this->postJson('/api/v1/auth/login', ['identifier' => 'courier1', 'password' => 'Courier@123'])->assertOk()
            ->assertJsonPath('data.logistics_company.status', 'APPROVED');
        $this->postJson('/api/v1/auth/login', ['identifier' => 'hub9', 'password' => 'Hub@1234'])->assertOk()
            ->assertJsonPath('data.sorting_center.status', 'APPROVED');
        $this->postJson('/api/v1/auth/login', ['identifier' => 'rider27', 'password' => 'Rider@123'])->assertOk()
            ->assertJsonPath('data.rider.status', 'ACTIVE');
        foreach (['buyer1', 'seller1', 'rider1'] as $username) {
            $user = User::where('username', $username)->sole();
            $this->assertNotNull($user->addresses()->where('is_default', true)->value('barangay_code') ?? ($username === 'rider1' ? 'n/a' : null));
            $this->assertTrue(Storage::disk('local')->exists($user->government_id_image_path));
        }

        // Every account passes the same rules a real sign-up, application and listing meets (showcase:check).
        $this->assertSame([], app(ShowcaseAudit::class)->run());
        $this->artisan('showcase:check')->assertExitCode(0);

        // Products: real names, every one with photos on disk and stock, spread over the 40 shops.
        $products = Product::whereIn('seller_id', User::where('username', 'like', 'seller%')->pluck('id'))->with('images', 'variants')->get();
        $this->assertCount($result['products'], $products);
        $this->assertSame(40, $products->pluck('seller_id')->unique()->count());
        foreach ($products as $product) {
            $this->assertNotEmpty($product->images, $product->name);
            $this->assertTrue(Storage::disk('public')->exists($product->images->first()->path));
            $this->assertGreaterThan(0, $product->variants->sum('stock_quantity'));
        }
        $this->assertTrue($products->contains('name', "Jack 'n Jill Piattos Cheese 85g"));
        $food = $products->firstWhere('name', 'Datu Puti Soy Sauce 385ml');
        $this->assertTrue(Storage::disk('local')->exists($food->fda_lto_path));
        $this->assertSame('385 ml', $food->net_weight_volume);
        $this->getJson('/api/v1/products?search=Piattos')->assertOk();

        // The courier network: 3 approved partners, a hub of each in East, South and West Laguna, 3 riders per hub.
        $couriers = LogisticsCompany::whereIn('owner_user_id', User::where('username', 'like', 'courier%')->pluck('id'))->get();
        $this->assertCount(3, $couriers);
        $this->assertTrue($couriers->every(fn ($c) => $c->status === LogisticsCompany::STATUS_APPROVED));
        $hubs = SortingCenter::whereIn('logistics_company_id', $couriers->pluck('id'))->get();
        $this->assertCount(9, $hubs);
        $this->assertTrue($hubs->every(fn ($h) => count($h->coverage_barangays) > 20 && $h->status === SortingCenter::STATUS_APPROVED));
        $this->assertSame(27, Rider::whereIn('sorting_center_id', $hubs->pluck('id'))->where('status', Rider::STATUS_ACTIVE)->count());

        // It only runs once.
        $this->expectException(RuntimeException::class);
        app(ShowcaseSeeder::class)->run('A-Strong-Admin-Pass-2026');
    }

    public function test_showcase_check_fix_repairs_accounts_seeded_the_old_way(): void
    {
        app(ShowcaseSeeder::class)->run('A-Strong-Admin-Pass-2026');

        // What the first showcase run left: local-format numbers, the easy passwords, plates with spaces, ID photos on
        // the wrong disk, and no TIN, licence, GCash, region or postal code.
        $buyer = User::where('username', 'buyer7')->sole();
        $buyer->forceFill(['phone' => '0' . substr($buyer->phone, 3), 'password' => Hash::make('buyer123'), 'terms_accepted_at' => null])->save();
        $buyer->addresses()->update(['region' => null, 'region_code' => null]);
        Storage::disk('ids')->put($buyer->government_id_image_path, Storage::disk('local')->get($buyer->government_id_image_path));
        Storage::disk('local')->delete($buyer->government_id_image_path);
        $seller = User::where('username', 'seller3')->sole();
        $seller->sellerProfile->forceFill(['tin' => null, 'seller_type' => null, 'gcash_number' => null, 'gcash_account_name' => null,
            'address_postal_code' => null, 'shop_category' => 'Phones, tablets and laptops'])->save();
        $rider = Rider::where('user_id', User::where('username', 'rider2')->value('id'))->sole();
        $rider->forceFill(['plate_number' => '987 QXZ', 'license_number' => null, 'license_expiry' => null, 'activated_at' => null])->save();
        $company = LogisticsCompany::where('owner_user_id', User::where('username', 'courier2')->value('id'))->sole();
        $company->forceFill(['tin' => null, 'sec_registration_no' => null, 'service_regions' => null, 'address_postal_code' => null])->save();

        $problems = collect(app(ShowcaseAudit::class)->run());
        $this->assertEqualsCanonicalizing(['buyer7', 'seller3', 'rider2', 'courier2'], $problems->pluck('account')->unique()->values()->all());
        $this->artisan('showcase:check')->assertExitCode(1);

        $this->artisan('showcase:check', ['--fix' => true, '--force' => true])->assertExitCode(0);
        $this->assertSame([], app(ShowcaseAudit::class)->run());

        $buyer->refresh();
        $this->assertMatchesRegularExpression('/^\+639\d{9}$/', $buyer->phone);
        $this->assertTrue(Storage::disk('local')->exists($buyer->government_id_image_path));
        $this->postJson('/api/v1/auth/login', ['identifier' => 'buyer7', 'password' => 'Buyer@123'])->assertOk();
        $profile = $seller->sellerProfile->fresh();
        $this->assertMatchesRegularExpression('/^\d{3}-\d{3}-\d{3}-000$/', $profile->tin);
        $this->assertTrue(Category::whereNull('parent_id')->where('name', $profile->shop_category)->exists());
        $this->assertSame($profile->gcash_number, \App\Support\Gcash::normalize($seller->phone));
        $this->assertSame('987QXZ', $rider->fresh()->plate_number);
        $this->assertMatchesRegularExpression('/^[A-Z]\d{2}-\d{2}-\d{6}$/', $rider->fresh()->license_number);
        $this->assertSame(['040000000'], $company->fresh()->service_regions);

        // A second run finds nothing to do.
        $this->assertSame([], app(ShowcaseRepair::class)->run()['fixed']);
    }

    public function test_a_weak_admin_password_is_refused_and_the_command_refuses_the_test_database(): void
    {
        try {
            app(ShowcaseSeeder::class)->run('admin123');
            $this->fail('A weak admin password was accepted.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('at least 12', $e->getMessage());
        }
        $this->assertFalse(User::where('username', 'admin')->exists());

        $this->artisan('showcase:seed', ['--force' => true])->assertExitCode(1);
    }

    public function test_email_to_a_seeded_account_is_skipped_and_to_anyone_else_is_sent(): void
    {
        $domain = config('showcase.email_domain');
        User::forceCreate(['first_name' => 'Seeded', 'last_name' => 'Buyer', 'email' => "seeded-buyer@{$domain}", 'username' => 'seeded-buyer-test',
            'phone' => '09170000999', 'password' => 'x', 'role' => 'buyer', 'status' => 'active']);
        $listener = new SkipShowcaseMail();
        $event = fn (string $to) => new MessageSending((new Email())->to($to)->subject('Your order shipped')->text('Hi'));

        $this->assertFalse($listener->handle($event("seeded-buyer@{$domain}")));
        $this->assertNull($listener->handle($event('someone@gmail.com')));
        // An address on the domain that no seeded account owns (a real staff mailbox, say) still gets mail.
        $this->assertNull($listener->handle($event("support@{$domain}")));

        config(['showcase.send_mail' => true]);
        $this->assertNull($listener->handle($event("seeded-buyer@{$domain}")));
    }
}
