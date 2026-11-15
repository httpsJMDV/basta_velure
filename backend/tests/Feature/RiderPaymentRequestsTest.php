<?php

namespace Tests\Feature;

use App\Models\LogisticsCompany;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\RiderPaymentRequest;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\BuildsEscrowOrders;
use Tests\TestCase;

class RiderPaymentRequestsTest extends TestCase
{
    use BuildsEscrowOrders, DatabaseTransactions;

    private LogisticsCompany $company;

    private User $courier;

    private User $hubUser;

    private SortingCenter $hub;

    private Rider $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        Storage::fake('ids');
        $code = strtoupper(substr(uniqid(), -6));
        $this->company = LogisticsCompany::create(['name' => 'Payment Courier '.$code, 'code' => $code, 'slug' => strtolower($code), 'status' => 'APPROVED']);
        $this->courier = $this->makeUser('buyer', 'Courier');
        LogisticsCompanyMember::create(['logistics_company_id' => $this->company->id, 'user_id' => $this->courier->id, 'role' => 'owner']);
        $this->hubUser = $this->makeUser('buyer', 'Hub');
        $this->hub = SortingCenter::forceCreate(['user_id' => $this->hubUser->id, 'hub_name' => 'Payment Hub '.$code,
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '1 Hub St',
            'logistics_company_id' => $this->company->id, 'status' => SortingCenter::STATUS_APPROVED]);
        $this->rider = Rider::forceCreate(['user_id' => $this->makeUser('rider')->id, 'sorting_center_id' => $this->hub->id,
            'logistics_company_id' => $this->company->id, 'vehicle_type' => 'Motorcycle', 'status' => Rider::STATUS_ACTIVE,
            'gcash_name' => 'Juan Rider', 'gcash_number' => '09171234567']);
        Sanctum::actingAs($this->rider->user);
    }

    private function earn(string $amount = '100.25', ?int $company = null): RiderEarning
    {
        $order = $this->makeOrder(parcelOverrides: ['logistics_company_id' => $company ?? $this->company->id]);

        return RiderEarning::create(['rider_id' => $this->rider->id, 'parcel_id' => $order->parcel->id, 'kind' => 'pickup', 'amount' => $amount, 'earned_at' => now()]);
    }

    private function trip(string $status = 'completed', string $amount = '120.50'): TruckTrip
    {
        return TruckTrip::create(['code' => 'TRK-'.uniqid(), 'logistics_company_id' => $this->company->id,
            'from_hub_id' => $this->hub->id, 'to_hub_id' => $this->hub->id, 'driver_id' => $this->rider->id,
            'status' => $status, 'parcel_count' => 1, 'pay_amount' => $amount, 'departed_at' => now(),
            'completed_at' => $status === 'completed' ? now() : null]);
    }

    private function requestPayment(bool $claim = true): RiderPaymentRequest
    {
        Sanctum::actingAs($this->rider->user);
        $summary = $this->getJson('/api/v1/rider/payment-requests')->assertOk()->json('summary');
        $id = $this->postJson('/api/v1/rider/payment-requests', ['confirmed' => true, 'expected_amount' => $summary['available'],
            'expected_gcash_number' => $summary['gcash_number'], 'expected_gcash_name' => $summary['gcash_name']])->assertCreated()->json('data.id');
        if ($claim) {
            Sanctum::actingAs($this->courier);
            $this->postJson('/api/v1/logistics/rider-payment-requests/'.$id.'/claim')->assertOk();
            Sanctum::actingAs($this->rider->user);
        }

        return RiderPaymentRequest::findOrFail($id);
    }

    private function transfer(string $reference = '1234567890123'): array
    {
        return ['reference' => $reference, 'receipt' => UploadedFile::fake()->image('gcash.png'), 'confirmed' => true];
    }

    public function test_request_reserves_exact_cents_and_only_eligible_own_company_earnings(): void
    {
        $one = $this->earn('30.25');
        $two = $this->earn('60.75');
        $trip = $this->trip();
        $ongoing = $this->trip('on_the_way', '900.00');
        $paid = $this->earn('50.00');
        $paid->update(['paid_at' => now()]);
        $otherCompany = LogisticsCompany::create(['name' => 'Other '.uniqid(), 'code' => substr(uniqid(), -6), 'slug' => uniqid(), 'status' => 'APPROVED']);
        $foreign = $this->earn('999.00', $otherCompany->id);
        $payment = $this->requestPayment();
        $this->assertSame('211.50', $payment->amount);
        foreach ([$one, $two, $trip] as $row) {
            $this->assertEquals($payment->id, $row->fresh()->rider_payment_request_id);
        }
        foreach ([$ongoing, $paid, $foreign] as $row) {
            $this->assertNull($row->fresh()->rider_payment_request_id);
        }
        $this->getJson('/api/v1/rider/payment-requests')->assertJsonPath('summary.available', '0.00')->assertJsonPath('summary.has_open_request', true);
        $this->earn('12.34');
        $this->postJson('/api/v1/rider/payment-requests', ['confirmed' => true, 'expected_amount' => '12.34',
            'expected_gcash_number' => '09171234567', 'expected_gcash_name' => 'Juan Rider'])->assertConflict();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/payouts/riders/'.$this->rider->id, ['reference' => '9994567890123'])->assertOk();
        $this->assertNull($one->fresh()->paid_at);
        $this->assertNull($trip->fresh()->paid_at);
    }

    public function test_stale_account_amount_missing_account_and_unconfirmed_requests_are_rejected(): void
    {
        $this->earn();
        $input = ['confirmed' => true, 'expected_amount' => '100.25', 'expected_gcash_number' => '09171234567', 'expected_gcash_name' => 'Juan Rider'];
        $this->postJson('/api/v1/rider/payment-requests', array_replace($input, ['confirmed' => false]))->assertUnprocessable();
        $this->postJson('/api/v1/rider/payment-requests', array_replace($input, ['expected_amount' => '100.00']))->assertConflict();
        $this->postJson('/api/v1/rider/payment-requests', array_replace($input, ['expected_gcash_number' => '09179999999']))->assertConflict();
        $this->rider->update(['gcash_number' => null, 'gcash_name' => null]);
        $this->postJson('/api/v1/rider/payment-requests', $input)->assertUnprocessable();
        $this->assertSame(0, RiderPaymentRequest::where('rider_id', $this->rider->id)->count());
    }

    public function test_hub_and_courier_share_one_transfer_then_only_the_rider_confirms_receipt(): void
    {
        $earning = $this->earn();
        $trip = $this->trip();
        $payment = $this->requestPayment();
        $this->postJson('/api/v1/rider/payment-requests/'.$payment->id.'/confirm', ['confirmed' => true])->assertConflict();
        $this->rider->update(['gcash_number' => '09179999999']);
        $this->assertSame('09171234567', $payment->fresh()->gcash_number);
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertNotFound();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/release', ['not_sent' => true])->assertOk();
        Sanctum::actingAs($this->hubUser);
        $this->postJson('/api/v1/hub/rider-payment-requests/'.$payment->id.'/claim')->assertOk();
        $this->getJson('/api/v1/hub/rider-payment-requests')->assertOk()->assertJsonFragment(['id' => $payment->id]);
        $send = '/api/v1/hub/rider-payment-requests/'.$payment->id.'/send';
        $this->postJson($send, ['reference' => '1234567890123', 'confirmed' => true])->assertUnprocessable();
        $this->postJson($send, $this->transfer())->assertOk()->assertJsonPath('data.status', 'processing');
        $path = $payment->fresh()->receipt_path;
        Storage::disk('ids')->assertExists($path);
        $this->assertNotNull($earning->fresh()->paid_at);
        $this->assertNotNull($trip->fresh()->paid_at);
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send', $this->transfer())->assertOk();
        $this->assertSame($path, $payment->fresh()->receipt_path);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send', $this->transfer('2224567890123'))->assertConflict();
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/reject', ['note' => 'Cannot undo a sent transfer'])->assertConflict();
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertOk();
        Sanctum::actingAs($this->rider->user);
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertOk();
        $this->postJson('/api/v1/rider/payment-requests/'.$payment->id.'/report', ['note' => 'Nothing has appeared in my GCash history.'])->assertOk();
        $this->assertSame('processing', $payment->fresh()->status);
        $this->postJson('/api/v1/rider/payment-requests/'.$payment->id.'/confirm', ['confirmed' => true])->assertOk();
        $this->postJson('/api/v1/rider/payment-requests/'.$payment->id.'/confirm', ['confirmed' => true])->assertOk();
        $this->assertSame('completed', $payment->fresh()->status);
        $this->getJson('/api/v1/rider/payment-requests')->assertJsonPath('summary.available', '0.00')->assertJsonPath('summary.has_open_request', false);
    }

    public function test_rejection_releases_earnings_for_a_new_request_and_reference_cannot_pay_twice(): void
    {
        $earning = $this->earn();
        $first = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$first->id.'/reject', ['note' => 'Please correct your GCash account name.'])->assertOk();
        $this->assertNull($earning->fresh()->rider_payment_request_id);
        $this->assertNull($earning->fresh()->paid_at);
        $second = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$second->id.'/send', $this->transfer())->assertOk();
        Sanctum::actingAs($this->rider->user);
        $this->postJson('/api/v1/rider/payment-requests/'.$second->id.'/confirm', ['confirmed' => true])->assertOk();
        $this->earn('1.25');
        $third = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$third->id.'/send', $this->transfer())->assertUnprocessable();
        $this->assertSame('pending', $third->fresh()->status);
        $this->assertCount(1, Storage::disk('ids')->allFiles('rider-payment-receipts'));
    }

    public function test_other_riders_hubs_couriers_and_buyers_cannot_access_a_request_or_private_receipt(): void
    {
        $this->earn();
        $payment = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send', $this->transfer())->assertOk();
        Sanctum::actingAs($this->makeUser('buyer'));
        $this->getJson('/api/v1/rider/payment-requests')->assertForbidden();
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertNotFound();
        $otherUser = $this->makeUser('rider');
        Rider::forceCreate(['user_id' => $otherUser->id, 'sorting_center_id' => $this->hub->id, 'logistics_company_id' => $this->company->id, 'vehicle_type' => 'Motorcycle', 'status' => 'ACTIVE']);
        Sanctum::actingAs($otherUser);
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertNotFound();
        $this->postJson('/api/v1/rider/payment-requests/'.$payment->id.'/confirm', ['confirmed' => true])->assertNotFound();
        $otherHubUser = $this->makeUser('buyer');
        SortingCenter::forceCreate(['user_id' => $otherHubUser->id, 'hub_name' => 'Other hub '.uniqid(), 'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real', 'address_street' => '2 Hub St', 'status' => 'APPROVED', 'logistics_company_id' => $this->company->id]);
        Sanctum::actingAs($otherHubUser);
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertNotFound();
        $this->postJson('/api/v1/hub/rider-payment-requests/'.$payment->id.'/send', $this->transfer())->assertNotFound();
        $otherCompany = LogisticsCompany::create(['name' => 'Other '.uniqid(), 'code' => substr(uniqid(), -6), 'slug' => uniqid(), 'status' => 'APPROVED']);
        $otherCourier = $this->makeUser('buyer');
        LogisticsCompanyMember::create(['logistics_company_id' => $otherCompany->id, 'user_id' => $otherCourier->id, 'role' => 'owner']);
        Sanctum::actingAs($otherCourier);
        $this->get('/api/v1/rider-payments/'.$payment->id.'/receipt')->assertNotFound();
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send', $this->transfer())->assertNotFound();
    }

    public function test_legacy_truck_payment_cannot_pay_trip_reserved_in_a_request(): void
    {
        $this->rider->forceFill(['duty' => Rider::DUTY_TRUCK, 'vehicle_type' => 'Truck'])->save();
        $trip = $this->trip();
        $payment = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $this->postJson('/api/v1/logistics/truck-drivers/'.$this->rider->id.'/pay', ['reference' => '1114567890123'])->assertUnprocessable();
        $this->assertNull($trip->fresh()->paid_at);
        $this->postJson('/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send', $this->transfer())->assertOk();
        $this->assertSame('1234567890123', $trip->fresh()->paid_reference);
    }

    public function test_staff_must_claim_before_transfer_and_only_owner_can_release_before_sending(): void
    {
        $this->earn();
        $p = $this->requestPayment(claim: false);
        Sanctum::actingAs($this->hubUser);
        $hub = '/api/v1/hub/rider-payment-requests/'.$p->id;
        $courier = '/api/v1/logistics/rider-payment-requests/'.$p->id;
        $this->postJson($hub.'/send', $this->transfer())->assertConflict();
        $this->postJson($hub.'/claim')->assertOk();
        Sanctum::actingAs($this->courier);
        $this->postJson($courier.'/claim')->assertConflict();
        $this->postJson($courier.'/send', $this->transfer())->assertConflict();
        $this->postJson($courier.'/reject', ['note' => 'Cannot decline another person handling payment.'])->assertConflict();
        $this->postJson($courier.'/release', ['not_sent' => true])->assertConflict();
        Sanctum::actingAs($this->hubUser);
        $this->postJson($hub.'/release', ['not_sent' => false])->assertUnprocessable();
        $this->postJson($hub.'/release', ['not_sent' => true])->assertOk();
        Sanctum::actingAs($this->courier);
        $this->postJson($courier.'/claim')->assertOk();
        $this->postJson($courier.'/send', $this->transfer())->assertOk();
        $this->postJson($courier.'/release', ['not_sent' => true])->assertConflict();
    }

    public function test_old_bulk_transfer_reference_cannot_be_reused_and_new_request_reference_cannot_pay_new_bulk_rows(): void
    {
        $old = $this->earn('30.00');
        $old->update(['paid_at' => now(), 'paid_reference' => '1114567890123']);
        $this->earn();
        $payment = $this->requestPayment();
        Sanctum::actingAs($this->courier);
        $url = '/api/v1/logistics/rider-payment-requests/'.$payment->id.'/send';
        $this->postJson($url, $this->transfer('1114567890123'))->assertUnprocessable();
        $this->postJson($url, $this->transfer())->assertOk();
        $unpaid = $this->earn('5.00');
        $this->postJson('/api/v1/logistics/payouts/riders/'.$this->rider->id, ['reference' => '1234567890123'])->assertUnprocessable();
        $this->assertNull($unpaid->fresh()->paid_at);
    }
}
