<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShippingZoneArea extends Model
{
    public const LEVELS = ['region', 'province', 'city'];

    protected $fillable = ['shipping_zone_id', 'level', 'psgc_code', 'name', 'excluded'];

    protected function casts(): array
    {
        return ['excluded' => 'boolean'];
    }

    public function zone(): BelongsTo { return $this->belongsTo(ShippingZone::class, 'shipping_zone_id'); }
}
