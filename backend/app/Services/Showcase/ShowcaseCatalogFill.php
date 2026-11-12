<?php

namespace App\Services\Showcase;

use App\Models\Address;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\Demo\PlaceholderImage;
use App\Services\MailNotifier;
use App\Services\Notifier;
use App\Support\Gcash;
use Carbon\Carbon;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Fills every storefront category and sub-category that has no products (php artisan showcase:fill-catalog), on top
 * of the showcase data (showcase:seed). The list is in database/data/showcase/fill.json:
 *
 *  - "recategorize": showcase products that sit in a broader sub-category than they belong to (a basketball under
 *    Fitness Equipment, perfume under Personal Care) move to the right one. Only when they are still where the
 *    showcase put them, so a change made on the site is never undone.
 *  - "shops": new approved shops (seller41 and up) for the aisles no showcase shop sold in: appliances, hardware,
 *    car and motorcycle, baby, toys and books, pets, and Others. They sign in like every showcase seller.
 *  - "products": about two products for each empty sub-category, from a new shop or an existing one that sells
 *    the same kind of thing, each with a real photo made square (ShowcasePhoto) and its credit in the description.
 *
 * It only adds rows (and moves the listed products), so running it again adds nothing. Photos are downloaded before
 * the database work; if that fails, the downloaded files are removed.
 */
class ShowcaseCatalogFill
{
    private const USER_AGENT = 'LovedIT-Capstone/1.0 (showcase seeding; https://loved-it.shop)';

    private array $data;

    private array $places;

    /** @var array<string, array<int, string>> */
    private array $written = ['public' => [], 'ids' => [], 'local' => []];

    private ?\Closure $progress = null;

    private Carbon $now;

    /**
     * @return array{moved: int, shops: int, products: int, photos: int, skipped: array<int, string>}
     */
    public function run(?callable $progress = null): array
    {
        $this->progress = $progress ? \Closure::fromCallable($progress) : null;
        $this->now = Carbon::now();
        $this->data = $this->load('fill.json');
        $this->places = $this->load('places.json');

        $admin = User::where('username', 'admin')->first();
        if (! $admin || ! User::where('username', 'seller1')->exists()) {
            throw new RuntimeException('Run php artisan showcase:seed first: the catalog is filled on top of the showcase shops.');
        }

        $this->say('Downloading product photos...');
        $photos = $this->downloadPhotos();

        try {
            return Notifier::muted(fn () => MailNotifier::muted(fn () => DB::transaction(function () use ($admin, $photos) {
                $moved = $this->recategorize();
                [$shops, $made] = $this->shops($admin);
                [$products, $photoCount, $skipped] = $this->products($photos);

                // TINs, documents and GCash accounts for the new shops, the way every showcase shop has them.
                app(ShowcaseRepair::class)->run(collect($shops)->pluck('id')->all());

                return ['moved' => $moved, 'shops' => $made, 'products' => $products, 'photos' => $photoCount, 'skipped' => $skipped];
            })));
        } catch (\Throwable $e) {
            foreach ($this->written as $disk => $paths) {
                Storage::disk($disk)->delete($paths);
            }
            throw $e;
        } finally {
            Cache::forget('storefront.categories');
        }
    }

    /** Moves the listed showcase products to the sub-category they belong to. */
    private function recategorize(): int
    {
        $slugs = Category::pluck('id', 'slug');
        $showcaseSellers = User::where('username', 'like', 'seller%')->where('email', 'like', '%@' . config('showcase.email_domain'))->pluck('id');
        $moved = 0;
        foreach ($this->data['recategorize'] as $move) {
            $from = $slugs[$move['from']] ?? null;
            $to = $slugs[$move['to']] ?? null;
            if (! $from || ! $to) {
                continue;
            }
            $moved += Product::whereIn('seller_id', $showcaseSellers)->where('name', $move['name'])->where('category_id', $from)
                ->update(['category_id' => $to]);
        }
        $this->say("  {$moved} products moved to a closer sub-category");

        return $moved;
    }

