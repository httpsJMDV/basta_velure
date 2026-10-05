<?php

namespace App\Enums;

enum OrderStatus: string
{
    // ERP-Flow Lifecycle Statuses
    case PLACED = 'PLACED';
    case CONFIRMED = 'CONFIRMED';
    case PREPARING = 'PREPARING';
    case READY_FOR_PICKUP = 'READY_FOR_PICKUP';
    case PICKED_UP = 'PICKED_UP';
    case AT_SORTING_CENTER = 'AT_SORTING_CENTER';
    case SORTED = 'SORTED';
    case ASSIGNED_TO_RIDER = 'ASSIGNED_TO_RIDER';
    case OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY';
    case DELIVERED = 'DELIVERED';
    case COMPLETED = 'COMPLETED';
    case DELIVERY_FAILED = 'DELIVERY_FAILED';
    case RETURNED = 'RETURNED';

    // Out-of-Lifecycle Statuses
    case CANCELLED = 'CANCELLED';
    case DISPUTED = 'DISPUTED';

    /**
     * Determine if this status is part of the normal forward/reverse ERP fulfillment lifecycle.
     */
    public function isLifecycle(): bool
    {
        return ! in_array($this, [self::CANCELLED, self::DISPUTED], true);
    }

    /**
     * Determine if this status is terminal (cannot transition further).
     */
    public function isTerminal(): bool
    {
        return in_array($this, [self::COMPLETED, self::RETURNED, self::CANCELLED], true);
    }

    /**
     * Return all string values for validation and mapping.
     *
     * @return array<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    /**
     * Return all lifecycle string values.
     *
     * @return array<string>
     */
    public static function lifecycleValues(): array
    {
        return array_values(array_map(
            fn (self $case) => $case->value,
            array_filter(self::cases(), fn (self $case) => $case->isLifecycle())
        ));
    }
}
