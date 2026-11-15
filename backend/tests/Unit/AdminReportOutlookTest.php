<?php

namespace Tests\Unit;

use App\Services\Reports\AdminReportOutlook;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class AdminReportOutlookTest extends TestCase
{
    public function test_weekday_baseline_uses_two_complete_weeks_and_never_relabels_estimates_as_history(): void
    {
        $days = [];
        for ($i = 0; $i < 14; $i++) {
            $days[] = ['date' => CarbonImmutable::parse('2026-10-02')->addDays($i)->toDateString(), 'gmv' => ($i + 1) * 100, 'orders' => $i + 1];
        }
        $outlook = (new AdminReportOutlook)->fromDaily($days, '2026-10-16', 'Weekday baseline - estimates only');
        $this->assertTrue($outlook['available']);
        $this->assertCount(14, $outlook['history']);
        $this->assertSame('2026-10-15', $outlook['basis_to']);
        $this->assertCount(7, $outlook['points']);
        $this->assertSame('2026-10-17', $outlook['points'][0]['date']);
        $this->assertSame(550.0, $outlook['points'][0]['gmv']); // Oct 3: 200; Oct 10: 900.
        $this->assertSame(5.5, $outlook['points'][0]['orders']);
        $this->assertSame(5250.0, $outlook['estimated_gmv']);
    }

    public function test_sparse_or_incomplete_history_does_not_generate_a_misleading_projection(): void
    {
        $days = array_map(fn ($i) => ['date' => '2026-10-'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT), 'gmv' => 0, 'orders' => 0], range(0, 13));
        $service = new AdminReportOutlook;
        $this->assertFalse($service->fromDaily($days, '2026-10-16', 'baseline')['available']);
        $this->assertSame([], $service->fromDaily(array_slice($days, 0, 7), '2026-10-16', 'baseline')['points']);
    }
}
