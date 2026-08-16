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
        return new Envelope(subject: 'Your Velure Seller Application Has Been Received');
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.seller-application', with: [
            'firstName' => $this->user->first_name,
            'shopName'  => $this->user->sellerProfile->shop_name,
            'loginUrl'  => env('FRONTEND_URL', 'http://localhost:5173') . '/login',
        ]);
    }
}
