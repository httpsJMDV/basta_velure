<?php

namespace App\Services\Demo;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Removes the demo data and nothing else.
 *
 * A demo row is one reachable from a demo user (an email on config('demo.email_domain')): their orders, parcels,
 * products, chats and so on, including soft-deleted rows. Rows are found through the users, never by pattern, so a
 * real account, order or product is never matched. Deletion runs in dependency order inside one transaction.
 *
 * If a NON-demo row depends on a demo one (for example a real buyer ordered from a demo seller), nothing is deleted
 * and the problem is reported, rather than deleting or orphaning real data.
 */
class DemoCleaner
{
    /** @return string the SQL LIKE pattern for demo emails */
    private function emailPattern(): string
    {
        return '%@' . config('demo.email_domain');
    }

    /**
     * What a reset would remove right now, without removing anything.
     *
     * @return array<string, int> table => rows
     */
    public function preview(): array
    {
        $ids = $this->collectIds();

        return $this->counts($ids);
    }

    /**
     * @return array<string, int> table => rows deleted (only tables where something was deleted)
     */
    public function reset(): array
    {
        $ids = $this->collectIds();

        $files = $this->collectFiles($ids);
        $deleted = [];

        if ($ids['users']->isNotEmpty()) {
            $this->assertNothingElseDependsOnDemoRows($ids);

            DB::transaction(function () use ($ids, &$deleted) {
                $deleted = $this->deleteRows($ids);
            });
        }

        $removedFiles = $this->deleteFiles($files);
        if ($removedFiles > 0) {
            $deleted['files'] = $removedFiles;
        }

        return array_filter($deleted, fn (int $n) => $n > 0);
    }

    // ── Finding the demo rows ────────────────────────────────────────────────

    /**
     * @return array<string, Collection<int, int>>
     */
    private function collectIds(): array
    {
        $users = DB::table('users')->where('email', 'like', $this->emailPattern())->pluck('id');

        $hubs = DB::table('sorting_centers')->whereIn('user_id', $users)->pluck('id');
        $riders = DB::table('riders')->whereIn('user_id', $users)->pluck('id');
        $orders = DB::table('orders')->whereIn('buyer_id', $users)->pluck('id');
        $parcels = DB::table('parcels')
            ->where(fn ($q) => $q->whereIn('order_id', $orders)->orWhereIn('seller_id', $users))
            ->pluck('id');
        $products = DB::table('products')->whereIn('seller_id', $users)->pluck('id');
        $conversations = DB::table('conversations')
            ->where(function ($q) use ($users, $hubs) {
                $q->whereIn('buyer_id', $users)->orWhereIn('seller_id', $users)->orWhereIn('rider_id', $users)->orWhereIn('sorting_center_id', $hubs);
            })
            ->pluck('id');
        $wishlists = DB::table('wishlists')->whereIn('user_id', $users)->pluck('id');

        return compact('users', 'hubs', 'riders', 'orders', 'parcels', 'products', 'conversations', 'wishlists');
    }

    /**
     * Refuse (touching nothing) when a real row hangs off a demo one.
     *
     * @param array<string, Collection<int, int>> $ids
     */
    private function assertNothingElseDependsOnDemoRows(array $ids): void
    {
        $blockers = [
            'order items from a demo seller on a non-demo order' => DB::table('order_items')
                ->whereIn('seller_id', $ids['users'])->whereNotIn('order_id', $ids['orders'])->count(),
            'reviews of demo products by non-demo buyers' => DB::table('reviews')
                ->whereIn('product_id', $ids['products'])->whereNotIn('buyer_id', $ids['users'])->count(),
            'wishlist items on demo products in non-demo wishlists' => DB::table('wishlist_items')
                ->whereIn('product_id', $ids['products'])->whereNotIn('wishlist_id', $ids['wishlists'])->count(),
            'non-demo disputes resolved by a demo admin' => DB::table('disputes')
                ->whereIn('resolved_by', $ids['users'])->whereNotIn('order_id', $ids['orders'])->count(),
            'non-demo seller applications reviewed by a demo admin' => DB::table('seller_profiles')
                ->whereIn('reviewed_by', $ids['users'])->whereNotIn('user_id', $ids['users'])->count(),
        ];

        $found = array_filter($blockers);
        if ($found !== []) {
            $list = collect($found)->map(fn (int $n, string $what) => "{$n} {$what}")->implode('; ');
            throw new RuntimeException("Nothing was deleted: real data depends on demo rows ({$list}). Remove or reassign those first.");
        }
    }

