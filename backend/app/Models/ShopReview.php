<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A buyer's comment on a shop (not on a product): the comment and quick tags, no stars (product reviews keep theirs).
 * One per buyer per shop; the buyer edits it (at most twice a day) instead of posting another. The seller can reply
 * once and edit the reply. `rating` only holds the stars given before comments replaced them; it is not shown.
 *
 * @property int $id
 * @property int $seller_id
 * @property int $buyer_id
 * @property int|null $rating
 * @property string|null $comment
 * @property array<int, string>|null $tags
 * @property int $edit_count
 * @property \Carbon\Carbon|null $edit_day
 * @property int $edits_on_day
 * @property string|null $seller_reply
 */
class ShopReview extends Model
{
    /** The quick tags a buyer can pick, in the order they are shown. */
    public const TAGS = ['Fast shipping', 'Good packaging', 'Responsive seller', 'Item as described'];

    public const MAX_EDITS_PER_DAY = 2;

    public const COMMENT_MAX = 500;

    protected $fillable = ['seller_id', 'buyer_id', 'rating', 'comment', 'tags'];

    protected function casts(): array
    {
        return [
            'rating'                 => 'integer',
            'tags'                   => 'array',
            'edit_count'             => 'integer',
            'edit_day'               => 'date',
            'edits_on_day'           => 'integer',
            'seller_replied_at'      => 'datetime',
            'seller_reply_edited_at' => 'datetime',
        ];
    }

    public function buyer(): BelongsTo { return $this->belongsTo(User::class, 'buyer_id'); }
    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }

    /** Edits left today (Manila days). */
    public function editsLeftToday(): int
    {
        $today = now('Asia/Manila')->toDateString();

        return $this->edit_day?->toDateString() === $today
            ? max(0, self::MAX_EDITS_PER_DAY - $this->edits_on_day)
            : self::MAX_EDITS_PER_DAY;
    }
}
