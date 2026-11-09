<?php

namespace Tests\Feature;

use App\Models\DeliveryLog;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SortingCenter;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

/**
 * Hub, courier network and rider reports as JSON, Excel and PDF (docs/api/logistics-rider-reports.md), and the
 * short-lived link the app opens in the phone's browser.
 */
class LogisticsReportFilesTest extends TestCase
{
    use DatabaseTransactions;

    private const TZ = 'Asia/Manila';

    private LogisticsCompany $company;

    private SortingCenter $hub;

    private User $hubUser;

    private SortingCenter $idleHub;

    private Rider $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Carbon::setTestNow(Carbon::parse('2026-11-09 12:00:00', self::TZ));
        config(['logistics.delivery_sla_hours' => 48]);

        $owner = $this->user('Carla', 'Courier');
        $code = strtoupper(Str::random(4));
        $this->company = LogisticsCompany::create([
            'name' => "Courier {$code}", 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $owner->id,
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(),
        ]);
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $owner->id, 'role' => 'owner']);

        $this->hubUser = $this->user('Hana', 'Hub');
        $this->hub = $this->makeHub($this->hubUser, 'Santa Cruz Hub ' . Str::random(4));
        $this->idleHub = $this->makeHub($this->user('Ida', 'Idle'), 'Pila Hub ' . Str::random(4));

        $riderUser = $this->user('Juan', 'Dela Cruz');
        $this->rider = Rider::create([
            'user_id' => $riderUser->id, 'sorting_center_id' => $this->hub->id, 'vehicle_type' => Rider::VEHICLE_MOTORCYCLE,
            'plate_number' => 'AB-' . rand(1000, 9999), 'or_cr_path' => 'ids/a.pdf', 'drivers_license_path' => 'ids/b.pdf',
            'status' => Rider::STATUS_ACTIVE, 'submitted_at' => now(),
        ]);

        // Two parcels: one received and delivered on Nov 7, one received Nov 8 with a failed attempt.
        $one = $this->parcel(['scanned' => '2026-11-07 09:00', 'ofd' => '2026-11-07 13:00', 'delivered' => '2026-11-07 15:00'], 'DELIVERED');
        $two = $this->parcel(['scanned' => '2026-11-08 10:00'], 'DELIVERY_FAILED');
        DeliveryLog::create(['parcel_id' => $one->id, 'rider_id' => $this->rider->id, 'outcome' => DeliveryLog::OUTCOME_DELIVERED, 'logged_at' => $this->at('2026-11-07 15:00')]);
        DeliveryLog::create(['parcel_id' => $two->id, 'rider_id' => $this->rider->id, 'outcome' => DeliveryLog::OUTCOME_DELIVERY_FAILED, 'logged_at' => $this->at('2026-11-08 16:00')]);
        RiderEarning::forceCreate(['rider_id' => $this->rider->id, 'parcel_id' => $one->id, 'kind' => RiderEarning::KIND_PICKUP, 'amount' => 10, 'earned_at' => $this->at('2026-11-07 09:00')]);
        RiderEarning::forceCreate(['rider_id' => $this->rider->id, 'parcel_id' => $one->id, 'kind' => RiderEarning::KIND_DELIVERY, 'amount' => 32.5, 'earned_at' => $this->at('2026-11-07 15:00')]);
        DB::table('hub_earnings')->insert(['sorting_center_id' => $this->hub->id, 'parcel_id' => $one->id, 'amount' => 7.5, 'earned_at' => $this->at('2026-11-07 15:00'), 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function user(string $first, string $last): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => $last, 'email' => strtolower($first) . '.' . uniqid() . '@example.com',
            'phone' => '0917' . rand(1000000, 9999999), 'password' => Hash::make('Password123!'), 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    private function makeHub(User $owner, string $name): SortingCenter
    {
        return SortingCenter::create([
            'logistics_company_id' => $this->company->id, 'user_id' => $owner->id, 'hub_name' => $name,
            'address_province' => 'Laguna', 'address_city' => 'Santa Cruz', 'address_barangay' => 'Poblacion I', 'address_street' => '1 St',
            'dti_permit_path' => 'dti_permits/p.pdf', 'coverage_barangays' => ['043426017'], 'status' => SortingCenter::STATUS_APPROVED,
        ]);
    }

    private function at(string $manila): Carbon
    {
        return Carbon::parse($manila, self::TZ)->utc();
    }

    private function parcel(array $times, string $status): Parcel
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $this->user('Bea', 'Buyer')->id,
            'status' => 'DELIVERED', 'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'gcash',
            'shipping_name' => 'Bea', 'shipping_phone' => '09998887777', 'shipping_address' => '1 St',
            'shipping_province' => 'Laguna', 'shipping_city' => 'Santa Cruz', 'shipping_barangay' => 'Poblacion I',
            'shipping_province_code' => '043400000', 'shipping_city_code' => '043426000', 'shipping_barangay_code' => '043426017',
        ]);

        return Parcel::create([
            'tracking_number' => 'LIT-261107-' . strtoupper(substr(uniqid(), -6)), 'order_id' => $order->id,
            'seller_id' => $this->user('Sam', 'Seller')->id, 'status' => $status, 'sorting_center_id' => $this->hub->id,
            'logistics_company_id' => $this->company->id, 'destination_barangay' => 'Poblacion I', 'destination_barangay_code' => '043426017',
            'scanned_in_at' => isset($times['scanned']) ? $this->at($times['scanned']) : null,
            'out_for_delivery_at' => isset($times['ofd']) ? $this->at($times['ofd']) : null,
            'delivered_at' => isset($times['delivered']) ? $this->at($times['delivered']) : null,
        ]);
    }

    /** @return array<string, string> label => display */
    private function kpis(array $doc): array
    {
        return array_column($doc['kpis'], 'display', 'label');
    }

    private function section(array $doc, string $title): array
    {
        return collect($doc['sections'])->firstWhere('title', $title);
    }

    /** The text drawn on every page of a PDF from this app (its content streams are deflated). */
    private function pdfText(string $pdf): string
    {
        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringEndsWith("%%EOF\n", $pdf);
        preg_match_all('/stream\n(.*?)\nendstream/s', $pdf, $m);
        $text = '';
        foreach ($m[1] as $stream) {
            $plain = @gzuncompress($stream);
            $text .= $plain === false ? $stream : $plain;
        }
        preg_match_all('/\((.*?)\) Tj/s', $text, $runs);

        return implode("\n", array_map(fn ($r) => stripcslashes($r), $runs[1]));
    }

    private function xlsxSheets(string $bytes): array
    {
        $path = tempnam(sys_get_temp_dir(), 'x');
        file_put_contents($path, $bytes);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path) === true);
        $sheets = [];
        for ($i = 1; ($xml = $zip->getFromName("xl/worksheets/sheet{$i}.xml")) !== false; $i++) {
            $sheets[] = $xml;
        }
        $workbook = $zip->getFromName('xl/workbook.xml');
        $zip->close();
        unlink($path);

        return [$workbook, $sheets];
    }

    public function test_the_hub_report_as_json_has_the_figures_days_and_riders(): void
    {
        Sanctum::actingAs($this->hubUser);
        $doc = $this->getJson('/api/v1/hub/reports/document?from=2026-11-03&to=2026-11-09')->assertOk()->json('data');

        $this->assertSame('Hub report', $doc['title']);
        $this->assertSame($this->hub->hub_name, $doc['owner']);
        $this->assertSame('Nov 3 to Nov 9, 2026', $doc['range']['label']);
        $kpis = $this->kpis($doc);
        $this->assertSame('2', $kpis['Received']);
        $this->assertSame('1', $kpis['Delivered']);
        $this->assertSame('1', $kpis['Failed attempts']);
        $this->assertSame('50%', $kpis['Success rate']);
        $this->assertSame('100%', $kpis['On time']);
        $this->assertSame('2 h', $kpis['Delivery time']);
        $this->assertSame('₱7.50', $kpis['Hub earnings']);

        $days = $this->section($doc, 'By day');
        $this->assertCount(7, $days['rows']);
        $this->assertSame(['2026-11-07', 1, 1, 0, 0], $days['rows'][4]);
        $this->assertSame(['Total', 2, 1, 1, 0], $days['total']);
        $riders = $this->section($doc, 'Riders');
        $this->assertSame('Juan Dela Cruz', $riders['rows'][0][0]);
    }

    public function test_the_hub_report_downloads_as_excel_and_pdf(): void
    {
        Sanctum::actingAs($this->hubUser);

        $xlsx = $this->get('/api/v1/hub/reports/file?format=xlsx&from=2026-11-03&to=2026-11-09')->assertOk();
        $this->assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $xlsx->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment; filename="hub-report-', $xlsx->headers->get('Content-Disposition'));
        $this->assertStringContainsString('2026-11-03_to_2026-11-09.xlsx"', $xlsx->headers->get('Content-Disposition'));
        [$workbook, $sheets] = $this->xlsxSheets($xlsx->getContent());
        $this->assertStringContainsString('name="Summary"', $workbook);
        $this->assertStringContainsString('name="By day"', $workbook);
        $this->assertStringContainsString('name="Riders"', $workbook);
        $this->assertStringContainsString('Hub earnings', $sheets[0]);
        $this->assertStringContainsString('Juan Dela Cruz', $sheets[2]);

        $pdf = $this->get('/api/v1/hub/reports/file?format=pdf&from=2026-11-03&to=2026-11-09')->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
        $text = $this->pdfText($pdf->getContent());
        $this->assertStringContainsString('Hub report', $text);
        $this->assertStringContainsString($this->hub->hub_name, $text);
        $this->assertStringContainsString('PHP 7.50', $text);
        $this->assertStringContainsString('Juan Dela Cruz', $text);
        $this->assertStringContainsString('Page 1 of 1', $text);

        $this->getJson('/api/v1/hub/reports/file?format=docx')->assertStatus(422)->assertJsonValidationErrors('format');
    }

    public function test_a_long_report_goes_on_over_pages_with_page_numbers(): void
    {
        Sanctum::actingAs($this->hubUser);
        $pdf = $this->get('/api/v1/hub/reports/file?format=pdf&from=2026-01-01&to=2026-11-09')->assertOk()->getContent();
        $text = $this->pdfText($pdf);

        $this->assertStringContainsString('By day (continued)', $text);
        $this->assertMatchesRegularExpression('/Page 3 of \d+/', $text);
    }

    public function test_the_courier_report_lists_only_hubs_with_parcels_and_counts_the_rest(): void
    {
        Sanctum::actingAs($this->company->owner ?? User::find($this->company->owner_user_id));
        $doc = $this->getJson('/api/v1/logistics/reports/document?from=2026-11-03&to=2026-11-09')->assertOk()->json('data');

        $this->assertSame('Network report', $doc['title']);
        $hubs = $this->section($doc, 'By hub');
        $this->assertCount(1, $hubs['rows']);
        $this->assertSame($this->hub->hub_name, $hubs['rows'][0][0]);
        $this->assertSame('1 other approved hubs had no parcels in this period.', $hubs['note']);
        $this->assertSame('1', $this->kpis($doc)['Hubs with parcels']);

        // The portal's report page, now from the same grouped figures: busy hubs first, then idle ones.
        $page = $this->getJson('/api/v1/logistics/reports?from=2026-11-03&to=2026-11-09')->assertOk()->json('data');
        $this->assertSame([$this->hub->id, $this->idleHub->id], array_column($page['hubs'], 'hub_id'));
        $this->assertSame(2, $page['totals']['received']);
        $this->assertSame(0.5, $page['totals']['success_rate']);
        $this->assertSame(1, $page['active_hubs']);

        $pdf = $this->get('/api/v1/logistics/reports/file?format=pdf&from=2026-11-03&to=2026-11-09')->assertOk();
        $this->assertStringContainsString('Network report', $this->pdfText($pdf->getContent()));
    }

    public function test_the_rider_report_has_earnings_jobs_and_failed_tries(): void
    {
        Sanctum::actingAs($this->rider->user);
        $doc = $this->getJson('/api/v1/rider/reports/document?from=2026-11-03&to=2026-11-09')->assertOk()->json('data');

        $this->assertSame('Rider report', $doc['title']);
        $this->assertStringStartsWith('Juan Dela Cruz · ', $doc['owner']);
        $kpis = $this->kpis($doc);
        $this->assertSame('₱42.50', $kpis['Earned']);
        $this->assertSame('1', $kpis['Pickups']);
        $this->assertSame('1', $kpis['Deliveries']);
        $this->assertSame('1', $kpis['Failed attempts']);
        $this->assertSame('₱42.50', $kpis['Not paid yet']);
        $this->assertSame('₱21.25', $kpis['Average per job']);
        $jobs = $this->section($doc, 'Jobs');
        $this->assertSame(['Delivery', 'Pickup'], array_column($jobs['rows'], 2));
        $this->assertSame('Not yet', $jobs['rows'][0][5]);

        $xlsx = $this->get('/api/v1/rider/reports/file?format=xlsx&from=2026-11-03&to=2026-11-09')->assertOk();
        [, $sheets] = $this->xlsxSheets($xlsx->getContent());
        $this->assertCount(3, $sheets);
    }

    public function test_the_app_gets_a_link_that_works_without_the_token_for_a_while(): void
    {
        Sanctum::actingAs($this->rider->user);
        $link = $this->postJson('/api/v1/rider/reports/link', ['format' => 'pdf', 'from' => '2026-11-03', 'to' => '2026-11-09'])
            ->assertOk()->json('data');
        $this->assertSame('pdf', $link['format']);
        $this->assertStringContainsString('/api/v1/reports/files/rider?', $link['url']);

        $this->app['auth']->forgetGuards();
        $file = $this->get($link['url'])->assertOk();
        $this->assertSame('application/pdf', $file->headers->get('Content-Type'));
        $this->assertStringContainsString('Rider report', $this->pdfText($file->getContent()));

        // Changed or late links don't work.
        $this->get(str_replace('format=pdf', 'format=xlsx', $link['url']))->assertForbidden();
        Carbon::setTestNow(now()->addMinutes(11));
        $this->get($link['url'])->assertForbidden();
    }

    public function test_reports_stay_with_their_own_account(): void
    {
        Sanctum::actingAs($this->rider->user);
        $this->getJson('/api/v1/hub/reports/document')->assertForbidden();
        $this->postJson('/api/v1/logistics/reports/link', ['format' => 'xlsx'])->assertForbidden();

        Sanctum::actingAs($this->hubUser);
        $this->getJson('/api/v1/rider/reports/document')->assertForbidden();
        $this->getJson('/api/v1/hub/reports/document?from=2026-01-01&to=2027-06-01')->assertStatus(422)->assertJsonValidationErrors('to');
    }
}