    // ── Deleting ─────────────────────────────────────────────────────────────

    /**
     * @param array<string, Collection<int, int>> $ids
     * @return array<string, int>
     */
    private function deleteRows(array $ids): array
    {
        $u = $ids['users'];
        $deleted = [];
        $del = function (string $table, $query) use (&$deleted) {
            $deleted[$table] = ($deleted[$table] ?? 0) + $query->delete();
        };

        $del('messages', DB::table('messages')->whereIn('conversation_id', $ids['conversations']));
        $del('conversations', DB::table('conversations')->whereIn('id', $ids['conversations']));

        $del('rider_pickup_declines', DB::table('rider_pickup_declines')
            ->where(fn ($q) => $q->whereIn('rider_id', $ids['riders'])->orWhereIn('parcel_id', $ids['parcels'])));
        $del('rider_earnings', DB::table('rider_earnings')
            ->where(fn ($q) => $q->whereIn('rider_id', $ids['riders'])->orWhereIn('parcel_id', $ids['parcels'])));
        $del('delivery_logs', DB::table('delivery_logs')
            ->where(fn ($q) => $q->whereIn('rider_id', $ids['riders'])->orWhereIn('parcel_id', $ids['parcels'])));

        $del('order_status_histories', DB::table('order_status_histories')->whereIn('order_id', $ids['orders']));
        $del('payments', DB::table('payments')->whereIn('order_id', $ids['orders']));
        $del('disputes', DB::table('disputes')
            ->where(fn ($q) => $q->whereIn('order_id', $ids['orders'])->orWhereIn('buyer_id', $u)));
        $del('reviews', DB::table('reviews')
            ->where(fn ($q) => $q->whereIn('order_id', $ids['orders'])->orWhereIn('buyer_id', $u)->orWhereIn('product_id', $ids['products'])));
        $del('order_items', DB::table('order_items')
            ->where(fn ($q) => $q->whereIn('order_id', $ids['orders'])->orWhereIn('seller_id', $u)));
        $del('parcels', DB::table('parcels')->whereIn('id', $ids['parcels']));
        $del('orders', DB::table('orders')->whereIn('id', $ids['orders']));

        $del('wishlist_items', DB::table('wishlist_items')
            ->where(fn ($q) => $q->whereIn('wishlist_id', $ids['wishlists'])->orWhereIn('product_id', $ids['products'])));
        $del('wishlists', DB::table('wishlists')->whereIn('id', $ids['wishlists']));
        $del('store_follows', DB::table('store_follows')
            ->where(fn ($q) => $q->whereIn('user_id', $u)->orWhereIn('seller_id', $u)));

        $del('product_images', DB::table('product_images')->whereIn('product_id', $ids['products']));
        $del('product_variants', DB::table('product_variants')->whereIn('product_id', $ids['products']));
        $del('products', DB::table('products')->whereIn('id', $ids['products']));

        $del('payout_requests', DB::table('payout_requests')->whereIn('seller_id', $u));
        $del('addresses', DB::table('addresses')->whereIn('user_id', $u));
        $del('admin_activity_logs', DB::table('admin_activity_logs')->whereIn('admin_id', $u));

        $del('rider_area_assignments', DB::table('rider_area_assignments')
            ->where(fn ($q) => $q->whereIn('rider_id', $ids['riders'])->orWhereIn('sorting_center_id', $ids['hubs'])));
        $del('riders', DB::table('riders')->whereIn('id', $ids['riders']));
        $del('sorting_centers', DB::table('sorting_centers')->whereIn('id', $ids['hubs']));
        $del('seller_profiles', DB::table('seller_profiles')->whereIn('user_id', $u));

        $del('personal_access_tokens', DB::table('personal_access_tokens')
            ->where('tokenable_type', 'App\\Models\\User')->whereIn('tokenable_id', $u));
        $del('sessions', DB::table('sessions')->whereIn('user_id', $u));
        $del('users', DB::table('users')->whereIn('id', $u));

        return $deleted;
    }

