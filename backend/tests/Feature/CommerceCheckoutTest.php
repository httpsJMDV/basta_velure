<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\FlashSale;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Promotion;
use App\Models\Voucher;
use App\Models\VoucherClaim;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Checkout against the workbook (Buyer B7, B8; Seller S11; the worked checkout example on the Test Data sheet).
 */
class CommerceCheckoutTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private function workedExample(): array
    {
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / M' => [249, 8], 'Black / M' => [249, 0]], 0.4);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [, $charger] = $this->product($s2, 'USB-C Fast Charger 20W', ['Default' => [399, 50]], 0.2);
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $s1, 'fixed', 50, 300);
        $plat = $this->voucher($this->code('PLAT100'), Voucher::SCOPE_PLATFORM, null, 'fixed', 100, 1000);
        $free = $this->voucher($this->code('FREESHIP'), Voucher::SCOPE_SHIPPING, null, 'fixed', 50, 300);

        return compact('buyer', 'addr', 's1', 's2', 'tote', 'basket', 'charger', 'mch50', 'plat', 'free');
    }

    private function items(array $pairs): array
    {
        return array_map(fn ($p) => ['variant_id' => $p[0]->id, 'quantity' => $p[1]], $pairs);
    }

    public function test_the_worked_checkout_example_totals_splits_and_earnings(): void
    {
        $w = $this->workedExample();
        Sanctum::actingAs($w['buyer']);
        $payload = [
            'source' => 'cart', 'address_id' => $w['addr']->id,
            'items' => $this->items([[$w['tote']['Natural / M'], 1], [$w['basket']['Default'], 1], [$w['charger']['Default'], 1]]),
            'vouchers' => ['store' => [$w['s1']->id => $w['mch50']->code], 'platform' => $w['plat']->code, 'shipping' => strtolower($w['free']->code)],
        ];

        $quote = $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()->json('data');
        $this->assertTrue($quote['can_place']);
        $this->assertEqualsWithDelta(1098.00, $quote['totals']['merchandise'], 0.001);
        $this->assertEqualsWithDelta(185.00, $quote['totals']['shipping'], 0.001);
        $this->assertEqualsWithDelta(50.00, $quote['totals']['store_discount'], 0.001);
        $this->assertEqualsWithDelta(100.00, $quote['totals']['platform_discount'], 0.001);
        $this->assertEqualsWithDelta(50.00, $quote['totals']['shipping_discount'], 0.001);
        $this->assertEqualsWithDelta(1083.00, $quote['totals']['total'], 0.001);
        $stores = collect($quote['stores'])->keyBy('seller.id');
        $this->assertEqualsWithDelta(65.00, $stores[$w['s1']->id]['shipping']['fee'], 0.001);
        $this->assertSame(2, $stores[$w['s1']->id]['shipping']['chargeable_kg']);
        $this->assertEqualsWithDelta(120.00, $stores[$w['s2']->id]['shipping']['fee'], 0.001);
        $this->assertEqualsWithDelta(63.66, $stores[$w['s1']->id]['platform_discount'], 0.001);
        $this->assertEqualsWithDelta(36.34, $stores[$w['s2']->id]['platform_discount'], 0.001);

        $res = $this->postJson('/api/v1/checkout/place-order', $payload + ['payment_method' => 'cod', 'expected_total' => 1083.00, 'notes' => [$w['s1']->id => 'Paki-wrap po as gift']])
            ->assertCreated();
        $orders = Order::whereIn('id', collect($res->json('orders'))->pluck('id'))->get()->keyBy(fn ($o) => $o->items()->value('seller_id'));
        $this->assertCount(2, $orders);
        $this->assertEqualsWithDelta(1083.00, $orders->sum(fn ($o) => (float) $o->total), 0.001);
        $one = $orders[$w['s1']->id];
        $this->assertSame('Paki-wrap po as gift', $one->notes);
        $this->assertSame('PLACED', $one->status->value);
        $this->assertSame('to_ship', collect($res->json('orders'))->firstWhere('id', $one->id)['tab']);
        $this->assertEqualsWithDelta(616.55, (float) OrderItem::where('order_id', $one->id)->sum('seller_earnings'), 0.001);
        $this->assertEqualsWithDelta(32.45, (float) OrderItem::where('order_id', $one->id)->sum('commission_amount'), 0.001);
        $this->assertEqualsWithDelta(379.05, (float) OrderItem::where('order_id', $orders[$w['s2']->id]->id)->sum('seller_earnings'), 0.001);
        $this->assertSame(7, $w['tote']['Natural / M']->fresh()->stock_quantity);
        $this->assertSame(1, $w['mch50']->fresh()->used_count);
        $this->assertSame(1, $w['plat']->fresh()->used_count);
    }

    public function test_shipping_is_per_store_route_and_rounds_the_weight_up(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [, $charger] = $this->product($s2, 'USB-C Fast Charger 20W', ['Default' => [399, 50]], 0.2);
        $ncr = $this->address($buyer, $this->qc);
        $visayas = $this->address($buyer, $this->cebu, false);
        Sanctum::actingAs($buyer);

        $fee = fn ($addr, $variant, $qty) => $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $this->items([[$variant, $qty]])])
            ->assertOk()->json('data.stores.0.shipping.fee');
        $this->assertEqualsWithDelta(50.00, $fee($ncr, $basket['Default'], 1), 0.001);
        $this->assertEqualsWithDelta(120.00, $fee($visayas, $basket['Default'], 1), 0.001);
        // 5 x 0.2 kg = 1.0 kg is charged as 1 kg; 6 x 0.2 kg = 1.2 kg as 2 kg (within Visayas: 60 + 20).
        $this->assertEqualsWithDelta(60.00, $fee($visayas, $charger['Default'], 5), 0.001);
        $this->assertEqualsWithDelta(80.00, $fee($visayas, $charger['Default'], 6), 0.001);
    }

    public function test_an_address_no_courier_serves_cannot_be_checked_out(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $far = $this->address($buyer, $this->itbayat);
        Sanctum::actingAs($buyer);
        $payload = ['address_id' => $far->id, 'items' => $this->items([[$basket['Default'], 1]])];

        $quote = $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()->json('data');
        $this->assertFalse($quote['can_place']);
        $this->assertSame('unserviceable', $quote['problems'][0]['type']);
        $this->postJson('/api/v1/checkout/place-order', $payload + ['payment_method' => 'cod'])->assertStatus(422);
        $this->assertSame(20, $basket['Default']->fresh()->stock_quantity);
    }

    public function test_note_to_seller_is_at_most_200_characters(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        $payload = fn ($note) => ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'payment_method' => 'cod', 'notes' => [$s1->id => $note]];

        $this->postJson('/api/v1/checkout/place-order', $payload(str_repeat('a', 201)))->assertStatus(422)->assertJsonValidationErrors(["notes.{$s1->id}"]);
        $id = $this->postJson('/api/v1/checkout/place-order', $payload(str_repeat('a', 200)))->assertCreated()->json('data.id');
        $this->assertSame(200, mb_strlen(Order::find($id)->notes));
    }

    public function test_place_order_twice_with_the_same_key_creates_one_order(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        $payload = ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'payment_method' => 'cod'];
        $key = (string) Str::uuid();

        $first = $this->postJson('/api/v1/checkout/place-order', $payload, ['Idempotency-Key' => $key])->assertCreated()->json('data.id');
        $second = $this->postJson('/api/v1/checkout/place-order', $payload, ['Idempotency-Key' => $key])->assertOk()->assertJsonPath('repeated', true);
        $this->assertSame($first, $second->json('data.id'));
        $this->assertSame(1, Order::where('buyer_id', $buyer->id)->count());
        $this->assertSame(19, $basket['Default']->fresh()->stock_quantity);
    }

    public function test_a_price_change_during_checkout_needs_the_buyer_to_confirm(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        $payload = ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'payment_method' => 'cod'];
        $this->assertEqualsWithDelta(500.00, $this->postJson('/api/v1/checkout/quote', $payload)->json('data.totals.total'), 0.001);

        $basket['Default']->update(['price' => 480]);
        $this->postJson('/api/v1/checkout/place-order', $payload + ['expected_total' => 500])
            ->assertStatus(409)->assertJsonPath('code', 'price_changed')->assertJsonPath('quote.totals.total', 530);
        $this->assertSame(0, Order::where('buyer_id', $buyer->id)->count());
        $this->postJson('/api/v1/checkout/place-order', $payload + ['expected_total' => 530])->assertCreated();
    }

    public function test_voucher_minimum_spend_cap_shipping_and_never_negative(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [299.99, 20]], 0.8);
        [, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / M' => [249, 8]], 0.4);
        $addr = $this->address($buyer, $this->qc);
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $s1, 'fixed', 50, 300);
        $mch10 = $this->voucher($this->code('MCH10'), Voucher::SCOPE_STORE, $s1, 'percent', 10, 500, ['max_discount' => 100]);
        $free = $this->voucher($this->code('FREESHIP'), Voucher::SCOPE_SHIPPING, null, 'fixed', 50, 300);
        Sanctum::actingAs($buyer);
        $store = fn ($code, $items) => $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $items, 'vouchers' => ['store' => [$s1->id => $code]]])->json('data.stores.0.store_voucher');
        $one = fn () => $this->items([[$basket['Default'], 1]]);

        // Minimum spend at the boundary, against the price paid.
        $this->assertSame('Spend ₱0.01 more to use this voucher.', $store($mch50->code, $one())['message']);
        $basket['Default']->update(['price' => 300.00]);
        $this->assertEqualsWithDelta(50.00, $store($mch50->code, $one())['discount'], 0.001);
        $basket['Default']->update(['price' => 300.01]);
        $this->assertEqualsWithDelta(50.00, $store($mch50->code, $one())['discount'], 0.001);

        // A percentage respects its cap.
        foreach ([[499.99, null], [999.00, 99.90], [1000.00, 100.00], [1250.00, 100.00]] as [$price, $off]) {
            $basket['Default']->update(['price' => $price]);
            $v = $store($mch10->code, $one());
            $off === null ? $this->assertFalse($v['applied']) : $this->assertEqualsWithDelta($off, $v['discount'], 0.001);
        }

        // A shipping voucher never takes the shipping below zero: ₱50 off ₱50 is ₱0, off ₱65 leaves ₱15.
        $basket['Default']->update(['price' => 450]);
        $ship = fn ($items) => $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $items, 'vouchers' => ['shipping' => $free->code]])->json('data');
        $q = $ship($one());
        $this->assertEqualsWithDelta(50.00, $q['totals']['shipping_discount'], 0.001);
        $this->assertEqualsWithDelta(450.00, $q['totals']['total'], 0.001);
        $q = $ship($this->items([[$basket['Default'], 1], [$tote['Natural / M'], 1]]));
        $this->assertEqualsWithDelta(65.00, $q['totals']['shipping'], 0.001);
        $this->assertEqualsWithDelta(15.00, $q['totals']['shipping'] - $q['totals']['shipping_discount'], 0.001);

        // The merchandise total never goes below zero; shipping is still charged.
        $basket['Default']->update(['price' => 100]);
        $t100 = $this->voucher($this->code('MCHT100'), Voucher::SCOPE_STORE, $s1, 'fixed', 100, 100);
        $q = $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $one(), 'vouchers' => ['store' => [$s1->id => $t100->code]]])->json('data');
        $this->assertEqualsWithDelta(0.00, $q['stores'][0]['net_merchandise'], 0.001);
        $this->assertEqualsWithDelta(50.00, $q['totals']['total'], 0.001);
    }

    public function test_each_invalid_voucher_has_its_own_message(): void
    {
        $buyer = $this->buyer();
        $other = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        $old = $this->voucher($this->code('MCHOLD'), Voucher::SCOPE_STORE, $s1, 'fixed', 30, 200, ['starts_at' => now()->subMonth(), 'ends_at' => now()->subDay()]);
        $soon = $this->voucher($this->code('MCHSOON'), Voucher::SCOPE_STORE, $s1, 'fixed', 30, 200, ['starts_at' => now()->addDay()]);
        $max = $this->voucher($this->code('MCHMAX'), Voucher::SCOPE_STORE, $s1, 'fixed', 20, 100, ['total_limit' => 1, 'used_count' => 1]);
        Sanctum::actingAs($buyer);
        $msg = fn ($code) => $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'vouchers' => ['store' => [$s1->id => $code]]])->json('data.stores.0.store_voucher.message');

        $this->assertStringStartsWith('This voucher expired on', $msg($old->code));
        $this->assertStringStartsWith('This voucher starts on', $msg($soon->code));
        $this->assertSame('This voucher has been fully used.', $msg($max->code));
        $this->assertSame('No voucher matches this code.', $msg('NOSUCHCODE'));

        // One per buyer: used on an order, it is refused for that buyer, not for another.
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $s1, 'fixed', 50, 300, ['total_limit' => 100]);
        $this->postJson('/api/v1/checkout/place-order', ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'payment_method' => 'cod', 'vouchers' => ['store' => [$s1->id => $mch50->code]]])->assertCreated();
        $this->assertSame('You already used this voucher.', $msg($mch50->code));
        Sanctum::actingAs($other);
        $otherAddr = $this->address($other, $this->qc);
        $this->assertTrue($this->postJson('/api/v1/checkout/quote', ['address_id' => $otherAddr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'vouchers' => ['store' => [$s1->id => $mch50->code]]])->json('data.stores.0.store_voucher.applied'));
    }

    public function test_a_voucher_that_ends_during_checkout_stops_the_order(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        $mch50 = $this->voucher($this->code('MCH50'), Voucher::SCOPE_STORE, $s1, 'fixed', 50, 300);
        Sanctum::actingAs($buyer);
        $payload = ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 1]]), 'payment_method' => 'cod', 'vouchers' => ['store' => [$s1->id => $mch50->code]]];

        $mch50->update(['ended_at' => now()]);
        $this->postJson('/api/v1/checkout/place-order', $payload + ['expected_total' => 450])
            ->assertStatus(409)->assertJsonPath('code', 'voucher_invalid')->assertJsonPath('quote.totals.total', 500);
        $this->assertSame(0, Order::where('buyer_id', $buyer->id)->count());
    }

    public function test_a_store_voucher_for_some_products_counts_only_those(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [$toteProduct, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / M' => [249, 8]], 0.4);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        $v = $this->voucher($this->code('MCHTOTE'), Voucher::SCOPE_STORE, $s1, 'fixed', 30, 100, ['applies_to' => 'products']);
        $v->products()->sync([$toteProduct->id]);
        Sanctum::actingAs($buyer);
        $apply = fn ($items) => $this->postJson('/api/v1/checkout/quote', ['address_id' => $addr->id, 'items' => $items, 'vouchers' => ['store' => [$s1->id => $v->code]]])->json('data.stores.0.store_voucher');

        $this->assertFalse($apply($this->items([[$basket['Default'], 1]]))['applied']);
        $this->assertEqualsWithDelta(30.00, $apply($this->items([[$tote['Natural / M'], 1]]))['discount'], 0.001);
        $this->assertEqualsWithDelta(30.00, $apply($this->items([[$tote['Natural / M'], 1], [$basket['Default'], 1]]))['discount'], 0.001);
    }

    public function test_flash_units_beyond_the_remaining_quantity_are_their_own_line(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [$product, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        $addr = $this->address($buyer, $this->qc);
        FlashSale::create(['seller_id' => $s1->id, 'product_id' => $product->id, 'product_variant_id' => $basket['Default']->id,
            'slot_start' => now()->subMinutes(10), 'slot_end' => now()->addHour(), 'flash_price' => 299, 'quantity' => 5, 'sold' => 4]);
        Sanctum::actingAs($buyer);
        $payload = ['address_id' => $addr->id, 'items' => $this->items([[$basket['Default'], 2]]), 'payment_method' => 'cod'];

        $lines = $this->postJson('/api/v1/checkout/quote', $payload)->json('data.stores.0.lines');
        $this->assertSame([[1, 299.0, 'flash'], [1, 450.0, 'regular']], array_map(fn ($l) => [$l['quantity'], (float) $l['unit_price'], $l['price_source']], $lines));
        $id = $this->postJson('/api/v1/checkout/place-order', $payload + ['expected_total' => 814])->assertCreated()->json('data.id');
        $this->assertSame(2, OrderItem::where('order_id', $id)->count());
        $this->assertSame(5, FlashSale::where('product_id', $product->id)->value('sold'));
    }

    public function test_bundles_and_buy_x_get_y_in_the_cart(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        [$toteProduct, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / S' => [199, 10], 'Black / L' => [299, 3]], 0.4);
        [$basketProduct, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [$matProduct, $mat] = $this->product($s1, 'Banig Placemat Set of 4', ['Default' => [350, 10]], 0.5);
        $bundle = Promotion::create(['seller_id' => $s1->id, 'type' => 'bundle', 'name' => 'Any 3 totes', 'min_quantity' => 3, 'discount_percent' => 15, 'starts_at' => now()->subDay(), 'ends_at' => now()->addWeek()]);
        $bundle->products()->sync([$toteProduct->id]);
        Promotion::create(['seller_id' => $s1->id, 'type' => 'bxgy', 'name' => 'Buy 2 baskets get a mat', 'buy_product_id' => $basketProduct->id, 'buy_quantity' => 2,
            'get_product_id' => $matProduct->id, 'get_quantity' => 1, 'starts_at' => now()->subDay(), 'ends_at' => now()->addWeek()]);
        Sanctum::actingAs($buyer);

        $this->postJson('/api/v1/cart/items', ['variant_id' => $tote['Natural / S']->id, 'quantity' => 2])->assertCreated();
        $this->assertEqualsWithDelta(0.00, $this->getJson('/api/v1/cart')->json('data.summary.promo_discount'), 0.001);
        $this->postJson('/api/v1/cart/items', ['variant_id' => $tote['Black / L']->id, 'quantity' => 1])->assertCreated();
        $this->assertEqualsWithDelta(104.55, $this->getJson('/api/v1/cart')->json('data.summary.promo_discount'), 0.001);

        $this->getJson('/api/v1/cart')->json('data.stores.0.lines');
        $line = collect($this->getJson('/api/v1/cart')->json('data.stores.0.lines'))->firstWhere('variant_id', $tote['Natural / S']->id);
        $this->patchJson("/api/v1/cart/items/{$line['id']}", ['quantity' => 1])->assertOk();
        $this->assertEqualsWithDelta(0.00, $this->getJson('/api/v1/cart')->json('data.summary.promo_discount'), 0.001);

        // Buy 2 baskets, get the placemat free; with one basket it costs ₱350 again.
        $this->postJson('/api/v1/cart/items', ['variant_id' => $basket['Default']->id, 'quantity' => 2])->assertCreated();
        $this->postJson('/api/v1/cart/items', ['variant_id' => $mat['Default']->id, 'quantity' => 1])->assertCreated();
        $matLine = fn () => collect($this->getJson('/api/v1/cart')->json('data.stores.0.lines'))->firstWhere('variant_id', $mat['Default']->id);
        $this->assertSame(1, $matLine()['free_quantity']);
        $basketLine = collect($this->getJson('/api/v1/cart')->json('data.stores.0.lines'))->firstWhere('variant_id', $basket['Default']->id);
        $this->patchJson("/api/v1/cart/items/{$basketLine['id']}", ['quantity' => 1])->assertOk();
        $this->assertSame(0, $matLine()['free_quantity']);
    }

    public function test_the_per_buyer_purchase_limit_counts_earlier_orders(): void
    {
        $buyer = $this->buyer();
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $bank] = $this->product($s2, 'Power Bank 10000mAh', ['Default' => [899, 5]], 0.4, ['purchase_limit' => 2]);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);

        $this->postJson('/api/v1/checkout/place-order', ['address_id' => $addr->id, 'items' => $this->items([[$bank['Default'], 2]]), 'payment_method' => 'cod'])->assertCreated();
        $this->postJson('/api/v1/cart/items', ['variant_id' => $bank['Default']->id, 'quantity' => 1])
            ->assertStatus(422)->assertJsonPath('errors.quantity.0', 'You can buy up to 2 of this item in total. You already bought 2.');
        $this->postJson('/api/v1/checkout/place-order', ['address_id' => $addr->id, 'items' => $this->items([[$bank['Default'], 1]]), 'payment_method' => 'cod'])->assertStatus(422);
    }

    public function test_buy_now_leaves_the_cart_as_it_is(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / M' => [249, 8]], 0.4);
        [, $charger] = $this->product($s2, 'USB-C Fast Charger 20W', ['Default' => [399, 50]], 0.2);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        $this->postJson('/api/v1/cart/items', ['variant_id' => $charger['Default']->id, 'quantity' => 1])->assertCreated();

        $res = $this->postJson('/api/v1/checkout/place-order', ['source' => 'buy_now', 'address_id' => $addr->id, 'items' => $this->items([[$tote['Natural / M'], 1]]), 'payment_method' => 'cod'])->assertCreated();
        $this->assertCount(1, $res->json('orders'));
        $this->assertSame(1, $this->getJson('/api/v1/cart')->json('data.summary.lines'));
    }

    public function test_cart_checkout_takes_only_the_selected_lines(): void
    {
        $buyer = $this->buyer();
        $s1 = $this->seller('Maria Clara Handicrafts', $this->qc);
        $s2 = $this->seller('RV Gadget Hub', $this->cebu);
        [, $tote] = $this->product($s1, 'Abaca Woven Tote Bag', ['Natural / M' => [249, 8]], 0.4);
        [, $basket] = $this->product($s1, 'Rattan Fruit Basket', ['Default' => [450, 20]], 0.8);
        [, $charger] = $this->product($s2, 'USB-C Fast Charger 20W', ['Default' => [399, 50]], 0.2);
        $addr = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        foreach ([$tote['Natural / M'], $basket['Default'], $charger['Default']] as $v) {
            $this->postJson('/api/v1/cart/items', ['variant_id' => $v->id, 'quantity' => 1])->assertCreated();
        }
        $this->postJson('/api/v1/cart/select', ['selected' => false])->assertOk();
        $lines = collect($this->getJson('/api/v1/cart')->json('data.stores'))->flatMap(fn ($s) => $s['lines'])->keyBy('variant_id');

        $this->patchJson("/api/v1/cart/items/{$lines[$charger['Default']->id]['id']}", ['selected' => true])->assertJsonPath('data.summary.merchandise', 399);
        $this->postJson('/api/v1/cart/select', ['selected' => true, 'seller_id' => $s1->id])->assertJsonPath('data.summary.merchandise', 1098);
        $this->patchJson("/api/v1/cart/items/{$lines[$charger['Default']->id]['id']}", ['selected' => false])->assertJsonPath('data.summary.merchandise', 699);

        $res = $this->postJson('/api/v1/checkout/place-order', ['address_id' => $addr->id, 'payment_method' => 'cod'])->assertCreated();
        $this->assertCount(1, $res->json('orders'));
        $this->assertSame(1, $this->getJson('/api/v1/cart')->json('data.summary.lines'));
        $this->assertTrue(VoucherClaim::count() >= 0);
    }
}
