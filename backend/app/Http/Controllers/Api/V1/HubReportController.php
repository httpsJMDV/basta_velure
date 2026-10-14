<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\HubReportRequest;
use App\Models\SortingCenter;
use App\Services\HubReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Feature 1.10: hub performance reports. The hub is always the authenticated user's own, so another hub's data can
 * never be requested. See docs/api/logistics-hub-reports.md for the metric definitions.
 */
class HubReportController extends Controller
{
    public function __construct(private readonly HubReportService $reports)
    {
    }

    /**
     * GET /api/v1/hub/reports/summary?from=&to=
     */
    public function summary(HubReportRequest $request): JsonResponse
    {
        $range = $this->reports->range($request->validated('from'), $request->validated('to'));

        return response()->json(['data' => $this->reports->summary($this->hub($request), $range)]);
    }

    /**
     * GET /api/v1/hub/reports/riders?from=&to=&sort=&direction=
     */
    public function riders(HubReportRequest $request): JsonResponse
    {
        $range = $this->reports->range($request->validated('from'), $request->validated('to'));
        $sort = $request->validated('sort') ?? 'delivered';
        $direction = $request->validated('direction');

        return response()->json([
            'data' => [
                'range'     => ['from' => $range['from'], 'to' => $range['to'], 'days' => $range['days'], 'timezone' => HubReportService::TIMEZONE],
                'sla_hours' => $this->reports->slaHours(),
                'sort'      => $sort,
                'direction' => $direction ?? ($sort === 'name' ? 'asc' : 'desc'),
                'riders'    => $this->reports->riders($this->hub($request), $range, $sort, $direction),
            ],
        ]);
    }

    /**
     * GET /api/v1/hub/reports/export?report=daily|riders&from=&to=&sort=&direction=
     *
     * A streamed CSV (UTF-8 with a byte-order mark so Excel reads it correctly). Cells that start with a formula
     * character are prefixed with an apostrophe, because rider names are typed by the riders themselves.
     */
    public function export(HubReportRequest $request): StreamedResponse
    {
        $request->validate(['report' => ['required']]);

        $hub = $this->hub($request);
        $report = $request->validated('report');
        $range = $this->reports->range($request->validated('from'), $request->validated('to'));

        if ($report === 'daily') {
            $header = ['Date', 'Received', 'Delivered', 'Failed attempts', 'Returned'];
            $rows = fn () => array_map(
                fn (array $d) => [$d['date'], $d['received'], $d['delivered'], $d['failed'], $d['returned']],
                $this->reports->daily($hub, $range)
            );
        } else {
            $header = ['Rider', 'Delivered', 'Failed attempts', 'Success rate (%)', 'Average delivery time (hours)', 'On-time deliveries', 'On-time rate (%)'];
            $rows = fn () => array_map(
                fn (array $r) => [
                    $r['name'],
                    $r['delivered'],
                    $r['failed_attempts'],
                    $this->percent($r['success_rate']),
                    $r['avg_delivery_hours'],
                    $r['on_time_deliveries'],
                    $this->percent($r['on_time_rate']),
                ],
                $this->reports->riders($hub, $range, $request->validated('sort') ?? 'delivered', $request->validated('direction'))
            );
        }

        $filename = "hub-{$report}-report-{$range['from']}_to_{$range['to']}.csv";

        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, array_map([$this, 'cell'], $header), ',', '"', '');
            foreach ($rows() as $row) {
                fputcsv($out, array_map([$this, 'cell'], $row), ',', '"', '');
            }
            fclose($out);
        }, $filename, [
            'Content-Type'  => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * One CSV cell. null becomes an empty cell. A string starting with = + - @ (or a tab or carriage return, which
     * spreadsheets also treat as the start of a formula) gets a leading apostrophe so it is read as text.
     */
    public function cell(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        $text = is_float($value) ? rtrim(rtrim(number_format($value, 4, '.', ''), '0'), '.') : (string) $value;

        return $text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'" . $text : $text;
    }

    private function percent(?float $fraction): ?float
    {
        return $fraction === null ? null : round($fraction * 100, 1);
    }

    private function hub(Request $request): SortingCenter
    {
        $hub = $request->user()?->sortingCenter;

        if (! $hub || $hub->status !== SortingCenter::STATUS_APPROVED) {
            abort(403, 'Sorting center account not approved.');
        }

        return $hub;
    }
}
