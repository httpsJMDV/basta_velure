<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TestDatabaseIsolationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_tests_run_against_the_dedicated_test_database(): void
    {
        $this->assertSame('velure_test', DB::connection()->getDatabaseName());
    }
}
