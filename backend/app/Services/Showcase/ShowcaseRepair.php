<?php

namespace App\Services\Showcase;

use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Requests\Logistics\AddRiderRequest;
use App\Models\Address;
use App\Models\Category;
use App\Models\LogisticsCompany;
use App\Models\Product;
use App\Models\Rider;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Demo\PlaceholderImage;
use App\Support\Gcash;
use App\Support\PhMobile;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * Brings the showcase accounts up to what the real sign-up, application and listing forms require, so every one of
 * them passes the same validation a person would (php artisan showcase:check --fix):
 *
 *  - mobile numbers stored the way the forms store them (+639XXXXXXXXX), unique across Loved-IT;
 *  - passwords that meet the password rule (A5), for accounts still on the old easy pattern;
 *  - accepted terms, an ID back photo for IDs that have one, and ID photos on the disk the admin reads them from;
 *  - shops with a seller type, a unique TIN, the documents their type needs, a region and postal code, a shop
 *    category from the list, and a GCash account so buyers can pay them by GCash;
 *  - couriers with an SEC number, TIN, contact person, service region, PSGC codes and documents;
 *  - riders with a driver's licence number and expiry, a plate in the stored format, and an activated account;
 *  - addresses with their region, and published products with a publish date.
 *
 * It only touches accounts on the showcase email domain that a seeder created (they have a username), fills or
 * corrects fields, and never deletes anything. Running it twice changes nothing the second time.
 */
class ShowcaseRepair
{
    /** The passwords the first showcase run used; accounts still on one get the configured password of their kind. */
    public const LEGACY_PASSWORDS = ['buyer' => 'buyer123', 'seller' => 'seller123', 'courier' => 'courier123', 'hub' => 'hub123', 'rider' => 'rider123'];

    /** Catalog names shorter than a listing allows (5 characters), as products.json now names them. */
    public const PRODUCT_NAMES = ['Rice' => 'Premium Rice', 'Fork' => 'Dinner Fork', 'Pan' => 'Non-Stick Frying Pan', 'Tray' => 'Serving Tray'];

    /** @var array<string, int> */
    private array $fixed = [];

    /** @var array<string, array<int, string>> disk => files this run wrote */
    private array $written = ['local' => [], 'ids' => []];

    private array $places;

    /** @var array<string, string> town name => PSGC code, and the same for "town|barangay" */
    private array $codes = [];

    /** @var array<string, string> town PSGC code => postal code */
    private array $postal = [];

    /** @return array{fixed: array<string, int>, written: array<string, array<int, string>>} */
    public function run(): array
    {
        $this->places = json_decode((string) file_get_contents(database_path('data/showcase/places.json')), true);
        foreach ($this->places['clusters'] as $cluster) {
            foreach ($cluster['towns'] as $town) {
                $this->codes[$town['name']] = $town['code'];
                $this->postal[$town['code']] = $town['postal_code'];
                foreach ($town['barangays'] as $b) {
                    $this->codes[$town['name'] . '|' . $b['name']] = $b['code'];
                }
            }
        }

        $users = self::accounts()->get();
        $ids = $users->pluck('id');

        DB::transaction(function () use ($users, $ids) {
            foreach ($users as $user) {
                $this->user($user);
            }
            $this->addresses($ids);
            foreach (SellerProfile::whereIn('user_id', $ids)->with('user')->get() as $profile) {
                $this->seller($profile);
            }
            foreach (LogisticsCompany::whereIn('owner_user_id', $ids)->with('owner')->get() as $company) {
                $this->courier($company);
            }
            foreach (SortingCenter::whereIn('user_id', $ids)->with('user')->get() as $hub) {
                $this->gcash($hub, 'gcash_number', 'gcash_name', $hub->user, 'hub GCash');
            }
            foreach (Rider::whereIn('user_id', $ids)->with(['user', 'sortingCenter'])->get() as $rider) {
                $this->rider($rider);
            }
            $published = Product::whereIn('seller_id', $ids)->where('status', 'active')->whereNull('published_at')
                ->update(['published_at' => DB::raw('created_at')]);
            $this->count('product publish date', $published);
            foreach (self::PRODUCT_NAMES as $old => $new) {
                $this->count('product name (5 to 120 characters)', Product::whereIn('seller_id', $ids)->where('name', $old)->update(['name' => $new]));
            }
        });

        return ['fixed' => array_filter($this->fixed), 'written' => $this->written];
    }

    /** Every showcase account: on the showcase email domain and created by a seeder (only seeders set a username). */
    public static function accounts()
    {
        return User::where('email', 'like', '%@' . config('showcase.email_domain'))->whereNotNull('username');
    }

