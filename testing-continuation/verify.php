<?php
$root = __DIR__ . '/../docs2';
$total = 0;
foreach (glob($root . '/*.xlsx') as $source) {
    $name = basename($source);
    $cases = json_decode(file_get_contents(__DIR__ . '/cases/' . pathinfo($name, PATHINFO_FILENAME) . '.json'), true);
    $a = new ZipArchive(); $b = new ZipArchive();
    if ($a->open($source) !== true || $b->open($root . '/answered/' . $name) !== true) throw new Exception('ZIP open failed');
    if ($a->numFiles !== $b->numFiles) throw new Exception('ZIP member count changed');
    foreach (range(0, $a->numFiles - 1) as $i) {
        $entry = $a->getNameIndex($i);
        $old = $a->getFromName($entry); $new = $b->getFromName($entry);
        if ($new === false) throw new Exception('Missing ZIP entry');
        if (!str_starts_with($entry, 'xl/worksheets/')) {
            if ($entry === 'xl/workbook.xml') {
                $old = preg_replace('/<calcPr[^>]*\/>/', '', $old);
                $new = preg_replace('/<calcPr[^>]*\/>/', '', $new);
            }
            if ($old !== $new) throw new Exception('Unexpected non-sheet edit: ' . $entry);
            continue;
        }
        if (!str_ends_with($entry, '.xml')) continue;
        $ox = new DOMDocument(); $nx = new DOMDocument();
        if (!$ox->loadXML($old) || !$nx->loadXML($new)) throw new Exception('Invalid XML');
        $cells = [];
        foreach ($nx->getElementsByTagName('c') as $c) $cells[$c->getAttribute('r')] = $c;
        foreach ($ox->getElementsByTagName('c') as $c) {
            $ref = $c->getAttribute('r');
            if (!isset($cells[$ref]) || $cells[$ref]->getAttribute('s') !== $c->getAttribute('s')) throw new Exception('Style changed');
        }
        foreach ($cases as $case) if ($case['file'] === $entry) foreach (['K','L'] as $col) {
            $ref = $col . $case['row'];
            if (!isset($cells[$ref]) || trim($cells[$ref]->textContent) === '') throw new Exception('Missing answer: ' . $ref);
        }
    }
    $total += count($cases);
    echo $name . ': XML, cell styles, case answer coverage verified (' . count($cases) . " rows)\n";
    $a->close(); $b->close();
}
echo "$total case rows across eight workbooks verified.\n";
