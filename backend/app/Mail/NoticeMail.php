<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One transactional email in the shared Loved-IT layout. The content is plain data (strings and arrays), built by
 * App\Services\MailNotifier, so a queued notice renders the same whenever the worker sends it.
 *
 * Content keys: recipientName, label, title, paragraphs[], and optionally tone, highlight, items, totals, details,
 * actionUrl, actionLabel, note, footer, preview (see emails/layouts/branded.blade.php).
 */
class NoticeMail extends Mailable
{
    use Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 60;

    /** @param array<string, mixed> $notice */
    public function __construct(
        public readonly string $subjectLine,
        public readonly array $notice,
        public readonly string $kind = 'notice',
    ) {
        // Queued only once the surrounding transaction commits, so a rolled-back action sends nothing.
        $this->afterCommit();
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.notice', text: 'emails.text', with: [
            'template' => 'emails.notice',
            'notice'   => $this->notice,
        ]);
    }
}
