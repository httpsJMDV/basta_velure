<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SellerApplicationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly User $user) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your Loved-IT Seller Application Has Been Received');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.seller-application', text: 'emails.text', with: [
            'template' => 'emails.seller-application',
            'firstName' => $this->user->first_name,
            'shopName'  => $this->user->sellerProfile->shop_name,
            'loginUrl'  => rtrim(config('app.frontend_url') ?: config('app.url'), '/') . '/login',
        ]);
    }
}
