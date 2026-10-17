<?php
// Test preconditions only. Refuse every database except the isolated QA database.
require __DIR__ . '/../backend/vendor/autoload.php';
$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (Illuminate\Support\Facades\DB::connection()->getDatabaseName() !== 'velure_blackbox') throw new Exception('Refusing non-test database');
$file = __DIR__ . '/fixture-backup.json';
$backup = is_file($file) ? json_decode(file_get_contents($file), true) : [];
$mode = $argv[1];
if ($mode === 'payout') {
    $item = App\Models\OrderItem::where('order_id', (int) $argv[2])->where('seller_id', 23)->firstOrFail();
    if (!isset($backup['payout'])) $backup['payout'] = ['id'=>$item->id,'payout_status'=>$item->payout_status,'seller_earnings'=>$item->seller_earnings];
    $item->update(['payout_status'=>'available','seller_earnings'=>'616.55']);
    echo "Prepared test-only available balance fixture on item {$item->id}.\n";
} elseif ($mode === 'foreign') {
    $parcel = App\Models\Parcel::where('tracking_number', $argv[2])->firstOrFail();
    $company = App\Models\LogisticsCompany::where('name','like','%Agila%')->firstOrFail();
    $backup['foreign']=['id'=>$parcel->id,'logistics_company_id'=>$parcel->logistics_company_id];
    $parcel->update(['logistics_company_id'=>$company->id]);
    echo "Prepared foreign-company parcel {$parcel->tracking_number}, company {$company->id}.\n";
} elseif ($mode === 'restore') {
    if (isset($backup['payout'])) { $x=$backup['payout']; App\Models\OrderItem::where('id',$x['id'])->update(['payout_status'=>$x['payout_status'],'seller_earnings'=>$x['seller_earnings']]); }
    if (isset($backup['foreign'])) { $x=$backup['foreign']; App\Models\Parcel::where('id',$x['id'])->update(['logistics_company_id'=>$x['logistics_company_id']]); }
    echo "Restored isolated fixture values.\n";
} else throw new Exception('Unknown fixture mode');
file_put_contents($file,json_encode($backup,JSON_PRETTY_PRINT));