    /** buyer, seller, courier, hub, rider or admin, from the username (buyer12 → buyer). */
    public static function kind(User $user): string
    {
        return preg_replace('/\d+$/', '', (string) $user->username);
    }

    // ── Accounts ─────────────────────────────────────────────────────────────

    private function user(User $user): void
    {
        $kind = self::kind($user);
        $changes = [];

        $phone = $this->uniquePhone($user);
        if ($phone !== $user->phone) {
            $changes['phone'] = $phone;
            $this->count('account mobile number');
        }
        if ($kind === 'admin') {
            $user->forceFill($changes)->save();

            return;
        }
        if (! $user->terms_accepted_at) {
            $changes['terms_accepted_at'] = $user->created_at;
            $this->count('accepted terms');
        }

        // The admin's buyer review reads ID photos from the private "local" disk.
        if ($user->government_id_image_path && ! Storage::disk('local')->exists($user->government_id_image_path)) {
            $this->placeDocument('local', $user->government_id_image_path, Storage::disk('ids')->get($user->government_id_image_path));
            $this->count('ID photo on the review disk');
        }
        if (BuyerRegisterRequest::requiresBack($user->government_id_type) && ! $user->government_id_image_back_path) {
            $changes['government_id_image_back_path'] = $this->document('local', "{$user->username}-id-back");
            $this->count('ID back photo');
        }

        $legacy = self::LEGACY_PASSWORDS[$kind] ?? null;
        $wanted = (string) config("showcase.passwords.{$kind}");
        if ($legacy && $wanted !== '' && $wanted !== $legacy && Hash::check($legacy, $user->password)) {
            $changes['password'] = $this->hash($kind, $wanted);
            $this->count('password');
        }

        if ($changes) {
            $user->forceFill($changes)->save();
        }
    }

    /** The account's number as the forms store it (+639XXXXXXXXX); a new one when another account already has it. */
    private function uniquePhone(User $user): string
    {
        $phone = PhMobile::normalize((string) $user->phone);
        $taken = fn (?string $p) => ! $p || User::where('id', '!=', $user->id)->whereIn('phone', [$p, PhMobile::local($p)])->exists();
        for ($try = 0; $taken($phone); $try++) {
            $phone = '+639' . substr($this->digits("phone-{$user->id}-{$try}", 9), 0, 9);
        }

        return $phone;
    }

    private function addresses(Collection $ids): void
    {
        foreach (Address::whereIn('user_id', $ids)->with('user')->get() as $address) {
            $changes = [];
            $phone = PhMobile::normalize((string) $address->phone) ?? $address->user?->phone;
            if ($phone && $phone !== $address->phone) {
                $changes['phone'] = $phone;
            }
            if (! $address->region || ! $address->region_code) {
                $changes += ['region' => $this->places['region'], 'region_code' => $this->places['region_code']];
            }
            if ($changes) {
                $address->forceFill($changes)->save();
                $this->count('address');
            }
        }
    }

    // ── Shops ────────────────────────────────────────────────────────────────

