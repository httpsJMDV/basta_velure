<?php

namespace Tests\Feature;

use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\Commerce\CheckoutCalculator;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

class SelfPurchaseTest extends TestCase
{
    use BuildsCommerce, DatabaseTransactions;

    private User $owner;

    private ProductVariant $own;

    private ProductVariant $other;

    private array $checkout;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->owner = $this->seller('Owner shop', $this->qc);
        $this->owner->forceFill(['buyer_application_status' => 'approved'])->save();
        [, $variants] = $this->product($this->owner, 'Own listing', ['Default' => [100, 10]], 0.2);
        $this->own = $variants['Default'];
        [, $variants] = $this->product($this->seller('Other shop', $this->qc), 'Other listing', ['Default' => [100, 10]], 0.2);
        $this->other = $variants['Default'];
        $this->checkout = ['address_id' => $this->address($this->owner, $this->qc)->id, 'payment_method' => 'cod'];
        Sanctum::actingAs($this->owner);
    }

    private function line(ProductVariant $variant): array
    {
        return ['variant_id' => $variant->id, 'quantity' => 1];
    }

    public function test_owner_cannot_add_own_product_even_when_sending_forged_owner_fields(): void
    {
        foreach (['buyer', 'seller'] as $role) {
            $this->owner->forceFill(['role' => $role])->save();
            $this->postJson('/api/v1/cart/items', $this->line($this->own) + ['seller_id' => 0, 'buyer_id' => 0])
                ->assertUnprocessable()->assertJsonValidationErrors('variant_id')
                ->assertJsonPath('errors.variant_id.0', CheckoutCalculator::SELF_PURCHASE_MESSAGE);
        }
        $this->assertDatabaseMissing('cart_items', ['user_id' => $this->owner->id, 'product_variant_id' => $this->own->id]);
        $this->assertSame(10, $this->own->fresh()->stock_quantity);
    }

    public function test_seller_can_still_buy_from_another_shop(): void
    {
        $this->postJson('/api/v1/cart/items', $this->line($this->other))->assertCreated();
        $payload = $this->checkout + ['items' => [$this->line($this->other)]];
        $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()->assertJsonPath('data.can_place', true);
        $response = $this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated();
        $order = Order::findOrFail($response->json('data.id'));
        $this->assertSame($this->owner->id, $order->buyer_id);
        $this->assertNotEquals($this->owner->id, $order->items()->first()->seller_id);
        $this->assertSame(9, $this->other->fresh()->stock_quantity);
    }

    public function test_direct_buy_now_and_legacy_product_id_cannot_bypass_checkout_guard(): void
    {
        foreach ([$this->line($this->own), ['product_id' => $this->own->product_id, 'quantity' => 1]] as $item) {
            $payload = $this->checkout + ['source' => 'buy_now', 'items' => [$item]];
            $this->postJson('/api/v1/checkout/quote', $payload)->assertOk()
                ->assertJsonPath('data.can_place', false)
                ->assertJsonPath('data.stores.0.lines.0.message', CheckoutCalculator::SELF_PURCHASE_MESSAGE);
            $this->postJson('/api/v1/checkout/place-order', $payload)->assertUnprocessable()->assertJsonValidationErrors('items');
        }
        $this->assertSame(0, Order::where('buyer_id', $this->owner->id)->count());
        $this->assertSame(10, $this->own->fresh()->stock_quantity);
    }

    public function test_mixed_checkout_is_rejected_atomically(): void
    {
        $payload = $this->checkout + ['items' => [$this->line($this->other), $this->line($this->own)]];
        $this->withHeader('Idempotency-Key', 'self-purchase-'.$this->owner->id)
            ->postJson('/api/v1/checkout/place-order', $payload)->assertUnprocessable();
        $this->assertSame(0, Order::where('buyer_id', $this->owner->id)->count());
        $this->assertSame(10, $this->own->fresh()->stock_quantity);
        $this->assertSame(10, $this->other->fresh()->stock_quantity);
        $this->assertDatabaseMissing('checkout_requests', ['buyer_id' => $this->owner->id]);
    }

    public function test_stale_cart_lines_are_unavailable_and_cannot_be_selected_or_checked_out(): void
    {
        $line = CartItem::create(['user_id' => $this->owner->id, 'product_id' => $this->own->product_id,
            'product_variant_id' => $this->own->id, 'quantity' => 1, 'selected' => true]);
        $this->getJson('/api/v1/cart')->assertOk()->assertJsonPath('data.stores.0.lines.0.selected', false)
            ->assertJsonPath('data.stores.0.lines.0.status', 'unavailable')
            ->assertJsonPath('data.stores.0.lines.0.message', CheckoutCalculator::SELF_PURCHASE_MESSAGE);
        $this->patchJson('/api/v1/cart/items/'.$line->id, ['quantity' => 2])->assertUnprocessable();
        $this->patchJson('/api/v1/cart/items/'.$line->id, ['selected' => true])->assertUnprocessable();
        $this->postJson('/api/v1/checkout/place-order', $this->checkout + ['source' => 'cart'])->assertUnprocessable();
        $this->patchJson('/api/v1/cart/items/'.$line->id, ['selected' => false])->assertOk();
        $this->postJson('/api/v1/cart/select', ['selected' => true])->assertOk();
        $this->assertFalse($line->fresh()->selected);
        $this->deleteJson('/api/v1/cart/items/'.$line->id)->assertOk();
    }

    public function test_guest_cart_merge_skips_own_products_but_keeps_other_shops(): void
    {
        $this->postJson('/api/v1/cart/merge', ['items' => [$this->line($this->own), $this->line($this->other)]])
            ->assertOk()->assertJsonCount(1, 'skipped')
            ->assertJsonPath('skipped.0.message', CheckoutCalculator::SELF_PURCHASE_MESSAGE)
            ->assertJsonPath('data.summary.lines', 1);
    }

    public function test_buy_again_does_not_readd_own_products_from_old_orders(): void
    {
        $order = Order::forceCreate(['order_number' => 'SELF-'.uniqid(), 'buyer_id' => $this->owner->id,
            'status' => 'COMPLETED', 'subtotal' => 100, 'shipping_fee' => 0, 'total' => 100,
            'payment_method' => 'cod', 'payment_status' => 'paid']);
        OrderItem::create(['order_id' => $order->id, 'seller_id' => $this->owner->id,
            'product_id' => $this->own->product_id, 'product_variant_id' => $this->own->id,
            'product_name' => 'Own listing', 'quantity' => 1, 'unit_price' => 100, 'subtotal' => 100,
            'commission_rate' => 0.05, 'commission_amount' => 5, 'seller_earnings' => 95, 'payout_status' => 'released']);
        $this->postJson('/api/v1/buyer/orders/'.$order->id.'/buy-again')->assertUnprocessable()
            ->assertJsonPath('added', 0)->assertJsonPath('skipped.0.message', CheckoutCalculator::SELF_PURCHASE_MESSAGE);
    }
}
