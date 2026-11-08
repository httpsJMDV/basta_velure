<?php

namespace App\Services\Courier;

use App\Models\HubCoverage;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\SortingCenter;
use App\Models\User;
use App\Services\Demo\PlaceholderImage;
use App\Services\Showcase\ShowcaseSeeder;
use App\Support\Gcash;
use App\Support\PhPlaces;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Builds a courier's nationwide network (php artisan network:build, docs/api/courier-network.md):
 *
 * 1. A hub in every city and municipality whose barangays none of the courier's approved hubs cover yet, covering
 *    exactly the barangays still missing. Hubs that already exist keep their area.
 * 2. Every hub learns its place (PSGC city, province, region, island group).
 * 3. One hub per region becomes the regional gateway (the trucks between regions meet there) and one per island
 *    group the island gateway (Manila, Cebu City, Davao City), where parcels go on a ship or a plane.
 * 4. Each gateway that has no rider gets one starter delivery rider for its city, so every region can deliver from day
 *    one; the hubs hire the rest through their apply link.
 *
 * Accounts are made like the showcase ones (showcase:seed): a username, an email on the showcase domain (they never
 * get email), the showcase password of their kind, and a placeholder ID and permit. Safe to run again: a second run
 * creates nothing new and only re-checks the gateways.
 */
class NetworkBuilder
{
    private ?string $hubHash = null;

    private ?string $riderHash = null;

    /** @var array<string, true> */
    private array $usedPhones = [];

    /** @var array<string, true> */
    private array $usedUsernames = [];

    /** @var array<string, true> */
    private array $usedPlates = [];

    /** @var array<string, int> how many places carry each name, to tell the San Joses apart */
    private array $nameCount = [];

    /** @var \Closure(string): void */
    private \Closure $say;

    /**
     * @param  list<int>  $companyIds  only these couriers (default: every approved courier)
     * @return array<string, array<string, int>> per courier: hubs_created, barangays_added, hubs_tagged, gateways, riders_created
     */
    public function build(array $companyIds = [], bool $dryRun = false, ?\Closure $say = null): array
    {
        $this->say = $say ?? fn (string $line) => null;
        $this->nameCount = array_count_values(array_map(fn ($c) => PhPlaces::displayName($c['name']), PhPlaces::cities()));
        if (! $dryRun) {
            $this->usedPhones = array_fill_keys(User::whereNotNull('phone')->pluck('phone')->all(), true);
            $this->usedUsernames = array_fill_keys(User::whereNotNull('username')->pluck('username')->all(), true);
            $this->usedPlates = array_fill_keys(Rider::withTrashed()->whereNotNull('plate_number')->pluck('plate_number')->all(), true);
        }

        $companies = LogisticsCompany::where('status', LogisticsCompany::STATUS_APPROVED)
            ->when($companyIds !== [], fn ($q) => $q->whereIn('id', $companyIds))
            ->orderBy('id')->get();

        $stats = [];
        foreach ($companies as $company) {
            ($this->say)("{$company->name} ({$company->code})...");
            $stats[$company->name] = $dryRun ? $this->plan($company) : DB::transaction(fn () => $this->buildCompany($company));
        }

        return $stats;
    }

    // ── One courier ───────────────────────────────────────────────────────────

    /** @return array<string, int> */
    private function plan(LogisticsCompany $company): array
    {
        $covered = $this->coveredBarangays($company);
        $hubs = 0;
        $barangays = 0;
        foreach (PhPlaces::cities() as $city) {
            $missing = array_diff(PhPlaces::barangaysOf($city), array_keys($covered));
            if ($missing !== []) {
                $hubs++;
                $barangays += count($missing);
            }
        }

        return ['hubs_created' => $hubs, 'barangays_added' => $barangays, 'hubs_tagged' => 0, 'gateways' => count(PhPlaces::REGION_GATEWAY_CITY), 'riders_created' => 0];
    }

    /** @return array<string, int> */
    private function buildCompany(LogisticsCompany $company): array
    {
        $tagged = $this->tagExistingHubs($company);
        [$created, $added] = $this->createMissingHubs($company);
        $gateways = $this->markGateways($company);
        $riders = $this->starterRiders($company);

        return ['hubs_created' => $created, 'barangays_added' => $added, 'hubs_tagged' => $tagged, 'gateways' => $gateways, 'riders_created' => $riders];
    }

