<?php

namespace App\Mail;

use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Tells a seller that a parcel could not be delivered and the hub has sent it back to them.
 */
class ParcelReturnedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $seller,
        public readonly SortingCenter $sortingCenter,
        public readonly string $shopName,
        public readonly string $orderNumber,
        public readonly string $trackingNumber,
        public readonly string $reasonLabel,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Order {$this->orderNumber} could not be delivered and is being returned");
    }

    public function content(): Content
    {
        // FRONTEND_URL comes from config; fall back to APP_URL, never to a hardcoded host.
        $baseUrl = config('app.frontend_url') ?: config('app.url');

        return new Content(view: 'emails.parcel-returned', text: 'emails.text', with: [
            'template' => 'emails.parcel-returned',
            'firstName'      => $this->seller->first_name,
            'shopName'       => $this->shopName,
            'orderNumber'    => $this->orderNumber,
            'trackingNumber' => $this->trackingNumber,
            'reasonLabel'    => $this->reasonLabel,
            'hubName'        => $this->sortingCenter->hub_name,
            'loginUrl'       => rtrim((string) $baseUrl, '/') . '/login',
        ]);
    }
}
