<?php

namespace Tests\Feature;

use App\Mail\BuyerApplicationMail;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class MailConfigurationTest extends TestCase
{
    public function test_log_mailer_is_reported_as_unable_to_deliver(): void
    {
        config(['mail.default' => 'log', 'queue.default' => 'sync']);
        $this->artisan('mail:check')
            ->expectsOutputToContain('Inbox delivery is disabled')
            ->assertFailed();
    }

    public function test_placeholder_sender_cannot_be_used_for_delivery(): void
    {
        config(['mail.default' => 'smtp', 'queue.default' => 'sync', 'mail.from.address' => 'hello@example.com', 'mail.mailers.smtp.host' => 'smtp.example.test']);
        $this->artisan('mail:check')
            ->expectsOutputToContain('Set MAIL_FROM_ADDRESS')
            ->assertFailed();
    }

    public function test_preview_uses_the_branded_email_without_creating_a_user(): void
    {
        config([
            'mail.default' => 'smtp', 'queue.default' => 'sync',
            'mail.from.address' => 'sender@loved-it.test',
            'mail.mailers.smtp.host' => 'smtp.example.test',
            'mail.mailers.smtp.username' => 'sender', 'mail.mailers.smtp.password' => 'test',
        ]);
        Mail::fake();
        $this->artisan('mail:check', ['--to' => 'recipient@example.test'])->assertSuccessful();
        Mail::assertSent(BuyerApplicationMail::class, fn ($mail) =>
            $mail->hasTo('recipient@example.test') && $mail->decision === 'approved' && ! $mail->user->exists
        );
    }
}
