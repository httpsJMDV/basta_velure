<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * Adding to the cart says so the moment the cart becomes a big purchase: the agreement checkout will ask for at
 * ₱50,000, and no cash on delivery above ₱50,000 for one shop. It is said once, not on every later add.
 */
class CartBigPurchaseNoticeTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private User $shopper;

    private User $shop;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['orders.high_value_min' => 50000, 'orders.cod_max' => 50000]);
        $this->shopper = $this->buyer();
        $this->shop = $this->seller('Big Ticket ' . uniqid(), $this->qc);
        Sanctum::actingAs($this->shopper);
    }

    private function item(float $price)
    {
        [, $variants] = $this->product($this->shop, 'Item ' . uniqid(), ['Default' => [$price, 100]], 1);

        return $variants['Default'];
    }

    private function add($variant, int $quantity = 1): array
    {
        return $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => $quantity])
            ->assertCreated()->json();
    }

    public function test_a_small_add_has_no_notice(): void
    {
        $this->assertNull($this->add($this->item(1200))['notice']);
    }

    public function test_crossing_the_line_tells_about_the_agreement_and_gcash_once(): void
    {
        $this->assertNull($this->add($this->item(30000))['notice']);

        $notice = $this->add($this->item(25000))['notice'];
        $this->assertSame('big_purchase', $notice['kind']);
        $this->assertSame('This is a big purchase', $notice['title']);
        $this->assertTrue($notice['agreement']);
        $this->assertTrue($notice['no_cod']);
        $this->assertEquals(55000, $notice['cart_total']);
        $this->assertStringContainsString('₱55,000', $notice['points'][0]);
        $this->assertStringContainsString('by GCash', $notice['points'][1]);
        $this->assertStringContainsString('7 days', $notice['points'][2]);

        // Already a big purchase: a small add says nothing again.
        $this->assertNull($this->add($this->item(500))['notice']);
    }

    public function test_one_very_expensive_item_says_so_every_time(): void
    {
        $tv = $this->item(80000);
        $this->assertNotNull($this->add($tv)['notice']);
        $this->assertNotNull($this->add($tv)['notice']);
    }

    public function test_the_line_is_the_configured_amount(): void
    {
        config(['orders.high_value_min' => 10000, 'orders.cod_max' => 100000]);

        $notice = $this->add($this->item(12000))['notice'];
        $this->assertTrue($notice['agreement']);
        $this->assertFalse($notice['no_cod']);
        $this->assertCount(2, $notice['points']);
        $this->assertStringContainsString('₱10,000', $notice['points'][0]);
    }

    public function test_one_line_never_holds_more_pieces_than_one_checkout_takes(): void
    {
        config(['orders.max_units' => 200]);
        [, $variants] = $this->product($this->shop, 'Pencil ' . uniqid(), ['Default' => [10, 5000]], 0.01);
        $pencil = $variants['Default'];

        $this->postJson('/api/v1/cart/items', ['variant_id' => $pencil->id, 'quantity' => 201])
            ->assertStatus(422)->assertJsonPath('errors.quantity.0', 'One checkout takes at most 200 pieces. For a bigger order, message the shop first.');
        $this->postJson('/api/v1/cart/items', ['variant_id' => $pencil->id, 'quantity' => 150])->assertCreated();
        $this->postJson('/api/v1/cart/items', ['variant_id' => $pencil->id, 'quantity' => 60])->assertStatus(422);
        $this->postJson('/api/v1/cart/items', ['variant_id' => $pencil->id, 'quantity' => 50])->assertCreated();
    }
}
