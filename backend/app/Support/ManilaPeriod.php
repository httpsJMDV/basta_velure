<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonImmutable;

/**
 * A day, a week (Monday to Sunday) or a month, counted in the reporting timezone (Asia/Manila).
 * Start is inclusive and end is exclusive. Queries use the UTC instants; the UI uses the Manila dates.
 */
final class ManilaPeriod
{
    public const DAY = 'day';
    public const WEEK = 'week';
    public const MONTH = 'month';

    public function __construct(
        public readonly string $type,
        public readonly CarbonImmutable $start,
        public readonly CarbonImmutable $end,
    ) {
    }

    /** The period of $type that contains the Manila date $date (default: today in Manila). */
    public static function containing(string $type, ?string $date = null): self
    {
        $tz = config('rider.timezone', 'Asia/Manila');
        $day = $date
            ? CarbonImmutable::createFromFormat('Y-m-d', $date, $tz)->startOfDay()
            : CarbonImmutable::now($tz)->startOfDay();

        return match ($type) {
            self::WEEK  => new self($type, $s = $day->startOfWeek((int) config('rider.week_starts_on', Carbon::MONDAY)), $s->addDays(7)),
            self::MONTH => new self($type, $s = $day->startOfMonth(), $s->addMonthsNoOverflow(1)->startOfMonth()),
            default     => new self(self::DAY, $day, $day->addDay()),
        };
    }

    public function previous(): self
    {
        return match ($this->type) {
            self::WEEK  => new self($this->type, $this->start->subDays(7), $this->start),
            self::MONTH => new self($this->type, $this->start->subMonthsNoOverflow(1)->startOfMonth(), $this->start),
            default     => new self($this->type, $this->start->subDay(), $this->start),
        };
    }

    public function startUtc(): CarbonImmutable
    {
        return $this->start->utc();
    }

    public function endUtc(): CarbonImmutable
    {
        return $this->end->utc();
    }

    /** "+08:00", for MySQL CONVERT_TZ (fixed, so no timezone tables are needed). */
    public function offset(): string
    {
        return $this->start->format('P');
    }

    /** Is "now" inside this period? */
    public function isCurrent(): bool
    {
        $now = CarbonImmutable::now();

        return $now->greaterThanOrEqualTo($this->start) && $now->lessThan($this->end);
    }

    /** Last calendar day of the period (inclusive), as a Manila date. */
    public function lastDay(): CarbonImmutable
    {
        return $this->end->subDay();
    }
}
