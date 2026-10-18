<?php

namespace App\Services\Showcase;

use App\Http\Requests\Auth\BuyerRegisterRequest;
use App\Http\Requests\Auth\SellerRegisterRequest;
use App\Http\Requests\Logistics\AddRiderRequest;
use App\Models\Address;
use App\Models\Category;
use App\Models\LogisticsCompany;
use App\Models\Product;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SellerProfile;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Catalog\ProductEditor;
use App\Support\Gcash;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

/**
 * Checks every showcase account against the rules a real person meets when they sign up, apply, list a product or
 * add an address, and against what the site needs for it to work end to end: a sign-in with the documented password,
 * documents where the admin opens them, a GCash account for GCash checkout, and places a hub and a rider cover.
 * php artisan showcase:check prints what it finds; --fix repairs it with ShowcaseRepair.
 */
class ShowcaseAudit
{
    private const ID_TYPES = 'in:national_id,drivers_license,passport,umid,sss_id,philhealth_id,voters_id,postal_id,school_id';
    private const PSGC = ['required', 'string', 'regex:/^\d{9,10}$/'];

    /** @var array<int, array{account: string, check: string, problem: string}> */
    private array $problems = [];

    /** @var array<string, true> barangay codes an approved hub covers */
    private array $hubCovers = [];

    /** @var array<string, true> barangay codes an active rider covers */
    private array $riderCovers = [];

    /** @return array<int, array{account: string, check: string, problem: string}> */
    public function run(): array
    {
        $this->problems = [];
        foreach (SortingCenter::where('status', SortingCenter::STATUS_APPROVED)->pluck('coverage_barangays') as $codes) {
            foreach ((array) $codes as $code) {
                $this->hubCovers[(string) $code] = true;
            }
        }
        foreach (RiderAreaAssignment::where('is_active', true)->whereHas('rider', fn ($q) => $q->where('status', Rider::STATUS_ACTIVE))->pluck('coverage_barangays') as $codes) {
            foreach ((array) $codes as $code) {
                $this->riderCovers[(string) $code] = true;
            }
        }

        foreach (array_keys(ShowcaseRepair::LEGACY_PASSWORDS) as $kind) {
            $password = (string) config("showcase.passwords.{$kind}");
            if (Validator::make(['password' => $password], ['password' => ['required', BuyerRegisterRequest::passwordRule()]])->fails()) {
                $this->add("config ({$kind})", 'password rule', 'The configured password does not meet the password rule (8+ characters, upper and lower case, a number and a symbol).');
            }
        }

        $users = ShowcaseRepair::accounts()->get();
        $ids = $users->pluck('id');
        $signIn = [];
        foreach ($users as $user) {
            $this->user($user, $signIn);
        }
        foreach (Address::whereIn('user_id', $ids)->with('user:id,username')->get() as $address) {
            $this->address($address);
        }
        foreach (SellerProfile::whereIn('user_id', $ids)->with('user:id,username,phone')->get() as $profile) {
            $this->seller($profile);
        }
        $editor = app(ProductEditor::class);
        foreach (Product::whereIn('seller_id', $ids)->where('status', 'active')->with(['images', 'variants', 'category', 'seller:id,username'])->get() as $product) {
            $this->product($product, $editor);
        }
        foreach (LogisticsCompany::whereIn('owner_user_id', $ids)->with('owner:id,username')->get() as $company) {
            $this->courier($company);
        }
        foreach (SortingCenter::whereIn('user_id', $ids)->with('user:id,username')->get() as $hub) {
            $this->hub($hub);
        }
        foreach (Rider::whereIn('user_id', $ids)->with('user:id,username')->get() as $rider) {
            $this->rider($rider);
        }

        return $this->problems;
    }

    // ── Accounts ─────────────────────────────────────────────────────────────

