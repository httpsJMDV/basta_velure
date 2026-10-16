<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Mail\NoticeMail;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\SellerProfile;
use App\Models\User;
use App\Services\MailNotifier;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The transactional notices sent through MailNotifier: who receives which email, that they render in the branded
 * layout with escaped content and the configured links, and that the admin actions send them.
 */
class TransactionalNoticeTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['app.frontend_url' => 'https://shop.example.test']);
    }

    private function user(string $role = 'buyer', string $first = 'Ana'): User
    {
        return User::forceCreate([
            'first_name' => $first, 'last_name' => 'Cruz', 'email' => strtolower($first) . '.' . uniqid() . '@example.com',
            'password' => Hash::make('Password123!'), 'role' => $role, 'status' => 'active',
        ]);
    }

    /** An unsaved order with its buyer and one seller's item, enough for the notifier to describe it. */
    private function order(User $buyer, User $seller, string $method = 'cod'): Order
    {
        $seller->setRelation('sellerProfile', new SellerProfile(['shop_name' => 'Marco Gadgets']));
        $item = new OrderItem(['product_name' => 'Classic Tee', 'variant_label' => 'Large', 'quantity' => 2, 'subtotal' => 398]);
        $item->setRelation('seller', $seller);
        $order = new Order([
            'order_number' => 'VEL-TEST-1', 'subtotal' => 398, 'shipping_fee' => 50, 'total' => 448, 'payment_method' => $method,
            'shipping_address' => '1 Rizal St', 'shipping_city' => 'Santa Cruz', 'shipping_province' => 'Laguna',
        ]);
        $order->setRelation('buyer', $buyer);
        $order->setRelation('items', collect([$item]));
        $order->setRelation('parcel', null);

        return $order;
    }

    public function test_a_notice_renders_in_the_branded_layout_with_escaped_content_and_links(): void
    {
        $mail = new NoticeMail('Subject', [
            'recipientName' => '<Ana>',
            'tone' => 'danger',
            'label' => 'Product not approved',
            'title' => 'Your product needs changes.',
            'paragraphs' => ['We could not approve it.'],
            'highlight' => ['title' => 'Review feedback', 'body' => '<script>x</script>'],
            'items' => [['name' => 'Classic Tee', 'meta' => 'Qty 2', 'amount' => '₱398.00']],
            'totals' => ['Items' => '₱398.00', 'Total' => '₱448.00'],
            'details' => ['Order' => 'VEL-1'],
            'actionUrl' => 'https://shop.example.test/seller/products',
            'actionLabel' => 'Edit product',
        ]);

        $mail->assertSeeInHtml('#C0001A');
        $mail->assertSeeInHtml('alt="Loved-IT"', false);
        $mail->assertSeeInHtml('&lt;Ana&gt;', false);
        $mail->assertSeeInHtml('&lt;script&gt;x&lt;/script&gt;', false);
        $mail->assertDontSeeInHtml('<script>', false);
        $mail->assertSeeInHtml('Your product needs changes.');
        $mail->assertSeeInHtml('₱448.00');
        $mail->assertSeeInHtml('https://shop.example.test/seller/products');
        $mail->assertSeeInText('Review feedback');
        $mail->assertSeeInText('Edit product: https://shop.example.test/seller/products');
        $mail->assertSeeInText('The Loved-IT Team');
    }

    public function test_a_checkout_sends_the_buyer_a_receipt_and_each_seller_a_new_order(): void
    {
        Mail::fake();
        $buyer = $this->user('buyer', 'Ana');
        $seller = $this->user('buyer', 'Marco');

        app(MailNotifier::class)->ordersPlaced([$this->order($buyer, $seller)]);

        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($buyer->email) && $m->kind === 'order_placed'
            && str_contains($m->render(), '₱448.00') && str_contains($m->render(), 'Classic Tee'));
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email) && $m->kind === 'seller_new_order');
        Mail::assertQueuedCount(2);
    }

    public function test_status_changes_tell_the_buyer_and_seller_only_what_concerns_them(): void
    {
        Mail::fake();
        $buyer = $this->user('buyer', 'Ana');
        $seller = $this->user('buyer', 'Marco');
        $order = $this->order($buyer, $seller);
        $notifier = app(MailNotifier::class);

        $notifier->orderStatusChanged($order, 'PLACED', OrderStatus::CONFIRMED->value);
        $notifier->orderStatusChanged($order, 'ASSIGNED_TO_RIDER', OrderStatus::OUT_FOR_DELIVERY->value);
        $notifier->orderStatusChanged($order, 'OUT_FOR_DELIVERY', OrderStatus::DELIVERED->value);
        // Internal hub steps send nothing.
        $notifier->orderStatusChanged($order, 'PICKED_UP', OrderStatus::AT_SORTING_CENTER->value);
        $notifier->orderStatusChanged($order, 'AT_SORTING_CENTER', OrderStatus::SORTED->value);
        // An accepted return is told by its own email, not as a failed delivery.
        $notifier->orderStatusChanged($order, OrderStatus::DISPUTED->value, OrderStatus::RETURNED->value);

        $kinds = Mail::queued(NoticeMail::class)->map(fn (NoticeMail $m) => ($m->hasTo($buyer->email) ? 'buyer:' : 'seller:') . $m->kind)->sort()->values()->all();
        $this->assertSame([
            'buyer:order_confirmed',
            'buyer:order_delivered',
            'buyer:order_out_for_delivery',
            'seller:seller_order_delivered',
        ], $kinds);
    }

    public function test_muted_work_sends_nothing(): void
    {
        Mail::fake();
        $buyer = $this->user();

        MailNotifier::muted(fn () => app(MailNotifier::class)->accountSuspended($buyer));
        Mail::assertNothingQueued();

        app(MailNotifier::class)->accountSuspended($buyer);
        Mail::assertQueuedCount(1);
    }

    public function test_admin_suspend_and_reactivate_email_the_account(): void
    {
        Mail::fake();
        $admin = $this->user('admin', 'Admin');
        $buyer = $this->user('buyer', 'Ana');
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/users/{$buyer->id}/suspend")->assertOk();
        $this->patchJson("/api/v1/admin/users/{$buyer->id}/reactivate")->assertOk();

        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($buyer->email) && $m->kind === 'account_suspended');
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($buyer->email) && $m->kind === 'account_reactivated');
    }

    public function test_admin_product_decisions_email_the_seller_with_the_reason(): void
    {
        Mail::fake();
        $admin = $this->user('admin', 'Admin');
        $seller = $this->user('buyer', 'Marco');
        $approve = Product::forceCreate(['seller_id' => $seller->id, 'name' => 'Koka Tota', 'base_price' => 42, 'status' => 'pending_review']);
        $reject = Product::forceCreate(['seller_id' => $seller->id, 'name' => 'Blurry Tee', 'base_price' => 99, 'status' => 'pending_review']);
        Sanctum::actingAs($admin);

        $this->postJson("/api/v1/admin/products/{$approve->id}/approve")->assertOk();
        $this->postJson("/api/v1/admin/products/{$reject->id}/reject", ['reason' => 'Photos are blurry'])->assertOk();

        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email) && $m->kind === 'product_approved'
            && str_contains($m->render(), 'https://shop.example.test/products/' . $approve->id));
        Mail::assertQueued(NoticeMail::class, fn (NoticeMail $m) => $m->hasTo($seller->email) && $m->kind === 'product_rejected'
            && str_contains($m->render(), 'Photos are blurry'));
    }
}
