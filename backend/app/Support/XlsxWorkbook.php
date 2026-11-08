<?php

namespace App\Support;

use Carbon\CarbonInterface;
use RuntimeException;
use ZipArchive;

/**
 * An Excel (.xlsx) workbook on PHP's own ZipArchive, so reports download as real workbooks (several sheets, bold
 * headers, peso and date formats, set column widths, a frozen header row) without a spreadsheet library.
 *
 * Text is written as inline strings, never as formulas, so a cell that starts with = + - @ stays plain text.
 * XlsxWriter is the plain one-sheet version the courier's COD export uses.
 *
 * $xlsx = new XlsxWorkbook('Sales report', 'Loved-IT');
 * $xlsx->sheet('Orders', [18, 14, 16], [[XlsxWorkbook::header('Order'), ...], ['VEL-1', XlsxWorkbook::money(450)]], freezeRows: 1);
 * $bytes = $xlsx->bytes();
 */
final class XlsxWorkbook
{
    /** Cell styles, as the index of their <xf> in styles.xml. */
    private const STYLE = [
        'default' => 0, 'header' => 1, 'money' => 2, 'int' => 3, 'date' => 4, 'title' => 5, 'muted' => 6,
        'total' => 7, 'total_money' => 8, 'total_int' => 9, 'percent' => 10, 'datetime' => 11, 'label' => 12, 'total_percent' => 13,
    ];

    /** @var list<array{name: string, xml: string}> */
    private array $sheets = [];

    public function __construct(private readonly string $title = 'Report', private readonly string $creator = 'Loved-IT')
    {
    }

    public static function available(): bool
    {
        return class_exists(ZipArchive::class);
    }

    // ── Cells ─────────────────────────────────────────────────────────────────

    /** @return array{v: mixed, s: string} */
    public static function header(string $text): array
    {
        return ['v' => $text, 's' => 'header'];
    }

    /** @return array{v: mixed, s: string} */
    public static function money(float|int|string|null $amount, bool $total = false): array
    {
        return ['v' => round((float) $amount, 2), 's' => $total ? 'total_money' : 'money'];
    }

    /** @return array{v: mixed, s: string} */
    public static function int(int|float|null $n, bool $total = false): array
    {
        return ['v' => (int) $n, 's' => $total ? 'total_int' : 'int'];
    }

    /** A share between 0 and 1, shown as a percentage. */
    public static function percent(float $share, bool $total = false): array
    {
        return ['v' => round($share, 4), 's' => $total ? 'total_percent' : 'percent'];
    }

    /** @return array{v: mixed, s: string} */
    public static function date(?CarbonInterface $date, bool $withTime = false): array
    {
        return ['v' => $date, 's' => $withTime ? 'datetime' : 'date'];
    }

    /** @return array{v: mixed, s: string} */
    public static function text(?string $text, string $style = 'default'): array
    {
        return ['v' => (string) $text, 's' => $style];
    }

    // ── Sheets ────────────────────────────────────────────────────────────────

    /**
     * @param  list<float|int>  $widths  column widths, in characters
     * @param  list<list<mixed>>  $rows  each cell a scalar, null, or one of the cell helpers above
     */
    public function sheet(string $name, array $widths, array $rows, int $freezeRows = 0): self
    {
        $name = mb_substr(str_replace(['\\', '/', '?', '*', '[', ']', ':'], ' ', $name), 0, 31);
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
        $xml .= '<sheetViews><sheetView workbookViewId="0"' . (count($this->sheets) === 0 ? ' tabSelected="1"' : '') . ' showGridLines="0">';
        if ($freezeRows > 0) {
            $xml .= '<pane ySplit="' . $freezeRows . '" topLeftCell="A' . ($freezeRows + 1) . '" activePane="bottomLeft" state="frozen"/>';
        }
        $xml .= '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
        if ($widths !== []) {
            $xml .= '<cols>';
            foreach (array_values($widths) as $i => $w) {
                $xml .= '<col min="' . ($i + 1) . '" max="' . ($i + 1) . '" width="' . round((float) $w, 2) . '" customWidth="1"/>';
            }
            $xml .= '</cols>';
        }
        $xml .= '<sheetData>';
        foreach (array_values($rows) as $r => $row) {
            $height = $this->rowHeight($row);
            $xml .= '<row r="' . ($r + 1) . '"' . ($height ? ' ht="' . $height . '" customHeight="1"' : '') . '>';
            foreach (array_values($row) as $c => $cell) {
                $xml .= $this->cell(self::column($c) . ($r + 1), $cell);
            }
            $xml .= '</row>';
        }
        $xml .= '</sheetData>';
        $xml .= '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
        $xml .= '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
        $this->sheets[] = ['name' => $name, 'xml' => $xml];

        return $this;
    }

    /** The workbook as the bytes of an .xlsx file. */
    public function bytes(): string
    {
        if (! self::available()) {
            throw new RuntimeException('ZipArchive is not available.');
        }
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', $this->contentTypes());
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
        $zip->addFromString('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            . '<dc:title>' . self::esc($this->title) . '</dc:title><dc:creator>' . self::esc($this->creator) . '</dc:creator>'
            . '<dcterms:created xsi:type="dcterms:W3CDTF">' . gmdate('Y-m-d\TH:i:s\Z') . '</dcterms:created></cp:coreProperties>');
        $zip->addFromString('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Loved-IT</Application></Properties>');
        $zip->addFromString('xl/workbook.xml', $this->workbook());
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->workbookRels());
        $zip->addFromString('xl/styles.xml', $this->styles());
        foreach ($this->sheets as $i => $sheet) {
            $zip->addFromString('xl/worksheets/sheet' . ($i + 1) . '.xml', $sheet['xml']);
        }
        $zip->close();
        $bytes = (string) file_get_contents($path);
        @unlink($path);

