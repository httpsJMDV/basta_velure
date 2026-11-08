<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SellerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

/**
 * GET /seller/reports/export: the seller's report as an Excel workbook with the same figures as the Reports page
 * (docs/api/seller-reports.md).
 */
class SellerReportExportTest extends TestCase
{
    use DatabaseTransactions;

    private function user(string $tag): User
    {
        return User::forceCreate([
            'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => $tag . '.' . uniqid() . '@example.com', 'phone' => '+63917' . random_int(1000000, 9999999),
            'password' => Hash::make('Password123!'), 'date_of_birth' => '1990-01-01', 'sex' => 'female', 'role' => 'buyer', 'status' => 'active',
        ]);
    }

    private function seller(string $shop): User
    {
        $seller = $this->user('seller');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => $shop, 'shop_category' => 'Crafts', 'date_of_birth' => '1990-01-01',
            'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333', 'government_id_number_hash' => hash('sha256', Str::random(20)),
            'government_id_image_path' => 'uploads/id.jpg', 'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
        ]);

        return $seller;
    }

    private function order(User $seller, OrderStatus $status, string $method, array $items, ?\DateTimeInterface $at = null): Order
    {
        $order = Order::forceCreate([
            'buyer_id' => $this->user('buyer')->id, 'order_number' => 'VEL-' . strtoupper(uniqid()), 'status' => $status->value,
            'subtotal' => array_sum(array_map(fn ($i) => $i[1] * $i[2], $items)), 'shipping_fee' => 50, 'total' => array_sum(array_map(fn ($i) => $i[1] * $i[2], $items)) + 50,
            'payment_method' => $method, 'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St',
        ]);
        if ($at) {
            $order->forceFill(['created_at' => $at])->save();
        }
        foreach ($items as [$name, $price, $qty]) {
            $subtotal = $price * $qty;
            OrderItem::forceCreate([
                'order_id' => $order->id, 'seller_id' => $seller->id, 'product_name' => $name, 'unit_price' => $price, 'quantity' => $qty,
                'subtotal' => $subtotal, 'commission_rate' => 0.05, 'commission_amount' => round($subtotal * 0.05, 2), 'seller_earnings' => round($subtotal * 0.95, 2),
            ]);
        }

        return $order;
    }

    /** @return array<string, string> sheet name => sheet XML */
    private function sheets(string $bytes): array
    {
        $path = tempnam(sys_get_temp_dir(), 'test-xlsx');
        file_put_contents($path, $bytes);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path) === true, 'The download is a zip (an .xlsx file).');
        preg_match_all('/<sheet name="([^"]+)" sheetId="(\d+)"/', (string) $zip->getFromName('xl/workbook.xml'), $m, PREG_SET_ORDER);
        $sheets = [];
        foreach ($m as [, $name, $id]) {
            $xml = (string) $zip->getFromName("xl/worksheets/sheet{$id}.xml");
            $this->assertNotFalse((new \DOMDocument())->loadXML($xml), "Sheet {$name} is valid XML.");
            $sheets[html_entity_decode($name)] = $xml;
        }
        $zip->close();
        unlink($path);

        return $sheets;
    }

    public function test_the_export_is_a_workbook_with_the_same_figures_as_the_page(): void
    {
        $seller = $this->seller('Ana\'s Abaca & Weaves');
        $this->order($seller, OrderStatus::COMPLETED, 'cod', [['Abaca Tote', 450, 2], ['Coin Purse', 120, 1]]);
        $this->order($seller, OrderStatus::PLACED, 'gcash', [['Abaca Tote', 450, 1]]);
        $this->order($seller, OrderStatus::CANCELLED, 'cod', [['=HYPERLINK("x")', 999, 1]]);
        $this->order($seller, OrderStatus::COMPLETED, 'cod', [['Old Basket', 300, 1]], now()->subDays(60));
        Sanctum::actingAs($seller);

        $summary = $this->getJson('/api/v1/seller/reports/summary?range=30d')->assertOk()->json('data');
        $res = $this->get('/api/v1/seller/reports/export?range=30d')->assertOk();

        $this->assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $res->headers->get('content-type'));
        $this->assertStringContainsString('anas-abaca-weaves-sales-report-', (string) $res->headers->get('content-disposition'));
        $this->assertStringContainsString('.xlsx"', (string) $res->headers->get('content-disposition'));

        $sheets = $this->sheets($res->getContent());
        $this->assertSame(['Summary', 'Sales by day', 'Payment methods', 'Products', 'Orders'], array_keys($sheets));

        // Gross sales on the Summary match the page: 2 × 450 + 120 + 450 = 1,470 (the cancelled and the old order are out).
        $this->assertEqualsWithDelta(1470.0, $summary['gross_sales'], 0.001);
        $this->assertStringContainsString('<v>1470</v>', $sheets['Summary']);
        $this->assertStringContainsString('Ana&apos;s Abaca &amp; Weaves', $sheets['Summary']);

        // Two orders in the window, newest first, totals at the bottom.
        $this->assertSame(2, substr_count($sheets['Orders'], '>VEL-'));
        $this->assertStringContainsString('2 orders', $sheets['Orders']);
        $this->assertStringContainsString('Cash on delivery', $sheets['Orders']);
        $this->assertStringNotContainsString('HYPERLINK', implode('', $sheets), 'Cancelled orders are left out.');
        $this->assertStringNotContainsString('<f>', implode('', $sheets), 'No formulas: text stays text.');

        // Products: the tote first (₱1,350 gross from 3 units).
        $this->assertMatchesRegularExpression('/Abaca Tote.*?<v>3<\/v>.*?<v>1350<\/v>/s', $sheets['Products']);
    }

    public function test_the_window_follows_the_page_and_bad_dates_are_refused(): void
    {
        $seller = $this->seller('Window Crafts');
        $this->order($seller, OrderStatus::COMPLETED, 'cod', [['Old Basket', 300, 1]], now()->subDays(60));
        Sanctum::actingAs($seller);

        $all = $this->sheets($this->get('/api/v1/seller/reports/export?range=all')->assertOk()->getContent());
        $this->assertArrayHasKey('Sales by month', $all);
        $this->assertStringContainsString('All time', $all['Summary']);
        $this->assertStringContainsString('Old Basket', $all['Products']);

        $from = now('Asia/Manila')->subDays(5)->toDateString();
        $to = now('Asia/Manila')->subDays(9)->toDateString();
        $this->getJson("/api/v1/seller/reports/export?from={$from}&to={$to}")->assertStatus(422)->assertJsonValidationErrors(['to']);
        $this->getJson('/api/v1/seller/reports/export?from=08-11-2026')->assertStatus(422)->assertJsonValidationErrors(['from']);
    }

    public function test_only_a_seller_gets_a_report(): void
    {
        $this->getJson('/api/v1/seller/reports/export')->assertStatus(401);
        Sanctum::actingAs($this->user('buyer'));
        $this->getJson('/api/v1/seller/reports/export')->assertStatus(403);
    }
}
