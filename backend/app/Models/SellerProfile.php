<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class SellerProfile extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'shop_name',
        'shop_category',
        'shop_description',
        'shop_bio',
        'date_of_birth',
        'government_id_type',
        'government_id_number',
        'government_id_number_hash',
        'government_id_image_path',
        'government_id_image_back_path',
        'selfie_with_id_path',
        'business_permit_path',
        'dti_sec_registration_path',
        'fda_lto_path',
        'address_province',
        'address_city',
        'address_barangay',
        'address_street',
        'shop_contact_number',
        'return_policy',
        'shipping_policy',
        'business_hours',
        'response_time',
        'logo_path',
        'banner_path',
        'payout_gcash_number',
        'application_status',
        'rejection_reason',
        'reviewed_by',
        'reviewed_at',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'reviewed_at' => 'datetime',
            'submitted_at' => 'datetime',
            // Encrypt sensitive fields at rest
            'government_id_number' => 'encrypted',
            'payout_gcash_number' => 'encrypted',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
