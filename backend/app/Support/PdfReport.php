<?php

namespace App\Support;

/**
 * A plain A4 PDF written by hand (PDF 1.4, the two standard Helvetica fonts, filled boxes and rules), so reports
 * download as real PDF files on the website and in the app without a PDF library. Text is Windows-1252, which
 * covers English and Filipino names (ñ, é); the peso sign is not in it, so amounts print as "PHP 1,250.00".
 *
 * Coordinates are in points from the top-left corner of the page; y is the text baseline.
 *
 * $pdf = new PdfReport('Hub report');
 * $pdf->addPage();
 * $pdf->text(40, 60, 'Hello', 12, bold: true);
 * $bytes = $pdf->bytes();
 */
final class PdfReport
{
    public const WIDTH = 595.28;
    public const HEIGHT = 841.89;

    /** Helvetica widths (per 1000 em) for the printable ASCII range 32 to 126. */
    private const REGULAR = [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
        1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
        333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
        556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
    ];

    /** Helvetica-Bold widths for 32 to 126. */
    private const BOLD = [
        278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
        556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
        975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
        667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
        333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
        611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
    ];

    /** Widths of the Windows-1252 characters above 126 that reports use; any other one counts as 556. */
    private const HIGH = [0x85 => 1000, 0x91 => 222, 0x92 => 222, 0x93 => 333, 0x94 => 333, 0x95 => 350, 0x96 => 556, 0x97 => 1000, 0xB7 => 278, 0xD7 => 584, 0xA0 => 278];

    /** @var list<string> one content stream per page */
    private array $pages = [];

    private int $page = -1;

    public function __construct(private readonly string $title = 'Report', private readonly string $author = 'Loved-IT')
    {
    }

    public function addPage(): void
    {
        $this->pages[] = '';
        $this->page = count($this->pages) - 1;
    }

    public function pageCount(): int
    {
        return count($this->pages);
    }

    /** Write on an earlier page (page numbers in the footers once the total is known). Zero-based. */
    public function onPage(int $index): void
    {
        $this->page = max(0, min($index, count($this->pages) - 1));
    }

    /**
     * @param  array{0: float, 1: float, 2: float}  $rgb  0 to 1
     * @param  'left'|'right'|'center'  $align  where x is: the left edge, the right edge or the middle
     */
    public function text(float $x, float $y, string $text, float $size = 10, bool $bold = false, array $rgb = [0.11, 0.1, 0.09], string $align = 'left'): void
    {
        $encoded = self::encode($text);
        if ($encoded === '') {
            return;
        }
        $width = self::measure($encoded, $size, $bold);
        $x = match ($align) {
            'right'  => $x - $width,
            'center' => $x - $width / 2,
            default  => $x,
        };
        $this->out(sprintf(
            "BT /F%d %.2F Tf %.3F %.3F %.3F rg %.2F %.2F Td (%s) Tj ET\n",
            $bold ? 2 : 1, $size, $rgb[0], $rgb[1], $rgb[2], $x, self::HEIGHT - $y, self::escape($encoded)
        ));
    }

    /** A filled box; (x, y) is its top-left corner. */
    public function rect(float $x, float $y, float $w, float $h, array $fill, ?array $stroke = null, float $lineWidth = 0.6): void
    {
        $ops = sprintf('%.3F %.3F %.3F rg ', $fill[0], $fill[1], $fill[2]);
        if ($stroke) {
            $ops .= sprintf('%.3F %.3F %.3F RG %.2F w ', $stroke[0], $stroke[1], $stroke[2], $lineWidth);
        }
        $this->out($ops . sprintf("%.2F %.2F %.2F %.2F re %s\n", $x, self::HEIGHT - $y - $h, $w, $h, $stroke ? 'B' : 'f'));
    }

    public function line(float $x1, float $y1, float $x2, float $y2, array $rgb = [0.84, 0.83, 0.82], float $width = 0.6): void
    {
        $this->out(sprintf(
            "%.3F %.3F %.3F RG %.2F w %.2F %.2F m %.2F %.2F l S\n",
            $rgb[0], $rgb[1], $rgb[2], $width, $x1, self::HEIGHT - $y1, $x2, self::HEIGHT - $y2
        ));
    }

    /** How wide the text prints, in points. */
    public static function width(string $text, float $size, bool $bold = false): float
    {
        return self::measure(self::encode($text), $size, $bold);
    }

    /** The text, shortened with "..." so it fits in the width. */
    public static function fit(string $text, float $maxWidth, float $size, bool $bold = false): string
    {
        if (self::width($text, $size, $bold) <= $maxWidth) {
            return $text;
        }
        $chars = mb_str_split($text);
        while ($chars !== [] && self::width(implode('', $chars) . '...', $size, $bold) > $maxWidth) {
            array_pop($chars);
        }

        return $chars === [] ? '' : rtrim(implode('', $chars)) . '...';
    }

    /** The PDF file. */
    public function bytes(): string
    {
        if ($this->pages === []) {
            $this->addPage();
        }
        $compress = function_exists('gzcompress');
        $objects = [];
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        $objects[5] = sprintf(
            '<< /Title (%s) /Author (%s) /Producer (Loved-IT) /CreationDate (D:%s) >>',
            self::escape(self::encode($this->title)), self::escape(self::encode($this->author)), gmdate('YmdHis') . 'Z'
        );

        $kids = [];
        $next = 6;
        foreach ($this->pages as $content) {
            $pageId = $next++;
            $contentId = $next++;
            $kids[] = "{$pageId} 0 R";
            $objects[$pageId] = sprintf(
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>',
                self::WIDTH, self::HEIGHT, $contentId
            );
            $stream = $compress ? gzcompress($content, 6) : $content;
            $objects[$contentId] = '<< /Length ' . strlen($stream) . ($compress ? ' /Filter /FlateDecode' : '') . " >>\nstream\n" . $stream . "\nendstream";
        }
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($kids) . ' >>';
        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $count = max(array_keys($objects)) + 1;
        $pdf .= "xref\n0 {$count}\n0000000000 65535 f \n";
        for ($id = 1; $id < $count; $id++) {
            $pdf .= isset($offsets[$id]) ? sprintf("%010d 00000 n \n", $offsets[$id]) : "0000000000 65535 f \n";
        }
        $pdf .= "trailer\n<< /Size {$count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n{$xref}\n%%EOF\n";

        return $pdf;
    }

    private function out(string $ops): void
    {
        if ($this->page < 0) {
            $this->addPage();
        }
        $this->pages[$this->page] .= $ops;
    }

    /** UTF-8 to Windows-1252. The peso sign becomes "PHP ", and anything else it can't show becomes "?". */
    private static function encode(string $text): string
    {
        $text = str_replace(['₱', '→', '≥', '≤', "\r", "\n", "\t"], ['PHP ', '->', '>=', '<=', ' ', ' ', ' '], $text);
        $converted = @mb_convert_encoding($text, 'Windows-1252', 'UTF-8');

        return is_string($converted) ? $converted : preg_replace('/[^\x20-\x7E]/', '?', $text);
    }

    private static function measure(string $encoded, float $size, bool $bold): float
    {
        $table = $bold ? self::BOLD : self::REGULAR;
        $sum = 0;
        $length = strlen($encoded);
        for ($i = 0; $i < $length; $i++) {
            $code = ord($encoded[$i]);
            $sum += $code >= 32 && $code <= 126 ? $table[$code - 32] : (self::HIGH[$code] ?? 556);
        }

        return $sum * $size / 1000;
    }

    private static function escape(string $encoded): string
    {
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $encoded);
    }
}
