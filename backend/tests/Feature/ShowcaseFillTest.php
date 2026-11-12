<?php

namespace Tests\Feature;

use App\Services\Showcase\ShowcasePhoto;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/**
 * The defense data seeders (showcase:fill-catalog, showcase:orders) only ever run on a real database, never on the test
 * one, and the product photos they store are always square.
 */
class ShowcaseFillTest extends TestCase
{
    use DatabaseTransactions;

    private function jpeg(int $w, int $h, array $rgb): string
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, ...$rgb));
        ob_start();
        imagejpeg($img);

        return (string) ob_get_clean();
    }

    public function test_photos_come_out_square_in_both_fits(): void
    {
        foreach (['cover', 'contain'] as $fit) {
            $out = ShowcasePhoto::square($this->jpeg(1600, 900, [40, 90, 160]), $fit);
            $this->assertNotNull($out);
            [$w, $h] = getimagesizefromstring($out);
            $this->assertSame($w, $h, $fit);
            $this->assertLessThanOrEqual(ShowcasePhoto::SIZE, $w);
        }

        // A studio shot on white is padded with white; any other photo with the warm mat.
        $white = imagecreatefromstring(ShowcasePhoto::square($this->jpeg(800, 400, [255, 255, 255]), 'contain'));
        $this->assertSame(255, (imagecolorat($white, 2, 2) >> 16) & 0xFF);
        $dark = imagecreatefromstring(ShowcasePhoto::square($this->jpeg(800, 400, [20, 20, 20]), 'contain'));
        $this->assertEqualsWithDelta(244, (imagecolorat($dark, 2, 2) >> 16) & 0xFF, 3);

        $this->assertNull(ShowcasePhoto::square('not an image'));
        $this->assertNull(ShowcasePhoto::square($this->jpeg(120, 120, [0, 0, 0])));
    }

    public function test_the_seeders_refuse_the_test_database(): void
    {
        $this->artisan('showcase:fill-catalog', ['--force' => true])->assertFailed();
        $this->artisan('showcase:orders', ['--force' => true])->assertFailed();
        $this->artisan('showcase:shop-banners', ['--force' => true])->assertFailed();
    }
}
