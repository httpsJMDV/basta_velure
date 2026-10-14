<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Demo data (php artisan demo:seed / demo:reset)
    |--------------------------------------------------------------------------
    |
    | Every demo user has an email on this domain; every other demo row is
    | reachable from those users, and demo:reset deletes only those rows. The
    | ".test" top-level domain is reserved, so no real person can own one of
    | these addresses.
    |
    | Every account shares one password, printed when the seeder finishes.
    | Set DEMO_PASSWORD in .env to change it.
    |
    */

    'email_domain' => 'demo.loved-it.test',

    'password' => env('DEMO_PASSWORD', 'Demo#12345'),

    /*
    | Every demo file lives under this folder on its disk ("public" and the
    | private "ids"), so demo:reset can remove them without guessing.
    */
    'storage_prefix' => 'demo',

];
