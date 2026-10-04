<?php

namespace App\Mail;

use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SortingCenterApplicationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $decision, // 'approved' | 'rejected'
        public readonly ?string $reason = null,
        public readonly ?SortingCenter $sortingCenter = null,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->decision === 'approved'
            ? 'Your Loved-IT Sorting Center Application Has Been Approved'
            : 'Update on Your Loved-IT Sorting Center Application';

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(markdown: 'emails.sorting-center-application', with: [
            'firstName' => $this->user->first_name,
            'hubName'   => $this->sortingCenter?->hub_name ?? 'Sorting Center Hub',
            'decision'  => $this->decision,
            'reason'    => $this->reason,
            'loginUrl'  => env('FRONTEND_URL', 'http://localhost:5173') . '/login',
        ]);
    }
}
