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

    /*
    |--------------------------------------------------------------------------
    | Delivery SLA for hub reports (feature 1.10)
    |--------------------------------------------------------------------------
    |
    | A delivered parcel counts as "on time" when it was delivered no more than
    | this many hours after the hub received it (scanned_in_at). Set
    | LOGISTICS_DELIVERY_SLA_HOURS in .env to change it.
    |
    */

    'delivery_sla_hours' => (int) env('LOGISTICS_DELIVERY_SLA_HOURS', 48),

    /*
    |--------------------------------------------------------------------------
    | Rider delivery chat (feature 2.10)
    |--------------------------------------------------------------------------
    |
    | Longest message body in characters, and how many messages one user may send
    | across all rider threads per minute.
    |
    */

    'chat' => [
        'max_body_length'  => (int) env('RIDER_CHAT_MAX_BODY_LENGTH', 1000),
        'sends_per_minute' => (int) env('RIDER_CHAT_SENDS_PER_MINUTE', 20),
    ],

];
