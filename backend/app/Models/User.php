<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'first_name',
        'middle_name',
        'last_name',
        'email',
        'phone',
        'password',
        'date_of_birth',
        'sex',
        'government_id_type',
        'government_id_image_path',
        'government_id_image_back_path',
        'buyer_application_status',
        'buyer_rejection_reason',
        'avatar_path',
        // role, status are intentionally excluded — set explicitly in code only
    ];

    protected $hidden = ['password', 'remember_token', 'verification_token', 'reset_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at'            => 'datetime',
            'verification_token_expires_at' => 'datetime',
            'reset_token_expires_at'        => 'datetime',
            'last_login_at'                 => 'datetime',
            'date_of_birth'                 => 'date',
            'password'                      => 'hashed',
        ];
    }

    public function sellerProfile(): HasOne
    {
        return $this->hasOne(SellerProfile::class);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class);
    }

    public function isApprovedSeller(): bool
    {
        return $this->role === 'seller'
            && $this->sellerProfile?->application_status === 'approved';
    }
}