        return $bytes;
    }

    // ── Parts ─────────────────────────────────────────────────────────────────

    private function cell(string $ref, mixed $cell): string
    {
        $style = 'default';
        $value = $cell;
        if (is_array($cell) && array_key_exists('v', $cell)) {
            $value = $cell['v'];
            $style = $cell['s'] ?? 'default';
        }
        $s = self::STYLE[$style] ?? 0;
        $attr = $s ? ' s="' . $s . '"' : '';

        if ($value === null || $value === '') {
            return $s ? '<c r="' . $ref . '"' . $attr . '/>' : '';
        }
        if ($value instanceof CarbonInterface) {
            // Excel counts days from 1899-12-30; the time of day is the fraction. Manila time is what sellers read.
            $local = $value->copy()->setTimezone('Asia/Manila');
            $serial = ($local->copy()->startOfDay()->diffInDays(\Carbon\Carbon::create(1899, 12, 30, 0, 0, 0, 'Asia/Manila'), true))
                + ($local->secondsSinceMidnight() / 86400);

            return '<c r="' . $ref . '"' . $attr . '><v>' . round($serial, 6) . '</v></c>';
        }
        if (is_bool($value)) {
            $value = $value ? 'Yes' : 'No';
        }
        if (is_int($value) || is_float($value)) {
            return '<c r="' . $ref . '"' . $attr . '><v>' . (is_float($value) ? rtrim(rtrim(number_format($value, 6, '.', ''), '0'), '.') : $value) . '</v></c>';
        }

        return '<c r="' . $ref . '"' . $attr . ' t="inlineStr"><is><t xml:space="preserve">' . self::esc((string) $value) . '</t></is></c>';
    }

    /** Taller rows for the title and the header row, so the sheet reads like a report. */
    private function rowHeight(array $row): ?int
    {
        foreach ($row as $cell) {
            $s = is_array($cell) ? ($cell['s'] ?? '') : '';
            if ($s === 'title') {
                return 26;
            }
            if ($s === 'header') {
                return 22;
            }
        }

        return null;
    }

    private function contentTypes(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            . '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
        foreach (array_keys($this->sheets) as $i) {
            $xml .= '<Override PartName="/xl/worksheets/sheet' . ($i + 1) . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }

        return $xml . '</Types>';
    }

    private function workbook(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
        foreach ($this->sheets as $i => $sheet) {
            $xml .= '<sheet name="' . self::esc($sheet['name']) . '" sheetId="' . ($i + 1) . '" r:id="rId' . ($i + 1) . '"/>';
        }

        return $xml . '</sheets></workbook>';
    }

    private function workbookRels(): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        foreach (array_keys($this->sheets) as $i) {
            $xml .= '<Relationship Id="rId' . ($i + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . ($i + 1) . '.xml"/>';
        }
        $n = count($this->sheets) + 1;

        return $xml . '<Relationship Id="rId' . $n . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    }

    /** Fonts, fills, borders and the cell formats the STYLE indexes point at (same order). */
    private function styles(): string
    {
        $peso = self::esc('"₱"#,##0.00');

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="3"><numFmt numFmtId="164" formatCode="' . $peso . '"/><numFmt numFmtId="165" formatCode="mmm d, yyyy"/><numFmt numFmtId="166" formatCode="mmm d, yyyy h:mm AM/PM"/></numFmts>'
            . '<fonts count="6">'
            . '<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>'
            . '<font><b/><sz val="16"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>'
            . '<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/></font>'
            . '<font><sz val="11"/><color rgb="FF4B5563"/><name val="Calibri"/><family val="2"/></font>'
            . '</fonts>'
            . '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>'
            . '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>'
            . '<border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="14">'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="center"/></xf>'                                                         // 0 default
            . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>'                                           // 1 header
            . '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>'                              // 2 money
            . '<xf numFmtId="3" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>'                                // 3 int
            . '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>'            // 4 date
            . '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"><alignment vertical="center"/></xf>'                                                        // 5 title
            . '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"><alignment vertical="center"/></xf>'                                                        // 6 muted
            . '<xf numFmtId="0" fontId="4" fillId="3" borderId="2" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'                          // 7 total
            . '<xf numFmtId="164" fontId="4" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'  // 8 total money
            . '<xf numFmtId="3" fontId="4" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'    // 9 total int
            . '<xf numFmtId="10" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>'                               // 10 percent
            . '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>'            // 11 datetime
            . '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>'                                        // 12 label
            . '<xf numFmtId="10" fontId="4" fillId="3" borderId="2" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>'   // 13 total percent
            . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    }

    /** A, B, ... Z, AA, AB, ... for a zero-based column. */
    public static function column(int $index): string
    {
        $name = '';
        for ($n = $index + 1; $n > 0; $n = intdiv($n - 1, 26)) {
            $name = chr(65 + ($n - 1) % 26) . $name;
        }

        return $name;
    }

    private static function esc(string $text): string
    {
        // Control characters other than tab and newline are not allowed in XML 1.0.
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $text) ?? '';

        return htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
