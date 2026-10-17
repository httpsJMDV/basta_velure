<?php
$a=new ZipArchive();$b=new ZipArchive();$a->open(__DIR__.'/../docs2/Blackbox_Test_Cases_Buyer_Modules-1.xlsx');$b->open(__DIR__.'/../docs2/answered-final/Blackbox_Test_Cases_Buyer_Modules-1.xlsx');
$s=new DOMDocument();$s->loadXML($a->getFromName('xl/styles.xml'));
$fills=$s->getElementsByTagName('fill');foreach($fills as$i=>$f)echo "FILL $i ".$s->saveXML($f)."\n";
$styles=[];foreach($s->getElementsByTagName('cellXfs')->item(0)->childNodes as$c)if($c instanceof DOMElement)$styles[]=$c->getAttribute('fillId');
$o=new DOMDocument();$n=new DOMDocument();$o->loadXML($a->getFromName('xl/worksheets/sheet1.xml'));$n->loadXML($b->getFromName('xl/worksheets/sheet1.xml'));$new=[];foreach($n->getElementsByTagName('c')as$c)$new[$c->getAttribute('r')]=$n->saveXML($c);foreach($o->getElementsByTagName('c')as$c)if($o->saveXML($c)!==($new[$c->getAttribute('r')]??''))echo $c->getAttribute('r').' style '.$c->getAttribute('s').' fill '.$styles[(int)$c->getAttribute('s')]."\n";