    /** @param array<string, bool> $signIn password hash => whether the documented password opens it (hashes repeat per kind) */
    private function user(User $user, array &$signIn): void
    {
        $who = (string) $user->username;
        $kind = ShowcaseRepair::kind($user);
        if (! PhMobile::normalize((string) $user->phone) || $user->phone !== PhMobile::normalize((string) $user->phone)) {
            $this->add($who, 'mobile number', PhMobile::MESSAGE . " Stored: {$user->phone}.");
        } elseif (User::where('id', '!=', $user->id)->whereIn('phone', [$user->phone, PhMobile::local($user->phone)])->exists()) {
            $this->add($who, 'mobile number', 'Another account uses the same mobile number.');
        }
        if ($user->status !== 'active' || ! $user->email_verified_at) {
            $this->add($who, 'account', 'The account is not active and verified.');
        }
        if ($kind === 'admin') {
            return;
        }

        $this->validate($who, 'profile', [
            'first_name' => $user->first_name, 'middle_name' => $user->middle_name, 'last_name' => $user->last_name, 'email' => $user->email,
            'date_of_birth' => $user->date_of_birth?->format('Y-m-d'), 'sex' => $user->sex, 'government_id_type' => $user->government_id_type,
        ], [
            'first_name' => Validation::personName(), 'middle_name' => Validation::personName(required: false), 'last_name' => Validation::personName(),
            'email' => ['required', 'string', 'email:rfc', 'max:100'], 'date_of_birth' => Validation::dateOfBirth(),
            'sex' => ['required', 'in:male,female,prefer_not_to_say'], 'government_id_type' => ['required', self::ID_TYPES],
        ]);
        if (! $user->terms_accepted_at) {
            $this->add($who, 'terms', 'The account has no record of accepting the Terms of Use and Privacy Policy.');
        }
        if (! $user->government_id_image_path || ! Storage::disk('local')->exists($user->government_id_image_path)) {
            $this->add($who, 'ID photo', 'The ID photo is not where the admin\'s buyer review opens it.');
        }
        if (BuyerRegisterRequest::requiresBack($user->government_id_type)
            && (! $user->government_id_image_back_path || ! Storage::disk('local')->exists($user->government_id_image_back_path))) {
            $this->add($who, 'ID photo', 'This ID type needs a photo of the back.');
        }

        $password = (string) config("showcase.passwords.{$kind}");
        if ($password !== '' && ! ($signIn[$user->password] ??= Hash::check($password, $user->password))) {
            $this->add($who, 'sign in', 'The documented password for this kind of account does not open it.');
        }
    }

    private function address(Address $address): void
    {
        $who = (string) $address->user?->username;
        $this->validate($who, 'address', $address->only(['full_name', 'phone', 'region', 'region_code', 'address', 'province', 'district', 'ward', 'province_code', 'city_code', 'barangay_code', 'label']), [
            'full_name' => ['required', 'string', 'min:2', 'max:100'], 'phone' => ['required', ...PhMobile::rules()],
            'region' => ['required', 'string', 'max:100'], 'region_code' => self::PSGC, 'address' => ['required', 'string', 'max:255'],
            'province' => ['required', 'string', 'max:100'], 'district' => ['required', 'string', 'max:100'], 'ward' => ['required', 'string', 'max:100'],
            'province_code' => self::PSGC, 'city_code' => self::PSGC, 'barangay_code' => self::PSGC, 'label' => ['required', 'in:home,office'],
        ]);
        $this->place($who, 'address', $address->province_code, $address->city_code, $address->barangay_code);
    }

    /** The codes nest (province > town > barangay), and a hub and a rider serve the barangay. */
    private function place(string $who, string $check, ?string $province, ?string $city, ?string $barangay, bool $rider = true): void
    {
        if ($province && $city && $barangay && (substr($barangay, 0, 6) !== substr($city, 0, 6) || substr($city, 0, 4) !== substr($province, 0, 4))) {
            $this->add($who, $check, 'The barangay, town and province codes do not belong together.');
        }
        if ($barangay && ! isset($this->hubCovers[$barangay])) {
            $this->add($who, $check, "No approved hub covers barangay {$barangay}.");
        } elseif ($barangay && $rider && ! isset($this->riderCovers[$barangay])) {
            $this->add($who, $check, "No active rider covers barangay {$barangay}.");
        }
    }

