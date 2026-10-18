<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A store's own category (A7, A19, A25): two levels at most, 1 to 50 characters, unique within the store ignoring
 * case and surrounding spaces. Hiding it removes it from the store page; its products stay visible everywhere else.
 *
 * @property int $id
 * @property int $seller_id
 * @property int|null $parent_id
 * @property string $name
 * @property int $sort_order
 * @property bool $is_visible
 */
class StoreCategory extends Model
{
    public const MAX_DEPTH = 2;
    public const MAX_PER_PRODUCT = 3;

    protected $fillable = ['seller_id', 'parent_id', 'name', 'sort_order', 'is_visible'];

    protected function casts(): array
    {
        return ['is_visible' => 'boolean', 'sort_order' => 'integer'];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('id');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_store_category');
    }
}
