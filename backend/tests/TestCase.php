<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;
use Tests\Support\TestDatabaseGuard;

abstract class TestCase extends BaseTestCase
{
    /**
     * Runs before any test trait (RefreshDatabase, DatabaseTransactions, ...) touches the database,
     * so a misconfigured run aborts instead of wiping the dev database.
     */
    protected function setUpTraits()
    {
        TestDatabaseGuard::assertSafe(DB::connection()->getDatabaseName());

        return parent::setUpTraits();
    }
}