    // ── Shops and products ───────────────────────────────────────────────────

    private function seller(SellerProfile $p): void
    {
        $who = (string) $p->user?->username;
        $business = in_array($p->seller_type, ['sole_proprietorship', 'corporation'], true);
        $this->validate($who, 'shop', $p->only([
            'shop_name', 'shop_category', 'shop_description', 'seller_type', 'tin', 'shop_contact_number', 'address_region', 'address_region_code',
            'address_province', 'address_city', 'address_barangay', 'address_street', 'address_postal_code', 'address_province_code', 'address_city_code', 'address_barangay_code',
        ]), [
            'shop_name' => ['required', 'string', 'min:3', 'max:30'],
            'shop_category' => ['required', 'string', 'max:100', function ($attr, $value, $fail) {
                if (! Category::whereNull('parent_id')->where(fn ($q) => $q->where('name', $value)->orWhere('slug', $value))->exists()) {
                    $fail('The shop category is not one of the main categories.');
                }
            }],
            'shop_description' => ['nullable', 'string', 'max:500'], 'seller_type' => ['required', 'in:' . implode(',', SellerRegisterRequest::SELLER_TYPES)],
            'tin' => ['required', 'string', 'regex:' . Validation::TIN_REGEX], 'shop_contact_number' => ['nullable', ...PhMobile::rules()],
            'address_region' => ['required', 'string', 'max:100'], 'address_region_code' => self::PSGC, 'address_province' => ['required', 'string', 'max:100'],
            'address_city' => ['required', 'string', 'max:100'], 'address_barangay' => ['required', 'string', 'max:100'], 'address_street' => ['required', 'string', 'max:255'],
            'address_postal_code' => ['required', 'string', 'regex:' . Validation::POSTAL_REGEX],
            'address_province_code' => self::PSGC, 'address_city_code' => self::PSGC, 'address_barangay_code' => self::PSGC,
        ]);
        if ($p->tin && SellerRegisterRequest::tinTaken($p->tin, sellerUserId: $p->user_id)) {
            $this->add($who, 'shop', 'Another seller or courier has the same TIN.');
        }
        if (SellerRegisterRequest::shopNameTaken((string) $p->shop_name, $p->user_id)) {
            $this->add($who, 'shop', 'Another shop has the same name.');
        }
        $docs = ['government_id_image_path' => 'the government ID'];
        if ($business) {
            $docs += ['dti_sec_registration_path' => $p->seller_type === 'corporation' ? 'the SEC certificate' : 'the DTI certificate', 'bir_2303_path' => 'the BIR 2303'];
        }
        foreach ($docs as $column => $label) {
            if (! $p->{$column} || ! Storage::disk('ids')->exists($p->{$column})) {
                $this->add($who, 'shop documents', "Missing {$label}.");
            }
        }
        if (! Gcash::normalize($p->gcash_number) || ! $p->gcash_account_name) {
            $this->add($who, 'GCash checkout', 'The shop has no GCash account, so buyers cannot pay it by GCash.');
        }
        if ($p->application_status !== 'approved') {
            $this->add($who, 'shop', 'The shop is not approved.');
        }
        $this->place($who, 'pickup address', $p->address_province_code, $p->address_city_code, $p->address_barangay_code);
    }

