<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The fee for one route between two zones: the first kilogram, then each additional kilogram (A20). */
class ShippingRate extends Model
{
    protected $fillable = ['logistics_company_id', 'origin_zone_id', 'destination_zone_id', 'first_kg', 'additional_kg'];

    protected function casts(): array
    {
        return ['first_kg' => 'decimal:2', 'additional_kg' => 'decimal:2'];
    }

    public function origin(): BelongsTo { return $this->belongsTo(ShippingZone::class, 'origin_zone_id'); }

    public function destination(): BelongsTo { return $this->belongsTo(ShippingZone::class, 'destination_zone_id'); }

    /** The fee for a chargeable weight in whole kilograms (at least 1). */
    public function feeFor(int $kg): float
    {
        return round((float) $this->first_kg + max(0, $kg - 1) * (float) $this->additional_kg, 2);
    }
}
