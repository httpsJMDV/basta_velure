<?php

namespace App\Console\Commands;

use App\Mail\BuyerApplicationMail;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class CheckMail extends Command
{
    protected $signature = 'mail:check {--to= : Send a branded approval preview to this email address}';

    protected $description = 'Check mail delivery configuration and optionally send a preview without approving an account';

    public function handle(): int
    {
        $mailer = config('mail.default');
        $transport = config("mail.mailers.{$mailer}.transport");
        $this->line("Mailer: {$mailer}; queue: " . config('queue.default'));

        if (in_array($transport, ['log', 'array', null], true)) {
            $this->error('Inbox delivery is disabled. Set MAIL_MAILER=smtp and configure your provider in backend/.env, then run php artisan config:clear.');

            return self::FAILURE;
        }

        if ($transport === 'smtp' && config("mail.mailers.{$mailer}.host") === 'smtp.gmail.com'
            && (! config("mail.mailers.{$mailer}.username") || ! config("mail.mailers.{$mailer}.password"))) {
            $this->error('Gmail setup is incomplete. Fill MAIL_USERNAME with your sender Gmail address and MAIL_PASSWORD with its Google App Password in backend/.env. Then run php artisan config:clear.');

            return self::FAILURE;
        }

        $from = config('mail.from.address');
        if (! filter_var($from, FILTER_VALIDATE_EMAIL) || str_ends_with(strtolower($from), '@example.com')) {
            $this->error('Set MAIL_FROM_ADDRESS to an address verified by your email provider.');

            return self::FAILURE;
        }

        if ($transport === 'smtp' && ! config("mail.mailers.{$mailer}.url")) {
            $host = config("mail.mailers.{$mailer}.host");
            if (! $host || in_array($host, ['127.0.0.1', 'localhost'], true)) {
                $this->warn('SMTP points to a local server. It will only deliver if a local mail relay is running.');
            }
            if (! config("mail.mailers.{$mailer}.username") || ! config("mail.mailers.{$mailer}.password")) {
                $this->warn('SMTP authentication is unset. Most hosted providers require MAIL_USERNAME and MAIL_PASSWORD.');
            }
            if (str_contains((string) $host, 'sandbox.smtp.mailtrap.io')) {
                $this->warn('Mailtrap sandbox captures emails; it does not deliver to buyer inboxes.');
            }
        }

        if (config('queue.default') === 'database') {
            try {
                $connection = config('queue.connections.database.connection');
                $pending = DB::connection($connection)->table(config('queue.connections.database.table'))->count();
                $this->line("Pending database jobs: {$pending}");
            } catch (\Throwable $exception) {
                report($exception);
                $this->error('Cannot read the queue. Check the database configuration and migrations.');

                return self::FAILURE;
            }
        }

        if (! in_array(config('queue.default'), ['sync', 'deferred', 'background'], true)) {
            $this->warn('Queued approval emails require a running worker: php artisan queue:work --tries=3 --backoff=60');
        }

        $recipient = $this->option('to');
        if (! $recipient) {
            $this->info('Configuration checked. SMTP connectivity and delivery have not been tested. Use --to=your-address to send a preview.');

            return self::SUCCESS;
        }
        if (! filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $this->error('The --to option must be a valid email address.');

            return self::FAILURE;
        }

        try {
            Mail::to($recipient)->send(new BuyerApplicationMail(new User(['first_name' => 'Preview']), 'approved'));
        } catch (\Throwable $exception) {
            report($exception);
            $this->error('Preview delivery failed. Check storage/logs/laravel.log for the provider error.');

            return self::FAILURE;
        }

        $this->info('The mail transport accepted the preview. Check the recipient inbox and spam folder. No account was approved.');

        return self::SUCCESS;
    }
}
