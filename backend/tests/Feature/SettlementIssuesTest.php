<?php

namespace Tests\Feature;

use App\Models\AdminActivityLog;
use App\Models\CourierSettlement;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\SellerProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * When a weekly courier ↔ shop payment goes wrong: the payer attaches the GCash receipt (private), the receiver is
 * told and either confirms or reports "not received", the payer and the admins are told, and an admin marks it
 * received or voids it so it is sent again (the voided payment stays in the history).
 */
class SettlementIssuesTest extends TestCase
{
    use DatabaseTransactions;

    private User $buyer;
    private User $owner;
    private LogisticsCompany $company;
    private User $shop;
    private User $admin;
    private string $weekStart;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        Storage::fake('ids');
        config(['payments.settlement_confirm_days' => 3]);

        $this->buyer = $this->user('buyer');
        $this->admin = $this->user('admin');
        $this->owner = $this->user('buyer');
        $code = strtoupper(Str::random(4));
        $this->company = LogisticsCompany::create([
            'name' => 'Courier ' . $code, 'code' => $code, 'slug' => strtolower($code), 'owner_user_id' => $this->owner->id,
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'gcash_number' => '09190000000', 'gcash_name' => 'Courier Co',
        ]);
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->owner->id, 'role' => 'owner']);

        $this->shop = $this->seller();

        // Last week the rider collected ₱550 for the shop and the courier earned ₱50: the courier owes ₱500.
        $delivered = CarbonImmutable::now('Asia/Manila')->subWeek()->startOfWeek()->addDays(2)->setTime(14, 0);
        $this->weekStart = $delivered->startOfWeek()->toDateString();
        $order = Order::create([
            'logistics_company_id' => $this->company->id, 'buyer_id' => $this->buyer->id, 'order_number' => 'VEL-S' . Str::upper(Str::random(8)),
            'subtotal' => 500, 'shipping_fee' => 50, 'courier_fee' => 50, 'total' => 550, 'payment_method' => 'cod', 'payment_status' => 'paid',
            'settlement' => Order::SETTLEMENT_DIRECT, 'status' => 'DELIVERED', 'shipping_name' => 'Juan', 'shipping_phone' => '09171234567',
            'shipping_address' => '1 St', 'shipping_province_code' => '130000000', 'shipping_city_code' => '137404000', 'shipping_barangay_code' => '137404001',
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'seller_id' => $this->shop->id, 'product_name' => 'Item', 'unit_price' => 500, 'quantity' => 1,
            'subtotal' => 500, 'commission_rate' => 0.05, 'commission_amount' => 25, 'seller_earnings' => 475, 'payout_status' => 'direct',
        ]);
        Parcel::create(['tracking_number' => 'LIT' . Str::upper(Str::random(10)), 'order_id' => $order->id, 'seller_id' => $this->shop->id,
            'logistics_company_id' => $this->company->id, 'status' => 'DELIVERED', 'delivered_at' => $delivered->utc()]);
    }

    private function user(string $role): User
    {
        return User::forceCreate([
            'first_name' => 'Juan', 'last_name' => 'Cruz', 'email' => Str::random(10) . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active', 'phone' => '0917' . random_int(1000000, 9999999),
        ]);
    }

    /** An approved shop with its GCash set up. */
    private function seller(): User
    {
        $seller = $this->user('seller');
        SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'Ana Shop ' . Str::random(4), 'shop_category' => 'General',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', Str::random(20)), 'government_id_image_path' => 'uploads/id.jpg',
            'payout_gcash_number' => 'N/A', 'application_status' => 'approved', 'gcash_number' => '09171110000', 'gcash_account_name' => 'Ana Shop',
        ]);

        return $seller;
    }

    private function receipt(string $name = 'r.png'): UploadedFile
    {
        // A real 1x1 PNG (the fake image() helper needs the GD extension).
        return UploadedFile::fake()->createWithContent($name, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    }

    /** The courier records last week's ₱500, optionally with a receipt. */
    private function courierPays(string $reference = '1234567890123', ?UploadedFile $receipt = null): CourierSettlement
    {
        Sanctum::actingAs($this->owner);
        $res = $this->post('/api/v1/logistics/settlements', array_filter([
            'seller_id' => $this->shop->id, 'week_start' => $this->weekStart, 'reference' => $reference, 'receipt' => $receipt,
        ]), ['Accept' => 'application/json'])->assertCreated();

        return CourierSettlement::findOrFail($res->json('data.id'));
    }

    private function kinds(User $user): array
    {
        return $user->notifications()->get()->pluck('data.kind')->all();
    }

    public function test_the_receipt_is_private_and_the_shop_is_told_when_the_courier_pays(): void
    {
        $s = $this->courierPays('1234567890123', $this->receipt());

        $this->assertNotNull($s->receipt_path);
        Storage::disk('ids')->assertExists($s->receipt_path);
        $this->assertContains('settlement.paid', $this->kinds($this->shop));
        $this->assertStringContainsString('₱500.00', $this->shop->notifications()->first()->data['body']);

        // The shop, the courier and admins can open it; anyone else gets a 404.
        foreach ([$this->shop, $this->owner, $this->admin] as $who) {
            Sanctum::actingAs($who);
            $this->get("/api/v1/settlements/{$s->id}/receipt")->assertOk();
        }
        Sanctum::actingAs($this->user('buyer'));
        $this->getJson("/api/v1/settlements/{$s->id}/receipt")->assertStatus(404);

        // Not a picture: refused, and nothing is recorded.
        Sanctum::actingAs($this->owner);
        CourierSettlement::whereKey($s->id)->delete();
        $this->post('/api/v1/logistics/settlements', [
            'seller_id' => $this->shop->id, 'week_start' => $this->weekStart, 'reference' => '1234567890123',
            'receipt' => UploadedFile::fake()->create('r.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['receipt']);
        $this->assertSame(0, CourierSettlement::where('seller_id', $this->shop->id)->count());
    }

    public function test_the_shop_reports_it_not_received_and_the_courier_and_admins_are_told(): void
    {
        $s = $this->courierPays();

        Sanctum::actingAs($this->shop);
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'short'])->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'Nothing with this reference is in our GCash.'])
            ->assertOk()->assertJsonPath('data.state', 'disputed')->assertJsonPath('data.dispute.reason', 'Nothing with this reference is in our GCash.');
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'Still nothing in our GCash.'])->assertStatus(422);

        $this->assertContains('settlement.disputed', $this->kinds($this->owner));
        $this->assertContains('settlement.disputed', $this->kinds($this->admin));

        // Only the receiving side may report, and only its own settlements.
        Sanctum::actingAs($this->owner);
        $this->postJson("/api/v1/logistics/settlements/{$s->id}/dispute", ['reason' => 'We want to report our own payment.'])->assertStatus(422);
        Sanctum::actingAs($this->seller());
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'Not my settlement at all.'])->assertStatus(404);

        // The courier adds its receipt while it is reported; the shop is told.
        Sanctum::actingAs($this->owner);
        $this->post("/api/v1/logistics/settlements/{$s->id}/receipt", ['receipt' => $this->receipt()], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.has_receipt', true);
        $this->assertContains('settlement.receipt', $this->kinds($this->shop));

        // The money shows up after all: the shop confirms, which closes the report.
        Sanctum::actingAs($this->shop);
        $this->postJson("/api/v1/seller/settlements/{$s->id}/confirm")->assertOk()->assertJsonPath('data.state', 'settled');
        $this->assertContains('settlement.confirmed', $this->kinds($this->owner));
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'Changed our mind about it.'])->assertStatus(422);
    }

    public function test_the_admin_sees_reported_and_overdue_payments_and_marks_one_received(): void
    {
        $s = $this->courierPays();

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/v1/admin/settlements?view=overdue')->assertOk()->assertJsonMissing(['id' => $s->id]);

        // Four days without an answer: overdue. A reminder reaches the shop, once a day at most.
        $this->travel(4)->days();
        $overdue = $this->getJson('/api/v1/admin/settlements?view=overdue')->assertOk();
        $row = collect($overdue->json('data'))->firstWhere('id', $s->id);
        $this->assertNotNull($row);
        $this->assertSame(['courier', 4, '0917 111 0000'], [$row['paid_by'], $row['days_waiting'], $row['shop']['gcash']['number']]);
        $this->assertTrue($row['can_remind']);
        $this->postJson("/api/v1/admin/settlements/{$s->id}/remind")->assertOk()->assertJsonPath('data.can_remind', false);
        $this->assertContains('settlement.reminder', $this->kinds($this->shop));
        $this->postJson("/api/v1/admin/settlements/{$s->id}/remind")->assertStatus(422);

        // The admin checked the courier's receipt: received. Both sides are told and the week is settled.
        $this->postJson("/api/v1/admin/settlements/{$s->id}/resolve", ['outcome' => 'received', 'note' => 'ok'])->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->postJson("/api/v1/admin/settlements/{$s->id}/resolve", ['outcome' => 'received', 'note' => 'The receipt shows the transfer to the shop number.'])
            ->assertOk()->assertJsonPath('data.state', 'settled')->assertJsonPath('data.resolution.outcome', 'received');
        $this->assertContains('settlement.resolved', $this->kinds($this->shop));
        $this->assertContains('settlement.resolved', $this->kinds($this->owner));
        $this->assertTrue(AdminActivityLog::where('action', 'resolve_settlement')->where('target_id', $s->id)->exists());
        $this->postJson("/api/v1/admin/settlements/{$s->id}/resolve", ['outcome' => 'pay_again', 'note' => 'Trying to void it afterwards.'])->assertStatus(422);

        $history = collect($this->getJson('/api/v1/admin/settlements?view=history')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($s->id, $history);

        // Not for anyone but admins.
        Sanctum::actingAs($this->owner);
        $this->getJson('/api/v1/admin/settlements')->assertStatus(403);
    }

    public function test_a_voided_payment_is_sent_again_and_the_first_one_stays_in_the_history(): void
    {
        $s = $this->courierPays('1111111111111', $this->receipt('first.png'));
        $firstReceipt = $s->receipt_path;
        Sanctum::actingAs($this->shop);
        $this->postJson("/api/v1/seller/settlements/{$s->id}/dispute", ['reason' => 'Nothing with this reference arrived.'])->assertOk();

        Sanctum::actingAs($this->admin);
        $this->assertContains($s->id, collect($this->getJson('/api/v1/admin/settlements?view=reported')->json('data'))->pluck('id'));
        $this->postJson("/api/v1/admin/settlements/{$s->id}/resolve", ['outcome' => 'pay_again', 'note' => 'The reference is not a transfer to the shop.'])
            ->assertOk()->assertJsonPath('data.state', 'pay_again');
        $this->assertContains('settlement.pay_again', $this->kinds($this->owner));
        $this->assertContains('settlement.pay_again', $this->kinds($this->shop));

        // The week counts as owed again on both sides, and the shop cannot confirm the voided payment.
        Sanctum::actingAs($this->owner);
        $this->assertEquals(500, $this->getJson('/api/v1/logistics/settlements')->json('data.totals.to_pay'));
        Sanctum::actingAs($this->shop);
        $this->assertEquals(500, $this->getJson('/api/v1/seller/settlements')->json('data.totals.to_receive'));
        $this->postJson("/api/v1/seller/settlements/{$s->id}/confirm")->assertStatus(422);

        // The courier sends it again: the same week's record, the first payment kept as attempt 1.
        $again = $this->courierPays('2222222222222');
        $this->assertSame($s->id, $again->id);
        $this->assertSame(['2222222222222', 'sent', null], [$again->reference, $again->state(), $again->receipt_path]);
        $this->assertSame('1111111111111', $again->attempts[0]['reference']);
        $this->assertSame('Nothing with this reference arrived.', $again->attempts[0]['dispute_reason']);
        Storage::disk('ids')->assertExists($firstReceipt);

        // Only an admin can open the first payment's receipt.
        Sanctum::actingAs($this->admin);
        $row = collect($this->getJson('/api/v1/admin/settlements?view=history')->json('data'))->firstWhere('id', $s->id);
        $this->assertSame([1, '1111111111111', true], [$row['attempts'][0]['number'], $row['attempts'][0]['reference'], $row['attempts'][0]['has_receipt']]);
        $this->get("/api/v1/settlements/{$s->id}/receipt?attempt=1")->assertOk();
        Sanctum::actingAs($this->shop);
        $this->getJson("/api/v1/settlements/{$s->id}/receipt?attempt=1")->assertStatus(404);

        // A week that is not voided cannot be paid twice.
        $this->assertSame(1, CourierSettlement::where('seller_id', $this->shop->id)->count());
        Sanctum::actingAs($this->owner);
        $this->postJson('/api/v1/logistics/settlements', ['seller_id' => $this->shop->id, 'week_start' => $this->weekStart, 'reference' => '3333333333333'])->assertStatus(422);
    }
}
