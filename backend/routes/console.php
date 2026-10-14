<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Feature 2.8: buyer receipt and escrow timing. The scheduler must be running for these to fire:
// `php artisan schedule:work` in development, a cron entry for `php artisan schedule:run` in production.
Schedule::command('orders:auto-complete')->hourly()->withoutOverlapping();
Schedule::command('payouts:release-due')->hourly()->withoutOverlapping();

// A heartbeat so `php artisan scheduler:check` can tell whether the scheduler is running at all.
Schedule::call(fn () => Cache::put(
    \App\Console\Commands\CheckSchedulerRunning::HEARTBEAT_KEY,
    now()->toIso8601String(),
    now()->addDay()
))->name('scheduler-heartbeat')->everyMinute();
