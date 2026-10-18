<?php

namespace App\Support;

use ZipArchive;

/**
 * Writes a one-sheet .xlsx file (Office Open XML) from a header row and data rows, with no library: numbers are
 * stored as numbers, everything else as text, and the header row is bold. Enough for the report exports, which
 * Excel, LibreOffice and Google Sheets all open.
 */
final class XlsxWriter
{
    /**
     * @param  list<string>  $header
     * @param  iterable<list<string|int|float|null>>  $rows
     * @return string the path of a temporary file; the caller deletes it
     */
    public static function write(string $sheetName, array $header, iterable $rows): string
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Could not create the spreadsheet.');
        }

        $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        $sheet .= self::row(1, $header, true);
        $n = 1;
        foreach ($rows as $row) {
            $sheet .= self::row(++$n, $row, false);
        }
        $sheet .= '</sheetData></worksheet>';

        $name = self::xml(mb_substr(preg_replace('/[\\\\\/\?\*\[\]:]/', ' ', $sheetName) ?: 'Sheet1', 0, 31));
        $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>');
        $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . "<sheets><sheet name=\"{$name}\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
        $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>');
        $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            . '<borders count="1"><border/></borders>'
            . '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
            . '<cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs>'
            . '</styleSheet>');
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        $zip->close();

        return $path;
    }

    /** @param list<string|int|float|null> $cells */
    private static function row(int $r, array $cells, bool $bold): string
    {
        $out = "<row r=\"{$r}\">";
        foreach (array_values($cells) as $i => $value) {
            $ref = self::column($i) . $r;
            $style = $bold ? ' s="1"' : '';
            if ($value === null || $value === '') {
                $out .= "<c r=\"{$ref}\"{$style}/>";
            } elseif (! $bold && (is_int($value) || is_float($value))) {
                $out .= "<c r=\"{$ref}\"{$style}><v>{$value}</v></c>";
            } else {
                $out .= "<c r=\"{$ref}\" t=\"inlineStr\"{$style}><is><t xml:space=\"preserve\">" . self::xml((string) $value) . '</t></is></c>';
            }
        }

        return $out . '</row>';
    }

    private static function column(int $i): string
    {
        $s = '';
        for ($n = $i + 1; $n > 0; $n = intdiv($n - 1, 26)) {
            $s = chr(65 + (($n - 1) % 26)) . $s;
        }

        return $s;
    }

    private static function xml(string $s): string
    {
        // Drop characters XML 1.0 does not allow, then escape.
        $s = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}]/u', '', $s) ?? '';

        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
