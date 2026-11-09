<?php

namespace App\Services\Reports;

use App\Models\DeliveryLog;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\RiderEarning;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Services\HubReportService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The reports of the logistics side: a hub's, a courier network's and a rider's, as ReportDocuments (JSON, Excel and
 * PDF from one object). Ranges are inclusive Manila days from HubReportService::range(). The figures follow the hub
 * reports' rules (docs/api/logistics-hub-reports.md): each event is counted by its own time.
 */
final class LogisticsReports
{
    /** A file lists at most this many jobs or hubs. */
    public const MAX_ROWS = 5000;

    public function __construct(private readonly HubReportService $hubs)
    {
    }

    // ── Hub ───────────────────────────────────────────────────────────────────

    /** @param array{from: string, to: string, days: int, start: string, end: string} $range */
    public function hub(SortingCenter $hub, array $range): ReportDocument
    {
        $summary = $this->hubs->summary($hub, $range);
        $t = $summary['totals'];
        $sla = $summary['sla_hours'];
        $riders = $this->hubs->riders($hub, $range);
        $unattributed = $this->hubs->unattributedDeliveries($hub, $range);
        $earned = (float) DB::table('hub_earnings')->where('sorting_center_id', $hub->id)->whereNull('deleted_at')
            ->where('earned_at', '>=', $range['start'])->where('earned_at', '<', $range['end'])->sum('amount');

        $doc = (new ReportDocument('hub', 'Hub report', (string) $hub->hub_name, $range))
            ->kpi('Received', 'int', $t['received'], 'Parcels scanned in at the hub')
            ->kpi('Sorted', 'int', $t['sorted'], 'Put in an area for delivery')
            ->kpi('Sent out', 'int', $t['dispatched'], 'Handed to a delivery rider')
            ->kpi('Delivered', 'int', $t['delivered'], 'Brought to the buyer')
            ->kpi('Failed attempts', 'int', $t['failed_attempts'], 'Each try that did not deliver')
            ->kpi('Returned', 'int', $t['returned'], 'Sent back to the shop')
            ->kpi('Success rate', 'percent', $t['success_rate'], 'Delivered out of all attempts')
            ->kpi('On time', 'percent', $t['on_time_rate'], "Delivered within {$sla} h of intake")
            ->kpi('Time at the hub', 'hours', $t['avg_hub_dwell_hours'], 'Average, scan-in to out for delivery')
            ->kpi('Delivery time', 'hours', $t['avg_delivery_hours'], 'Average, out for delivery to delivered')
            ->kpi('Hub earnings', 'money', $earned, "The hub's share of delivery fees");

        $daily = $summary['daily'];
        $doc->section(
            'By day',
            [['Date', 'date', 1.4], ['Received', 'int'], ['Delivered', 'int'], ['Failed attempts', 'int'], ['Returned', 'int']],
            array_map(fn ($d) => [$d['date'], $d['received'], $d['delivered'], $d['failed'], $d['returned']], $daily),
            ['Total', array_sum(array_column($daily, 'received')), array_sum(array_column($daily, 'delivered')), array_sum(array_column($daily, 'failed')), array_sum(array_column($daily, 'returned'))],
        );

        $delivered = array_sum(array_column($riders, 'delivered'));
        $fails = array_sum(array_column($riders, 'failed_attempts'));
        $onTime = array_sum(array_column($riders, 'on_time_deliveries'));
        $doc->section(
            'Riders',
            [['Rider', 'text', 2.4], ['Delivered', 'int'], ['Failed', 'int'], ['Success', 'percent'], ['Avg delivery', 'hours'], ['On time', 'int'], ['On-time rate', 'percent']],
            array_map(fn ($r) => [
                $r['name'], $r['delivered'], $r['failed_attempts'], $r['success_rate'], $r['avg_delivery_hours'], $r['on_time_deliveries'], $r['on_time_rate'],
            ], $riders),
            ['All riders', $delivered, $fails, $this->hubs->rate($delivered, $delivered + $fails), null, $onTime, $this->hubs->rate($onTime, $delivered)],
            $unattributed > 0 ? "{$unattributed} delivered parcels were marked delivered by Loved-IT, not by a rider, so they are in the totals above but in no rider's row." : null,
            'No riders yet.',
        );

        return $doc
            ->note('Days are Philippine time. Each figure counts the event on its own day: a parcel received on one day and delivered on another counts on both days.')
            ->note("On time means delivered within {$sla} hours of being scanned in at the hub.");
    }

    // ── Courier network ───────────────────────────────────────────────────────

