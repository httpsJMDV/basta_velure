<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly User $user) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Welcome to Velure!');
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.welcome', with: [
            'name'      => $this->user->first_name,
            'loginUrl'  => env('FRONTEND_URL', 'http://localhost:5173') . '/login',
        ]);
    }
}
