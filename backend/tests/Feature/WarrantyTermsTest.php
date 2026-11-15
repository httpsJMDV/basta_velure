<?php

namespace Tests\Feature;

use App\Models\Order;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

class WarrantyTermsTest extends TestCase
{
    use BuildsCommerce, DatabaseTransactions;

    public function test_seller_owns_terms_and_purchase_keeps_them_after_listing_changes(): void
    {
        $seller = $this->seller('Warranty shop', $this->qc);
        [$product, $variants] = $this->product($seller, 'Covered appliance', ['Default' => [500, 5]], 1);
        $url = '/api/v1/seller/products/'.$product->id.'/warranty';
        $terms = '12-month seller warranty from delivery for manufacturing defects. Contact this shop with your order number for assessment.';
        Sanctum::actingAs($seller);
        $this->patchJson($url, ['warranty' => $terms])->assertOk()->assertJsonPath('data.warranty', $terms);
        $this->getJson('/api/v1/products/'.$product->id)->assertOk()->assertJsonPath('data.warranty', $terms);
        $this->patchJson($url, ['warranty' => str_repeat('a', 2001)])->assertUnprocessable();

        $buyer = $this->buyer();
        $address = $this->address($buyer, $this->qc);
        Sanctum::actingAs($buyer);
        $this->patchJson($url, ['warranty' => 'Changed by someone else'])->assertForbidden();
        $result = $this->postJson('/api/v1/checkout/place-order', [
            'source' => 'buy_now', 'address_id' => $address->id, 'payment_method' => 'cod',
            'items' => [['variant_id' => $variants['Default']->id, 'quantity' => 1]],
        ])->assertCreated();
        $order = Order::findOrFail($result->json('data.id'));
        $this->assertSame($terms, $order->items()->first()->warranty);
        Sanctum::actingAs($seller);
        $this->getJson('/api/v1/seller/orders/'.$order->id)->assertOk()->assertJsonPath('data.items.0.warranty', $terms);
        $this->patchJson($url, ['warranty' => '24-month manufacturer warranty for new purchases only.'])->assertOk();
        $this->assertSame($terms, $order->fresh()->items()->first()->warranty);
        Sanctum::actingAs($buyer);
        $this->getJson('/api/v1/buyer/orders/'.$order->id)->assertOk()->assertJsonPath('data.items.0.warranty', $terms);
        Sanctum::actingAs($seller);
        $this->patchJson($url, ['warranty' => null])->assertOk()->assertJsonPath('data.warranty', null);
        $this->assertSame($terms, $order->fresh()->items()->first()->warranty);
    }
}