    /**
     * The courier's approved hubs side by side, with network totals. Only hubs with parcels in the period get a row.
     *
     * @param array{from: string, to: string, days: int, start: string, end: string} $range
     * @return array{totals: array<string, mixed>, hubs: list<array<string, mixed>>, idle_hubs: int, approved_hubs: int, daily: list<array<string, mixed>>}
     */
    public function network(LogisticsCompany $company, array $range, bool $withDaily = true): array
    {
        $hubIds = fn () => LogisticsCompany::constrain(SortingCenter::query(), $company->id)
            ->where('status', SortingCenter::STATUS_APPROVED)->select('id');
        $byHub = $this->hubs->totalsByHub($hubIds(), $range);
        $names = SortingCenter::whereIn('id', array_keys($byHub))->get(['id', 'hub_name', 'address_city', 'address_province'])->keyBy('id');

        $rows = [];
        foreach ($byHub as $id => $t) {
            $h = $names[$id] ?? null;
            $rows[] = ['hub_id' => $id, 'hub_name' => (string) ($h->hub_name ?? "Hub #{$id}"), 'city' => (string) ($h->address_city ?? '')] + $t;
        }
        usort($rows, fn ($a, $b) => [$b['delivered'], $b['received'], $a['hub_name']] <=> [$a['delivered'], $a['received'], $b['hub_name']]);

        $sum = fn (string $k) => array_sum(array_column($rows, $k));
        $delivered = $sum('delivered');
        $failed = $sum('failed_attempts');
        $onTime = $sum('on_time_deliveries');
        $timed = $sum('timed_deliveries');
        $totals = [
            'received'           => $sum('received'),
            'sorted'             => $sum('sorted'),
            'dispatched'         => $sum('dispatched'),
            'delivered'          => $delivered,
            'failed_attempts'    => $failed,
            'returned'           => $sum('returned'),
            'on_time_deliveries' => $onTime,
            'on_time_rate'       => $this->hubs->rate($onTime, $delivered),
            'success_rate'       => $this->hubs->rate($delivered, $delivered + $failed),
            'avg_delivery_hours' => $timed > 0 ? round($sum('delivery_seconds') / $timed / 3600, 2) : null,
        ];
        $approved = (clone $hubIds())->count();

        return [
            'totals'        => $totals,
            'hubs'          => $rows,
            'idle_hubs'     => max(0, $approved - count($rows)),
            'approved_hubs' => $approved,
            'daily'         => $withDaily ? $this->hubs->dailyForHubs($hubIds(), $range) : [],
        ];
    }

    /** @param array{from: string, to: string, days: int, start: string, end: string} $range */
    public function courier(LogisticsCompany $company, array $range): ReportDocument
    {
        $n = $this->network($company, $range);
        $t = $n['totals'];
        $sla = $this->hubs->slaHours();
        $trips = TruckTrip::where('logistics_company_id', $company->id)
            ->whereNotNull('completed_at')->where('completed_at', '>=', $range['start'])->where('completed_at', '<', $range['end']);
        $tripCount = (clone $trips)->count();
        $tripPay = (float) (clone $trips)->sum('pay_amount');

        $doc = (new ReportDocument('courier', 'Network report', (string) $company->name, $range))
            ->kpi('Received at hubs', 'int', $t['received'], 'Parcels scanned in at your hubs')
            ->kpi('Delivered', 'int', $t['delivered'], 'Brought to the buyer')
            ->kpi('Failed attempts', 'int', $t['failed_attempts'], 'Each try that did not deliver')
            ->kpi('Returned', 'int', $t['returned'], 'Sent back to the shop')
            ->kpi('Success rate', 'percent', $t['success_rate'], 'Delivered out of all attempts')
            ->kpi('On time', 'percent', $t['on_time_rate'], "Delivered within {$sla} h of intake")
            ->kpi('Delivery time', 'hours', $t['avg_delivery_hours'], 'Average, out for delivery to delivered')
            ->kpi('Hubs with parcels', 'int', count($n['hubs']), 'Of ' . number_format($n['approved_hubs']) . ' approved hubs')
            ->kpi('Truck trips', 'int', $tripCount, 'Completed between hubs')
            ->kpi('Truck trip pay', 'money', $tripPay, 'Set for those trips');

        $hubs = array_slice($n['hubs'], 0, self::MAX_ROWS);
        $doc->section(
            'By hub',
            [['Hub', 'text', 2.8], ['Received', 'int'], ['Delivered', 'int'], ['Failed', 'int'], ['Returned', 'int'], ['Success', 'percent'], ['On time', 'percent'], ['Avg delivery', 'hours']],
            array_map(fn ($h) => [$h['hub_name'], $h['received'], $h['delivered'], $h['failed_attempts'], $h['returned'], $h['success_rate'], $h['on_time_rate'], $h['avg_delivery_hours']], $hubs),
            ['Network', $t['received'], $t['delivered'], $t['failed_attempts'], $t['returned'], $t['success_rate'], $t['on_time_rate'], $t['avg_delivery_hours']],
            $n['idle_hubs'] > 0 ? number_format($n['idle_hubs']) . ' other approved hubs had no parcels in this period.' : null,
            'No hub had parcels in this period.',
        );

        $daily = $n['daily'];
        $doc->section(
            'By day',
            [['Date', 'date', 1.4], ['Received', 'int'], ['Delivered', 'int'], ['Failed attempts', 'int'], ['Returned', 'int']],
            array_map(fn ($d) => [$d['date'], $d['received'], $d['delivered'], $d['failed'], $d['returned']], $daily),
            ['Total', array_sum(array_column($daily, 'received')), array_sum(array_column($daily, 'delivered')), array_sum(array_column($daily, 'failed')), array_sum(array_column($daily, 'returned'))],
        );

        return $doc
            ->note('Days are Philippine time. Each figure counts the event on its own day.')
            ->note('Hubs are listed by parcels delivered. The network row adds up every hub.');
    }

