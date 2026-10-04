<?php

namespace App\Mail;

use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RiderApplicationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $decision, // 'approved' | 'disapproved'
        public readonly ?string $reason = null,
        public readonly ?SortingCenter $sortingCenter = null,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->decision === 'approved'
            ? 'Your Loved-IT Courier Application Has Been Approved'
            : 'Update on Your Loved-IT Courier Application';

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.rider-application', with: [
            'firstName' => $this->user->first_name,
            'hubName'   => $this->sortingCenter?->hub_name ?? 'Logistics Sorting Center',
            'decision'  => $this->decision,
            'reason'    => $this->reason,
            'loginUrl'  => rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . '/login',
        ]);
    }
}
