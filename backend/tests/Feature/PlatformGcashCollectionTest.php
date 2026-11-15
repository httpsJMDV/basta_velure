<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Services\Payments\GcashReview;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsCommerce;
use Tests\TestCase;

class PlatformGcashCollectionTest extends TestCase
{
    use BuildsCommerce, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payments.gcash_collection_mode' => 'platform']);
        Storage::fake('ids');
        PlatformSetting::updateOrCreate(['key' => 'platform_gcash_number'], ['value' => '09171234567']);
        PlatformSetting::updateOrCreate(['key' => 'platform_gcash_name'], ['value' => 'Loved IT Test']);
    }

    private function checkout(bool $two = true): array
    {
        $buyer = $this->buyer();
        $seller = $this->seller('Central payment shop', $this->qc);
        [, $v] = $this->product($seller, 'Basket', ['Default' => [450, 20]], .8);
        $address = $this->address($buyer, $this->qc);
        $items = [['variant_id' => $v['Default']->id, 'quantity' => 1]];
        if ($two) {
            $s2 = $this->seller('Second shop', $this->qc);
            [, $v2] = $this->product($s2, 'Other basket', ['Default' => [300, 20]], .5);
            $items[] = ['variant_id' => $v2['Default']->id, 'quantity' => 1];
        }
        Sanctum::actingAs($buyer);
        return [$buyer, $seller, ['address_id' => $address->id, 'items' => $items, 'payment_method' => 'gcash',
            'gcash' => [0 => ['reference' => '1234567890123']], 'gcash_proof' => [0 => UploadedFile::fake()->image('receipt.png')]]];
    }

    private function admin(): User
    {
        $admin = $this->buyer(); $admin->forceFill(['role' => 'admin'])->save(); Sanctum::actingAs($admin);
        return $admin;
    }

    public function test_new_central_checkout_uses_one_receipt_and_cannot_be_confirmed_by_seller(): void
    {
        [$buyer, $seller, $payload] = $this->checkout();
        $orders = collect($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('orders'));
        $this->assertCount(2, $orders);
        $rows = Order::whereIn('id', $orders->pluck('id'))->get();
        $this->assertCount(1, $rows->pluck('payment_proof_path')->unique());
        foreach ($rows as $o) {
            $this->assertTrue($o->isPlatformGcash());
            $this->assertSame('09171234567', $o->collection_payee['number']);
            $this->assertSame('pending_release', $o->items()->first()->payout_status);
        }
        $o = $rows->first(fn ($r) => (int) $r->items()->value('seller_id') === $seller->id); Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$o->id}/confirm-payment")->assertUnprocessable();
        $this->postJson("/api/v1/seller/orders/{$o->id}/reject-payment", ['reason' => 'Not received in the account'])->assertForbidden();
        $this->assertSame('pending_verification', $o->fresh()->payment_status);
        $admin = $this->admin();
        $total = $rows->sum(fn ($r) => (float) $r->total);
        $url = "/api/v1/admin/payments/orders/{$o->id}/confirm-gcash";
        $this->postJson($url, ['reference' => '1234567890123', 'received_amount' => $o->total, 'received_in_gcash' => true])->assertUnprocessable();
        $this->postJson($url, ['reference' => '1234567890123', 'received_amount' => $total, 'received_in_gcash' => true])->assertOk();
        foreach ($rows as $r) $this->assertSame('paid', $r->fresh()->payment_status);
        $stamp = $o->fresh()->payment_verified_at->toIso8601String();
        $this->postJson($url, ['reference' => '1234567890123', 'received_amount' => $total, 'received_in_gcash' => true])->assertOk();
        $this->assertSame($stamp, $o->fresh()->payment_verified_at->toIso8601String());
        $this->assertSame(1, DB::table('platform_gcash_references')->where('reference', '1234567890123')->count());
        Sanctum::actingAs($seller);
        $this->postJson("/api/v1/seller/orders/{$o->id}/confirm-payment")->assertOk();
        $this->assertSame(OrderStatus::CONFIRMED, $o->fresh()->status);
    }

    public function test_unconfigured_collection_fails_closed_without_order(): void
    {
        [$buyer, , $payload] = $this->checkout(false);
        PlatformSetting::where('key', 'platform_gcash_number')->update(['value' => null]);
        $this->postJson('/api/v1/checkout/place-order', $payload)->assertUnprocessable();
        $this->assertSame(0, Order::where('buyer_id', $buyer->id)->count());
    }

    public function test_late_receipt_on_cancelled_order_opens_platform_refund_without_reopening(): void
    {
        [, , $payload] = $this->checkout(false);
        $id = $this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id');
        $o = Order::findOrFail($id);
        app(\App\Services\Commerce\OrderCanceller::class)->cancel($o, 'buyer', $o->buyer_id, 'No longer needed');
        app(GcashReview::class)->confirm($o->fresh(), $this->admin(), '1234567890123', $o->total);
        $o->refresh();
        $this->assertSame(OrderStatus::CANCELLED, $o->status);
        $this->assertSame('platform', $o->refund->payer);
        $this->assertSame('pending', $o->refund_status);
        $this->assertFalse(\App\Services\Commerce\ManualRefunds::present($o->refund, 'seller')['can_send']);
    }

    public function test_reference_cannot_credit_two_independent_checkouts(): void
    {
        [, , $payload] = $this->checkout(false);
        $one = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id'));
        [, , $secondPayload] = $this->checkout(false);
        $two = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $secondPayload)->assertCreated()->json('data.id'));
        $admin = $this->admin();
        app(GcashReview::class)->confirm($one, $admin, '1234567890123', $one->total);
        $this->postJson("/api/v1/admin/payments/orders/{$two->id}/confirm-gcash", ['reference' => '1234567890123', 'received_amount' => $two->total, 'received_in_gcash' => true])->assertUnprocessable();
        $this->assertSame('pending_verification', $two->fresh()->payment_status);
    }

    public function test_unpaid_central_order_cannot_bypass_state_machine_or_old_admin_route(): void
    {
        [, , $payload] = $this->checkout(false);
        $o = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id'));
        $this->admin();
        $this->patchJson('/api/v1/admin/payments/'.$o->payment->id.'/mark-paid')->assertUnprocessable();
        try { app(\App\Services\OrderStateMachine::class)->transition($o, OrderStatus::CONFIRMED, 'admin'); $this->fail('Unverified funds were accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        $this->assertSame(OrderStatus::PLACED, $o->fresh()->status);
    }

    public function test_correcting_a_receipt_updates_the_group_and_rejects_stale_admin_approval(): void
    {
        [$buyer, , $payload] = $this->checkout();
        $id = $this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id');
        $o = Order::findOrFail($id); $admin = $this->admin();
        app(GcashReview::class)->reject($o, $admin, '1234567890123', 'Please correct the reference on your receipt');
        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$id}/gcash-receipt", ['reference' => '2234567890123', 'receipt' => UploadedFile::fake()->image('correct.png')])->assertOk();
        $rows = Order::where('checkout_group_id', $o->checkout_group_id)->get();
        $this->assertSame(['2234567890123'], $rows->pluck('payment_reference')->unique()->values()->all());
        $this->assertSame(['pending_verification'], $rows->pluck('payment_status')->unique()->values()->all());
        $this->admin();
        $this->postJson("/api/v1/admin/payments/orders/{$id}/confirm-gcash", ['reference' => '1234567890123', 'received_amount' => $rows->sum('total'), 'received_in_gcash' => true])->assertConflict();
    }

    public function test_manual_payout_cannot_complete_without_reference_or_be_rejected_after_sent(): void
    {
        [, $seller] = $this->checkout(false);
        $p = \App\Models\PayoutRequest::create(['seller_id' => $seller->id, 'reference_code' => 'PO-'.uniqid(), 'amount' => 100,
            'gcash_number' => '09171111111', 'gcash_name' => 'Seller Test', 'status' => 'pending', 'manual_reference_required' => true]);
        $this->admin(); $url = '/api/v1/admin/payouts/'.$p->id;
        $this->postJson($url.'/complete')->assertConflict();
        $this->postJson($url.'/mark-sent')->assertUnprocessable();
        $this->postJson($url.'/mark-sent', ['transfer_reference' => '3334567890123'])->assertOk();
        $this->postJson($url.'/mark-sent', ['transfer_reference' => '3334567890123'])->assertOk();
        $this->postJson($url.'/reject', ['reason' => 'This must not restore an already sent balance'])->assertConflict();
        $this->assertSame('processing', $p->fresh()->status);
        $this->postJson($url.'/complete')->assertOk();
        $this->assertSame('completed', $p->fresh()->status);
        $this->assertSame('3334567890123', $p->fresh()->transfer_reference);
    }

    public function test_courier_shipping_is_funded_once_and_only_its_company_can_confirm(): void
    {
        [, $seller, $payload] = $this->checkout(false);
        $o = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id'));
        $admin = $this->admin(); app(GcashReview::class)->confirm($o, $admin, '1234567890123', $o->total);
        $company = \App\Models\LogisticsCompany::findOrFail($o->logistics_company_id);
        $company->update(['gcash_number' => '09175555555', 'gcash_name' => 'Courier Test']);
        \App\Models\Parcel::create(['tracking_number' => 'LIT-'.uniqid(), 'order_id' => $o->id, 'seller_id' => $seller->id,
            'logistics_company_id' => $company->id, 'status' => 'DELIVERED', 'delivered_at' => now()]);
        $url = '/api/v1/admin/platform-funding/companies/'.$company->id;
        $send = ['reference' => '4444567890123', 'amount' => $o->courierFeeAmount(), 'order_ids' => [$o->id], 'receipt' => UploadedFile::fake()->image('funding.png')];
        $id = $this->postJson($url, $send)->assertCreated()->json('data.id');
        $this->postJson($url, $send)->assertConflict();
        $this->assertSame(1, DB::table('platform_courier_funding_orders')->where('order_id', $o->id)->count());
        $courier = $this->buyer();
        \App\Models\LogisticsCompanyMember::create(['logistics_company_id' => $company->id, 'user_id' => $courier->id, 'role' => 'owner']);
        Sanctum::actingAs($courier);
        $this->postJson("/api/v1/logistics/platform-funding/{$id}/confirm", ['received_in_gcash' => true])->assertOk();
        $this->assertNotNull(DB::table('platform_courier_fundings')->where('id', $id)->value('confirmed_at'));
        Sanctum::actingAs($seller);
        $this->getJson('/api/v1/logistics/platform-funding')->assertForbidden();
    }

    public function test_seller_funded_free_shipping_reduces_net_once_and_preserves_commission(): void
    {
        [, $seller, $payload] = $this->checkout(false);
        $seller->sellerProfile->update(['free_delivery_min' => 1]);
        $o = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id'));
        $this->assertTrue((bool) $o->free_delivery);
        $this->assertSame(0.0, (float) $o->shipping_fee);
        $this->assertEquals($o->courierFeeAmount(), (float) $o->seller_shipping_charge);
        $items = $o->items;
        $this->assertEqualsWithDelta(450 - $items->sum('commission_amount') - $o->courierFeeAmount(), $items->sum('seller_earnings'), .001);
        $this->assertSame('platform', $o->settlement);
    }

    public function test_platform_refund_requires_admin_actual_transfer_and_new_reference_for_resend(): void
    {
        [$buyer, $seller, $payload] = $this->checkout(false);
        $o = Order::findOrFail($this->postJson('/api/v1/checkout/place-order', $payload)->assertCreated()->json('data.id'));
        $admin = $this->admin(); app(GcashReview::class)->confirm($o, $admin, '1234567890123', $o->total);
        app(\App\Services\Commerce\OrderCanceller::class)->cancel($o->fresh(), 'admin', $admin->id, 'Requested cancellation');
        $refund = $o->fresh()->refund;
        Sanctum::actingAs($buyer);
        $this->putJson("/api/v1/buyer/orders/{$o->id}/refund/account", ['gcash_number' => '09176666666', 'gcash_name' => 'Juan Dela Cruz'])->assertOk();
        Sanctum::actingAs($seller);
        $send = ['reference' => '5554567890123', 'receipt' => UploadedFile::fake()->image('refund.png')];
        $this->postJson("/api/v1/seller/orders/{$o->id}/refund/sent", $send)->assertNotFound();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/resolve", ['decision' => 'received', 'note' => 'Cannot mark a transfer that was never sent'])->assertConflict();
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/sent", $send)->assertOk();
        Sanctum::actingAs($buyer);
        $this->postJson("/api/v1/buyer/orders/{$o->id}/refund/report", ['note' => 'Nothing arrived in my GCash account'])->assertOk();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/resolve", ['decision' => 'send_again', 'note' => 'Verified missing transfer and agreed to resend'])->assertOk();
        $this->postJson("/api/v1/admin/refunds/{$refund->id}/sent", $send)->assertUnprocessable();
    }
}
