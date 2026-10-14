<?php

namespace App\Services\Demo;

/**
 * A small valid PNG made in plain PHP (the GD extension is not required). It is a soft diagonal-striped block of one
 * colour, enough for a product photo or a delivery proof to look like an image in the app.
 */
final class PlaceholderImage
{
    private const STRIPE = 48;

    /**
     * @param array{0: int, 1: int, 2: int} $rgb
     */
    public static function png(int $width, int $height, array $rgb): string
    {
        // One stripe period of pixels, repeated across the row; each row is the same pattern shifted by one pixel.
        $period = '';
        for ($i = 0; $i < self::STRIPE; $i++) {
            $shade = (int) ($i / self::STRIPE * 40) - 20;
            $period .= chr(max(0, min(255, $rgb[0] + $shade))) . chr(max(0, min(255, $rgb[1] + $shade))) . chr(max(0, min(255, $rgb[2] + $shade)));
        }
        $repeated = str_repeat($period, intdiv($width, self::STRIPE) + 2);

        $raw = '';
        for ($y = 0; $y < $height; $y++) {
            $raw .= "\x00" . substr($repeated, ($y % self::STRIPE) * 3, $width * 3); // filter type none, then the pixels
        }

        return "\x89PNG\r\n\x1a\n"
            . self::chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
            . self::chunk('IDAT', gzcompress($raw, 6))
            . self::chunk('IEND', '');
    }

    private static function chunk(string $type, string $data): string
    {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    }
}
