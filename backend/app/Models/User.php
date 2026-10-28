<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * @method \Laravel\Sanctum\PersonalAccessToken|null currentAccessToken()
 */
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
        // role, status and username are intentionally excluded — set explicitly in code only (username: demo seeder)
    ];

    protected $hidden = ['password', 'remember_token', 'verification_token', 'reset_token', 'username'];

    protected function casts(): array
    {
        return [
            'email_verified_at'            => 'datetime',
            'verification_token_expires_at' => 'datetime',
            'reset_token_expires_at'        => 'datetime',
            'last_login_at'                 => 'datetime',
            'date_of_birth'                 => 'date',
            'password'                      => 'hashed',
            'notification_preferences'      => 'array',
        ];
    }

    protected $appends = ['avatar_url'];

    public function getAvatarUrlAttribute(): ?string
    {
        return $this->avatar_path ? asset('storage/' . $this->avatar_path) : null;
    }

    /**
     * The account a sign-in identifier names: an email (anything with an "@") or a username, case-insensitive.
     * Usernames never contain "@" (only the demo seeder sets them), so the two cannot collide. The columns are
     * compared directly so their unique indexes are used; MySQL's collation makes the comparison case-insensitive.
     */
    public static function findByLoginIdentifier(string $identifier): ?self
    {
        $identifier = mb_strtolower(trim($identifier));
        if ($identifier === '') {
            return null;
        }

        return str_contains($identifier, '@')
            ? static::where('email', $identifier)->first()
            : static::where('username', $identifier)->first();
    }

    /**
     * Buyers place orders only once the Loved-IT team approved their government ID (Admin > Buyer Applications); until
     * then they can sign in, browse and fill a cart. Null when this account may order, else why not (for a 403).
     *
     * @return array{code: string, id_status: string, message: string}|null
     */
    public function orderBlockedByIdCheck(): ?array
    {
        return match ($this->buyer_application_status) {
            'approved' => null,
            'pending'  => ['code' => 'id_not_verified', 'id_status' => 'pending',
                'message' => 'Your ID is still being checked. You can place orders once the Loved-IT team approves it, usually within 1 business day.'],
            'rejected' => ['code' => 'id_not_verified', 'id_status' => 'rejected',
                'message' => 'Your ID was not approved' . ($this->buyer_rejection_reason ? ': ' . rtrim($this->buyer_rejection_reason, '.') . '.' : '.') . ' Send a new one from your account to place orders.'],
            default    => ['code' => 'id_not_verified', 'id_status' => 'none',
                'message' => 'Add a government ID to your account before placing an order. The Loved-IT team checks it, usually within 1 business day.'],
        };
    }

    public function sellerProfile(): HasOne
    {
        return $this->hasOne(SellerProfile::class);
    }

    public function sortingCenter(): HasOne
    {
        return $this->hasOne(SortingCenter::class);
    }

    public function rider(): HasOne
    {
        return $this->hasOne(Rider::class);
    }

    /** The courier company this account runs, through its membership (one company per account). */
    public function logisticsMembership(): HasOne
    {
        return $this->hasOne(LogisticsCompanyMember::class);
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'seller_id');
    }

    public function isApprovedSeller(): bool
    {
        return $this->sellerProfile?->application_status === 'approved';
    }

    public function sellerApplicationStatus(): ?string
    {
        return $this->sellerProfile?->application_status;
    }
}
