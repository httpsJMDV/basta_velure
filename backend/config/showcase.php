<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Showcase data (php artisan showcase:seed)
    |--------------------------------------------------------------------------
    |
    | Fills a database, the live one included, with a realistic marketplace:
    | one admin, sellers with real products and photos, buyers, and a courier
    | network (companies, hubs and riders) over real Laguna PSGC places. The
    | data comes from database/data/showcase (products.json, places.json).
    |
    | Every account signs in with a short username (buyer1, seller1, hub1, ...)
    | and the shared password of its kind below. The admin's password is never
    | shared or stored here: showcase:seed generates a strong one (or takes
    | --admin-password) and prints it once.
    |
    | Seeded accounts have an email on this domain and a username (only the
    | seeders write users.username). Unless send_mail is on, they never get
    | email: these mailboxes do not exist, and mail to them would bounce.
    |
    */

    'email_domain' => env('SHOWCASE_EMAIL_DOMAIN', 'loved-it.shop'),

    'send_mail' => (bool) env('SHOWCASE_SEND_MAIL', false),

    // They meet the password rule every real account meets (A5: 8+ characters, upper and lower case, a number and
    // a symbol). Accounts seeded with the old easy ones get these from: php artisan showcase:check --fix
    'passwords' => [
        'buyer'   => 'Buyer@123',
        'seller'  => 'Seller@123',
        'courier' => 'Courier@123',
        'hub'     => 'Hub@1234',
        'rider'   => 'Rider@123',
    ],

    // 1 admin + 40 sellers + 3 courier admins + 9 hub owners + 27 riders + 220 buyers = 300 accounts.
    'counts' => [
        'buyers'          => 220,
        'riders_per_hub'  => 3,
    ],

    /*
    | Every showcase file lives under this folder on its disk (product photos on
    | "public", placeholder documents on "ids" and "local").
    */
    'storage_prefix' => 'showcase',

];
