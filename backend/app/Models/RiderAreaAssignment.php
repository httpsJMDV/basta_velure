<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * RiderAreaAssignment Model
 *
 * Maps a rider to a designated geographic delivery coverage area
 * and list of barangays under a specific sorting center.
 *
 * @property int $id
 * @property int|null $rider_id
 * @property int $sorting_center_id
 * @property string $area_label
 * @property array|null $coverage_barangays
 * @property bool $is_active
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 *
 * @property-read \App\Models\SortingCenter $sortingCenter
 */
class RiderAreaAssignment extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'rider_id',
        'sorting_center_id',
        'area_label',
        'coverage_area_label',
        'coverage_barangays',
        'coverage_barangay_list',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'coverage_barangays' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function getCoverageAreaLabelAttribute(): ?string
    {
        return $this->attributes['area_label'] ?? null;
    }

    public function setCoverageAreaLabelAttribute($value): void
    {
        $this->attributes['area_label'] = $value;
    }

    public function getCoverageBarangayListAttribute(): ?array
    {
        return $this->coverage_barangays;
    }

    public function setCoverageBarangayListAttribute($value): void
    {
        $this->coverage_barangays = $value;
    }

    public function sortingCenter(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    /**
     * @return BelongsTo
     * TODO(2.1): Relates to App\Models\Rider once created in Task 2.1
     */
    public function rider(): BelongsTo
    {
        return $this->belongsTo('App\Models\Rider', 'rider_id');
    }
}
