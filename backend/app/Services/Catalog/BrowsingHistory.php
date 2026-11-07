<?php

namespace App\Services\Catalog;

use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A signed-in shopper's recently viewed products and recent searches. Written when they open a product page or search
 * (nothing extra for the website or the app to call), read for "Recently viewed" and the search box, and cleared on
 * request. Guests leave nothing behind.
 */
class BrowsingHistory
{
    public const KEEP_VIEWS = 30;

    public const KEEP_SEARCHES = 15;

    public function viewed(User $user, Product $product): void
    {
        DB::table('product_views')->upsert(
            [['user_id' => $user->id, 'product_id' => $product->id, 'viewed_at' => now()]],
            ['user_id', 'product_id'],
            ['viewed_at'],
        );
        $this->trim('product_views', 'viewed_at', $user->id, self::KEEP_VIEWS);
    }

    public function searched(User $user, string $query): void
    {
        $query = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $query) ?? ''));
        if (mb_strlen($query) < 2) {
            return;
        }
        DB::table('search_histories')->upsert(
            [['user_id' => $user->id, 'query' => mb_substr($query, 0, 100), 'searched_at' => now()]],
            ['user_id', 'query'],
            ['searched_at'],
        );
        $this->trim('search_histories', 'searched_at', $user->id, self::KEEP_SEARCHES);
    }

    /** @return Collection<int, int> product ids, newest first */
    public function viewedIds(User $user, int $limit = self::KEEP_VIEWS): Collection
    {
        return DB::table('product_views')->where('user_id', $user->id)->orderByDesc('viewed_at')->limit($limit)->pluck('product_id');
    }

    /** @return list<array{id: int, query: string, searched_at: string}> */
    public function searches(User $user): array
    {
        return DB::table('search_histories')->where('user_id', $user->id)->orderByDesc('searched_at')->limit(self::KEEP_SEARCHES)
            ->get(['id', 'query', 'searched_at'])
            ->map(fn ($r) => ['id' => (int) $r->id, 'query' => $r->query, 'searched_at' => \Carbon\Carbon::parse($r->searched_at)->toIso8601String()])
            ->all();
    }

    public function clearViews(User $user): void
    {
        DB::table('product_views')->where('user_id', $user->id)->delete();
    }

    public function clearSearches(User $user, ?int $id = null): void
    {
        DB::table('search_histories')->where('user_id', $user->id)->when($id, fn ($q) => $q->where('id', $id))->delete();
    }

    private function trim(string $table, string $column, int $userId, int $keep): void
    {
        $cut = DB::table($table)->where('user_id', $userId)->orderByDesc($column)->orderByDesc('id')->skip($keep)->take(1)->value('id');
        if ($cut !== null) {
            $edge = DB::table($table)->where('id', $cut)->value($column);
            DB::table($table)->where('user_id', $userId)->where(fn ($q) => $q->where($column, '<', $edge)->orWhere(fn ($w) => $w->where($column, $edge)->where('id', '<=', $cut)))->delete();
        }
    }
}
