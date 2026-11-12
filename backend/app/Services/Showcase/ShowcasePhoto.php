<?php

namespace App\Services\Showcase;

/**
 * Makes a downloaded product photo look like the rest of the catalog: a square JPEG, up to 1000 px.
 *
 *  - "cover" fills the square and trims the long side around the centre (a photo with its own background);
 *  - "contain" keeps the whole product with a margin: on white when the photo is a studio shot on white, otherwise
 *    on the storefront's warm off-white mat, the same for every product.
 *
 * Without GD (it is part of every PHP build here) the original bytes are kept.
 */
final class ShowcasePhoto
{
    public const SIZE = 1000;

    public static function square(string $bytes, string $fit = 'cover'): ?string
    {
        if (! function_exists('imagecreatefromstring')) {
            return $bytes;
        }
        $src = @imagecreatefromstring($bytes);
        if (! $src) {
            return null;
        }
        $w = imagesx($src);
        $h = imagesy($src);
        if ($w < 200 || $h < 200) {
            return null;
        }

        if ($fit === 'contain') {
            $side = min(self::SIZE, max($w, $h));
            $out = imagecreatetruecolor($side, $side);
            [$r, $g, $b] = self::edgeColour($src, $w, $h);
            // A studio shot on white stays on clean white; any other photo sits on the storefront's warm off-white mat
            // (#F4F1EC, a shade under the page's #FAF8F5), the same for every product, like a print in a frame.
            $mat = min($r, $g, $b) >= 228 ? [255, 255, 255] : [244, 241, 236];
            imagefill($out, 0, 0, imagecolorallocate($out, ...$mat));
            $scale = min($side / $w, $side / $h) * ($mat[0] === 255 ? 0.9 : 0.86);
            $dw = (int) round($w * $scale);
            $dh = (int) round($h * $scale);
            imagecopyresampled($out, $src, intdiv($side - $dw, 2), intdiv($side - $dh, 2), 0, 0, $dw, $dh, $w, $h);
        } else {
            $crop = min($w, $h);
            $side = min(self::SIZE, $crop);
            $out = imagecreatetruecolor($side, $side);
            imagecopyresampled($out, $src, 0, 0, intdiv($w - $crop, 2), intdiv($h - $crop, 2), $side, $side, $crop, $crop);
        }

        ob_start();
        imagejpeg($out, null, 86);
        $jpeg = (string) ob_get_clean();

        return $jpeg !== '' ? $jpeg : null;
    }

    /** The average colour of the photo's outer border, for padding. */
    private static function edgeColour(\GdImage $img, int $w, int $h): array
    {
        $sum = [0, 0, 0];
        $n = 0;
        $step = max(1, intdiv(min($w, $h), 40));
        for ($x = 0; $x < $w; $x += $step) {
            foreach ([0, $h - 1] as $y) {
                $c = imagecolorat($img, $x, $y);
                $sum[0] += ($c >> 16) & 0xFF;
                $sum[1] += ($c >> 8) & 0xFF;
                $sum[2] += $c & 0xFF;
                $n++;
            }
        }
        for ($y = 0; $y < $h; $y += $step) {
            foreach ([0, $w - 1] as $x) {
                $c = imagecolorat($img, $x, $y);
                $sum[0] += ($c >> 16) & 0xFF;
                $sum[1] += ($c >> 8) & 0xFF;
                $sum[2] += $c & 0xFF;
                $n++;
            }
        }

        return array_map(fn ($v) => (int) round($v / max(1, $n)), $sum);
    }
}
