<?php

namespace Tests\Feature;

use App\Models\Address;
use App\Models\AuditLog;
use App\Models\CartItem;
use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Order;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * The cart (B6), the address book (B2, A30), vouchers as their owners manage them (S9, A26, A27) and a courier's
 * delivery zones and rates (L8).
 */
class CommerceSettingsTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    public function test_the_cart_is_on_the_server_live_and_private(): void
    {
        $buyer = $this->buyer();
        $other = $this->buyer();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        [$basketProduct, $basket] = $this->product($seller, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [, $mat] = $this->product($seller, 'Banig Placemat Set of 4', ['Default' => [350, 0]], 0.5);
        Sanctum::actingAs($buyer);

        // Quantity limits: a whole number from 1 to the stock.
        foreach (['0', '-1', '1.5', 'abc'] as $bad) {
            $this->postJson('/api/v1/cart/items', ['variant_id' => $basket['Default']->id, 'quantity' => $bad])->assertStatus(422);
        }
        $this->postJson('/api/v1/cart/items', ['variant_id' => $basket['Default']->id, 'quantity' => 21])->assertStatus(422)->assertJsonPath('errors.quantity.0', 'Only 20 are available.');
        $this->postJson('/api/v1/cart/items', ['variant_id' => $mat['Default']->id, 'quantity' => 1])->assertStatus(422)->assertJsonPath('errors.variant_id.0', 'This item is sold out.');
        $line = $this->postJson('/api/v1/cart/items', ['variant_id' => $basket['Default']->id, 'quantity' => 20])->assertCreated()->json('data.stores.0.lines.0');
        $this->patchJson("/api/v1/cart/items/{$line['id']}", ['quantity' => 0])->assertStatus(422);
        $this->patchJson("/api/v1/cart/items/{$line['id']}", ['quantity' => 21])->assertStatus(422);

        // A price change shows the new price and what it was.
        $basket['Default']->update(['price' => 420]);
        $l = $this->getJson('/api/v1/cart')->json('data.stores.0.lines.0');
        $this->assertEqualsWithDelta(420.00, $l['unit_price'], 0.001);
        $this->assertSame('down', $l['price_changed']);
        $this->assertEqualsWithDelta(450.00, $l['price_seen'], 0.001);
        $this->assertEqualsWithDelta(8400.00, $this->getJson('/api/v1/cart')->json('data.summary.merchandise'), 0.001);

        // Deactivated, it is marked unavailable and cannot be selected.
        $basketProduct->update(['status' => 'archived']);
        $l = $this->getJson('/api/v1/cart')->json('data.stores.0.lines.0');
        $this->assertSame('unavailable', $l['status']);
        $this->assertFalse($l['selected']);
        $this->patchJson("/api/v1/cart/items/{$line['id']}", ['selected' => true])->assertStatus(422);
        $basketProduct->update(['status' => 'active']);

        // Another buyer cannot read or change this line.
        Sanctum::actingAs($other);
        $this->patchJson("/api/v1/cart/items/{$line['id']}", ['quantity' => 1])->assertNotFound();
        $this->deleteJson("/api/v1/cart/items/{$line['id']}")->assertNotFound();
        $this->assertSame(0, $this->getJson('/api/v1/cart')->json('data.summary.lines'));
        $this->assertSame(20, CartItem::find($line['id'])->quantity);
    }

    public function test_a_guest_cart_merges_into_the_account(): void
    {
        $buyer = $this->buyer();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($seller, 'Rattan Fruit Basket', ['Default' => [450, 3]], 0.8);
        [, $mat] = $this->product($seller, 'Banig Placemat Set of 4', ['Default' => [350, 0]], 0.5);
        Sanctum::actingAs($buyer);

        $res = $this->postJson('/api/v1/cart/merge', ['items' => [['variant_id' => $basket['Default']->id, 'quantity' => 2], ['variant_id' => $mat['Default']->id, 'quantity' => 1]]])->assertOk();
        $this->assertCount(1, $res->json('skipped'));
        $this->assertSame(2, $res->json('data.summary.units'));
    }

    public function test_the_address_book_keeps_ten_addresses_valid_phones_and_one_default(): void
    {
        $buyer = $this->buyer();
        Sanctum::actingAs($buyer);
        $payload = fn (array $extra = []) => $extra + [
            'full_name' => 'Juan Miguel Dela Cruz', 'phone' => '09171234567', 'address' => '45 Kalayaan Ave.', 'province' => 'Metro Manila',
            'district' => 'Quezon City', 'ward' => 'Central', 'region' => 'National Capital Region (NCR)', 'region_code' => '130000000',
            'province_code' => '130000000', 'city_code' => '137404000', 'barangay_code' => '137404001', 'label' => 'home',
        ];

        foreach (['0917123', '091712345678', 'abc'] as $bad) {
            $this->postJson('/api/v1/addresses', $payload(['phone' => $bad]))->assertStatus(422)->assertJsonValidationErrors(['phone']);
        }
        $first = $this->postJson('/api/v1/addresses', $payload())->assertCreated()->json('data');
        $this->assertSame('+639171234567', $first['phone']);
        $this->postJson('/api/v1/addresses', $payload(['phone' => '+639171234567']))->assertCreated();
        for ($i = 3; $i <= 10; $i++) {
            $this->postJson('/api/v1/addresses', $payload())->assertCreated();
        }
        $this->postJson('/api/v1/addresses', $payload())->assertStatus(422);
        $this->assertSame(10, Address::where('user_id', $buyer->id)->count());

        // The default cannot go until another is the default.
        $default = Address::where('user_id', $buyer->id)->where('is_default', true)->firstOrFail();
        $this->deleteJson("/api/v1/addresses/{$default->id}")->assertStatus(422);
        $other = Address::where('user_id', $buyer->id)->where('is_default', false)->firstOrFail();
        $this->patchJson("/api/v1/addresses/{$other->id}/default")->assertOk();
        $this->deleteJson("/api/v1/addresses/{$default->id}")->assertNoContent();
        $this->assertSame(1, Address::where('user_id', $buyer->id)->where('is_default', true)->count());
        $this->assertSame('130000000', $other->fresh()->region_code);
    }

    public function test_store_voucher_codes_and_fields_are_checked(): void
    {
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $this->voucher('PLATCODE' . Str::upper(Str::random(3)), Voucher::SCOPE_PLATFORM, null, 'fixed', 100, 1000);
        Sanctum::actingAs($seller);
        $base = fn (array $extra = []) => $extra + [
            'name' => 'Fifty off', 'discount_type' => 'fixed', 'amount' => 50, 'min_spend' => 300, 'total_limit' => 100, 'per_buyer_limit' => 1,
            'claimable' => true, 'starts_at' => now('Asia/Manila')->addMinute()->format('Y-m-d H:i'), 'ends_at' => now('Asia/Manila')->addMonth()->format('Y-m-d H:i'),
        ];
        $code = 'M' . Str::upper(Str::random(5));

        foreach (['ABC', 'ABCDEFGHIJKLM', 'MCH 50', 'MCH-50'] as $bad) {
            $this->postJson('/api/v1/seller/vouchers', $base(['code' => $bad]))->assertStatus(422)->assertJsonValidationErrors(['code']);
        }
        $this->postJson('/api/v1/seller/vouchers', $base(['code' => strtolower($code)]))->assertCreated()->assertJsonPath('data.code', $code);
        $this->postJson('/api/v1/seller/vouchers', $base(['code' => $code]))->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->postJson('/api/v1/seller/vouchers', $base(['code' => strtolower($code)]))->assertStatus(422);

        // A fixed discount cannot exceed the minimum spend; equal is fine.
        $this->postJson('/api/v1/seller/vouchers', $base(['code' => 'X' . Str::upper(Str::random(5)), 'amount' => 500, 'min_spend' => 100]))->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $this->postJson('/api/v1/seller/vouchers', $base(['code' => 'Y' . Str::upper(Str::random(5)), 'amount' => 100, 'min_spend' => 100]))->assertCreated();

        $invalid = [
            ['amount' => 0], ['discount_type' => 'percent', 'amount' => 0], ['discount_type' => 'percent', 'amount' => 100],
            ['discount_type' => 'percent', 'amount' => 10, 'max_discount' => 0], ['total_limit' => 0], ['per_buyer_limit' => 2, 'total_limit' => 1],
            ['ends_at' => now('Asia/Manila')->subDay()->format('Y-m-d H:i')],
        ];
        foreach ($invalid as $i => $fields) {
            $this->assertSame(422, $this->postJson('/api/v1/seller/vouchers', $base($fields + ['code' => 'Z' . Str::upper(Str::random(5))]))->status(), "invalid case {$i}");
        }
    }

    public function test_a_claimed_voucher_can_only_be_extended_and_ending_it_empties_wallets(): void
    {
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        $buyer = $this->buyer();
        $v = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $seller, 'fixed', 50, 300, ['total_limit' => 100]);
        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/buyer/vouchers/claim', ['voucher_id' => $v->id])->assertCreated();
        $this->postJson('/api/v1/buyer/vouchers/claim', ['voucher_id' => $v->id])->assertStatus(409);
        $this->assertSame([$v->code], collect($this->getJson('/api/v1/buyer/vouchers')->json('data'))->pluck('code')->all());

        Sanctum::actingAs($seller);
        $this->patchJson("/api/v1/seller/vouchers/{$v->id}", ['min_spend' => 500])->assertStatus(422)->assertJsonValidationErrors(['min_spend']);
        $this->patchJson("/api/v1/seller/vouchers/{$v->id}", ['amount' => 20])->assertStatus(422)->assertJsonValidationErrors(['amount']);
        $later = $v->ends_at->copy()->addDays(7)->setTimezone('Asia/Manila')->format('Y-m-d H:i:s');
        $this->patchJson("/api/v1/seller/vouchers/{$v->id}", ['ends_at' => $later, 'total_limit' => 150])->assertOk()->assertJsonPath('data.total_limit', 150);
        $this->postJson("/api/v1/seller/vouchers/{$v->id}/end")->assertOk();

        Sanctum::actingAs($buyer);
        $this->assertSame([], $this->getJson('/api/v1/buyer/vouchers')->json('data'));
    }

    public function test_code_only_vouchers_are_not_listed_but_apply_by_code(): void
    {
        $seller = $this->seller('RV Gadget Hub', $this->cebu);
        $this->voucher($this->code('RVSECRET'), Voucher::SCOPE_STORE, $seller, 'fixed', 100, 1000, ['claimable' => false]);
        $shown = $this->voucher($this->code('RVOPEN'), Voucher::SCOPE_STORE, $seller, 'fixed', 50, 300);

        $codes = collect($this->getJson("/api/v1/shops/{$seller->id}/vouchers")->assertOk()->json('data'))->pluck('code')->all();
        $this->assertSame([$shown->code], $codes);
    }

    public function test_a_courier_edits_its_rates_with_an_audit_trail_and_adds_zones(): void
    {
        $company = LogisticsCompany::create([
            'name' => 'Bilis Hatid Express ' . Str::random(4), 'slug' => 'bilis-' . Str::lower(Str::random(6)), 'code' => 'BH' . Str::upper(Str::random(4)), 'contact_email' => 'ops' . Str::random(5) . '@example.com',
            'status' => LogisticsCompany::STATUS_APPROVED, 'submitted_at' => now(), 'is_default' => false,
        ]);
        $admin = User::forceCreate(['first_name' => 'Carlos', 'last_name' => 'Mendoza', 'email' => 'ops.' . Str::lower(Str::random(8)) . '@example.com', 'password' => Hash::make('Hatid@2026'), 'role' => 'buyer', 'status' => 'active']);
        LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $admin->id, 'role' => 'owner']);
        Sanctum::actingAs($admin);

        $ncr = $this->postJson('/api/v1/logistics/shipping/zones', ['name' => 'NCR', 'areas' => [['level' => 'region', 'psgc_code' => '130000000', 'name' => 'NCR']]])
            ->assertCreated()->json('data.zones.0.id');
        foreach (['-1', '0', 'abc'] as $bad) {
            $this->putJson('/api/v1/logistics/shipping/rates', ['origin_zone_id' => $ncr, 'destination_zone_id' => $ncr, 'first_kg' => $bad, 'additional_kg' => 15])
                ->assertStatus(422)->assertJsonValidationErrors(['first_kg']);
        }
        $this->putJson('/api/v1/logistics/shipping/rates', ['origin_zone_id' => $ncr, 'destination_zone_id' => $ncr, 'first_kg' => 0.01, 'additional_kg' => 15])->assertOk();
        $this->putJson('/api/v1/logistics/shipping/rates', ['origin_zone_id' => $ncr, 'destination_zone_id' => $ncr, 'first_kg' => 55, 'additional_kg' => 15])->assertOk();
        $log = AuditLog::where('logistics_company_id', $company->id)->where('action', 'shipping.rate_changed')->latest('id')->first();
        $this->assertEqualsWithDelta(0.01, $log->old_value['first_kg'], 0.0001);
        $this->assertEqualsWithDelta(55.0, $log->new_value['first_kg'], 0.0001);
        $this->assertNotEmpty($this->getJson('/api/v1/logistics/shipping/audit')->json('data'));

        // Another company's zone is not usable.
        $foreign = ShippingZone::where('logistics_company_id', '!=', $company->id)->value('id');
        $this->putJson('/api/v1/logistics/shipping/rates', ['origin_zone_id' => $foreign, 'destination_zone_id' => $ncr, 'first_kg' => 10, 'additional_kg' => 5])->assertStatus(422);
    }

    public function test_the_new_rate_applies_to_new_checkouts_and_a_new_zone_opens_batanes(): void
    {
        $default = LogisticsCompany::defaultId();
        $ncr = ShippingZone::where('logistics_company_id', $default)->where('name', 'NCR')->firstOrFail();
        $rate = ShippingRate::where('origin_zone_id', $ncr->id)->where('destination_zone_id', $ncr->id)->firstOrFail();
        $buyer = $this->buyer();
        $seller = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($seller, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $home = $this->address($buyer, $this->qc);
        $far = $this->address($buyer, $this->itbayat, false);
        Sanctum::actingAs($buyer);
        $items = [['variant_id' => $basket['Default']->id, 'quantity' => 1]];

        $earlier = $this->postJson('/api/v1/checkout/place-order', ['address_id' => $home->id, 'items' => $items, 'payment_method' => 'cod'])->json('data.id');
        $rate->update(['first_kg' => 55]);
        $this->assertEqualsWithDelta(55.00, $this->postJson('/api/v1/checkout/quote', ['address_id' => $home->id, 'items' => $items])->json('data.stores.0.shipping.fee'), 0.001);
        $this->assertEqualsWithDelta(50.00, (float) Order::find($earlier)->shipping_fee, 0.001);

        $this->assertFalse($this->postJson('/api/v1/checkout/quote', ['address_id' => $far->id, 'items' => $items])->json('data.can_place'));
        $batanes = ShippingZone::create(['logistics_company_id' => $default, 'name' => 'Batanes ' . Str::random(3)]);
        $batanes->areas()->create(['level' => 'province', 'psgc_code' => '020900000', 'name' => 'Batanes']);
        ShippingRate::create(['logistics_company_id' => $default, 'origin_zone_id' => $ncr->id, 'destination_zone_id' => $batanes->id, 'first_kg' => 200, 'additional_kg' => 60]);
        $quote = $this->postJson('/api/v1/checkout/quote', ['address_id' => $far->id, 'items' => $items])->json('data');
        $this->assertTrue($quote['can_place']);
        $this->assertEqualsWithDelta(200.00, $quote['stores'][0]['shipping']['fee'], 0.001);
    }
}
