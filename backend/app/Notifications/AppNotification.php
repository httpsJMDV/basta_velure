<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * One in-app notification (A23), stored in the database inbox and shown under the bell. Built by App\Services\Notifier.
 * It is written right away, not queued, so it is in the inbox the moment the change that caused it commits.
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

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
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

    public function databaseType(object $notifiable): string
    {
        return $this->kind;
    }
}
