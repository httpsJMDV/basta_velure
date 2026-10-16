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
    | Each demo account can sign in with its email (<key>@demo.loved-it.test) or
    | with the short username below, using the password below. These passwords
    | are deliberately weak so a demo is easy to run: they are for a LOCAL
    | database only. demo:seed and demo:reset refuse production and any database
    | whose name ends in _test.
    |
    | Keys are the local part of the demo email. The username is stored in
    | users.username, which only this seeder ever writes.
    |
    */

    'email_domain' => 'demo.loved-it.test',

    'accounts' => [
        'admin'   => ['username' => 'admin',  'password' => 'admin123'],
        'buyer1'  => ['username' => 'buyer1', 'password' => 'buyer123'],
        'buyer2'  => ['username' => 'buyer2', 'password' => 'buyer123'],
        'seller1' => ['username' => 'seller1', 'password' => 'seller123'],
        'seller2' => ['username' => 'seller2', 'password' => 'seller123'],
        'hub'     => ['username' => 'hub1',   'password' => 'hub123'],
        'courier' => ['username' => 'courier1', 'password' => 'courier123'],
        'rider1'  => ['username' => 'rider1', 'password' => 'rider123'],
        'rider2'  => ['username' => 'rider2', 'password' => 'rider123'],
        'rider3'  => ['username' => 'rider3', 'password' => 'rider123'],
    ],

    /*
    | Every demo file lives under this folder on its disk ("public" and the
    | private "ids"), so demo:reset can remove them without guessing.
    */
    'storage_prefix' => 'demo',

];
