<?php

namespace App\Services\Reports;

use App\Services\AdminAnalyticsService;

final class AdminReportDocument
{
    public function build(AdminAnalyticsService $analytics, array $range, string $interval): ReportDocument
    {
        $overview = $analytics->overview($range);
        $s = $overview['summary'];
        $doc = new ReportDocument('admin', 'Platform Analytics & Reports', 'Loved-IT', $range, kpiColumns: 3);
        $doc->kpi('Gross merchandise value', 'money', $s['gmv'], 'Counted order totals, including shipping')
            ->kpi('Net platform commission', 'money', $s['commission'], 'Stored commission on counted order items')
            ->kpi('Seller earnings', 'money', $s['seller_earnings'])
            ->kpi('Counted orders', 'int', $s['orders'])
            ->kpi('Units sold', 'int', $s['units_sold'])
            ->kpi('Orders placed', 'int', $s['orders_placed'])
            ->note('All dates use Asia/Manila. Orders are grouped by placement date; cancelled, returned and soft-deleted orders are excluded from sales and commission. These are recorded order metrics, not a statement of cash received.');
        $series = $interval === 'monthly' ? $analytics->monthly($range) : $analytics->daily($range);
        $doc->section(ucfirst($interval).' performance', [['Period', 'date'], ['GMV', 'money'], ['Commission', 'money'], ['Orders', 'int'], ['Placed', 'int']],
            array_map(fn ($p) => [$p['date'], $p['gmv'], $p['commission'], $p['orders'], $p['orders_placed']], $series));
        $doc->section('Category breakdown', [['Category', 'text', 2], ['Sales', 'money'], ['Units', 'int'], ['Rate', 'percent'], ['Commission', 'money']],
            array_map(fn ($c) => [$c['category'], $c['gross_sales'], $c['units_sold'], $c['commission_rate'] / 100, $c['commission_earned']], $analytics->categories($range)),
            note: 'All categories are exported, including rows collapsed on the website. Item sales exclude shipping.');
        $doc->section('Top 15 sellers', [['Shop', 'text', 2], ['Sales', 'money'], ['Orders', 'int'], ['Units', 'int'], ['Commission', 'money'], ['Earnings', 'money']],
            array_map(fn ($s) => [$s['shop_name'], $s['gross_sales'], $s['orders_count'], $s['units_sold'], $s['commission_generated'], $s['net_payout_credited']], $analytics->topSellers($range)));
        $payments = $analytics->paymentSplit($range);
        $doc->section('Payment channels', [['Channel', 'text'], ['Orders', 'int'], ['Order value', 'money']],
            [['GCash', $payments['gcash']['count'], $payments['gcash']['volume']], ['Cash on delivery', $payments['cod']['count'], $payments['cod']['volume']]],
            note: 'Counted order value by payment method; this does not prove that cash has been collected or remitted.');
        $doc->section('Order pipeline', [['Stage', 'text', 2], ['Orders', 'int']],
            array_map(fn ($g) => [$g['label'], $g['count']], $overview['pipeline']['groups']));
        $outlook = app(AdminReportOutlook::class)->build($analytics, $range);
        $doc->section('Seven-day outlook - estimate', [['Future date', 'date'], ['Estimated GMV', 'money'], ['Expected orders', 'text']],
            array_map(fn ($p) => [$p['date'], $p['gmv'], (string) $p['orders']], $outlook['points']),
            note: $outlook['method'], empty: $outlook['reason'] ?? 'No outlook available.');
        return $doc;
    }
}
