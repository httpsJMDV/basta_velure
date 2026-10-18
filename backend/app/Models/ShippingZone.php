<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A delivery zone of a courier: the regions, provinces or cities it covers, minus any carved-out areas (L8). */
class ShippingZone extends Model
{
    protected $fillable = ['logistics_company_id', 'name'];

    public function company(): BelongsTo { return $this->belongsTo(LogisticsCompany::class, 'logistics_company_id'); }

    public function areas(): HasMany { return $this->hasMany(ShippingZoneArea::class); }
}
