<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    /**
     * "Others" is the catch-all for products that fit no other category. It is always listed last, an admin cannot
     * delete, deactivate or move it (or its "Other items"), and every listing in it waits for an admin before it goes
     * live (ListingScreen).
     */
    public const OTHERS_SLUG = 'others';
    public const OTHER_ITEMS_SLUG = 'other-items';
    public const OTHERS_SORT_ORDER = 9999;

    protected $fillable = [
        'slug',
        'name',
        'parent_id',
        'sort_order',
        'is_active',
        'requires_fda',
        'commission_rate',
    ];

    /** The admin's uploaded photo, when there is one (the storefront falls back to the built-in picture). */
    protected $appends = ['photo_url'];

    protected $hidden = ['image_path'];

    public function getPhotoUrlAttribute(): ?string
    {
        return $this->image_path ? asset('storage/' . $this->image_path) : null;
    }

    protected $casts = [
        'is_active'       => 'boolean',
        'requires_fda'    => 'boolean',
        'commission_rate' => 'float',
        'sort_order'      => 'integer',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Category::class, 'parent_id')->orderBy('sort_order');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'category_id');
    }

    /** "Others" itself or "Other items": the two rows the catch-all needs, which an admin cannot remove. */
    public function isLockedCatchAll(): bool
    {
        return in_array($this->slug, [self::OTHERS_SLUG, self::OTHER_ITEMS_SLUG], true);
    }

    /** "Others" or any sub-category under it. */
    public function isUnderOthers(): bool
    {
        if ($this->slug === self::OTHERS_SLUG) {
            return true;
        }

        return $this->parent_id !== null && $this->parent?->slug === self::OTHERS_SLUG;
    }
}