    /** @return array<string, true> barangay codes the courier's approved hubs cover */
    private function coveredBarangays(LogisticsCompany $company): array
    {
        $covered = [];
        foreach ($this->hubsOf($company)->where('status', SortingCenter::STATUS_APPROVED)->pluck('coverage_barangays') as $codes) {
            foreach ((array) (is_string($codes) ? json_decode($codes, true) : $codes) as $code) {
                $covered[trim((string) $code)] = true;
            }
        }

        return $covered;
    }

    /** Hubs made before the network know their place from the barangays they cover (the city most of them are in). */
    private function tagExistingHubs(LogisticsCompany $company): int
    {
        $count = 0;
        foreach ($this->hubsOf($company)->whereNull('city_code')->get(['id', 'coverage_barangays']) as $hub) {
            $cities = array_count_values(array_map(fn ($c) => HubCoverage::cityOf((string) $c), (array) $hub->coverage_barangays));
            arsort($cities);
            $city = PhPlaces::city((string) array_key_first($cities));
            if ($city) {
                SortingCenter::whereKey($hub->id)->update($this->placeColumns($city));
                $count++;
            }
        }

        return $count;
    }

    /** @return array{0: int, 1: int} hubs created, barangays they cover */
    private function createMissingHubs(LogisticsCompany $company): array
    {
        $covered = $this->coveredBarangays($company);
        $taken = array_fill_keys($this->hubsOf($company)->pluck('hub_name')->all(), true);
        $prefix = strtolower((string) $company->code);
        $now = now();
        $plans = [];
        foreach (PhPlaces::cities() as $city) {
            $missing = array_values(array_diff(PhPlaces::barangaysOf($city), array_keys($covered)));
            if ($missing === []) {
                continue;
            }
            $place = PhPlaces::displayName($city['name']);
            $province = PhPlaces::addressProvince($city);
            $label = ($this->nameCount[$place] ?? 0) > 1 ? "{$place} ({$province})" : $place;
            $name = "{$company->name} {$label} Hub";
            if (isset($taken[$name])) {
                $name = "{$company->name} {$label} Annex Hub";
            }
            $taken[$name] = true;
            $slug = Str::slug($label);
            $plans[] = [
                'city'     => $city,
                'name'     => $name,
                'username' => $this->username("hub-{$prefix}-{$slug}", "hub-{$prefix}-{$city['code']}"),
                'codes'    => $missing,
                'person'   => $this->person(),
                'phone'    => $this->phone(),
                'province' => $province,
                'place'    => $place,
            ];
        }
        if ($plans === []) {
            return [0, 0];
        }

        ($this->say)('  ' . count($plans) . ' new hubs...');
        $permit = $this->placeholder('ids', 'network-hub-permit');
        $idPhoto = $this->placeholder('local', 'network-account-id');
        $hash = $this->hubHash ??= Hash::make((string) config('showcase.passwords.hub'));
        $reviewer = $company->owner_user_id;

        foreach (array_chunk($plans, 400) as $chunk) {
            DB::table('users')->insert(array_map(fn ($p) => $this->userRow($p['username'], $p['person'], $p['phone'], $hash, $idPhoto, $now), $chunk));
            $ids = User::whereIn('username', array_column($chunk, 'username'))->pluck('id', 'username');

            DB::table('sorting_centers')->insert(array_map(fn ($p) => [
                'logistics_company_id' => $company->id,
                'user_id'              => $ids[$p['username']],
                'hub_name'             => $p['name'],
                'address_province'     => $p['province'],
                'address_city'         => $p['place'],
                'address_barangay'     => $p['city']['center'],
                'address_street'       => mt_rand(10, 400) . ' ' . ShowcaseSeeder::STREETS[array_rand(ShowcaseSeeder::STREETS)] . ' Street',
                'dti_permit_path'      => $permit,
                'coverage_barangays'   => json_encode($p['codes']),
                'status'               => SortingCenter::STATUS_APPROVED,
                'reviewed_by'          => $reviewer,
                'reviewed_at'          => $now,
                'gcash_number'         => Crypt::encryptString((string) Gcash::normalize($p['phone'])),
                'gcash_name'           => "{$p['person']['first']} {$p['person']['last']}",
                'created_at'           => $now,
                'updated_at'           => $now,
            ] + $this->placeColumns($p['city']), $chunk));

            $hubIds = SortingCenter::whereIn('user_id', $ids->values())->pluck('id', 'user_id');
            $rows = [];
            foreach ($chunk as $p) {
                foreach ($p['codes'] as $code) {
                    $rows[] = ['sorting_center_id' => $hubIds[$ids[$p['username']]], 'barangay_code' => $code, 'city_code' => HubCoverage::cityOf($code)];
                }
            }
            foreach (array_chunk($rows, 2000) as $part) {
                DB::table('hub_coverage')->insertOrIgnore($part);
            }
        }

        return [count($plans), array_sum(array_map(fn ($p) => count($p['codes']), $plans))];
    }

