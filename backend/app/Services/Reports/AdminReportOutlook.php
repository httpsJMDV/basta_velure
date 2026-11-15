<?php

namespace App\Services\Reports;

use App\Services\AdminAnalyticsService;
use Carbon\CarbonImmutable;

/** A transparent weekday baseline, never posted to any financial ledger. */
final class AdminReportOutlook
{
    public function build(AdminAnalyticsService $analytics, array $range): array
    {
        $today = $analytics->today();
        $method = 'Average of the same weekday in the last two complete weeks. Estimates are not booked revenue or guaranteed results.';
        if ($range['to'] !== $today || $range['days'] < 15) {
            return ['available' => false, 'reason' => 'Choose at least 15 days ending today to see a seven-day outlook.', 'method' => $method, 'points' => []];
        }
        $end = CarbonImmutable::parse($today, AdminAnalyticsService::TIMEZONE);
        $basis = $analytics->range($end->subDays(14)->toDateString(), $end->subDay()->toDateString());
        return $this->fromDaily($analytics->daily($basis), $today, $method);
    }

    public function fromDaily(array $days, string $today, string $method): array
    {
        if (count($days) !== 14 || count(array_filter($days, fn ($p) => $p['orders'] > 0)) < 4) {
            return ['available' => false, 'reason' => 'Not enough recent activity: at least four active days in the previous two complete weeks are needed.', 'method' => $method, 'points' => []];
        }
        $weekdays = [];
        foreach ($days as $p) {
            $weekday = CarbonImmutable::parse($p['date'], AdminAnalyticsService::TIMEZONE)->dayOfWeek;
            $weekdays[$weekday][] = $p;
        }
        $points = [];
        for ($i = 1; $i <= 7; $i++) {
            $date = CarbonImmutable::parse($today, AdminAnalyticsService::TIMEZONE)->addDays($i);
            $samples = $weekdays[$date->dayOfWeek];
            $points[] = ['date' => $date->toDateString(),
                'gmv' => round(array_sum(array_column($samples, 'gmv')) / count($samples), 2),
                'orders' => round(array_sum(array_column($samples, 'orders')) / count($samples), 1)];
        }
        return ['available' => true, 'method' => $method, 'basis_from' => $days[0]['date'], 'basis_to' => $days[13]['date'],
            'today' => $today, 'history' => array_map(fn ($p) => ['date' => $p['date'], 'gmv' => $p['gmv']], $days),
            'points' => $points, 'estimated_gmv' => round(array_sum(array_column($points, 'gmv')), 2)];
    }
}
