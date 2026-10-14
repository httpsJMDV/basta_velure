<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Escrow hold days
    |--------------------------------------------------------------------------
    |
    | A seller's earnings stay in escrow (payout_status = pending_release) for
    | this many days after the order is COMPLETED, then the payouts:release-due
    | command makes them available. Only the timing is configurable here; amounts
    | and commission are not. Set PAYOUT_ESCROW_HOLD_DAYS=0 for demos, then run
    | `php artisan payouts:release-due` by hand.
    |
    */

    'escrow_hold_days' => max(0, (int) env('PAYOUT_ESCROW_HOLD_DAYS', 7)),

];
