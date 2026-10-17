<?php
// Copy an .xlsx and write values into existing cells (the yellow answer cells), keeping each cell's style.
// usage: php fill.php <original.xlsx> <output.xlsx> <fill.json>
// fill.json: { "sheets": { "xl/worksheets/sheet5.xml": { "cells": { "K2": "text" }, "rows": { "2": 120 } } } }

[$_, $src, $dst, $spec] = $argv;
$fill = json_decode(file_get_contents($spec), true, flags: JSON_THROW_ON_ERROR);

if (! copy($src, $dst)) fwrite(STDERR, "copy failed\n") && exit(1);
$zip = new ZipArchive();
if ($zip->open($dst) !== true) fwrite(STDERR, "open failed\n") && exit(1);

$esc = fn (string $s) => htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s), ENT_XML1 | ENT_QUOTES, 'UTF-8');
$missing = [];

foreach ($fill['sheets'] as $entry => $sheet) {
    $xml = $zip->getFromName($entry);
    if ($xml === false) { fwrite(STDERR, "no entry $entry\n"); exit(1); }

    foreach ($sheet['cells'] ?? [] as $ref => $value) {
        $pattern = '/<c r="' . $ref . '"((?:\s+[a-zA-Z:]+="[^"]*")*)\s*(\/>|>(.*?)<\/c>)/s';
        $count = 0;
        $xml = preg_replace_callback($pattern, function ($m) use ($ref, $value, $esc) {
            preg_match('/\ss="(\d+)"/', $m[1], $s);
            $style = isset($s[1]) ? ' s="' . $s[1] . '"' : '';
            return '<c r="' . $ref . '"' . $style . ' t="inlineStr"><is><t xml:space="preserve">' . $esc((string) $value) . '</t></is></c>';
        }, $xml, 1, $count);
        if ($count === 0) $missing[] = "$entry!$ref";
    }

    $zip->addFromString($entry, $xml);
}

$zip->close();
if ($missing) { fwrite(STDERR, "cells not found: " . implode(', ', $missing) . "\n"); exit(2); }
echo "wrote $dst\n";
