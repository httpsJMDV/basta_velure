<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Email codes (OTP)
    |--------------------------------------------------------------------------
    |
    | A new account, a new email address and a new mobile number are confirmed
    | with a 6-digit code sent by email. A code works for this many minutes;
    | asking for a new one cancels the old one (Assumption A9).
    |
    */

    'otp_minutes' => max(1, (int) env('OTP_MINUTES', 5)),

    // Wrong guesses allowed on one code before it stops working (a new code can be requested).
    'otp_max_attempts' => max(1, (int) env('OTP_MAX_ATTEMPTS', 5)),

    /*
    |--------------------------------------------------------------------------
    | Rider activation links
    |--------------------------------------------------------------------------
    |
    | A rider added by a courier company sets their password from an emailed
    | link that works once, for this many hours (Assumption A13).
    |
    */

    'activation_hours' => max(1, (int) env('RIDER_ACTIVATION_HOURS', 24)),

];
