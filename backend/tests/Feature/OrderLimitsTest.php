<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Limits on one order: a rider's load, a huge cart, the cash a rider carries, and the agreements for big amounts.
 */
class OrderLimitsTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private User $shopper;

    private User $shop;

    private $addressRow;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);

        $this->shopper = $this->buyer();
        $this->addressRow = $this->address($this->shopper, $this->qc);
        $this->shop = $this->seller('Block Shop ' . uniqid(), $this->qc);
    }

    /** One variant of a new product, at this price and weight. */
    private function item(float $price, float $kg = 1, int $stock = 1000)
    {
        [, $variants] = $this->product($this->shop, 'Item ' . uniqid(), ['Default' => [$price, $stock]], $kg);

        return $variants['Default'];
    }

    private function quote(array $pairs): array
    {
        Sanctum::actingAs($this->shopper);

        return $this->postJson('/api/v1/checkout/quote', [
            'address_id' => $this->addressRow->id,
            'items' => array_map(fn ($p) => ['variant_id' => $p[0]->id, 'quantity' => $p[1]], $pairs),
        ])->assertOk()->json('data');
    }

    private function types(array $quote): array
    {
        return array_column($quote['problems'], 'type');
    }

    private function place($variant, array $extra)
    {
        Sanctum::actingAs($this->shopper);

        return $this->postJson('/api/v1/checkout/place-order', [
            'address_id' => $this->addressRow->id,
            'items' => [['variant_id' => $variant->id, 'quantity' => 1]],
        ] + $extra);
    }

    // ── Bulky items ──

    public function test_a_cart_refuses_more_of_a_heavy_item_than_one_parcel_carries(): void
    {
        $block = $this->item(20, 15);
        Sanctum::actingAs($this->shopper);

        $this->postJson('/api/v1/cart/items', ['variant_id' => $block->id, 'quantity' => 3])->assertSuccessful();

        $this->postJson('/api/v1/cart/items', ['variant_id' => $block->id, 'quantity' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['quantity' => 'This item weighs 15 kg each, and one parcel can weigh at most 50 kg, so you can buy at most 3 in one order.']);
    }

    public function test_an_item_too_heavy_for_any_parcel_says_so(): void
    {
        $safe = $this->item(500, 60);
        Sanctum::actingAs($this->shopper);

        $this->postJson('/api/v1/cart/items', ['variant_id' => $safe->id, 'quantity' => 1])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['quantity' => 'This item weighs 60 kg, which is too heavy for a rider to deliver. One parcel can weigh at most 50 kg.']);
    }

    public function test_checkout_adds_up_all_of_one_shops_items(): void
    {
        $quote = $this->quote([[$this->item(20, 30), 1], [$this->item(20, 25), 1]]);

        $this->assertContains('too_heavy', $this->types($quote));
        $this->assertFalse($quote['can_place']);
    }

    public function test_buying_straight_from_the_page_cannot_skip_the_weight_limit(): void
    {
        $this->place($this->item(20, 60), ['payment_method' => 'cod'])->assertStatus(422)->assertJsonValidationErrors(['items']);
    }

    public function test_exactly_the_limit_is_allowed(): void
    {
        $this->assertNotContains('too_heavy', $this->types($this->quote([[$this->item(20, 25), 2]])));
    }

    public function test_a_seller_cannot_list_an_item_heavier_than_a_parcel(): void
    {
        Sanctum::actingAs($this->shop);

        $this->postJson('/api/v1/seller/products', [
            'name' => 'Steel Beam Long', 'status' => 'draft', 'weight_kg' => 150,
            'variants' => [['label' => 'Default', 'price' => 100, 'stock' => 5]],
        ])->assertStatus(422)->assertJsonValidationErrors(['weight_kg']);
    }

    public function test_the_product_page_warns_about_a_heavy_item_only(): void
    {
        $heavy = $this->getJson('/api/v1/products/' . $this->item(20, 15)->product_id)->assertOk()->json();
        $light = $this->getJson('/api/v1/products/' . $this->item(20, 1)->product_id)->assertOk()->json();

        $bulky = data_get($heavy, 'specs.bulky') ?? data_get($heavy, 'data.specs.bulky');
        $this->assertEquals(['weight_kg' => 15, 'max_per_order' => 3, 'max_parcel_kg' => 50], $bulky);
        $this->assertNull(data_get($light, 'specs.bulky') ?? data_get($light, 'data.specs.bulky'));
    }

    // ── Huge carts ──

    public function test_too_many_different_items_in_one_checkout_is_refused(): void
    {
        config(['orders.max_lines' => 2]);

        $quote = $this->quote([[$this->item(100), 1], [$this->item(100), 1], [$this->item(100), 1]]);

        $this->assertContains('too_many_items', $this->types($quote));
    }

    public function test_too_many_pieces_in_one_checkout_is_refused(): void
    {
        $this->assertContains('too_many_items', $this->types($this->quote([[$this->item(1, 0.01), 201]])));
    }

    public function test_an_order_above_the_top_amount_is_refused(): void
    {
        $this->assertContains('order_too_large', $this->types($this->quote([[$this->item(1000000), 2]])));
    }

    public function test_bad_quantities_are_not_accepted(): void
    {
        $variant = $this->item(100);
        Sanctum::actingAs($this->shopper);

        foreach ([0, -1, -100, 1.5, 'abc', [], null, 99999999999] as $quantity) {
            $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => $quantity])->assertStatus(422);
        }
    }

    // ── Big amounts ──

    public function test_the_quote_tells_the_page_what_a_big_order_needs(): void
    {
        $small = $this->quote([[$this->item(1000), 1]]);
        $this->assertTrue($small['limits']['cod_available']);
        $this->assertFalse($small['limits']['agreement_required']);

        $big = $this->quote([[$this->item(60000), 1]]);
        $this->assertFalse($big['limits']['cod_available']);
        $this->assertTrue($big['limits']['agreement_required']);
    }

    public function test_a_big_cash_order_is_refused_and_nothing_is_created(): void
    {
        $before = Order::count();

        $this->place($this->item(60000), ['payment_method' => 'cod', 'high_value_agreed' => true])
            ->assertStatus(422)->assertJsonValidationErrors(['payment_method']);

        $this->assertSame($before, Order::count());
    }

    public function test_the_agreement_cannot_be_skipped_when_placing(): void
    {
        config(['orders.high_value_min' => 1000]);
        $variant = $this->item(2000);
        $before = Order::count();

        $this->place($variant, ['payment_method' => 'cod'])
            ->assertStatus(422)->assertJsonValidationErrors(['high_value_agreed']);
        $this->assertSame($before, Order::count());

        $id = $this->place($variant, ['payment_method' => 'cod', 'high_value_agreed' => true])->assertCreated()->json('data.id');

        $this->assertTrue(AuditLog::where('action', 'order.high_value_agreed')->where('subject_id', $id)->where('actor_user_id', $this->shopper->id)->exists());
    }

    public function test_a_seller_must_agree_to_a_very_high_price_once(): void
    {
        Sanctum::actingAs($this->shop);
        $product = [
            'name' => 'Gold Necklace', 'status' => 'draft', 'weight_kg' => 0.2,
            'variants' => [['label' => 'Default', 'price' => 75000, 'stock' => 1]],
        ];

        $this->postJson('/api/v1/seller/products', $product)
            ->assertStatus(422)->assertJsonValidationErrors(['high_value_agreed']);

        $id = $this->postJson('/api/v1/seller/products', $product + ['high_value_agreed' => true])
            ->assertCreated()->json('data.id');

        $this->assertTrue(AuditLog::where('action', 'product.high_value_agreed')->where('subject_id', $id)->where('actor_user_id', $this->shop->id)->exists());
    }

    public function test_raising_a_price_past_the_line_needs_the_agreement_too(): void
    {
        Sanctum::actingAs($this->shop);
        $variant = $this->item(1000);

        $this->patchJson("/api/v1/seller/products/{$variant->product_id}/price", ['price' => 50000])
            ->assertStatus(422)->assertJsonValidationErrors(['high_value_agreed']);
        $this->assertEquals(1000, $variant->fresh()->price);

        $this->patchJson("/api/v1/seller/products/{$variant->product_id}/price", ['price' => 50000, 'high_value_agreed' => true])->assertOk();
        $this->assertEquals(50000, $variant->fresh()->price);

        // Lowering it is not a new promise.
        $this->patchJson("/api/v1/seller/products/{$variant->product_id}/price", ['price' => 49000])->assertOk();
    }

    public function test_a_price_below_the_line_needs_nothing(): void
    {
        Sanctum::actingAs($this->shop);

        $this->postJson('/api/v1/seller/products', [
            'name' => 'Plain Cotton Shirt', 'status' => 'draft', 'weight_kg' => 0.2,
            'variants' => [['label' => 'Default', 'price' => 49999, 'stock' => 1]],
        ])->assertCreated();
    }
}