    private function seller(SellerProfile $profile): void
    {
        $user = $profile->user;
        $no = (int) preg_replace('/\D/', '', (string) $user->username);
        $changes = [];

        // A mix of seller types, as on a real marketplace; each type brings its own documents (A30).
        $type = $profile->seller_type ?: ($no % 5 === 0 ? 'corporation' : ($no % 2 === 0 ? 'sole_proprietorship' : 'individual'));
        if ($type !== $profile->seller_type) {
            $changes['seller_type'] = $type;
        }
        if (in_array($type, ['sole_proprietorship', 'corporation'], true)) {
            if (! $profile->dti_sec_registration_path) {
                $changes['dti_sec_registration_path'] = $this->document('ids', "{$user->username}-" . ($type === 'corporation' ? 'sec' : 'dti'));
            }
            if (! $profile->bir_2303_path) {
                $changes['bir_2303_path'] = $this->document('ids', "{$user->username}-bir-2303");
            }
        }
        if (! $profile->tin) {
            $changes['tin'] = $this->uniqueTin("seller-{$user->id}");
        }

        $phone = PhMobile::normalize((string) $profile->shop_contact_number) ?? $user->phone;
        if ($phone !== $profile->shop_contact_number) {
            $changes['shop_contact_number'] = $phone;
        }
        if (! $profile->address_region || ! $profile->address_region_code) {
            $changes += ['address_region' => $this->places['region'], 'address_region_code' => $this->places['region_code']];
        }
        if (! $profile->address_postal_code && isset($this->postal[(string) $profile->address_city_code])) {
            $changes['address_postal_code'] = $this->postal[(string) $profile->address_city_code];
        }

        // The shop category is one of the main categories, the one most of its products are in.
        if (! Category::whereNull('parent_id')->where('name', $profile->shop_category)->exists()) {
            $parentId = Product::where('seller_id', $user->id)->join('categories', 'categories.id', '=', 'products.category_id')
                ->selectRaw('COALESCE(categories.parent_id, categories.id) AS parent, COUNT(*) AS n')
                ->groupBy('parent')->orderByDesc('n')->value('parent');
            $name = Category::whereKey($parentId)->value('name') ?? Category::whereNull('parent_id')->orderBy('sort_order')->value('name');
            if ($name) {
                $changes['shop_category'] = $name;
            }
        }

        // Buyers can pay the shop by GCash (the checkout needs the shop's own GCash account).
        $gcash = Gcash::normalize($profile->gcash_number) ?? Gcash::normalize($profile->payout_gcash_number) ?? Gcash::normalize($user->phone);
        if ($gcash && ($gcash !== $profile->gcash_number || ! $profile->gcash_account_name)) {
            $changes['gcash_number'] = $gcash;
            $changes['gcash_account_name'] = $profile->gcash_account_name ?: "{$user->first_name} {$user->last_name}";
        }
        if ($profile->payout_gcash_number && Gcash::normalize($profile->payout_gcash_number) !== $profile->payout_gcash_number) {
            $changes['payout_gcash_number'] = Gcash::normalize($profile->payout_gcash_number);
        }

        if ($changes) {
            $profile->forceFill($changes)->save();
            $this->count('shop');
        }
    }

    // ── Couriers, hubs and riders ────────────────────────────────────────────

    private function courier(LogisticsCompany $company): void
    {
        $owner = $company->owner;
        $changes = [];
        if (! $company->sec_registration_no) {
            $changes['sec_registration_no'] = $this->unique('CS' . $this->digits("sec-{$company->id}", 9), fn ($v) => LogisticsCompany::where('sec_registration_no', $v)->exists(), fn ($n) => 'CS' . $this->digits("sec-{$company->id}-{$n}", 9));
        }
        if (! $company->tin) {
            $changes['tin'] = $this->uniqueTin("courier-{$company->id}");
        }
        if ($owner && ! $company->contact_first_name) {
            $changes += ['contact_first_name' => $owner->first_name, 'contact_last_name' => $owner->last_name, 'contact_position' => 'Operations Manager'];
        }
        $phone = PhMobile::normalize((string) $company->contact_phone) ?? $owner?->phone;
        if ($phone && $phone !== $company->contact_phone) {
            $changes['contact_phone'] = $phone;
        }
        if (! $company->address_region_code) {
            $changes += ['address_region' => $this->places['region'], 'address_region_code' => $this->places['region_code']];
        }
        $cityCode = $this->codes[(string) $company->address_city] ?? null;
        if ($cityCode && ! $company->address_city_code) {
            $changes += [
                'address_province_code' => $this->places['province_code'],
                'address_city_code'     => $cityCode,
                'address_barangay_code' => $this->codes[$company->address_city . '|' . $company->address_barangay] ?? null,
            ];
        }
        if ($cityCode && ! $company->address_postal_code) {
            $changes['address_postal_code'] = $this->postal[$cityCode] ?? null;
        }
        if (empty($company->service_regions)) {
            $changes['service_regions'] = [$this->places['region_code']];
        }
        foreach (['sec_certificate_path' => 'sec', 'bir_2303_path' => 'bir-2303', 'representative_id_path' => 'representative-id', 'business_permit_path' => 'permit'] as $column => $name) {
            if (! $company->{$column}) {
                $changes[$column] = $this->document('ids', "courier{$company->id}-{$name}");
            }
        }
        if ($changes) {
            $company->forceFill($changes)->save();
            $this->count('courier company');
        }
        $this->gcash($company, 'gcash_number', 'gcash_name', $owner, 'courier GCash');
    }

