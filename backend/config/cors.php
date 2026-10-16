<?php

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // FRONTEND_URL may hold several origins separated by commas, e.g.
    // "https://loved-it.shop,http://localhost:5173".
    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('FRONTEND_URL', 'http://localhost:5173'))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
