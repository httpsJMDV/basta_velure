<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'seller_id', 'category_id', 'name', 'description', 'base_price', 'original_price',
        'status', 'rejection_reason', 'archive_reason', 'archived_by', 'weight_kg',
        'dimension_l_cm', 'dimension_w_cm', 'dimension_h_cm', 'sku',
        'fda_lto_path', 'fda_cpr_path', 'net_weight_volume',
        'expiry_best_before', 'ingredients', 'storage_instructions', 'allergen_info',
    ];

    protected $casts = [
        'base_price'     => 'float',
        'original_price' => 'float',
        'avg_rating'     => 'float',
        'review_count'   => 'integer',
        'weight_kg'      => 'float',
        'dimension_l_cm' => 'float',
        'dimension_w_cm' => 'float',
        'dimension_h_cm' => 'float',
        'units_sold'     => 'integer',
    ];

    public function seller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'seller_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function primaryImage(): ?ProductImage
    {
        return $this->images->firstWhere('is_primary', true) ?? $this->images->first();
    }

    /** Aggregated total stock across all variants */
    public function getTotalStockAttribute(): int
    {
        return $this->variants->sum('stock_quantity');
    }
}
