<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Auto-complete days
    |--------------------------------------------------------------------------
    |
    | If the buyer does nothing for this many days after delivery (7 days, or 168
    | hours, A11), the orders:auto-complete command completes the order for them,
    | so a buyer who forgets cannot hold a seller's money forever. An order with
    | an open return request is not completed. Set ORDER_AUTO_COMPLETE_DAYS=0 for
    | demos, then run `php artisan orders:auto-complete` by hand.
    |
    */

    'auto_complete_days' => max(0, (int) env('ORDER_AUTO_COMPLETE_DAYS', 7)),

    /*
    |--------------------------------------------------------------------------
    | Limits on one checkout
    |--------------------------------------------------------------------------
    |
    | A cart can hold more than one checkout can carry. These stop a mistake (or a
    | script) from placing hundreds of items, or an amount no rider or shop should
    | be holding. max_total matches the highest price a listing can have.
    |
    */

    'max_lines' => max(1, (int) env('ORDER_MAX_LINES', 50)),
    'max_units' => max(1, (int) env('ORDER_MAX_UNITS', 200)),
    'max_total' => max(1, (float) env('ORDER_MAX_TOTAL', 1000000)),

    /*
    |--------------------------------------------------------------------------
    | Big amounts
    |--------------------------------------------------------------------------
    |
    | cod_max: the most cash a rider collects for one shop's order. Above it the
    | buyer pays the shop by GCash, so a rider never carries that much on the road.
    |
    | high_value_min: from this amount a buyer accepts an agreement before placing
    | the order, and a seller before setting a price this high. Each acceptance is
    | saved in the audit log with who agreed and when.
    |
    */

    'cod_max'        => max(1, (float) env('ORDER_COD_MAX', 50000)),
    'high_value_min' => max(1, (float) env('ORDER_HIGH_VALUE_MIN', 50000)),

];
