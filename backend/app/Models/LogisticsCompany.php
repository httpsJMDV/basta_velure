<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

/**
 * A courier company (like SPX Express or J&T). It runs hubs; the hubs' riders deliver the parcels of the orders
 * placed with it. Loved-IT runs no courier of its own: every courier is a partner. The default courier (is_default,
 * the demo partner "Demo Courier Co.") stands in for every hub, order
 * and parcel that has no company.
 *
 * @property int $id
 * @property string $name
 * @property string $code
 * @property string $slug
 * @property int|null $owner_user_id
 * @property bool $is_default
 * @property string $status
 * @property string|null $rejection_reason
 * @property \Carbon\Carbon|null $reviewed_at
 * @property \Carbon\Carbon|null $submitted_at
 */
class LogisticsCompany extends Model
{
    public const STATUS_PENDING = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_REJECTED = 'REJECTED';
    public const STATUS_SUSPENDED = 'SUSPENDED';

    protected $fillable = [
        'name', 'code', 'slug', 'owner_user_id', 'description', 'contact_email', 'contact_phone',
        'address_province', 'address_city', 'address_barangay', 'address_street', 'logo_path', 'business_permit_path',
        'is_default', 'status', 'rejection_reason', 'reviewed_by', 'reviewed_at', 'submitted_at',
    ];

    protected $appends = ['logo_url'];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'reviewed_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    /** The default courier's id: what a hub, order or parcel without a company belongs to. */
    public static function defaultId(): ?int
    {
        return Cache::remember('logistics.default_company_id', 300, fn () => static::where('is_default', true)->orderBy('id')->value('id'));
    }

    /** The company a row belongs to, reading "no company" as the default courier. */
    public static function effectiveId(?int $companyId): ?int
    {
        return $companyId ?? static::defaultId();
    }

    /**
     * Narrows a query on a table with logistics_company_id to one company, counting rows without a company as the
     * default courier's.
     */
    public static function constrain($query, int $companyId, string $column = 'logistics_company_id')
    {
        return $query->where(function ($q) use ($companyId, $column) {
            $q->where($column, $companyId);
            if ($companyId === static::defaultId()) {
                $q->orWhereNull($column);
            }
        });
    }

    /** @var array<int, array{id: int, name: string, code: string, logo_url: ?string}|null> */
    private static array $summaries = [];

    /**
     * Name, code and logo of the courier with this id (null reads as the default courier), memoised per request so
     * a list of orders does not query once per row.
     *
     * @return array{id: int, name: string, code: string, logo_url: ?string}|null
     */
    public static function summaryFor(?int $companyId): ?array
    {
        $id = static::effectiveId($companyId);
        if ($id === null) {
            return null;
        }
        if (! array_key_exists($id, static::$summaries)) {
            $c = static::find($id);
            static::$summaries[$id] = $c ? ['id' => $c->id, 'name' => $c->name, 'code' => $c->code, 'logo_url' => $c->logo_url] : null;
        }

        return static::$summaries[$id];
    }

    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? asset('storage/' . $this->logo_path) : null;
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(LogisticsCompanyMember::class);
    }

    public function hubs(): HasMany
    {
        return $this->hasMany(SortingCenter::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function isApproved(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }
}
