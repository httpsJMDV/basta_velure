<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * When the shop wants the rider: a day (today to 3 days ahead) and a window, in Philippine time. Riders are offered
 * a scheduled pickup from an hour before its window opens.
 */
final class PickupSlot
{
    public const TZ = 'Asia/Manila';

    /** How far ahead a shop can schedule, in days. */
    public const MAX_DAYS_AHEAD = 3;

    /** Offers start this long before the window opens. */
    public const OFFER_LEAD_MINUTES = 60;

    /** @var array<string, array{0: string, 1: string, 2: string}> start, end, label */
    public const WINDOWS = [
        'morning'   => ['09:00', '12:00', '9 AM – 12 NN'],
        'afternoon' => ['13:00', '17:00', '1 – 5 PM'],
    ];

    public static function start(string $date, string $window): CarbonImmutable
    {
        return CarbonImmutable::parse("{$date} " . self::WINDOWS[$window][0], self::TZ);
    }

    public static function end(string $date, string $window): CarbonImmutable
    {
        return CarbonImmutable::parse("{$date} " . self::WINDOWS[$window][1], self::TZ);
    }

    /** Why this slot cannot be chosen now, or null. */
    public static function problem(?string $date, ?string $window): ?string
    {
        if ($date === null && $window === null) {
            return null;
        }
        if ($date === null || $window === null || ! isset(self::WINDOWS[$window])) {
            return 'Choose a day and a time for the pickup.';
        }
        $today = CarbonImmutable::now(self::TZ)->startOfDay();
        try {
            $day = CarbonImmutable::createFromFormat('Y-m-d', $date, self::TZ)->startOfDay();
        } catch (\Throwable) {
            return 'Choose a day and a time for the pickup.';
        }
        if ($day->lt($today) || $day->gt($today->addDays(self::MAX_DAYS_AHEAD))) {
            return 'Choose a pickup day from today to ' . self::MAX_DAYS_AHEAD . ' days ahead.';
        }
        if (self::end($date, $window)->lte(CarbonImmutable::now(self::TZ)->addMinutes(30))) {
            return 'That pickup time has already passed. Choose a later one.';
        }

        return null;
    }

    /** True while riders should not be offered it yet. */
    public static function isLater(?string $date, ?string $window): bool
    {
        return $date !== null && $window !== null && isset(self::WINDOWS[$window])
            && self::start($date, $window)->subMinutes(self::OFFER_LEAD_MINUTES)->isFuture();
    }

    /** "Today, 1 – 5 PM", "Tomorrow, 9 AM – 12 NN" or "Mon 10 Nov, 9 AM – 12 NN"; null for as soon as possible. */
    public static function label(?string $date, ?string $window): ?string
    {
        if ($date === null || $window === null || ! isset(self::WINDOWS[$window])) {
            return null;
        }
        $day = CarbonImmutable::createFromFormat('Y-m-d', substr($date, 0, 10), self::TZ)->startOfDay();
        $today = CarbonImmutable::now(self::TZ)->startOfDay();
        $name = match ((int) $today->diffInDays($day, false)) {
            0 => 'Today',
            1 => 'Tomorrow',
            default => $day->format('D j M'),
        };

        return "{$name}, " . self::WINDOWS[$window][2];
    }

    /**
     * What a parcel shows about its pickup time.
     *
     * @return array{date: string, window: string, label: string, starts_at: string}|null
     */
    public static function present(?string $date, ?string $window): ?array
    {
        $label = self::label($date, $window);

        return $label === null ? null : [
            'date'      => substr((string) $date, 0, 10),
            'window'    => (string) $window,
            'label'     => $label,
            'starts_at' => self::start(substr((string) $date, 0, 10), (string) $window)->toIso8601String(),
        ];
    }
}
