<?php

namespace Tests\Support;

use RuntimeException;

/**
 * Refuses to let the test suite run against anything but a dedicated test database.
 *
 * Some tests refresh or migrate the schema, so a run against the live dev database would
 * destroy its data. The rule is simple: the database name must end in "_test".
 */
final class TestDatabaseGuard
{
    public const REQUIRED_SUFFIX = '_test';

    /**
     * @throws RuntimeException when the database is not a test database.
     */
    public static function assertSafe(?string $database): void
    {
        if ($database !== null && $database !== '' && str_ends_with($database, self::REQUIRED_SUFFIX)) {
            return;
        }

        throw new RuntimeException(sprintf(
            'Refusing to run the tests: the active database is "%s", but a test database name must end in "%s". '
            . 'Tests refresh and rewrite data, so they must never touch your dev database. '
            . 'Check DB_DATABASE in phpunit.xml (it should be velure_test) and create it once with: '
            . 'CREATE DATABASE IF NOT EXISTS velure_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
            $database ?? '(none)',
            self::REQUIRED_SUFFIX
        ));
    }
}
