<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class BuyerApplicationMail extends Mailable
{
    use Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(
        public readonly User   $user,
        public readonly string $decision,       // 'approved' | 'rejected'
        public readonly ?string $reason = null,
    ) {
        $this->afterCommit();
    }

    public function envelope(): Envelope
    {
        $subject = $this->decision === 'approved'
            ? 'Your Loved-IT Account Has Been Approved'
            : 'Update on Your Loved-IT Account Application';

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.buyer-application', text: 'emails.buyer-application-text', with: [
            'firstName' => $this->user->first_name,
            'decision'  => $this->decision,
            'reason'    => $this->reason,
            'loginUrl'  => rtrim(config('app.frontend_url') ?: config('app.url'), '/') . '/login',
        ]);
    }
}