    /** One regional gateway per region and one island gateway per island group, among the courier's approved hubs. */
    private function markGateways(LogisticsCompany $company): int
    {
        $this->hubsOf($company)->where(fn ($q) => $q->whereNotNull('gateway_region_code')->orWhere('is_island_gateway', true))
            ->update(['gateway_region_code' => null, 'is_island_gateway' => false]);

        $count = 0;
        foreach (PhPlaces::REGION_GATEWAY_CITY as $region => $cityCode) {
            if ($hub = $this->hubInCity($company, $cityCode)) {
                SortingCenter::whereKey($hub->id)->update(['gateway_region_code' => $region]);
                $count++;
            }
        }
        foreach (PhPlaces::ISLAND_GATEWAY_CITY as $cityCode) {
            if ($hub = $this->hubInCity($company, $cityCode)) {
                SortingCenter::whereKey($hub->id)->update(['is_island_gateway' => true]);
            }
        }

        return $count;
    }

    /** The courier's approved hub for a city: one placed there, else the one covering most of its barangays. */
    private function hubInCity(LogisticsCompany $company, string $cityCode): ?SortingCenter
    {
        $approved = fn () => $this->hubsOf($company)->where('status', SortingCenter::STATUS_APPROVED);

        return $approved()->where('city_code', $cityCode)->orderBy('id')->first()
            ?? $approved()->whereIn('id', HubCoverage::where('city_code', $cityCode)->select('sorting_center_id'))
                ->withCount(['coverage as here' => fn ($q) => $q->where('city_code', $cityCode)])
                ->orderByDesc('here')->orderBy('id')->first();
    }

