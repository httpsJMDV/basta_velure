<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\SellerProfile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Gives every showcase shop that has no banner one made from its own products: a row of up to five product photos
 * (best sellers first), 1800 x 360, with thin warm gaps, on the public disk. A shop that uploaded its own banner, and
 * every real (non-showcase) shop, is left alone; a seller can replace the banner any time in Seller Centre.
 */
class ShowcaseShopBannersCommand extends Command
{
    protected $signature = 'showcase:shop-banners {--force : Run in production without asking}';

    protected $description = 'Give showcase shops without a banner one made from their product photos';

    private const W = 1800;

    private const H = 360;

    private const GAP = 6;

    public function handle(): int
    {
        $database = DB::connection()->getDatabaseName();
        if (str_ends_with((string) $database, '_test')) {
            $this->error("Refusing to run on the test database ({$database}).");

            return self::FAILURE;
        }
        if (app()->isProduction() && ! $this->option('force') && ! $this->confirm("Add banners to showcase shops in {$database}?")) {
            return self::FAILURE;
        }
        if (! function_exists('imagecreatetruecolor')) {
            $this->error('GD is not available.');

            return self::FAILURE;
        }

        $disk = Storage::disk('public');
        $made = 0;
        $skipped = [];
        $shops = SellerProfile::with('user:id,username,email')->where('application_status', 'approved')->whereNull('banner_path')->get()
            ->filter(fn (SellerProfile $p) => preg_match('/^seller\d+$/', (string) $p->user?->username)
                && str_ends_with((string) $p->user?->email, '@' . config('showcase.email_domain')));

        foreach ($shops as $profile) {
            $photos = Product::with(['images' => fn ($q) => $q->orderByDesc('is_primary')->orderBy('sort_order')])
                ->where('seller_id', $profile->user_id)->where('status', 'active')
                ->orderByDesc('units_sold')->orderByDesc('review_count')->orderBy('id')->limit(12)->get()
                ->map(fn (Product $p) => $p->images->first()?->path)
                ->filter(fn ($path) => $path && $disk->exists($path))
                ->take(5)->values();
            if ($photos->isEmpty()) {
                $skipped[] = $profile->shop_name;
                continue;
            }

            $jpeg = $this->banner($photos->map(fn ($path) => $disk->get($path))->all());
            if (! $jpeg) {
                $skipped[] = $profile->shop_name;
                continue;
            }
            $path = trim((string) config('showcase.storage_prefix'), '/') . '/banners/' . $profile->user->username . '.jpg';
            $disk->put($path, $jpeg);
            $profile->forceFill(['banner_path' => $path])->save();
            $made++;
        }

        $this->info("Done: {$made} banners made." . ($skipped ? ' No photo for: ' . implode(', ', $skipped) : ''));

        return self::SUCCESS;
    }

    /** The photos side by side, each cropped to fill its tile, on the storefront's warm off-white. */
    private function banner(array $images): ?string
    {
        $tiles = array_values(array_filter(array_map(fn ($bytes) => @imagecreatefromstring($bytes) ?: null, $images)));
        $n = count($tiles);
        if ($n === 0) {
            return null;
        }
        $out = imagecreatetruecolor(self::W, self::H);
        imagefill($out, 0, 0, imagecolorallocate($out, 250, 248, 245));
        $tileW = intdiv(self::W - self::GAP * ($n - 1), $n);
        foreach ($tiles as $i => $src) {
            $w = imagesx($src);
            $h = imagesy($src);
            // Crop the middle of the photo to the tile's shape.
            $ratio = $tileW / self::H;
            [$cw, $ch] = $w / $h > $ratio ? [(int) round($h * $ratio), $h] : [$w, (int) round($w / $ratio)];
            imagecopyresampled($out, $src, $i * ($tileW + self::GAP), 0, intdiv($w - $cw, 2), intdiv($h - $ch, 2), $tileW, self::H, $cw, $ch);
        }
        ob_start();
        imagejpeg($out, null, 85);

        return (string) ob_get_clean() ?: null;
    }
}
