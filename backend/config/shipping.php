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

];
