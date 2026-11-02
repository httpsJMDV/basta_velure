<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Delivery fee
    |--------------------------------------------------------------------------
    |
    | What a buyer pays for delivery, in pesos, for each seller's order. It is the
    | same for every order (one order is created per seller at checkout). The fee
    | is copied onto the order when it is placed, so changing it later never
    | rewrites an order that was already placed. Set SHIPPING_FEE in .env to change it.
    |
    */

    'fee' => (string) env('SHIPPING_FEE', '50.00'),

    /*
    |--------------------------------------------------------------------------
    | Bulky items
    |--------------------------------------------------------------------------
    |
    | A rider carries each shop's parcel on their own vehicle, so one parcel can
    | weigh at most max_parcel_kg. It is one limit for every vehicle: the system
    | does not yet send heavier parcels to bigger vehicles. A product at or above
    | heavy_item_kg tells the buyer about the limit on its page.
    |
    */

    'max_parcel_kg' => max(1, (float) env('SHIPPING_MAX_PARCEL_KG', 50)),
    'heavy_item_kg' => max(1, (float) env('SHIPPING_HEAVY_ITEM_KG', 10)),

    /*
    |--------------------------------------------------------------------------
    | Who gets the delivery fee
    |--------------------------------------------------------------------------
    |
    | When a parcel is delivered, the delivery fee the buyer paid is split: the
    | rider who delivered it gets this percentage and the logistics hub that
    | handled it gets the rest. 85 means 85% rider and 15% hub (42.50 and 7.50 on
    | a 50.00 fee). Set SHIPPING_RIDER_SHARE_PERCENT in .env to change it.
    |
    */

    'rider_share_percent' => (int) env('SHIPPING_RIDER_SHARE_PERCENT', 85),

    /*
    |--------------------------------------------------------------------------
    | The pickup rider's part of the riders' share
    |--------------------------------------------------------------------------
    |
    | The rider who collects the parcel from the seller and brings it to the hub
    | earns this percentage of the fee as soon as the hub receives it; the rider
    | who delivers it earns the rest of the riders' share. 20 (of 85) means 20%
    | pickup, 65% delivery, 15% hub: 10.00, 32.50 and 7.50 on a 50.00 fee. One
    | rider doing both earns both. Set SHIPPING_PICKUP_SHARE_PERCENT in .env.
    |
    */

    'pickup_share_percent' => (int) env('SHIPPING_PICKUP_SHARE_PERCENT', 20),

    /*
    |--------------------------------------------------------------------------
    | Rider pay per job (A3)
    |--------------------------------------------------------------------------
    |
    | A rider earns a fixed amount per job, whatever the parcel's delivery fee:
    | 30.00 for each pickup (earned when the parcel is picked up) and 50.00 for
    | each successful delivery. A failed attempt pays nothing. The hub's share
    | above is still a percentage of the fee. Set RIDER_PAY_PICKUP and
    | RIDER_PAY_DELIVERY in .env to change them.
    |
    */

    'rider_pay' => [
        'pickup'   => (string) env('RIDER_PAY_PICKUP', '30.00'),
        'delivery' => (string) env('RIDER_PAY_DELIVERY', '50.00'),
    ],

];