    /** A delivery rider for each gateway hub that has none yet, covering the hub's whole area. */
    private function starterRiders(LogisticsCompany $company): int
    {
        $gateways = $this->hubsOf($company)->where('status', SortingCenter::STATUS_APPROVED)
            ->where(fn ($q) => $q->whereNotNull('gateway_region_code')->orWhere('is_island_gateway', true))
            ->whereDoesntHave('riderAreaAssignments', fn ($q) => $q->where('is_active', true))
            ->with('user:id')->get();
        if ($gateways->isEmpty()) {
            return 0;
        }

        $hash = $this->riderHash ??= Hash::make((string) config('showcase.passwords.rider'));
        $idPhoto = $this->placeholder('local', 'network-account-id');
        $license = $this->placeholder('ids', 'network-rider-license');
        $orcr = $this->placeholder('ids', 'network-rider-orcr');
        $prefix = strtolower((string) $company->code);
        $now = now();

        foreach ($gateways as $hub) {
            $person = $this->person('male');
            $phone = $this->phone();
            $username = $this->username('rider-' . $prefix . '-' . Str::slug((string) $hub->address_city), "rider-{$prefix}-{$hub->id}");
            $user = new User();
            $user->forceFill($this->userRow($username, $person, $phone, $hash, $idPhoto, $now))->save();

            $rider = new Rider();
            $rider->forceFill([
                'user_id'              => $user->id,
                'sorting_center_id'    => $hub->id,
                'logistics_company_id' => $company->id,
                'vehicle_type'         => Rider::VEHICLE_MOTORCYCLE,
                'duty'                 => Rider::DUTY_DELIVERY,
                'plate_number'         => $this->plate(),
                'license_number'       => $this->license($user->id),
                'license_expiry'       => $now->copy()->addYears(3)->toDateString(),
                'or_cr_path'           => $orcr,
                'drivers_license_path' => $license,
                'status'               => Rider::STATUS_ACTIVE,
                'activated_at'         => $now,
                'reviewed_by'          => $hub->user_id,
                'reviewed_at'          => $now,
                'submitted_at'         => $now,
                'gcash_number'         => Gcash::normalize($phone),
                'gcash_name'           => "{$person['first']} {$person['last']}",
            ])->save();

            RiderAreaAssignment::create([
                'rider_id'           => $rider->id,
                'sorting_center_id'  => $hub->id,
                'area_label'         => (string) $hub->address_city,
                'coverage_barangays' => array_values((array) $hub->coverage_barangays),
                'is_active'          => true,
            ]);
        }

        return $gateways->count();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** @return \Illuminate\Database\Eloquent\Builder<SortingCenter> */
    private function hubsOf(LogisticsCompany $company)
    {
        return LogisticsCompany::constrain(SortingCenter::query(), $company->id);
    }

    /** @return array{city_code: string, province_code: ?string, region_code: string, island_group: string} */
    private function placeColumns(array $city): array
    {
        return [
            'city_code'     => $city['code'],
            'province_code' => $city['province'],
            'region_code'   => $city['region'],
            'island_group'  => $city['island'],
        ];
    }

    private function userRow(string $username, array $person, string $phone, string $hash, string $idPhoto, $now): array
    {
        return [
            'first_name'               => $person['first'],
            'last_name'                => $person['last'],
            'email'                    => $username . '@' . config('showcase.email_domain'),
            'username'                 => $username,
            'phone'                    => $phone,
            'password'                 => $hash,
            'date_of_birth'            => $person['dob'],
            'sex'                      => $person['sex'],
            'role'                     => 'buyer',
            'status'                   => 'active',
            'email_verified_at'        => $now,
            'terms_accepted_at'        => $now,
            'government_id_type'       => 'national_id',
            'government_id_image_path' => $idPhoto,
            'buyer_application_status' => 'approved',
            'created_at'               => $now,
            'updated_at'               => $now,
        ];
    }

    /** A username nobody has, at most 50 characters; the fallback when the readable one is too long or taken. */
    private function username(string $wanted, string $fallback): string
    {
        $name = strlen($wanted) <= 50 ? $wanted : $fallback;
        for ($n = 2; isset($this->usedUsernames[$name]); $n++) {
            $name = substr($fallback, 0, 46) . "-{$n}";
        }
        $this->usedUsernames[$name] = true;

        return $name;
    }

    /** @return array{first: string, last: string, sex: string, dob: string} */
    private function person(?string $sex = null): array
    {
        $sex ??= mt_rand(0, 1) ? 'male' : 'female';
        $first = $sex === 'male' ? ShowcaseSeeder::MALE : ShowcaseSeeder::FEMALE;

        return [
            'first' => $first[array_rand($first)],
            'last'  => ShowcaseSeeder::LAST[array_rand(ShowcaseSeeder::LAST)],
            'sex'   => $sex,
            'dob'   => sprintf('%04d-%02d-%02d', mt_rand(1975, 2003), mt_rand(1, 12), mt_rand(1, 28)),
        ];
    }

    /** A mobile number no account uses, stored the way the forms store it: +639XXXXXXXXX. */
    private function phone(): string
    {
        do {
            $phone = '+63' . substr(ShowcaseSeeder::PREFIXES[array_rand(ShowcaseSeeder::PREFIXES)], 1) . str_pad((string) mt_rand(0, 9999999), 7, '0', STR_PAD_LEFT);
        } while (isset($this->usedPhones[$phone]));
        $this->usedPhones[$phone] = true;

        return $phone;
    }

    private function plate(): string
    {
        do {
            $plate = mt_rand(100, 999) . chr(mt_rand(65, 90)) . chr(mt_rand(65, 90)) . chr(mt_rand(65, 90));
        } while (isset($this->usedPlates[$plate]));
        $this->usedPlates[$plate] = true;

        return $plate;
    }

    /** An LTO-style licence number (D04-21-012345) no rider uses. */
    private function license(int $seed): string
    {
        do {
            $number = sprintf('N%02d-%02d-%06d', 1 + $seed % 30, 15 + $seed % 10, mt_rand(0, 999999));
        } while (Rider::withTrashed()->where('license_number', $number)->exists());

        return $number;
    }

    /** One placeholder picture shared by every account the network makes, written once. */
    private function placeholder(string $disk, string $name): string
    {
        $path = trim((string) config('showcase.storage_prefix'), '/') . "/documents/{$name}.png";
        if (! Storage::disk($disk)->exists($path)) {
            $shade = crc32($name);
            Storage::disk($disk)->put($path, PlaceholderImage::png(320, 220, [90 + $shade % 100, 100 + intdiv($shade, 100) % 100, 120 + intdiv($shade, 10000) % 100]));
        }

        return $path;
    }
}