    // ── Rider ─────────────────────────────────────────────────────────────────

    /** @param array{from: string, to: string, days: int, start: string, end: string} $range */
    public function rider(Rider $rider, array $range): ReportDocument
    {
        $rider->loadMissing(['user', 'sortingCenter']);
        $jobs = DB::table('rider_earnings as re')
            ->leftJoin('parcels as p', 'p.id', '=', 're.parcel_id')
            ->where('re.rider_id', $rider->id)->whereNull('re.deleted_at')
            ->where('re.earned_at', '>=', $range['start'])->where('re.earned_at', '<', $range['end'])
            ->orderByDesc('re.earned_at')->orderByDesc('re.id')
            ->limit(self::MAX_ROWS)
            ->get(['re.kind', 're.amount', 're.earned_at', 're.paid_at', 'p.tracking_number', 'p.destination_barangay',
                DB::raw("JSON_UNQUOTE(JSON_EXTRACT(p.recipient_snapshot, '$.city')) as city")]);
        $logs = DB::table('delivery_logs')->where('rider_id', $rider->id)->whereNull('deleted_at')
            ->whereIn('outcome', [DeliveryLog::OUTCOME_DELIVERY_FAILED, DeliveryLog::OUTCOME_RETURNED])
            ->where('logged_at', '>=', $range['start'])->where('logged_at', '<', $range['end'])
            ->get(['outcome', 'logged_at']);
        $trips = TruckTrip::with(['fromHub:id,hub_name', 'toHub:id,hub_name'])->where('driver_id', $rider->id)
            ->whereNotNull('completed_at')->where('completed_at', '>=', $range['start'])->where('completed_at', '<', $range['end'])
            ->orderByDesc('completed_at')->limit(self::MAX_ROWS)->get();

        $day = fn (string $utc) => CarbonImmutable::parse($utc, 'UTC')->setTimezone(ReportDocument::TZ)->toDateString();
        $pickups = $jobs->where('kind', RiderEarning::KIND_PICKUP)->count();
        $deliveries = $jobs->where('kind', RiderEarning::KIND_DELIVERY)->count();
        $failed = $logs->where('outcome', DeliveryLog::OUTCOME_DELIVERY_FAILED)->count();
        $returned = $logs->where('outcome', DeliveryLog::OUTCOME_RETURNED)->count();
        $earned = (float) $jobs->sum('amount');
        $tripPay = (float) $trips->sum('pay_amount');
        $unpaid = (float) $jobs->whereNull('paid_at')->sum('amount') + (float) $trips->whereNull('paid_at')->sum('pay_amount');

        $name = trim(($rider->user?->first_name ?? '') . ' ' . ($rider->user?->last_name ?? '')) ?: 'Rider';
        $owner = $name . ($rider->sortingCenter ? ' · ' . $rider->sortingCenter->hub_name : '');
        $isTruck = $rider->duty === 'truck' || $trips->isNotEmpty();

        $doc = (new ReportDocument('rider', 'Rider report', $owner, $range))
            ->kpi('Earned', 'money', $earned + $tripPay, $isTruck ? 'Jobs and truck trips' : 'Your share of delivery fees')
            ->kpi('Pickups', 'int', $pickups, 'Collected from shops')
            ->kpi('Deliveries', 'int', $deliveries, 'Brought to buyers')
            ->kpi('Failed attempts', 'int', $failed, 'Tries that did not deliver')
            ->kpi('Returned', 'int', $returned, 'Taken back to the shop')
            ->kpi('Not paid yet', 'money', $unpaid, 'Of this period, still to be paid');
        if ($isTruck) {
            $doc->kpi('Truck trips', 'int', $trips->count(), 'Completed between hubs');
        }
        $jobCount = $pickups + $deliveries;
        $doc->kpi('Average per job', 'money', $jobCount > 0 ? round($earned / $jobCount, 2) : null, 'Pickups and deliveries');

        // By day: every day of the period, zeros included.
        $byDay = [];
        $start = CarbonImmutable::createFromFormat('Y-m-d', $range['from'], ReportDocument::TZ);
        for ($i = 0; $i < $range['days']; $i++) {
            $byDay[$start->addDays($i)->toDateString()] = ['pickups' => 0, 'deliveries' => 0, 'failed' => 0, 'earned' => 0.0];
        }
        foreach ($jobs as $j) {
            $d = $day($j->earned_at);
            if (! isset($byDay[$d])) {
                continue;
            }
            $byDay[$d][$j->kind === RiderEarning::KIND_PICKUP ? 'pickups' : 'deliveries']++;
            $byDay[$d]['earned'] += (float) $j->amount;
        }
        foreach ($logs as $l) {
            $d = $day($l->logged_at);
            if (isset($byDay[$d]) && $l->outcome === DeliveryLog::OUTCOME_DELIVERY_FAILED) {
                $byDay[$d]['failed']++;
            }
        }
        foreach ($trips as $trip) {
            $d = $trip->completed_at->copy()->setTimezone(ReportDocument::TZ)->toDateString();
            if (isset($byDay[$d])) {
                $byDay[$d]['earned'] += (float) $trip->pay_amount;
            }
        }
        $doc->section(
            'By day',
            [['Date', 'date', 1.4], ['Pickups', 'int'], ['Deliveries', 'int'], ['Failed attempts', 'int'], ['Earned', 'money', 1.2]],
            array_map(fn ($d, $v) => [$d, $v['pickups'], $v['deliveries'], $v['failed'], round($v['earned'], 2)], array_keys($byDay), $byDay),
            ['Total', $pickups, $deliveries, $failed, round($earned + $tripPay, 2)],
        );

        $doc->section(
            'Jobs',
            [['When', 'datetime', 1.6], ['Tracking number', 'text', 1.6], ['Job', 'text', 0.9], ['Place', 'text', 1.8], ['Earned', 'money', 1.1], ['Paid', 'text', 0.8]],
            $jobs->map(fn ($j) => [
                CarbonImmutable::parse($j->earned_at, 'UTC')->toIso8601String(),
                (string) ($j->tracking_number ?? '—'),
                $j->kind === RiderEarning::KIND_PICKUP ? 'Pickup' : 'Delivery',
                trim(implode(', ', array_filter([(string) $j->destination_barangay, (string) $j->city]))),
                (float) $j->amount,
                $j->paid_at ? 'Paid' : 'Not yet',
            ])->values()->all(),
            ['Total', number_format($jobCount) . ' jobs', null, null, round($earned, 2), null],
            null,
            'No pickups or deliveries in this period.',
        );

        if ($isTruck) {
            $doc->section(
                'Truck trips',
                [['Completed', 'datetime', 1.6], ['Trip', 'text', 1.1], ['From', 'text', 1.9], ['To', 'text', 1.9], ['Parcels', 'int', 0.8], ['Pay', 'money', 1.1]],
                $trips->map(fn (TruckTrip $trip) => [
                    $trip->completed_at->toIso8601String(), (string) $trip->code, (string) ($trip->fromHub?->hub_name ?? ''), (string) ($trip->toHub?->hub_name ?? ''),
                    (int) $trip->parcel_count, (float) $trip->pay_amount,
                ])->values()->all(),
                ['Total', number_format($trips->count()) . ' trips', null, null, (int) $trips->sum('parcel_count'), round($tripPay, 2)],
                null,
                'No truck trips in this period.',
            );
        }

        return $doc
            ->note('Days are Philippine time. A job counts on the day it was done: a pickup when the hub received the parcel, a delivery when it was delivered.')
            ->note('Your courier company pays your share by GCash and marks it paid; "Not yet" means it has not been marked paid.');
    }
}