    private function product(Product $product, ProductEditor $editor): void
    {
        $who = (string) $product->seller?->username;
        $name = "\"{$product->name}\"";
        foreach ($editor->publishProblems($product) as $problem) {
            $this->add($who, 'product', "{$name}: {$problem}");
        }
        $category = $product->category;
        if (! $category || ! $category->is_active || $category->children()->exists()) {
            $this->add($who, 'product', "{$name}: not in an active sub-category.");
        }
        foreach ($product->images as $image) {
            if (! Storage::disk('public')->exists($image->path)) {
                $this->add($who, 'product', "{$name}: a photo is missing from storage.");
            }
        }
        if ($category?->requires_fda) {
            foreach (['fda_lto_path' => 'FDA LTO', 'fda_cpr_path' => 'FDA CPR'] as $column => $label) {
                if (! $product->{$column} || ! Storage::disk('local')->exists($product->{$column})) {
                    $this->add($who, 'product', "{$name}: missing its {$label}.");
                }
            }
        }
        $this->validate($who, 'product', $product->only(['net_weight_volume', 'expiry_best_before', 'ingredients', 'storage_instructions', 'allergen_info', 'dimension_l_cm', 'dimension_w_cm', 'dimension_h_cm']) + [
            'skus' => $product->variants->pluck('sku')->filter()->values()->all(),
        ], [
            'net_weight_volume' => ['nullable', 'string', 'max:10'], 'expiry_best_before' => ['nullable', 'string', 'max:50'],
            'ingredients' => ['nullable', 'string', 'max:500'], 'storage_instructions' => ['nullable', 'string', 'max:500'], 'allergen_info' => ['nullable', 'string', 'max:500'],
            'dimension_l_cm' => ['nullable', 'numeric', 'gt:0', 'max:1000'], 'dimension_w_cm' => ['nullable', 'numeric', 'gt:0', 'max:1000'], 'dimension_h_cm' => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'skus.*' => ['string', 'max:100', 'regex:/^[A-Za-z0-9._\-]+$/'],
        ], $name . ': ');
        if (! $product->published_at) {
            $this->add($who, 'product', "{$name}: listed with no publish date.");
        }
    }

    // ── Couriers, hubs and riders ────────────────────────────────────────────

    private function courier(LogisticsCompany $c): void
    {
        $who = (string) $c->owner?->username;
        $this->validate($who, 'courier company', $c->only([
            'name', 'code', 'sec_registration_no', 'tin', 'description', 'contact_first_name', 'contact_last_name', 'contact_position', 'contact_email', 'contact_phone',
            'address_region', 'address_region_code', 'address_province', 'address_province_code', 'address_city', 'address_city_code', 'address_barangay',
            'address_barangay_code', 'address_street', 'address_postal_code', 'service_regions',
        ]), [
            'name' => ['required', 'string', 'min:2', 'max:120'], 'code' => ['nullable', 'string', 'regex:/^[A-Z0-9]{2,6}$/'],
            'sec_registration_no' => ['required', 'string', 'regex:/^[A-Z]{2}\d{9}$/'], 'tin' => ['required', 'string', 'regex:' . Validation::TIN_REGEX],
            'description' => ['nullable', 'string', 'max:500'], 'contact_first_name' => Validation::personName(), 'contact_last_name' => Validation::personName(),
            'contact_position' => ['required', 'string', 'min:2', 'max:80'], 'contact_email' => ['required', 'email:rfc', 'max:150'], 'contact_phone' => ['required', ...PhMobile::rules()],
            'address_region' => ['required', 'string', 'max:100'], 'address_region_code' => self::PSGC, 'address_province' => ['required', 'string', 'max:100'],
            'address_province_code' => self::PSGC, 'address_city' => ['required', 'string', 'max:100'], 'address_city_code' => self::PSGC,
            'address_barangay' => ['required', 'string', 'max:100'], 'address_barangay_code' => self::PSGC, 'address_street' => ['required', 'string', 'max:255'],
            'address_postal_code' => ['required', 'string', 'regex:' . Validation::POSTAL_REGEX],
            'service_regions' => ['required', 'array', 'min:1', 'max:17'], 'service_regions.*' => ['required', 'string', 'regex:/^\d{9,10}$/', 'distinct'],
        ]);
        if ($c->tin && SellerRegisterRequest::tinTaken($c->tin, companyId: $c->id)) {
            $this->add($who, 'courier company', 'Another seller or courier has the same TIN.');
        }
        foreach (['sec_certificate_path' => 'SEC certificate', 'bir_2303_path' => 'BIR 2303', 'business_permit_path' => 'business permit', 'representative_id_path' => "representative's ID"] as $column => $label) {
            if (! $c->{$column} || ! Storage::disk('ids')->exists($c->{$column})) {
                $this->add($who, 'courier documents', "Missing the {$label}.");
            }
        }
        $this->payout($who, $c->gcash_number, $c->gcash_name);
    }