    /** @return array{0: array<string, User>, 1: int} shop key => seller, and how many were created */
    private function shops(User $admin): array
    {
        $sellers = [];
        $made = 0;
        foreach ($this->data['existing'] as $key => $username) {
            if ($user = User::where('username', $username)->first()) {
                $sellers[$key] = $user;
            }
        }

        $hash = Hash::make((string) config('showcase.passwords.seller'));
        foreach ($this->data['shops'] as $i => $shop) {
            $existing = User::where('username', $shop['username'])->first();
            if ($existing) {
                $sellers[$shop['key']] = $existing;
                continue;
            }
            $created = $this->now->copy()->subDays(40 - $i)->subMinutes(mt_rand(0, 600));
            $person = $this->person($shop['username']);
            $place = $this->place($shop['username']);
            $user = new User();
            $user->forceFill([
                'first_name' => $person['first'], 'last_name' => $person['last'],
                'email' => $shop['username'] . '@' . config('showcase.email_domain'), 'username' => $shop['username'],
                'phone' => $this->phone($shop['username']), 'password' => $hash,
                'date_of_birth' => $person['dob'], 'sex' => $person['sex'], 'role' => 'buyer', 'status' => 'active',
                'email_verified_at' => $created, 'created_at' => $created, 'updated_at' => $created,
                'government_id_type' => 'national_id', 'government_id_image_path' => $this->document('local', "{$shop['username']}-id"),
                'terms_accepted_at' => $created, 'buyer_application_status' => 'approved',
            ])->save();

            $street = (10 + crc32($shop['username']) % 240) . ' ' . ShowcaseSeeder::STREETS[crc32($shop['name']) % count(ShowcaseSeeder::STREETS)] . ' Street';
            Address::create([
                'user_id' => $user->id, 'full_name' => "{$user->first_name} {$user->last_name}", 'phone' => $user->phone,
                'address' => $street, 'province' => $place['province'], 'district' => $place['town'], 'ward' => $place['barangay'],
                'province_code' => $place['province_code'], 'city_code' => $place['town_code'], 'barangay_code' => $place['barangay_code'],
                'label' => 'home', 'is_default' => true,
            ]);
            SellerProfile::forceCreate([
                'user_id'                   => $user->id,
                'shop_name'                 => $shop['name'],
                'shop_category'             => $shop['category'],
                'shop_description'          => "{$shop['name']}: {$shop['category']}, shipped from {$place['town']}, Laguna. {$shop['bio']}",
                'shop_bio'                  => $shop['bio'],
                'date_of_birth'             => $user->date_of_birth,
                'government_id_type'        => 'national_id',
                'government_id_number'      => sprintf('%04d-%04d-%04d-%04d', mt_rand(1000, 9999), mt_rand(0, 9999), mt_rand(0, 9999), mt_rand(0, 9999)),
                'government_id_number_hash' => hash('sha256', 'SHOWCASE_' . $user->id),
                'government_id_image_path'  => $this->document('ids', "{$shop['username']}-gov-id"),
                'business_permit_path'      => $this->document('ids', "{$shop['username']}-permit"),
                'dti_sec_registration_path' => $this->document('ids', "{$shop['username']}-dti"),
                'address_province'          => $place['province'],
                'address_city'              => $place['town'],
                'address_barangay'          => $place['barangay'],
                'address_street'            => $street,
                'address_province_code'     => $place['province_code'],
                'address_city_code'         => $place['town_code'],
                'address_barangay_code'     => $place['barangay_code'],
                'shop_contact_number'       => $user->phone,
                'return_policy'             => 'Returns accepted within 7 days of delivery for items that arrive damaged or not as described.',
                'shipping_policy'           => 'Orders are packed within 1 to 2 days and handed to the partner courier that covers your area.',
                'business_hours'            => 'Mon to Sat, 8:00 AM to 6:00 PM',
                'payout_gcash_number'       => Gcash::normalize($user->phone),
                'application_status'        => 'approved',
                'reviewed_by'               => $admin->id,
                'reviewed_at'               => $created->copy()->addDay(),
                'submitted_at'              => $created,
            ]);
            $sellers[$shop['key']] = $user;
            $made++;
        }
        $this->say("  {$made} new shops");

        return [$sellers, $made];
    }

