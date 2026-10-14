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
 * Tells a rider that a hub has assigned parcels to them for delivery.
 * One mail per assign request, however many parcels it covered.
 */
class ParcelsAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $riderUser,
        public readonly SortingCenter $sortingCenter,
        public readonly int $parcelCount,
        public readonly string $barangayName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: sprintf('%d %s assigned to you', $this->parcelCount, $this->parcelCount === 1 ? 'parcel' : 'parcels')
        );
    }

    public function content(): Content
    {
        // FRONTEND_URL comes from config; fall back to APP_URL, never to a hardcoded host.
        $baseUrl = config('app.frontend_url') ?: config('app.url');

        return new Content(markdown: 'emails.parcels-assigned', with: [
            'firstName'    => $this->riderUser->first_name,
            'hubName'      => $this->sortingCenter->hub_name,
            'parcelCount'  => $this->parcelCount,
            'barangayName' => $this->barangayName,
            'loginUrl'     => rtrim((string) $baseUrl, '/') . '/login',
        ]);
    }
}
