<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Escrow hold days
    |--------------------------------------------------------------------------
    |
    | A seller's earnings move from Pending to Available when the order is
    | COMPLETED (A15), so the default hold is 0 days. A positive value keeps them
    | in escrow (payout_status = pending_release) for that many days after
    | completion, and the payouts:release-due command releases them. Only the
    | timing is configurable here; amounts and commission are not.
    |
    */

    'escrow_hold_days' => max(0, (int) env('PAYOUT_ESCROW_HOLD_DAYS', 0)),

];
