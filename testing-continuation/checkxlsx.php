<?php
// Parse every XML part of each .xlsx given; report anything that is not well-formed.
foreach (array_slice($argv, 1) as $file) {
    $zip = new ZipArchive(); $zip->open($file); $bad = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (!preg_match('/\.(xml|rels)$/', $name)) continue;
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        if (!$doc->loadXML($zip->getFromIndex($i))) { $bad++; echo "BAD $name: " . trim(libxml_get_errors()[0]->message ?? '') . "\n"; }
        libxml_clear_errors();
    }
    echo basename($file) . ': ' . ($bad ? "$bad bad parts" : 'all XML parts well-formed') . "\n";
}
