<?php

namespace App\Listeners;

use App\Models\User;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Log;

/**
 * Stops email to the accounts showcase:seed created. Their mailboxes (buyer1@loved-it.shop and so on) do not exist,
 * so every order, parcel or application email to them would bounce and hurt the sender's reputation. A seeded account
 * is one on config('showcase.email_domain') that has a username (only the seeders write users.username).
 * SHOWCASE_SEND_MAIL=true turns this off.
 */
class SkipShowcaseMail
{
    public function handle(MessageSending $event): ?bool
    {
        if (config('showcase.send_mail')) {
            return null;
        }

        $domain = '@' . strtolower((string) config('showcase.email_domain'));
        $to = array_map(fn ($address) => strtolower($address->getAddress()), $event->message->getTo());
        $onDomain = array_filter($to, fn (string $email) => str_ends_with($email, $domain));
        if ($to === [] || count($onDomain) !== count($to)) {
            return null;
        }

        if (User::whereIn('email', $onDomain)->whereNotNull('username')->count() !== count(array_unique($onDomain))) {
            return null;
        }

        Log::info('Skipped an email to a showcase account.', ['to' => $to, 'subject' => $event->message->getSubject()]);

        return false;
    }
}
