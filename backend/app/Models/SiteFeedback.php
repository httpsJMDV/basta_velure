<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A note about the Loved-IT site from a signed-in user (the storefront's Feedback button).
 *
 * @property int $id
 * @property int|null $user_id
 * @property string $message
 * @property string|null $page_url
 * @property string $status new | read
 * @property \Carbon\Carbon|null $read_at
 */
class SiteFeedback extends Model
{
    public const STATUS_NEW = 'new';
    public const STATUS_READ = 'read';

    protected $table = 'site_feedback';

    protected $fillable = ['user_id', 'message', 'page_url', 'status', 'read_at', 'read_by'];

    protected function casts(): array
    {
        return ['read_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function readBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'read_by');
    }
}
