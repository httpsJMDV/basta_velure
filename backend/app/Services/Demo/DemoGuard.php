<?php

namespace App\Services\Demo;

use Illuminate\Support\Facades\DB;

/**
 * The checks the demo commands make before they touch anything. They are separate from DemoDataService so the tests
 * can run the service on the _test database, while the commands themselves still refuse to run there.
 */
final class DemoGuard
{
    /**
     * A reason the demo commands must not run here, or null when it is safe.
     */
    public static function refusal(): ?string
    {
        if (app()->environment('production')) {
            return 'Refusing to run: the environment is production. Demo data must never be created in or removed from a real database.';
        }

        $database = (string) DB::connection()->getDatabaseName();
        if (str_ends_with($database, '_test')) {
            return "Refusing to run: the database \"{$database}\" is a test database. The test suite owns it; run this against your dev database.";
        }

        return null;
    }
}