    /** @return array{0: int, 1: int, 2: array<int, string>} */
    private function products(array $photos): array
    {
        $sellers = $this->sellersByKey();
        $categories = Category::pluck('id', 'slug');
        $fda = Category::where('requires_fda', true)->pluck('slug')->flip();
        $made = 0;
        $photoCount = 0;
        $skipped = [];
        $perShop = [];

        foreach ($this->data['products'] as $i => $item) {
            $seller = $sellers[$item['shop']] ?? null;
            $categoryId = $categories[$item['category']] ?? null;
            $path = $photos[$i] ?? null;
            if (! $seller || ! $categoryId || ! $path) {
                $skipped[] = $item['name'];
                continue;
            }
            if (Product::where('seller_id', $seller->id)->where('name', $item['name'])->exists()) {
                continue;
            }
            $perShop[$seller->id] = ($perShop[$seller->id] ?? Product::withTrashed()->where('seller_id', $seller->id)->count()) + 1;
            $sku = sprintf('LIT-F%s-%03d', strtoupper(substr(preg_replace('/\D/', '', $seller->username) ?: '0', 0, 3)), $perShop[$seller->id]);
            $isFood = isset($fda[$item['category']]);
            $created = $this->now->copy()->subDays(mt_rand(5, 35))->subMinutes(mt_rand(0, 900));

            $product = Product::forceCreate([
                'seller_id'            => $seller->id,
                'category_id'          => $categoryId,
                'name'                 => $item['name'],
                'description'          => $item['description'] . (! empty($item['credit']) ? "\n\n{$item['credit']}" : ''),
                'base_price'           => $item['price'],
                'original_price'       => $item['original_price'] ?: null,
                'status'               => 'active',
                'weight_kg'            => $item['weight_kg'],
                'sku'                  => $sku,
                'fda_lto_path'         => $isFood ? $this->document('local', "{$sku}-fda-lto") : null,
                'fda_cpr_path'         => $isFood ? $this->document('local', "{$sku}-fda-cpr") : null,
                'net_weight_volume'    => $isFood ? ($item['weight_kg'] . ' kg') : null,
                'expiry_best_before'   => $isFood ? 'Best within 5 days of delivery' : null,
                'storage_instructions' => $isFood ? 'Keep in a cool, airy place. Refrigerate once ripe.' : null,
                'published_at'         => $created,
                'created_at'           => $created,
                'updated_at'           => $created,
            ]);
            ProductImage::create(['product_id' => $product->id, 'path' => $path, 'is_primary' => true, 'sort_order' => 0]);
            $photoCount++;

            $labels = array_values(array_filter($item['variants'], fn ($v) => $v !== '')) ?: ['Standard'];
            $stock = $item['price'] >= 10000 ? 12 : ($item['price'] >= 2000 ? 30 : 80);
            foreach ($labels as $label) {
                ProductVariant::create([
                    'product_id'     => $product->id,
                    'label'          => $label,
                    'sku'            => $sku . ($label === 'Standard' ? '' : '-' . strtoupper(Str::slug($label, ''))),
                    'price'          => $item['price'],
                    'original_price' => $item['original_price'] ?: null,
                    'stock_quantity' => max(6, intdiv($stock * 2, count($labels))),
                ]);
            }
            $made++;
        }
        $this->say("  {$made} new products");

        return [$made, $photoCount, $skipped];
    }

    /** @return array<string, User> */
    private function sellersByKey(): array
    {
        $out = [];
        foreach ($this->data['existing'] as $key => $username) {
            if ($u = User::where('username', $username)->first()) {
                $out[$key] = $u;
            }
        }
        foreach ($this->data['shops'] as $shop) {
            if ($u = User::where('username', $shop['username'])->first()) {
                $out[$shop['key']] = $u;
            }
        }

        return $out;
    }

