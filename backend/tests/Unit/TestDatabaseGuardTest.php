<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tests\Support\TestDatabaseGuard;

class TestDatabaseGuardTest extends TestCase
{
    #[DataProvider('unsafeNames')]
    public function test_it_aborts_when_the_database_name_does_not_end_in_test(?string $name): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Refusing to run the tests');

        TestDatabaseGuard::assertSafe($name);
    }

    public static function unsafeNames(): array
    {
        return [
            'live dev database'  => ['velure'],
            'test in the middle' => ['velure_test_backup'],
            'prefix only'        => ['test_velure'],
            'empty'              => [''],
            'null'               => [null],
        ];
    }

    #[DataProvider('safeNames')]
    public function test_it_allows_databases_ending_in_test(string $name): void
    {
        TestDatabaseGuard::assertSafe($name);

        $this->addToAssertionCount(1);
    }

    public static function safeNames(): array
    {
        return [['velure_test'], ['other_test']];
    }

    public function test_the_error_message_names_the_database_and_the_fix(): void
    {
        try {
            TestDatabaseGuard::assertSafe('velure');
            $this->fail('Guard did not throw.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('"velure"', $e->getMessage());
            $this->assertStringContainsString('CREATE DATABASE IF NOT EXISTS velure_test', $e->getMessage());
        }
    }
}
