<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * One barangay a hub covers. sorting_centers.coverage_barangays stays the source of truth; these rows are an index of
 * it, rewritten whenever a hub's list changes (SortingCenter::saved), so "which hub covers this barangay" is one indexed
 * query across thousands of hubs.
 *
 * @property int $id
 * @property int $sorting_center_id
 * @property string $barangay_code
 * @property string $city_code
 */
class HubCoverage extends Model
{
    protected $table = 'hub_coverage';

    public $timestamps = false;

    protected $fillable = ['sorting_center_id', 'barangay_code', 'city_code'];

    public function hub(): BelongsTo
    {
        return $this->belongsTo(SortingCenter::class, 'sorting_center_id');
    }

    /**
     * The PSGC city or municipality of a barangay code: RRPPMM000 for a 9-digit code, RRPPMMM000 for a 10-digit one.
     * The City of Manila is split into sub-municipalities (Tondo, Sampaloc, ...); its barangays all belong to it.
     */
    public static function cityOf(string $code): string
    {
        $code = trim($code);
        if (strlen($code) === 10) {
            return str_starts_with($code, '13806') ? '1380600000' : substr($code, 0, 7) . '000';
        }

        return str_starts_with($code, '1339') ? '133900000' : substr($code, 0, 6) . '000';
    }

    /** Rewrites one hub's rows from its coverage list. */
    public static function syncHub(SortingCenter $hub): void
    {
        $codes = collect($hub->coverage_barangays ?? [])->map(fn ($c) => trim((string) $c))
            ->filter(fn ($c) => preg_match('/^\d{9,10}$/', $c))->unique()->values();

        DB::transaction(function () use ($hub, $codes) {
            static::where('sorting_center_id', $hub->id)->delete();
            foreach ($codes->chunk(1000) as $chunk) {
                static::insert($chunk->map(fn ($c) => ['sorting_center_id' => $hub->id, 'barangay_code' => $c, 'city_code' => self::cityOf($c)])->all());
            }
        });
    }
}
