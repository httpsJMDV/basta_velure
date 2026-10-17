<?php
function xml(string $s): DOMDocument { $d=new DOMDocument(); if(!$d->loadXML($s))throw new Exception('Invalid XML'); return $d; }
$root=__DIR__.'/../docs2'; $output=getenv('BB_OUTPUT_DIR')?:(is_dir($root.'/answered-final')?$root.'/answered-final':$root.'/answered'); $total=0; $changed=0;
foreach(glob($root.'/*.xlsx') as $src){
 $name=basename($src);$a=new ZipArchive();$b=new ZipArchive();if($a->open($src)!==true||$b->open($output.'/'.$name)!==true)throw new Exception('Invalid ZIP');
 if($a->numFiles!==$b->numFiles)throw new Exception('ZIP members changed');
 $styles=xml($a->getFromName('xl/styles.xml'));$fills=$styles->getElementsByTagName('fill');$yellowFills=[];
 foreach($fills as $i=>$f){foreach($f->getElementsByTagName('fgColor') as $c)if(in_array(substr(strtoupper($c->getAttribute('rgb')),-6),['FFFF00','FFF2CC']))$yellowFills[]=$i;}
 $yellowStyles=[];$xfs=$styles->getElementsByTagName('cellXfs')->item(0);$i=0;foreach($xfs->childNodes as $xf)if($xf instanceof DOMElement){if(in_array((int)$xf->getAttribute('fillId'),$yellowFills))$yellowStyles[]=(string)$i;$i++;}
 for($i=0;$i<$a->numFiles;$i++){
  $entry=$a->getNameIndex($i);$old=$a->getFromName($entry);$new=$b->getFromName($entry);if($new===false)throw new Exception('Missing member');
  if(!str_starts_with($entry,'xl/worksheets/')||!str_ends_with($entry,'.xml')){if($old!==$new)throw new Exception($name.': non-sheet changed '.$entry);continue;}
  $oldDoc=xml($old);$cells=[];foreach($oldDoc->getElementsByTagName('c') as $c)$cells[$c->getAttribute('r')]=$c;
  // Replace only the contents of yellow cells with a marker, preserving every surrounding XML byte.
  $normalize=function($source)use($cells,$yellowStyles,$name,$entry,&$changed){return preg_replace_callback('/<c r="([^"]+)"([^>]*?)(?:\/>|>.*?<\/c>)/s',function($m)use($cells,$yellowStyles,$name,$entry){$ref=$m[1];$original=$cells[$ref]??null;if(!$original||!in_array($original->getAttribute('s'),$yellowStyles))return $m[0];$n=xml('<root xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'.$m[0].'</root>')->getElementsByTagName('c')->item(0);$attrs=[];foreach($n->attributes as $attr)if($attr->name!=='t')$attrs[$attr->name]=$attr->value;$expected=[];foreach($original->attributes as $attr)if($attr->name!=='t')$expected[$attr->name]=$attr->value;ksort($attrs);ksort($expected);if($attrs!==$expected)throw new Exception($name.': yellow cell attributes changed '.$entry.'!'.$ref);return '<YELLOW ref="'.$ref.'"/>';},$source);};
  if($normalize($old)!==$normalize($new))throw new Exception($name.': non-yellow content or formatting changed '.$entry);
  $newDoc=xml($new);$nc=[];foreach($newDoc->getElementsByTagName('c')as$c)$nc[$c->getAttribute('r')]=$c;
  foreach($cells as $ref=>$c)if(in_array($c->getAttribute('s'),$yellowStyles)&&isset($nc[$ref])&&$c->textContent!==$nc[$ref]->textContent)$changed++;
 }
 $cases=json_decode(file_get_contents(__DIR__.'/cases/'.pathinfo($name,PATHINFO_FILENAME).'.json'),true);
 $key=str_replace('Blackbox_Test_Cases_','',pathinfo($name,PATHINFO_FILENAME));
 $key=str_replace(['Account_Creation-Seller1','_Modules-1'],['Account_Creation-Seller','_Modules'],$key);
 $reviewed=json_decode(file_get_contents(__DIR__.'/bb/results/'.$key.'.json'),true);
 foreach($cases as $case){$d=xml($b->getFromName($case['file']));$xp=new DOMXPath($d);$xp->registerNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');foreach(['K'=>'actual','L'=>'status','M'=>'remarks'] as $col=>$field){$node=$xp->query('//s:c[@r="'.$col.$case['row'].'"]')->item(0);if(!$node||$node->textContent!==$reviewed[$case['id']][$field])throw new Exception('Workbook differs from reviewed result '.$name.' '.$case['id'].' '.$field);}}
 foreach($cases as $case){$d=xml($b->getFromName($case['file']));$xp=new DOMXPath($d);$xp->registerNamespace('s','http://schemas.openxmlformats.org/spreadsheetml/2006/main');foreach(['K','L','M']as$col){$node=$xp->query('//s:c[@r="'.$col.$case['row'].'"]')->item(0);if(!$node||trim($node->textContent)==='')throw new Exception('Missing answer '.$case['id']);if($col==='L'&&!in_array($node->textContent,['Pass','Fail','Blocked']))throw new Exception('Unfinished status '.$case['id']);}}
 $total+=count($cases);echo "$name: only yellow-cell contents changed; ".count($cases)." cases complete.\n";
 $a->close();$b->close();
}
echo "$total cases verified; $changed yellow cells changed. All other XML bytes, styles, formulas and dimensions are unchanged.\n";
