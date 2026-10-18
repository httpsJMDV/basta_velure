<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Sandbox gateway
    |--------------------------------------------------------------------------
    |
    | E-wallet and card payments go through Loved-IT's built-in sandbox gateway:
    | no real money moves. Its callback is signed with this secret (HMAC-SHA256
    | of "token|status|reference"); it falls back to the app key.
    |
    */

    'sandbox_secret' => env('PAYMENTS_SANDBOX_SECRET', env('APP_KEY', 'sandbox')),

];
