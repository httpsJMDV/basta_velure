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


    /*
    |--------------------------------------------------------------------------
    | Truck trips between hubs (line-haul)
    |--------------------------------------------------------------------------
    |
    | What a courier pays its truck driver for one trip from one hub to another,
    | when the courier has not set its own rate. The courier pays it from its own
    | money, so the shipping fee split (riders 85%, hub 15%) does not change.
    |
    */

    'truck_trip_rate' => (float) env('LOGISTICS_TRUCK_TRIP_RATE', 800),

    /*
    |--------------------------------------------------------------------------
    | Truck planner (courier Truck drivers page)
    |--------------------------------------------------------------------------
    |
    | How many parcels one truck carries and how long one driver's shift is,
    | until the courier sets its own. The planner turns a week of real trips
    | into "how many drivers do we need" with these two numbers.
    |
    */

    'truck_capacity'    => (int) env('LOGISTICS_TRUCK_CAPACITY', 300),
    'truck_shift_hours' => (int) env('LOGISTICS_TRUCK_SHIFT_HOURS', 8),
    // Hours a one-way trip takes when the courier has no finished trips to learn from yet.
    'truck_trip_hours'  => (float) env('LOGISTICS_TRUCK_TRIP_HOURS', 3),

    /*
    |--------------------------------------------------------------------------
    | Branches: how far a courier branch reaches (network:consolidate)
    |--------------------------------------------------------------------------
    |
    | Kilometres between town centres, in a straight line (about 20 km of road
    | at 15). Riders ride only that short part on a motorcycle or tricycle;
    | trucks carry parcels between branches and gateways.
    |
    */

    'branch_radius_km' => (float) env('LOGISTICS_BRANCH_RADIUS_KM', 15),

    /*
    |--------------------------------------------------------------------------
    | Delivery estimate (days), shown at checkout and kept on the order
    |--------------------------------------------------------------------------
    |
    | By how far the shop is from the buyer. Between island groups (Luzon,
    | Visayas, Mindanao) parcels cross by ship; a plane is faster but only the
    | island gateway decides that when it sends them.
    |
    */

    'eta_days' => [
        'same_city'     => [1, 2],
        'same_province' => [1, 3],
        'same_region'   => [2, 4],
        'same_island'   => [3, 5],
        'other_island'  => [5, 8],
    ],

    // Days a ship and a plane take between island gateways, the default ETA the gateway can change when it sends.
    'cargo_days' => ['sea' => 3, 'air' => 1],

];