    private function hub(SortingCenter $hub): void
    {
        $who = (string) $hub->user?->username;
        $this->validate($who, 'hub', $hub->only(['hub_name', 'address_province', 'address_city', 'address_barangay', 'address_street', 'coverage_barangays']), [
            'hub_name' => ['required', 'string', 'max:150'], 'address_province' => ['required', 'string', 'max:100'], 'address_city' => ['required', 'string', 'max:100'],
            'address_barangay' => ['required', 'string', 'max:100'], 'address_street' => ['required', 'string', 'max:255'],
            'coverage_barangays' => ['required', 'array', 'min:1'], 'coverage_barangays.*' => ['required', 'string', 'distinct', 'regex:/^\d{9,10}$/'],
        ]);
        if (! $hub->dti_permit_path || ! Storage::disk('ids')->exists($hub->dti_permit_path)) {
            $this->add($who, 'hub documents', 'Missing the DTI or business permit.');
        }
        $this->payout($who, $hub->gcash_number, $hub->gcash_name);
    }

    private function rider(Rider $rider): void
    {
        $who = (string) $rider->user?->username;
        $this->validate($who, 'rider', [
            'license_number' => $rider->license_number, 'license_expiry' => $rider->license_expiry?->format('Y-m-d'),
            'vehicle_type' => $rider->vehicle_type, 'plate_number' => $rider->plate_number,
        ], AddRiderRequest::licenseRules($rider->id) + [
            'vehicle_type' => ['required', 'string', 'in:' . implode(',', Rider::VEHICLE_TYPES)],
            'plate_number' => ['required', 'string', 'regex:/^[A-Z0-9]{2,10}$/'],
        ]);
        if ($rider->plate_number && AddRiderRequest::plateTaken(strtoupper(preg_replace('/[\s-]+/', '', $rider->plate_number)), $rider->id)) {
            $this->add($who, 'rider', 'Another rider has the same plate number.');
        }
        foreach (['drivers_license_path' => "driver's licence", 'or_cr_path' => 'OR/CR'] as $column => $label) {
            if (! $rider->{$column} || ! Storage::disk('ids')->exists($rider->{$column})) {
                $this->add($who, 'rider documents', "Missing the {$label}.");
            }
        }
        if ($rider->status === Rider::STATUS_ACTIVE && ! $rider->activated_at) {
            $this->add($who, 'rider', 'Active, but the account was never activated.');
        }
        if (! RiderAreaAssignment::where('rider_id', $rider->id)->where('is_active', true)->exists()) {
            $this->add($who, 'rider', 'No delivery area assigned.');
        }
        $this->payout($who, $rider->gcash_number, $rider->gcash_name);
    }

    private function payout(string $who, ?string $number, ?string $name): void
    {
        if (! Gcash::normalize($number) || ! $name) {
            $this->add($who, 'payout GCash', 'No GCash account to pay out to.');
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function validate(string $who, string $check, array $data, array $rules, string $prefix = ''): void
    {
        foreach (Validator::make($data, $rules)->errors()->all() as $message) {
            $this->add($who, $check, $prefix . $message);
        }
    }

    private function add(string $account, string $check, string $problem): void
    {
        $this->problems[] = ['account' => $account, 'check' => $check, 'problem' => $problem];
    }
}
