<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Showcase\ShowcaseRepair;
use Illuminate\Console\Command;
use Illuminate\Console\ConfirmableTrait;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The showcase accounts share one password per kind, and those passwords are public in the code. Anyone who reads the
 * repository could sign in as a seller, courier, hub or rider. This moves every account still on one to a new random
 * password and signs it out. A person who already chose their own password is left alone.
 */
class ShowcaseRotatePasswordsCommand extends Command
{
    use ConfirmableTrait;

    protected $signature = 'showcase:rotate-passwords {--force : Run in production without asking}';

    protected $description = 'Give the showcase accounts new passwords, because the old ones are public in the code';

    public function handle(): int
    {
        if (! $this->confirmToProceed('Application is in production. Change the showcase passwords?')) {
            return self::FAILURE;
        }

        $known = [];
        foreach ([config('showcase.public_passwords', []), ShowcaseRepair::LEGACY_PASSWORDS] as $list) {
            foreach ($list as $kind => $password) {
                $known[$kind][] = $password;
            }
        }

        $accounts = User::where('email', 'like', '%@' . config('showcase.email_domain'))->whereNotNull('username')->get(['id', 'password']);

        // Accounts of one kind share a hash, so each hash is checked once instead of 300 slow checks.
        $kindOfHash = [];
        $idsByKind = [];
        foreach ($accounts as $account) {
            $hash = (string) $account->getRawOriginal('password');
            if (! array_key_exists($hash, $kindOfHash)) {
                $kindOfHash[$hash] = $this->kindUsing($hash, $known);
            }
            if ($kindOfHash[$hash] !== null) {
                $idsByKind[$kindOfHash[$hash]][] = $account->id;
            }
        }

        if ($idsByKind === []) {
            $this->info('No showcase account is on a public password.');
        }

        $rows = [];
        foreach ($idsByKind as $kind => $ids) {
            $password = 'Lv-' . Str::random(14) . random_int(10, 99);
            foreach (array_chunk($ids, 200) as $chunk) {
                User::whereIn('id', $chunk)->update(['password' => Hash::make($password)]);
                PersonalAccessToken::where('tokenable_type', User::class)->whereIn('tokenable_id', $chunk)->delete();
            }
            $this->saveToEnv('SHOWCASE_PASSWORD_' . strtoupper($kind), $password);
            $rows[] = [$kind, count($ids), $password];
        }

        if ($rows !== []) {
            $this->table(['Kind', 'Accounts changed', 'New password'], $rows);
            $this->info('Also saved in backend/.env, which is never committed. These accounts were signed out.');
        }

        $this->warnAboutAdmins();

        return self::SUCCESS;
    }

    /** @param array<string, array<int, string>> $known */
    private function kindUsing(string $hash, array $known): ?string
    {
        foreach ($known as $kind => $passwords) {
            foreach ($passwords as $password) {
                if (Hash::check($password, $hash)) {
                    return $kind;
                }
            }
        }

        return null;
    }

    private function saveToEnv(string $key, string $value): void
    {
        $path = app()->environmentFilePath();
        $env = is_file($path) ? (string) file_get_contents($path) : '';
        $line = "{$key}={$value}";
        $pattern = '/^' . preg_quote($key, '/') . '=.*$/m';

        $env = preg_match($pattern, $env)
            ? preg_replace($pattern, $line, $env)
            : rtrim($env) . PHP_EOL . $line . PHP_EOL;

        file_put_contents($path, $env);
    }

    /** The demo admin password is public too. The admin chooses their own, so this only points at the problem. */
    private function warnAboutAdmins(): void
    {
        $weak = User::where('role', 'admin')->get(['id', 'email', 'password'])
            ->filter(fn (User $admin) => Hash::check('admin123', (string) $admin->getRawOriginal('password')));

        foreach ($weak as $admin) {
            $this->error("Admin {$admin->email} still uses the public password. Change it now.");
        }
    }
}
