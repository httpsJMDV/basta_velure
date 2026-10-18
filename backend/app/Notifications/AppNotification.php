<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

/**
 * One in-app notification (A23), stored in the database inbox and shown under the bell. Built by App\Services\Notifier.
 * It is written right away, not queued, so it is in the inbox the moment the change that caused it commits, and it is
 * pushed at once over Reverb on the person's private channel (App.Models.User.{id}) so the bell lights up without
 * waiting for its next poll.
 */
class AppNotification extends Notification
{
    /**
     * @param  array<string, mixed>  $meta
     */
    public function __construct(
        public readonly string $kind,
        public readonly string $title,
        public readonly string $body,
        public readonly ?string $link = null,
        public readonly array $meta = [],
    ) {}

    /** @return array<int, string> the inbox, and the live push unless broadcasting is off (the "null" driver, as in tests) */
    public function via(object $notifiable): array
    {
        return in_array(config('broadcasting.default'), [null, '', 'null'], true) ? ['database'] : ['database', 'broadcast'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'kind'  => $this->kind,
            'title' => $this->title,
            'body'  => $this->body,
            'link'  => $this->link,
            'meta'  => $this->meta,
        ];
    }

    /** The same shape as an item of GET /notifications, sent now (like the chat events), not through the queue. */
    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return (new BroadcastMessage([
            'id'         => $this->id,
            'kind'       => $this->kind,
            'title'      => $this->title,
            'body'       => $this->body,
            'link'       => $this->link,
            'meta'       => $this->meta,
            'read_at'    => null,
            'created_at' => now()->toIso8601String(),
        ]))->onConnection('sync');
    }

    public function databaseType(object $notifiable): string
    {
        return $this->kind;
    }

    public function broadcastType(): string
    {
        return 'app.notification';
    }
}