    // ── Files ────────────────────────────────────────────────────────────────

    /**
     * @param array<string, Collection<int, int>> $ids
     * @return array<string, array<int, string>> disk => paths
     */
    private function collectFiles(array $ids): array
    {
        $prefix = trim((string) config('demo.storage_prefix'), '/') . '/';
        $private = [];
        $public = [];

        $add = function (array &$bucket, $values) use ($prefix) {
            foreach ($values as $path) {
                if (is_string($path) && str_starts_with($path, $prefix)) {
                    $bucket[] = $path;
                }
            }
        };

        $add($private, DB::table('parcels')->whereIn('id', $ids['parcels'])->pluck('delivery_proof_path'));
        $add($private, DB::table('parcels')->whereIn('id', $ids['parcels'])->pluck('delivery_proof_path_2'));
        $add($private, DB::table('riders')->whereIn('id', $ids['riders'])->pluck('or_cr_path'));
        $add($private, DB::table('riders')->whereIn('id', $ids['riders'])->pluck('drivers_license_path'));
        $add($private, DB::table('sorting_centers')->whereIn('id', $ids['hubs'])->pluck('dti_permit_path'));
        foreach (['government_id_image_path', 'government_id_image_back_path', 'selfie_with_id_path', 'business_permit_path', 'dti_sec_registration_path', 'fda_lto_path'] as $column) {
            $add($private, DB::table('seller_profiles')->whereIn('user_id', $ids['users'])->pluck($column));
        }
        $add($private, DB::table('users')->whereIn('id', $ids['users'])->pluck('government_id_image_path'));

        $add($public, DB::table('orders')->whereIn('id', $ids['orders'])->pluck('payment_proof_path'));
        $add($public, DB::table('product_images')->whereIn('product_id', $ids['products'])->pluck('path'));
        $add($public, DB::table('seller_profiles')->whereIn('user_id', $ids['users'])->pluck('logo_path'));
        $add($public, DB::table('seller_profiles')->whereIn('user_id', $ids['users'])->pluck('banner_path'));
        $add($public, DB::table('users')->whereIn('id', $ids['users'])->pluck('avatar_path'));

        return ['ids' => array_values(array_unique($private)), 'public' => array_values(array_unique($public))];
    }

    /**
     * Removes the listed files, then the whole demo folder on each disk (everything the seeder writes lives there).
     *
     * @param array<string, array<int, string>> $files
     */
    private function deleteFiles(array $files): int
    {
        $removed = 0;
        $folder = trim((string) config('demo.storage_prefix'), '/');

        foreach ($files as $disk => $paths) {
            $storage = Storage::disk($disk);
            foreach ($paths as $path) {
                if ($storage->exists($path)) {
                    $storage->delete($path);
                    $removed++;
                }
            }

            if ($folder !== '' && $storage->exists($folder)) {
                $leftover = count($storage->allFiles($folder));
                $storage->deleteDirectory($folder);
                $removed += $leftover;
            }
        }

        return $removed;
    }

    // ── Counting (for the preview) ───────────────────────────────────────────

    /**
     * @param array<string, Collection<int, int>> $ids
     * @return array<string, int>
     */
    private function counts(array $ids): array
    {
        $counts = [
            'users'         => $ids['users']->count(),
            'sorting_centers' => $ids['hubs']->count(),
            'riders'        => $ids['riders']->count(),
            'products'      => $ids['products']->count(),
            'orders'        => $ids['orders']->count(),
            'parcels'       => $ids['parcels']->count(),
            'conversations' => $ids['conversations']->count(),
            'reviews'       => DB::table('reviews')
                ->where(fn ($q) => $q->whereIn('order_id', $ids['orders'])->orWhereIn('buyer_id', $ids['users'])->orWhereIn('product_id', $ids['products']))
                ->count(),
        ];

        return array_filter($counts, fn (int $n) => $n > 0);
    }
}
