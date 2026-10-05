<?php

namespace Tests\Feature;

use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderStatusMigrationTest extends TestCase
{
    private User $buyer;
    private User $hubOwner;
    private SortingCenter $hub;
    private User $riderUser;
    private Rider $rider;
    private $migration;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = User::forceCreate([
            'first_name' => 'Migration',
            'last_name'  => 'Buyer',
            'email'      => 'mig.buyer.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->hubOwner = User::forceCreate([
            'first_name' => 'Hub',
            'last_name'  => 'Owner',
            'email'      => 'mig.hub.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'buyer',
            'status'     => 'active',
        ]);

        $this->hub = SortingCenter::create([
            'user_id'          => $this->hubOwner->id,
            'hub_name'         => 'Migration Hub',
            'address_province' => 'Metro Manila',
            'address_city'     => 'Manila',
            'status'           => SortingCenter::STATUS_APPROVED,
        ]);

        $this->riderUser = User::forceCreate([
            'first_name' => 'Migration',
            'last_name'  => 'Rider',
            'email'      => 'mig.rider.' . uniqid() . '@example.com',
            'password'   => Hash::make('Secret123!'),
            'role'       => 'rider',
            'status'     => 'active',
        ]);

        $this->rider = Rider::create([
            'user_id'              => $this->riderUser->id,
            'sorting_center_id'    => $this->hub->id,
            'vehicle_type'         => 'motorcycle',
            'plate_number'         => 'MIG-1234',
            'or_cr_path'           => 'docs/or_cr.pdf',
            'drivers_license_path' => 'docs/license.jpg',
            'status'               => Rider::STATUS_ACTIVE,
        ]);

        $this->migration = require database_path('migrations/2026_10_05_000005_convert_order_status_to_string_and_migrate_data.php');
    }

    protected function tearDown(): void
    {
        DB::table('delivery_logs')->where('notes', 'migration_test')->delete();
        DB::table('parcels')->where('tracking_number', 'MIG-PARCEL-RTS')->delete();
        DB::table('orders')->where('buyer_id', $this->buyer->id)->delete();
        $this->rider->delete();
        $this->riderUser->delete();
        $this->hub->delete();
        $this->hubOwner->delete();
        $this->buyer->delete();

        parent::tearDown();
    }

    public function test_migration_up_maps_all_statuses_and_down_restores_them(): void
    {
        // The 8 valid statuses in the legacy MySQL ENUM
        $oldStatuses = [
            'pending',
            'confirmed',
            'packed',
            'shipped',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'returned',
        ];

        $orderIds = [];
        foreach ($oldStatuses as $index => $oldStatus) {
            $id = DB::table('orders')->insertGetId([
                'buyer_id'       => $this->buyer->id,
                'order_number'   => 'MIG-' . $index . '-' . uniqid(),
                'subtotal'       => 100.00,
                'shipping_fee'   => 20.00,
                'total'          => 120.00,
                'payment_method' => 'cod',
                'payment_status' => 'pending',
                'status'         => $oldStatus,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);
            $orderIds[$oldStatus] = $id;
        }

        $parcelId = DB::table('parcels')->insertGetId([
            'tracking_number' => 'MIG-PARCEL-RTS',
            'status'          => 'RTS',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $deliveryLogId = DB::table('delivery_logs')->insertGetId([
            'parcel_id' => $parcelId,
            'rider_id'  => $this->rider->id,
            'outcome'   => 'RTS',
            'notes'     => 'migration_test',
            'logged_at' => now(),
            'created_at'=> now(),
            'updated_at'=> now(),
        ]);

        // 1. Run Migration UP
        $this->migration->up();

        // 2. Assert UP mappings
        $this->assertEquals('PLACED', DB::table('orders')->where('id', $orderIds['pending'])->value('status'));
        $this->assertEquals('CONFIRMED', DB::table('orders')->where('id', $orderIds['confirmed'])->value('status'));
        $this->assertEquals('PREPARING', DB::table('orders')->where('id', $orderIds['packed'])->value('status'));
        $this->assertEquals('READY_FOR_PICKUP', DB::table('orders')->where('id', $orderIds['shipped'])->value('status'));
        $this->assertEquals('OUT_FOR_DELIVERY', DB::table('orders')->where('id', $orderIds['out_for_delivery'])->value('status'));
        $this->assertEquals('DELIVERED', DB::table('orders')->where('id', $orderIds['delivered'])->value('status'));
        $this->assertEquals('CANCELLED', DB::table('orders')->where('id', $orderIds['cancelled'])->value('status'));
        $this->assertEquals('RETURNED', DB::table('orders')->where('id', $orderIds['returned'])->value('status'));

        $this->assertEquals('RETURNED', DB::table('parcels')->where('id', $parcelId)->value('status'));
        $this->assertEquals('RETURNED', DB::table('delivery_logs')->where('id', $deliveryLogId)->value('outcome'));

        // Test that new non-lifecycle string statuses like DISPUTED can be inserted in string column
        $disputeOrderId = DB::table('orders')->insertGetId([
            'buyer_id'       => $this->buyer->id,
            'order_number'   => 'MD-' . substr(uniqid(), -8),
            'subtotal'       => 50.00,
            'shipping_fee'   => 10.00,
            'total'          => 60.00,
            'payment_method' => 'cod',
            'payment_status' => 'pending',
            'status'         => 'DISPUTED',
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
        $this->assertEquals('DISPUTED', DB::table('orders')->where('id', $disputeOrderId)->value('status'));

        // 3. Run Migration DOWN
        $this->migration->down();

        // 4. Assert DOWN restored originals
        $this->assertEquals('pending', DB::table('orders')->where('id', $orderIds['pending'])->value('status'));
        $this->assertEquals('confirmed', DB::table('orders')->where('id', $orderIds['confirmed'])->value('status'));
        $this->assertEquals('packed', DB::table('orders')->where('id', $orderIds['packed'])->value('status'));
        $this->assertEquals('shipped', DB::table('orders')->where('id', $orderIds['shipped'])->value('status'));
        $this->assertEquals('out_for_delivery', DB::table('orders')->where('id', $orderIds['out_for_delivery'])->value('status'));
        $this->assertEquals('delivered', DB::table('orders')->where('id', $orderIds['delivered'])->value('status'));
        $this->assertEquals('cancelled', DB::table('orders')->where('id', $orderIds['cancelled'])->value('status'));
        $this->assertEquals('returned', DB::table('orders')->where('id', $orderIds['returned'])->value('status'));
        $this->assertEquals('returned', DB::table('orders')->where('id', $disputeOrderId)->value('status'));

        $this->assertEquals('RTS', DB::table('parcels')->where('id', $parcelId)->value('status'));
        $this->assertEquals('RTS', DB::table('delivery_logs')->where('id', $deliveryLogId)->value('outcome'));

        // 5. Restore UP state so database schema remains migrated
        $this->migration->up();
    }
}
