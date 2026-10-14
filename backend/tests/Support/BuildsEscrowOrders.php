<?php

namespace Tests\Support;

use App\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Parcel;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Hash;

/**
 * Fixtures for the Feature 2.8 tests: orders with items in a chosen payout state and a parcel with a
 * chosen delivery time. Money values are fixed so tests can prove they never change.
 */
trait BuildsEscrowOrders
{
    protected function makeUser(string $role, string $first = 'Test'): User
    {
        return User::forceCreate([
            'first_name'    => $first,
            'last_name'     => 'User' . substr(uniqid(), -4),
            'email'         => strtolower($role) . '.' . uniqid() . '@example.com',
            'phone'         => '09' . rand(100000000, 999999999),
            'password'      => Hash::make('Password123!'),
            'date_of_birth' => '1992-02-02',
            'sex'           => 'male',
            'role'          => $role,
            'status'        => 'active',
        ]);
    }

    /** A seller whose shop is approved, so seller-only routes (earnings, orders) accept them. */
    protected function makeApprovedSeller(string $first = 'Selena'): User
    {
        $seller = $this->makeUser('seller', $first);

        \App\Models\SellerProfile::create([
            'user_id' => $seller->id, 'shop_name' => 'Shop ' . uniqid(), 'shop_category' => 'Fashion',
            'date_of_birth' => '1990-01-01', 'government_id_type' => 'national_id', 'government_id_number' => '1111-2222-3333',
            'government_id_number_hash' => hash('sha256', uniqid()), 'government_id_image_path' => 'uploads/id1.jpg',
            'payout_gcash_number' => '09171111111', 'application_status' => 'approved',
            'address_province' => 'Laguna', 'address_city' => 'Calamba', 'address_barangay' => 'Real',
            'address_street' => '456 Burgos St', 'address_province_code' => '040000000', 'address_city_code' => '043405000',
            'address_barangay_code' => '043405001', 'shop_contact_number' => '09171112222',
        ]);

        return $seller;
    }

    /**
     * An order with one item per entry of $payoutStates (each 1035.00 earnings, 115.00 commission) and a
     * parcel. $deliveredAt is stamped on the parcel and the items, as a real delivery would.
     *
     * @param array<int, string> $payoutStates
     * @param array<string, mixed> $parcelOverrides
     */
    protected function makeOrder(
        OrderStatus $status = OrderStatus::DELIVERED,
        array $payoutStates = ['pending_release'],
        ?Carbon $deliveredAt = null,
        ?User $buyer = null,
        ?User $seller = null,
        string $payment = 'cod',
        array $parcelOverrides = []
    ): Order {
        $buyer ??= $this->makeUser('buyer', 'Bea');
        $seller ??= $this->makeUser('seller', 'Selena');

        $order = Order::forceCreate([
            'order_number'           => 'VEL-' . strtoupper(uniqid()),
            'buyer_id'               => $buyer->id,
            'status'                 => $status->value,
            'subtotal'               => 1150.00 * count($payoutStates),
            'shipping_fee'           => 100.00,
            'total'                  => 1150.00 * count($payoutStates) + 100.00,
            'payment_method'         => $payment,
            'payment_status'         => $payment === 'gcash' ? 'paid' : 'pending',
            'shipping_name'          => 'Bea Buyer',
            'shipping_phone'         => '09998887777',
            'shipping_address'       => '12 Sampaguita St',
            'shipping_province'      => 'Metro Manila',
            'shipping_city'          => 'Makati City',
            'shipping_barangay'      => 'Real',
            'shipping_province_code' => '130000000',
            'shipping_city_code'     => '137602000',
            'shipping_barangay_code' => '043405001',
        ]);

        foreach ($payoutStates as $i => $payoutStatus) {
            OrderItem::create([
                'order_id' => $order->id, 'seller_id' => $seller->id,
                'product_name' => 'Floral Summer Dress ' . ($i + 1), 'variant_label' => 'M / Red',
                'unit_price' => 575.00, 'quantity' => 2, 'subtotal' => 1150.00,
                'commission_rate' => 0.10, 'commission_amount' => 115.00,
                'seller_earnings' => 1035.00, 'payout_status' => $payoutStatus,
                'delivered_at' => $deliveredAt,
            ]);
        }

        Parcel::create(array_merge([
            'tracking_number'           => 'LIT-' . date('ymd') . '-' . strtoupper(substr(uniqid(), -6)),
            'order_id'                  => $order->id,
            'seller_id'                 => $seller->id,
            'status'                    => Parcel::STATUS_DELIVERED,
            'destination_barangay'      => 'Real',
            'destination_barangay_code' => '043405001',
            'delivered_at'              => $deliveredAt,
        ], $parcelOverrides));

        return $order;
    }

    /**
     * Every money-related value of an order and its items, for "nothing changed" assertions.
     *
     * @return array<string, mixed>
     */
    protected function moneySnapshot(Order $order): array
    {
        $order = $order->fresh(['items']);

        return [
            'order' => $order->only(['subtotal', 'shipping_fee', 'total', 'payment_method', 'payment_status']),
            'items' => $order->items->map(fn (OrderItem $i) => $i->only([
                'unit_price', 'quantity', 'subtotal', 'commission_rate', 'commission_amount', 'seller_earnings',
            ]))->all(),
        ];
    }
}
