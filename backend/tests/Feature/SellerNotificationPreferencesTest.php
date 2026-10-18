<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Mail\NoticeMail;
use App\Models\Order;
use App\Models\User;
use App\Services\OrderStateMachine;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

/**
 * A seller's notification settings (Account Settings > Notifications): each kind of event by the bell and by email,
 * saved and obeyed. New orders, reviews, payouts and product decisions reach the bell.
 */
class SellerNotificationPreferencesTest extends TestCase
{
    use BuildsCommerce;
    use DatabaseTransactions;

    private function shop(int $stock = 20): array
    {
        $buyer = $this->buyer();
        $addr = $this->address($buyer, $this->qc);
        $seller = $this->seller('Notify Test Shop', $this->qc);
        [, $variants] = $this->product($seller, 'Abaca Tote Bag', ['Default' => [500, $stock]], 0.6);

        return [$buyer, $addr, $seller, $variants['Default']];
    }

    private function place($addr, $variant, string $method = 'cod'): array
    {
        return $this->postJson('/api/v1/checkout/place-order', [
            'address_id' => $addr->id, 'items' => [['variant_id' => $variant->id, 'quantity' => 1]], 'payment_method' => $method,
        ])->assertCreated()->json();
    }

    private function mailsTo(User $user, string $kind): int
    {
        return Mail::queued(NoticeMail::class, fn (NoticeMail $m) => $m->kind === $kind && $m->hasTo($user->email))->count();
    }

    public function test_settings_start_from_the_defaults_save_and_reject_unknown_types(): void
    {
        [, , $seller] = $this->shop();
        Sanctum::actingAs($seller);

        $data = collect($this->getJson('/api/v1/seller/notification-preferences')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(['new_order', 'order_updates', 'returns', 'low_stock', 'new_review', 'payouts', 'listings'], $data->keys()->all());
        $this->assertTrue($data['new_order']['app'] && $data['new_order']['email']);
        $this->assertFalse($data['low_stock']['email']);
        $this->assertFalse($data['new_review']['email']);

        $this->putJson('/api/v1/seller/notification-preferences', ['preferences' => ['new_order' => ['email' => false], 'low_stock' => ['app' => false, 'email' => true]]])
            ->assertOk()->assertJsonPath('message', 'Notification settings saved.');
        $data = collect($this->getJson('/api/v1/seller/notification-preferences')->json('data'))->keyBy('key');
        $this->assertSame([true, false], [$data['new_order']['app'], $data['new_order']['email']]);
        $this->assertSame([false, true], [$data['low_stock']['app'], $data['low_stock']['email']]);

        $this->putJson('/api/v1/seller/notification-preferences', ['preferences' => ['promotions' => ['email' => true]]])->assertStatus(422);
        $this->putJson('/api/v1/seller/notification-preferences', ['preferences' => ['new_order' => ['email' => 'maybe']]])->assertStatus(422);
    }

    public function test_the_bell_and_email_follow_the_settings(): void
    {
        Mail::fake();
        [$buyer, $addr, $seller, $variant] = $this->shop(stock: 6);
        $bell = fn (string $kind) => $seller->notifications()->where('type', $kind)->count();

        // Defaults: a new COD order reaches the bell and the inbox.
        Sanctum::actingAs($buyer);
        $this->place($addr, $variant);
        $this->assertSame(1, $bell('order.new'));
        $this->assertSame(1, $this->mailsTo($seller, 'seller_new_order'));
        // Stock 6 → 5: the low-stock alert reaches the bell; its email is off by default.
        $this->assertSame(1, $bell('stock.low'));
        $this->assertSame(0, $this->mailsTo($seller, 'stock_low'));

        // New orders: bell off, email on.
        Sanctum::actingAs($seller);
        $this->putJson('/api/v1/seller/notification-preferences', ['preferences' => ['new_order' => ['app' => false, 'email' => true]]])->assertOk();
        Sanctum::actingAs($buyer);
        $this->place($addr, $variant);
        $this->assertSame(1, $bell('order.new'));
        $this->assertSame(2, $this->mailsTo($seller, 'seller_new_order'));

        // Order updates: email off, bell on. A cancellation by the buyer notifies the bell only.
        Sanctum::actingAs($seller);
        $this->putJson('/api/v1/seller/notification-preferences', ['preferences' => ['order_updates' => ['email' => false]]])->assertOk();
        Sanctum::actingAs($buyer);
        $id = $this->place($addr, $variant)['data']['id'];
        $this->postJson("/api/v1/buyer/orders/{$id}/cancel", ['reason' => 'Changed my mind'])->assertOk();
        $this->assertTrue($seller->notifications()->where('type', 'order.status')->where('data->title', 'Order cancelled')->exists());
        $this->assertSame(0, $this->mailsTo($seller, 'seller_order_cancelled'));
    }

    public function test_a_wallet_order_reaches_the_seller_when_paid_and_reviews_reach_the_bell(): void
    {
        Mail::fake();
        [$buyer, $addr, $seller, $variant] = $this->shop();

        Sanctum::actingAs($buyer);
        $res = $this->place($addr, $variant, 'e_wallet');
        $this->assertSame(0, $seller->notifications()->whereIn('type', ['order.new', 'order.paid'])->count());
        $this->assertSame(0, $this->mailsTo($seller, 'seller_new_order'));
        $this->postJson("/api/v1/payments/sessions/{$res['payment']['token']}/complete", ['outcome' => 'success'])->assertOk();
        $this->assertSame(1, $seller->notifications()->where('type', 'order.paid')->count());
        $this->assertSame(1, $this->mailsTo($seller, 'seller_new_order'));

        // A review of a completed order reaches the seller's bell (its email is off by default).
        $order = Order::find($res['data']['id']);
        $order->update(['status' => OrderStatus::OUT_FOR_DELIVERY->value]);
        app(OrderStateMachine::class)->transition($order->fresh(), OrderStatus::DELIVERED, 'admin', null, 'Delivered');
        app(OrderStateMachine::class)->transition($order->fresh(), OrderStatus::COMPLETED, 'admin', null, 'Completed');
        $this->postJson('/api/v1/buyer/reviews', ['order_id' => $order->id, 'product_id' => $variant->product_id, 'rating' => 5, 'comment' => 'Sturdy bag, neat stitching.'])
            ->assertCreated();
        $review = $seller->notifications()->where('type', 'review.new')->first();
        $this->assertNotNull($review);
        $this->assertSame('New 5-star review', $review->data['title']);
        $this->assertStringContainsString('Sturdy bag', $review->data['body']);
        $this->assertSame(0, $this->mailsTo($seller, 'review_new'));
    }
}
