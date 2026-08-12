<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $resetUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reset Your Velure Password');
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.password-reset', with: [
            'name'     => $this->name,
            'resetUrl' => $this->resetUrl,
        ]);
    }
}
