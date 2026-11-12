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
Schedule::command('orders:auto-complete')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('payouts:release-due')->hourly()->withoutOverlapping();

// Flash sale reminders, just before a slot starts.
Schedule::command('flash-sales:remind')->everyMinute()->withoutOverlapping();

// A6: unpaid e-wallet and card orders are cancelled 1 hour after they are placed.
Schedule::command('orders:cancel-unpaid')->everyMinute()->withoutOverlapping();

// A31: unanswered return requests are approved after 3 days; rejections not escalated in 3 days close.
Schedule::command('returns:process-deadlines')->everyFifteenMinutes()->withoutOverlapping();

// Refunds the shop sends by hand: unreported sent refunds count as received after 3 days; late shops are flagged.
Schedule::command('refunds:process-deadlines')->everyFifteenMinutes()->withoutOverlapping();

// A14: pickup offers last 60 seconds; an expired one goes to the next rider. The rider and company screens also
// expire offers on every read (the rider app checks every 5 seconds); this catches the rest.
Schedule::command('dispatch:expire-offers')->everyMinute()->withoutOverlapping();

// Pickups the shop scheduled for later are offered to riders from an hour before their window.
Schedule::command('pickups:release-scheduled')->everyFiveMinutes()->withoutOverlapping();

// Sign-in tokens past their 30 days are removed from the database.
Schedule::command('sanctum:prune-expired --hours=24')->daily()->withoutOverlapping();

// A full database backup every night at 2:00 AM Manila time, then old backups past their keep date are removed
// (DatabaseBackups, the admin Backups page).
Schedule::command('backups:run')->dailyAt('02:00')->timezone('Asia/Manila')->withoutOverlapping();

// A heartbeat so `php artisan scheduler:check` can tell whether the scheduler is running at all.
Schedule::call(fn () => Cache::put(
    \App\Console\Commands\CheckSchedulerRunning::HEARTBEAT_KEY,
    now()->toIso8601String(),
    now()->addDay()
))->name('scheduler-heartbeat')->everyMinute();
