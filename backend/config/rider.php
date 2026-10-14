<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Flat delivery fee
    |--------------------------------------------------------------------------
    |
    | What a rider earns for each parcel they deliver, in pesos. The amount is
    | copied onto the rider's earnings row at the moment of delivery, so changing
    | this later never rewrites past earnings. It is not related to what the buyer
    | pays for shipping, and it does not touch any buyer, seller or platform money.
    | Set RIDER_DELIVERY_FEE in .env to change it.
    |
    */

    'delivery_fee' => (string) env('RIDER_DELIVERY_FEE', '50.00'),

    /*
    |--------------------------------------------------------------------------
    | Reporting calendar
    |--------------------------------------------------------------------------
    |
    | Days, weeks and months are counted in this timezone (Manila has no daylight
    | saving, so it is always UTC+08:00), and a week runs Monday to Sunday.
    |
    */

    'timezone' => 'Asia/Manila',

    'week_starts_on' => \Carbon\Carbon::MONDAY,

];