    private function rider(Rider $rider): void
    {
        $changes = [];
        $plate = strtoupper(preg_replace('/[\s-]+/', '', (string) $rider->plate_number));
        for ($try = 0; $plate === '' || ! preg_match('/^[A-Z0-9]{2,10}$/', $plate) || AddRiderRequest::plateTaken($plate, $rider->id); $try++) {
            $plate = $this->digits("plate-{$rider->id}-{$try}", 3) . chr(65 + $rider->id % 26) . chr(65 + ($rider->id + $try) % 26) . chr(65 + ($rider->id * 7 + $try) % 26);
        }
        if ($plate !== $rider->plate_number) {
            $changes['plate_number'] = $plate;
        }
        if (! $rider->license_number || ! preg_match(AddRiderRequest::LICENSE_REGEX, $rider->license_number)) {
            // LTO format: office letter and code, year issued, serial (D04-21-012345).
            $changes['license_number'] = $this->unique(
                sprintf('D%02d-%02d-%s', 1 + $rider->id % 30, 15 + $rider->id % 10, $this->digits("license-{$rider->id}", 6)),
                fn ($v) => Rider::where('license_number', $v)->where('id', '!=', $rider->id)->exists(),
                fn ($n) => sprintf('D%02d-%02d-%s', 1 + $rider->id % 30, 15 + $rider->id % 10, $this->digits("license-{$rider->id}-{$n}", 6))
            );
        }
        if (! $rider->license_expiry || $rider->license_expiry->lt(CarbonImmutable::today())) {
            $changes['license_expiry'] = CarbonImmutable::today()->addYears(1 + $rider->id % 5)->addDays($rider->id % 200)->toDateString();
        }
        if ($rider->status === Rider::STATUS_ACTIVE && ! $rider->activated_at) {
            $changes['activated_at'] = $rider->reviewed_at ?? $rider->created_at;
        }
        if (! $rider->logistics_company_id && $rider->sortingCenter?->logistics_company_id) {
            $changes['logistics_company_id'] = $rider->sortingCenter->logistics_company_id;
        }
        if ($changes) {
            $rider->forceFill($changes)->save();
            $this->count('rider');
        }
        $this->gcash($rider, 'gcash_number', 'gcash_name', $rider->user, 'rider GCash');
    }

    /** A payout GCash account in the owner's name (couriers, hubs and riders are paid out by GCash). */
    private function gcash($model, string $numberColumn, string $nameColumn, ?User $owner, string $label): void
    {
        if (! $owner || ($model->{$numberColumn} && $model->{$nameColumn})) {
            return;
        }
        $number = Gcash::normalize($model->{$numberColumn}) ?? Gcash::normalize($owner->phone);
        if ($number) {
            $model->forceFill([$numberColumn => $number, $nameColumn => "{$owner->first_name} {$owner->last_name}"])->save();
            $this->count($label);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** A Philippine TIN (000-000-000-000, head office branch 000) no seller or courier uses yet. */
    private function uniqueTin(string $seed): string
    {
        $make = fn (int $n) => implode('-', str_split($this->digits("tin-{$seed}-{$n}", 9), 3)) . '-000';

        return $this->unique($make(0), fn ($tin) => SellerProfile::where('tin', $tin)->exists() || LogisticsCompany::where('tin', $tin)->exists(), $make);
    }

    private function unique(string $value, callable $taken, callable $next): string
    {
        for ($n = 1; $taken($value); $n++) {
            $value = $next($n);
        }

        return $value;
    }

    /** $length digits that always come out the same for the same seed (so a rerun proposes the same values). */
    private function digits(string $seed, int $length): string
    {
        $out = '';
        for ($i = 0; strlen($out) < $length; $i++) {
            $out .= preg_replace('/\D/', '', (string) hexdec(substr(hash('sha256', "{$seed}:{$i}"), 0, 12)));
        }
        $out = substr($out, 0, $length);

        return $out[0] === '0' ? '1' . substr($out, 1) : $out;
    }

    /** @var array<string, string> */
    private array $hashes = [];

    private function hash(string $kind, string $password): string
    {
        return $this->hashes[$kind] ??= Hash::make($password);
    }

    /** A placeholder document image, the same kind the showcase seeder writes. */
    private function document(string $disk, string $name): string
    {
        $path = trim((string) config('showcase.storage_prefix'), '/') . "/documents/{$name}.png";
        if (! Storage::disk($disk)->exists($path)) {
            $shade = crc32($name);
            $this->placeDocument($disk, $path, PlaceholderImage::png(320, 220, [90 + $shade % 100, 100 + intdiv($shade, 100) % 100, 120 + intdiv($shade, 10000) % 100]));
        }

        return $path;
    }

    private function placeDocument(string $disk, string $path, ?string $contents): void
    {
        if ($contents === null) {
            $shade = crc32($path);
            $contents = PlaceholderImage::png(320, 220, [90 + $shade % 100, 100 + intdiv($shade, 100) % 100, 120 + intdiv($shade, 10000) % 100]);
        }
        Storage::disk($disk)->put($path, $contents);
        $this->written[$disk][] = $path;
    }

    private function count(string $what, int $by = 1): void
    {
        $this->fixed[$what] = ($this->fixed[$what] ?? 0) + $by;
    }
}
