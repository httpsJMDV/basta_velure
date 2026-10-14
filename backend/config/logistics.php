<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Maximum delivery attempts
    |--------------------------------------------------------------------------
    |
    | A parcel may be out for delivery this many times. Once a parcel has failed
    | this many times the hub can no longer reschedule it, only return it to the
    | seller. Set LOGISTICS_MAX_DELIVERY_ATTEMPTS in .env to change it.
    |
    */

    'max_delivery_attempts' => (int) env('LOGISTICS_MAX_DELIVERY_ATTEMPTS', 3),

];
