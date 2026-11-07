<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\CartItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/** Buy again: an order's items go back in the cart at today's price; unavailable ones are listed with why. */
class BuyAgainTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private function orderOf(User $buyer, array $lines): Order
    {
        $order = Order::forceCreate([
            'order_number' => 'VEL-' . strtoupper(uniqid()), 'buyer_id' => $buyer->id, 'status' => OrderStatus::COMPLETED->value,
            'subtotal' => 100, 'shipping_fee' => 50, 'total' => 150, 'payment_method' => 'cod', 'payment_status' => 'paid',
            'shipping_name' => 'Ana', 'shipping_phone' => '09171234567', 'shipping_address' => '1 St', 'shipping_province' => 'Laguna',
            'shipping_city' => 'Pila', 'shipping_barangay' => 'Santa Clara',
        ]);
        foreach ($lines as [$product, $variant, $qty]) {
            OrderItem::create([
                'order_id' => $order->id, 'seller_id' => $product->seller_id, 'product_id' => $product->id, 'product_variant_id' => $variant?->id,
                'product_name' => $product->name, 'variant_label' => $variant?->label ?? 'Default', 'unit_price' => 50, 'quantity' => $qty,
                'subtotal' => 50 * $qty, 'commission_rate' => 0.05, 'commission_amount' => 2.5, 'seller_earnings' => 47.5, 'payout_status' => 'released',
            ]);
        }

        return $order;
    }

    public function test_the_items_go_back_in_the_cart_and_sold_out_ones_are_listed(): void
    {
        $buyer = $this->buyer();
        $seller = $this->seller('Bayong Store', $this->qc);
        [$bag, $bags] = $this->product($seller, 'Bayong Bag', ['Small' => [250, 10]], 0.5);
        [$fan, $fans] = $this->product($seller, 'Pamaypay Fan', ['Default' => [80, 0]], 0.1);
        $order = $this->orderOf($buyer, [[$bag, $bags['Small'], 2], [$fan, $fans['Default'], 1]]);

        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/buy-again")->assertOk()
            ->assertJsonPath('added', 1)
            ->assertJsonPath('skipped.0.name', 'Pamaypay Fan')
            ->assertJsonPath('skipped.0.message', 'This item is sold out.');

        $this->assertSame(2, (int) CartItem::where('user_id', $buyer->id)->where('product_variant_id', $bags['Small']->id)->value('quantity'));
    }

    public function test_nothing_buyable_is_a_422_and_another_buyers_order_is_a_404(): void
    {
        $buyer = $this->buyer();
        $seller = $this->seller('Bayong Store', $this->qc);
        [$fan, $fans] = $this->product($seller, 'Pamaypay Fan', ['Default' => [80, 0]], 0.1);
        $order = $this->orderOf($buyer, [[$fan, $fans['Default'], 1]]);

        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$order->id}/buy-again")->assertStatus(422)->assertJsonPath('added', 0);

        Sanctum::actingAs($this->buyer());
        $this->postJson("/api/v1/buyer/orders/{$order->id}/buy-again")->assertNotFound();
    }
}
