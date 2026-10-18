<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One line of a buyer's cart, kept on the server so it follows the account across devices (B6). */
class CartItem extends Model
{
    /** The most distinct lines a cart holds. */
    public const MAX_LINES = 100;

    protected $fillable = ['user_id', 'product_id', 'product_variant_id', 'quantity', 'selected', 'price_seen'];

    protected function casts(): array
    {
        return ['selected' => 'boolean', 'quantity' => 'integer', 'price_seen' => 'decimal:2'];
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    public function product(): BelongsTo { return $this->belongsTo(Product::class)->withTrashed(); }

    public function variant(): BelongsTo { return $this->belongsTo(ProductVariant::class, 'product_variant_id')->withTrashed(); }
}
