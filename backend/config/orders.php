<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Auto-complete days
    |--------------------------------------------------------------------------
    |
    | If the buyer does nothing for this many days after delivery, the
    | orders:auto-complete command completes the order for them, so a buyer who
    | forgets cannot hold a seller's money forever. Set ORDER_AUTO_COMPLETE_DAYS=0
    | for demos, then run `php artisan orders:auto-complete` by hand.
    |
    */

    'auto_complete_days' => max(0, (int) env('ORDER_AUTO_COMPLETE_DAYS', 3)),

];
