<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Models\AdminActivityLog;
use App\Models\DeliveryLog;
use App\Models\Order;
use App\Models\Rider;
use App\Models\User;
use App\Services\Ai\AiModel;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsEscrowOrders;
use Tests\Support\FakeAiModel;
use Tests\TestCase;

class AdminBuyerRiskTest extends TestCase
{
    use BuildsEscrowOrders, DatabaseTransactions;

    private User $admin;

    private User $buyer;

    private FakeAiModel $ai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser('admin');
        $this->buyer = $this->makeUser('buyer');
        $this->ai = new FakeAiModel;
        $this->app->instance(AiModel::class, $this->ai);
        Sanctum::actingAs($this->admin);
    }

    private function url(string $suffix = ''): string
    {
        return '/api/v1/admin/buyer-risk/'.$this->buyer->id.$suffix;
    }

    private function riskOrder(array $overrides = []): Order
    {
        return Order::forceCreate(array_merge([
            'buyer_id' => $this->buyer->id, 'order_number' => 'RISK-'.uniqid(),
            'subtotal' => 100, 'shipping_fee' => 10, 'total' => 110, 'status' => 'PLACED',
            'payment_method' => 'cod', 'payment_status' => 'pending',
        ], $overrides));
    }

    public function test_every_endpoint_requires_an_admin(): void
    {
        $order = $this->riskOrder();
        Sanctum::actingAs($this->buyer);
        $this->getJson('/api/v1/admin/buyer-risk')->assertForbidden();
        $this->getJson($this->url())->assertForbidden();
        $this->postJson($this->url('/analyze'))->assertForbidden();
        $this->postJson($this->url('/orders/'.$order->id.'/cancel'), [])->assertForbidden();
        $this->assertSame('PLACED', $order->fresh()->status->value);
    }

    public function test_scores_exclude_seller_cancellations_old_deleted_orders_and_multi_shop_checkout_duplicates(): void
    {
        foreach (range(1, 3) as $i) {
            $this->riskOrder(['status' => 'CANCELLED', 'cancelled_by' => 'buyer', 'checkout_group_id' => 'shared']);
        }
        $this->riskOrder(['status' => 'CANCELLED', 'cancelled_by' => 'seller', 'checkout_group_id' => 'shared']);
        $this->riskOrder(['created_at' => now()->subDays(31), 'status' => 'CANCELLED', 'cancelled_by' => 'buyer']);
        $this->riskOrder(['status' => 'CANCELLED', 'cancelled_by' => 'buyer'])->delete();

        $this->getJson($this->url())->assertOk()->assertJsonPath('data.score', 35)
            ->assertJsonPath('data.order_count', 4)->assertJsonPath('data.buyer_cancellations', 3)
            ->assertJsonPath('data.hourly_checkouts', 1)->assertJsonPath('data.level', 'medium');
        $response = $this->getJson('/api/v1/admin/buyer-risk?search='.urlencode($this->buyer->email))->assertOk();
        $response->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->buyer->id);
        $this->getJson('/api/v1/admin/buyer-risk?level=high&search='.urlencode($this->buyer->email))->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/buyer-risk?level=invalid')->assertUnprocessable();
        $this->getJson('/api/v1/admin/buyer-risk?page=0')->assertUnprocessable();
    }

    public function test_seller_cancellations_do_not_flag_buyers(): void
    {
        foreach (range(1, 3) as $i) {
            $this->riskOrder(['status' => 'CANCELLED', 'cancelled_by' => 'seller']);
        }
        $this->getJson($this->url())->assertJsonPath('data.score', 0)->assertJsonCount(0, 'data.signals');
        $this->getJson('/api/v1/admin/buyer-risk?search='.urlencode($this->buyer->email))->assertJsonCount(0, 'data');
    }

    public function test_refusals_count_distinct_parcels_and_honor_cod_restoration(): void
    {
        $rider = Rider::forceCreate(['user_id' => $this->makeUser('rider')->id, 'vehicle_type' => 'motorcycle', 'status' => 'ACTIVE']);
        foreach (range(1, 2) as $i) {
            $order = $this->makeOrder(OrderStatus::DELIVERY_FAILED, buyer: $this->buyer);
            foreach (range(1, 2) as $attempt) {
                DeliveryLog::create(['parcel_id' => $order->parcel->id, 'rider_id' => $rider->id, 'outcome' => 'DELIVERY_FAILED',
                    'notes' => 'REFUSED: Recipient declined.', 'logged_at' => now()->subMinutes(10)]);
            }
            DeliveryLog::create(['parcel_id' => $order->parcel->id, 'rider_id' => $rider->id, 'outcome' => 'DELIVERY_FAILED',
                'notes' => 'RECIPIENT_UNAVAILABLE: Not home.', 'logged_at' => now()]);
        }
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.refused_parcels', 2)
            ->assertJsonPath('data.score', 40)->assertJsonPath('data.level', 'high');
        $this->buyer->forceFill(['cod_refusals_reset_at' => now()])->save();
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.refused_parcels', 0)->assertJsonPath('data.score', 0);
    }

    public function test_separate_checkout_bursts_and_failed_payments_add_signals(): void
    {
        foreach (range(1, 5) as $i) {
            $this->riskOrder(['payment_status' => 'failed']);
        }
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.score', 25)
            ->assertJsonPath('data.hourly_checkouts', 5)->assertJsonCount(2, 'data.signals');
    }

    public function test_ai_uses_only_anonymous_aggregate_facts_is_cached_and_cannot_change_orders(): void
    {
        $order = $this->riskOrder();
        $this->ai->queue(FakeAiModel::text('{"summary":"No evidence of abuse.","checks":["Contact the buyer if you need more context."]}'));
        $this->postJson($this->url('/analyze'))->assertOk()->assertJsonPath('data.summary', 'No evidence of abuse.');
        $this->postJson($this->url('/analyze'))->assertOk();
        $this->assertCount(1, $this->ai->calls);
        $payload = json_encode($this->ai->calls[0]);
        $this->assertStringNotContainsString($this->buyer->email, $payload);
        $this->assertStringNotContainsString($order->order_number, $payload);
        $this->assertArrayNotHasKey('tools', $this->ai->calls[0]);
        $this->assertSame('PLACED', $order->fresh()->status->value);
    }

    public function test_ai_outages_and_malformed_replies_leave_manual_review_available(): void
    {
        $this->riskOrder();
        $this->ai->available = false;
        $this->postJson($this->url('/analyze'))->assertStatus(503);
        $this->ai->available = true;
        $this->ai->queue(FakeAiModel::text('{"summary":[],"checks":{}}'));
        $this->postJson($this->url('/analyze'))->assertStatus(503);
        $this->getJson($this->url())->assertOk();
    }

    public function test_cancellation_requires_confirmation_ownership_and_a_reason_then_restores_stock_and_refunds_once(): void
    {
        $order = $this->makeOrder(OrderStatus::PLACED, buyer: $this->buyer, payment: 'card');
        $order->forceFill(['payment_status' => 'paid'])->save();
        $url = $this->url('/orders/'.$order->id.'/cancel');
        $payload = ['reason' => 'Buyer confirmed this duplicate order.', 'confirmed' => true];
        $this->postJson($url, ['reason' => 'x', 'confirmed' => false])->assertUnprocessable();
        $this->postJson($url, ['reason' => str_repeat(' ', 15), 'confirmed' => true])->assertUnprocessable();
        $other = $this->makeUser('buyer');
        $this->postJson('/api/v1/admin/buyer-risk/'.$other->id.'/orders/'.$order->id.'/cancel', $payload)->assertNotFound();
        $this->postJson($url, $payload)->assertOk();
        $fresh = $order->fresh();
        $this->assertSame('CANCELLED', $fresh->status->value);
        $this->assertSame('admin', $fresh->cancelled_by);
        $this->assertSame('refunded', $fresh->payment_status);
        $this->assertEquals($order->total, $fresh->refund_amount);
        $this->assertNotNull($fresh->items->first()->stock_restored_at);
        $this->assertDatabaseHas('admin_activity_logs', ['admin_id' => $this->admin->id, 'action' => 'buyer_risk.cancel_order', 'target_id' => $order->id]);
        $this->postJson($url, $payload)->assertConflict();
        $this->assertSame(1, AdminActivityLog::where('action', 'buyer_risk.cancel_order')->where('target_id', $order->id)->count());
        $this->assertSame(1, $fresh->statusHistories()->where('to_status', 'CANCELLED')->count());
    }

    public function test_picked_up_and_delivered_orders_cannot_be_cancelled_here(): void
    {
        foreach ([OrderStatus::PICKED_UP, OrderStatus::DELIVERED, OrderStatus::COMPLETED] as $status) {
            $order = $this->riskOrder(['status' => $status->value]);
            $this->postJson($this->url('/orders/'.$order->id.'/cancel'), ['reason' => 'Reviewed the order evidence.', 'confirmed' => true])->assertConflict();
            $this->assertSame($status, $order->fresh()->status);
        }
        $this->getJson('/api/v1/admin/buyer-risk/'.$this->admin->id)->assertNotFound();
    }
}
