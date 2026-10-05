<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Address extends Model
{
    protected $fillable = [
        'user_id', 'full_name', 'phone', 'address', 'floor_unit',
        'province', 'district', 'ward',
        'province_code', 'city_code', 'barangay_code',
        'label', 'is_default',
    ];

    protected $casts = ['is_default' => 'boolean'];

    protected $appends = ['address_needs_update'];

    public function getAddressNeedsUpdateAttribute(): bool
    {
        return empty($this->barangay_code);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