    /**
     * Downloads and squares each product's photo (a few at a time, retrying), keyed by product index. A product that
     * is already listed keeps its photo, so nothing is downloaded for it again.
     *
     * @return array<int, string> product index => stored path
     */
    private function downloadPhotos(): array
    {
        $done = [];
        foreach ($this->data['products'] as $i => $item) {
            $path = trim((string) config('showcase.storage_prefix'), '/') . '/products/fill-' . Str::slug($item['category'] . '-' . $item['name']) . '.jpg';
            if (Storage::disk('public')->exists($path)) {
                $done[$i] = $path;
            }
        }
        $pending = array_values(array_filter(array_keys($this->data['products']), fn ($i) => ! isset($done[$i]) && ! empty($this->data['products'][$i]['image'])));

        for ($round = 1; $pending !== [] && $round <= 3; $round++) {
            $retry = [];
            foreach (array_chunk($pending, 6) as $chunk) {
                // Wikimedia answers 429 to bursts: a short pause between groups keeps it happy.
                usleep(700_000);
                $responses = Http::pool(fn (Pool $pool) => array_map(
                    fn (int $i) => $pool->as((string) $i)->withHeaders(['User-Agent' => self::USER_AGENT])->timeout(60)->get($this->data['products'][$i]['image']),
                    $chunk
                ));
                foreach ($chunk as $i) {
                    $response = $responses[(string) $i] ?? null;
                    $ok = $response instanceof Response && $response->successful() && strlen($response->body()) > 2000;
                    $jpeg = $ok ? ShowcasePhoto::square($response->body(), $this->data['products'][$i]['fit'] ?? 'cover') : null;
                    if (! $jpeg) {
                        $retry[] = $i;
                        continue;
                    }
                    $item = $this->data['products'][$i];
                    $path = trim((string) config('showcase.storage_prefix'), '/') . '/products/fill-' . Str::slug($item['category'] . '-' . $item['name']) . '.jpg';
                    Storage::disk('public')->put($path, $jpeg);
                    $this->written['public'][] = $path;
                    $done[$i] = $path;
                }
            }
            $pending = $retry;
            $this->say('  ' . count($done) . ' photos ready' . ($pending ? ', ' . count($pending) . ' to retry' : ''));
        }

        return $done;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** A plausible Filipino name, the same one for the same username on every run. */
    private function person(string $seed): array
    {
        $h = crc32($seed);
        $sex = $h % 2 ? 'male' : 'female';
        $first = $sex === 'male' ? ShowcaseSeeder::MALE[$h % count(ShowcaseSeeder::MALE)] : ShowcaseSeeder::FEMALE[$h % count(ShowcaseSeeder::FEMALE)];
        $last = ShowcaseSeeder::LAST[intdiv($h, 7) % count(ShowcaseSeeder::LAST)];

        return ['first' => $first, 'last' => $last, 'sex' => $sex, 'dob' => sprintf('%04d-%02d-%02d', 1975 + $h % 28, 1 + $h % 12, 1 + $h % 28)];
    }

    private function phone(string $seed): string
    {
        for ($n = 0; ; $n++) {
            $h = crc32($seed . $n);
            $phone = '+63' . substr(ShowcaseSeeder::PREFIXES[$h % count(ShowcaseSeeder::PREFIXES)], 1) . str_pad((string) ($h % 10000000), 7, '0', STR_PAD_LEFT);
            if (! User::where('phone', $phone)->exists()) {
                return $phone;
            }
        }
    }

    private function place(string $seed): array
    {
        $h = crc32($seed);
        $clusters = array_values($this->places['clusters']);
        $cluster = $clusters[$h % count($clusters)];
        $town = $cluster['towns'][intdiv($h, 3) % count($cluster['towns'])];
        $barangay = $town['barangays'][intdiv($h, 11) % count($town['barangays'])];

        return [
            'province' => $this->places['province'], 'province_code' => $this->places['province_code'],
            'town' => $town['name'], 'town_code' => $town['code'],
            'barangay' => $barangay['name'], 'barangay_code' => $barangay['code'],
        ];
    }

    /** A placeholder document image (ID photo, permit, FDA licence) on a private disk. */
    private function document(string $disk, string $name): string
    {
        $path = trim((string) config('showcase.storage_prefix'), '/') . "/documents/{$name}.png";
        if (! Storage::disk($disk)->exists($path)) {
            $shade = crc32($name);
            Storage::disk($disk)->put($path, PlaceholderImage::png(320, 220, [90 + $shade % 100, 100 + intdiv($shade, 100) % 100, 120 + intdiv($shade, 10000) % 100]));
            $this->written[$disk][] = $path;
        }

        return $path;
    }

    private function load(string $file): array
    {
        $path = database_path("data/showcase/{$file}");
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (! is_array($data)) {
            throw new RuntimeException("Missing or unreadable showcase data: {$path}");
        }

        return $data;
    }

    private function say(string $line): void
    {
        if ($this->progress) {
            ($this->progress)($line);
        }
    }
}
