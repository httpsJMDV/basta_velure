<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Services\Courier\CodLedger;
use App\Services\Courier\Dispatcher;
use App\Support\XlsxWriter;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cash on delivery and exports for the courier company (Logistics L9): the day's reconciliation of what each rider
 * collected and remitted, confirming remittances (only the company can), and the deliveries and COD exports as CSV
 * or XLSX for a date range. An export with no rows is a file with the header only.
 */
class LogisticsCodController extends Controller
{
    public function __construct(private readonly CodLedger $ledger) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** GET /logistics/cod?date=YYYY-MM-DD */
    public function index(Request $request): JsonResponse
    {
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? now('Asia/Manila')->toDateString();

        return response()->json(['data' => $this->ledger->reconciliation($this->company($request), $date)]);
    }

    /** POST /logistics/cod/remittances/{remittance}/confirm */
    public function confirm(Request $request, int $remittance): JsonResponse
    {
        $r = $this->ledger->confirm($this->company($request), $remittance, $request->user());

        return response()->json(['message' => 'Remittance confirmed. The rider\'s balance is updated.', 'data' => $this->ledger->present($r->load('rider.user'))]);
    }

    /** GET /logistics/exports?type=deliveries|cod&format=csv|xlsx&from=&to= */
    public function export(Request $request): Response
    {
        $data = $request->validate([
            'type'   => ['required', 'in:deliveries,cod'],
            'format' => ['required', 'in:csv,xlsx'],
            'from'   => ['required', 'date_format:Y-m-d'],
            'to'     => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], ['to.after_or_equal' => 'The end date cannot be before the start date.']);

        [$header, $rows] = $this->rows($this->company($request), $data['type'], $data['from'], $data['to']);
        $name = "{$data['type']}-{$data['from']}_to_{$data['to']}";

        if ($data['format'] === 'xlsx') {
            $path = XlsxWriter::write($data['type'] === 'cod' ? 'COD' : 'Deliveries', $header, $rows);

            return response()->download($path, "{$name}.xlsx", ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->deleteFileAfterSend();
        }

        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $header);
            foreach ($rows as $row) {
                fputcsv($out, array_map(fn ($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'{$v}" : $v, $row));
            }
            fclose($out);
        }, "{$name}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return array{0: list<string>, 1: list<list<string|int|float|null>>} */
    private function rows(LogisticsCompany $company, string $type, string $from, string $to): array
    {
        $start = CarbonImmutable::parse($from, 'Asia/Manila')->startOfDay()->utc();
        $end = CarbonImmutable::parse($to, 'Asia/Manila')->endOfDay()->utc();
        $local = fn ($t) => $t ? CarbonImmutable::parse($t)->setTimezone('Asia/Manila')->format('Y-m-d H:i') : null;
        $base = LogisticsCompany::constrain(Parcel::query(), $company->id)->with(['order:id,order_number,payment_method', 'assignedRider.user', 'sortingCenter:id,hub_name']);

        if ($type === 'cod') {
            $parcels = $base->whereNotNull('cod_collected_at')->whereBetween('cod_collected_at', [$start, $end])->orderBy('cod_collected_at')->get();
            $rows = $parcels->map(fn (Parcel $p) => [
                $local($p->cod_collected_at), $p->tracking_number, $p->order?->order_number, Dispatcher::name($p->assignedRider),
                round((float) ($p->cod_collected_amount ?? $p->cod_amount), 2),
            ])->all();
            if ($rows !== []) {
                $rows[] = ['Total', null, null, null, round($parcels->sum(fn ($p) => (float) ($p->cod_collected_amount ?? $p->cod_amount)), 2)];
            }

            return [['Collected at', 'Tracking number', 'Order', 'Rider', 'COD collected (PHP)'], $rows];
        }

        // Deliveries completed in the range: the same parcels the dashboard and reports count as delivered.
        $parcels = $base->whereNotNull('delivered_at')->whereBetween('delivered_at', [$start, $end])->orderBy('delivered_at')->get();
        $rows = $parcels->map(fn (Parcel $p) => [
            $local($p->delivered_at), $p->tracking_number, $p->order?->order_number, $p->sortingCenter?->hub_name, Dispatcher::name($p->assignedRider),
            $p->destination_barangay, (int) $p->delivery_attempts + 1, $p->cod_amount !== null ? round((float) $p->cod_amount, 2) : null,
        ])->all();
        if ($rows !== []) {
            $rows[] = ['Total: ' . count($rows) . ' deliveries', null, null, null, null, null, null, round($parcels->sum(fn ($p) => (float) ($p->cod_amount ?? 0)), 2)];
        }

        return [['Delivered at', 'Tracking number', 'Order', 'Hub', 'Rider', 'Barangay', 'Attempt', 'COD amount (PHP)'], $rows];
    }
}
