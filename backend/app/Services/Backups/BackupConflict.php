<?php

namespace App\Services\Backups;

use RuntimeException;

/** Another backup is being made: the admin page shows that one's progress instead of starting a second. */
class BackupConflict extends RuntimeException
{
    public function __construct(string $message, public readonly array $running)
    {
        parent::__construct($message);
    }
}
