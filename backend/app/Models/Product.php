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
        'seller_id', 'category_id', 'name', 'description', 'base_price', 'original_price', 'discount_percent',
        'status', 'rejection_reason', 'archive_reason', 'archived_by', 'weight_kg',
        'dimension_l_cm', 'dimension_w_cm', 'dimension_h_cm', 'sku',
        'fda_lto_path', 'fda_cpr_path', 'net_weight_volume',
        'expiry_best_before', 'ingredients', 'storage_instructions', 'allergen_info',
        'variation_types', 'purchase_limit', 'publish_key', 'published_at',
    ];

    /** Order statuses after which an order no longer holds a product or variant (A19). */
    public const FINISHED_ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'RETURNED', 'LOST', 'DAMAGED'];

    protected $casts = [
        'base_price'     => 'float',
        'original_price' => 'float',
        'discount_percent' => 'integer',
        'avg_rating'     => 'float',
        'review_count'   => 'integer',
        'weight_kg'      => 'float',
        'dimension_l_cm' => 'float',
        'dimension_w_cm' => 'float',
        'dimension_h_cm' => 'float',
        'units_sold'     => 'integer',
        'variation_types' => 'array',
        'purchase_limit' => 'integer',
        'published_at'   => 'datetime',
    ];

    public function storeCategories(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(StoreCategory::class, 'product_store_category');
    }

    public function storeSales(): HasMany
    {
        return $this->hasMany(StoreSale::class);
    }

    public function flashSales(): HasMany
    {
        return $this->hasMany(FlashSale::class);
    }

    /** True when an order that is not finished (A19) still includes this product, or the given variant of it. */
    public function hasUnfinishedOrders(?int $variantId = null): bool
    {
        return OrderItem::where('product_id', $this->id)
            ->when($variantId, fn ($q) => $q->where('product_variant_id', $variantId))
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', self::FINISHED_ORDER_STATUSES))
            ->exists();
    }

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

    /** Full URL of the primary photo (the first photo when none is marked primary), or null without photos. */
    public function primaryImageUrl(): ?string
    {
        $image = $this->primaryImage();

        return $image ? asset('storage/' . $image->path) : null;
    }

    /** Aggregated total stock across all variants */
    public function getTotalStockAttribute(): int
    {
        return $this->variants->sum('stock_quantity');
    }
}
