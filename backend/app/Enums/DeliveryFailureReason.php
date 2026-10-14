<?php

namespace App\Enums;

/**
 * Why a delivery attempt failed. The single source for codes, labels and the note rule,
 * used by validation, the failure-reasons endpoint and the history note.
 */
enum DeliveryFailureReason: string
{
    case RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE';
    case WRONG_ADDRESS = 'WRONG_ADDRESS';
    case REFUSED = 'REFUSED';
    case CANNOT_CONTACT = 'CANNOT_CONTACT';
    case ADDRESS_INACCESSIBLE = 'ADDRESS_INACCESSIBLE';
    case OTHER = 'OTHER';

    public function label(): string
    {
        return match ($this) {
            self::RECIPIENT_UNAVAILABLE => 'Recipient unavailable',
            self::WRONG_ADDRESS         => 'Wrong or incomplete address',
            self::REFUSED               => 'Recipient refused the parcel',
            self::CANNOT_CONTACT        => 'Could not contact the recipient',
            self::ADDRESS_INACCESSIBLE  => 'Address not accessible',
            self::OTHER                 => 'Other reason',
        };
    }

    /** Only OTHER needs the rider to explain in a note. */
    public function requiresNote(): bool
    {
        return $this === self::OTHER;
    }

    /**
     * @return array<int, array{code: string, label: string, requires_note: bool}>
     */
    public static function options(): array
    {
        return array_map(fn (self $r) => [
            'code'          => $r->value,
            'label'         => $r->label(),
            'requires_note' => $r->requiresNote(),
        ], self::cases());
    }
}
