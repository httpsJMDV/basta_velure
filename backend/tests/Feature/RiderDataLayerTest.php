<?php

namespace Tests\Feature;

use App\Models\DeliveryLog;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\RiderAreaAssignment;
use App\Models\RiderEarning;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RiderDataLayerTest extends TestCase
{
    use DatabaseTransactions;

    private User $hubOwner;
    private SortingCenter $hub;
    private User $riderUser;
    private Rider $rider;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hubOwner = User::forceCreate([
            'first_name' => 'Hub',
            'last_name'  => 'Owner',
            'email'      => 'hub.owner.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->hub = SortingCenter::create([
            'user_id'          => $this->hubOwner->id,
            'hub_name'         => 'Test Manila Logistics Hub',
            'address_province' => 'Metro Manila',
            'address_city'     => 'Manila',
            'status'           => SortingCenter::STATUS_APPROVED,
        ]);

        $this->riderUser = User::forceCreate([
            'first_name' => 'Juan',
            'last_name'  => 'Rider',
            'email'      => 'juan.rider.' . uniqid() . '@example.com',
            'password'   => Hash::make('RiderPass123!'),
            'role'       => 'rider',
            'status'     => 'active',
        ]);

        $this->rider = Rider::create([
            'user_id'              => $this->riderUser->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => 'motorcycle',
            'plate_number'         => 'ND-1234',
            'or_cr_path'           => 'rider_docs/or_cr.pdf',
            'drivers_license_path' => 'rider_docs/license.jpg',
            'status'               => Rider::STATUS_ACTIVE,
        ]);
    }

    public function test_rider_profile_and_user_relationship(): void
    {
        $this->assertInstanceOf(User::class, $this->rider->user);
        $this->assertEquals($this->riderUser->id, $this->rider->user->id);

        $this->assertInstanceOf(Rider::class, $this->riderUser->rider);
        $this->assertEquals($this->rider->id, $this->riderUser->rider->id);

        $this->assertInstanceOf(SortingCenter::class, $this->rider->sortingCenter);
        $this->assertEquals($this->hub->id, $this->rider->sortingCenter->id);

        $this->assertTrue($this->hub->riders->contains($this->rider));
    }

    public function test_rider_area_assignments_relationship(): void
    {
        $assignment = RiderAreaAssignment::create([
            'rider_id'           => $this->rider->id,
            'sorting_center_id'  => $this->hub->id,
            'area_label'         => 'Zone 1 - Binondo',
            'coverage_barangays' => ['Barangay 287', 'Barangay 288'],
            'is_active'          => true,
        ]);

        $this->assertTrue($this->rider->areas->contains($assignment));
        $this->assertTrue($this->rider->areaAssignments->contains($assignment));
        $this->assertInstanceOf(Rider::class, $assignment->rider);
        $this->assertEquals($this->rider->id, $assignment->rider->id);
    }

    public function test_rider_parcel_delivery_and_pickup_relationships(): void
    {
        $parcel = Parcel::create([
            'tracking_number'   => 'TRK-RL-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'assigned_rider_id' => $this->rider->id,
            'pickup_rider_id'   => $this->rider->id,
            'status'            => Parcel::STATUS_OUT_FOR_DELIVERY,
        ]);

        $this->assertTrue($this->rider->parcels->contains($parcel));
        $this->assertTrue($this->rider->pickupParcels->contains($parcel));
        $this->assertInstanceOf(Rider::class, $parcel->assignedRider);
        $this->assertEquals($this->rider->id, $parcel->assignedRider->id);
        $this->assertInstanceOf(Rider::class, $parcel->pickupRider);
        $this->assertEquals($this->rider->id, $parcel->pickupRider->id);
    }

    public function test_rider_earnings_and_delivery_logs_relationships(): void
    {
        $parcel = Parcel::create([
            'tracking_number'   => 'TRK-LOG-' . uniqid(),
            'sorting_center_id' => $this->hub->id,
            'assigned_rider_id' => $this->rider->id,
            'status'            => Parcel::STATUS_DELIVERED,
        ]);

        $earning = RiderEarning::create([
            'rider_id'  => $this->rider->id,
            'parcel_id' => $parcel->id,
            'amount'    => 75.50,
            'earned_at' => now(),
            'notes'     => 'Completed standard dropoff',
        ]);

        $log = DeliveryLog::create([
            'parcel_id' => $parcel->id,
            'rider_id'  => $this->rider->id,
            'outcome'   => DeliveryLog::OUTCOME_DELIVERED,
            'logged_at' => now(),
            'notes'     => 'Customer signed proof of delivery',
        ]);

        // Verify Rider relations
        $this->assertTrue($this->rider->earnings->contains($earning));
        $this->assertTrue($this->rider->deliveryLogs->contains($log));
        $this->assertInstanceOf(Rider::class, $earning->rider);
        $this->assertInstanceOf(Rider::class, $log->rider);

        // Verify Parcel relations
        $this->assertTrue($parcel->earnings->contains($earning));
        $this->assertTrue($parcel->deliveryLogs->contains($log));
        $this->assertInstanceOf(Parcel::class, $earning->parcel);
        $this->assertInstanceOf(Parcel::class, $log->parcel);
    }
}
