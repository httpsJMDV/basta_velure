<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'seller_id', 'product_id', 'product_variant_id', 'category_id', 'product_name', 'variant_label',
        'unit_price', 'quantity', 'subtotal', 'image_url',
        'commission_rate', 'commission_amount', 'seller_earnings',
        'payout_status', 'delivered_at', 'escrow_release_at',
        // What the line was priced at (A5: a flash line and the units beyond the flash quantity are separate lines).
        'regular_unit_price', 'price_source', 'flash_sale_id', 'store_sale_id', 'promotion_id', 'is_gift',
        // The line's share of the store voucher and of a bundle or buy-X-get-Y discount (A8), both seller-funded.
        'store_voucher_share', 'promo_share', 'weight_grams', 'stock_restored_at',
    ];

    protected function casts(): array
    {
        return [
            'unit_price'          => 'decimal:2',
            'regular_unit_price'  => 'decimal:2',
            'subtotal'            => 'decimal:2',
            'store_voucher_share' => 'decimal:2',
            'promo_share'         => 'decimal:2',
            'commission_rate'     => 'decimal:4',
            'commission_amount'   => 'decimal:2',
            'seller_earnings'     => 'decimal:2',
            'is_gift'             => 'boolean',
            'delivered_at'        => 'datetime',
            'escrow_release_at'   => 'datetime',
            'stock_restored_at'   => 'datetime',
        ];
    }

    public function order(): BelongsTo  { return $this->belongsTo(Order::class); }
    public function seller(): BelongsTo { return $this->belongsTo(User::class, 'seller_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function variant(): BelongsTo { return $this->belongsTo(ProductVariant::class, 'product_variant_id')->withTrashed(); }
}
