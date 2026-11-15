<?php

namespace App\Services\Payments;

use App\Models\PlatformSetting;
use App\Support\Gcash;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class PlatformGcash
{
    public static function enabled(): bool
    {
        return config('payments.gcash_collection_mode', 'platform') === 'platform';
    }

    public static function account(): ?array
    {
        $number = Gcash::normalize((string) PlatformSetting::get('platform_gcash_number', ''));
        $name = trim((string) PlatformSetting::get('platform_gcash_name', ''));
        if (! $number || $name === '') return null;
        return ['type' => 'platform', 'version' => 1, 'name' => $name, 'number' => $number,
            'qr_url' => PlatformSetting::get('platform_gcash_qr_url')];
    }

    /** Called within the transaction recording an actual, manually checked transfer. */
    public static function claim(string $direction, string $reference, string $kind, int $id): void
    {
        $reference = Gcash::reference($reference);
        if (strlen($reference) !== 13) throw ValidationException::withMessages(['reference' => 'Enter the 13-digit GCash transaction reference.']);
        DB::table('platform_gcash_references')->insertOrIgnore(['direction' => $direction, 'reference' => $reference,
            'subject_type' => $kind, 'subject_id' => $id, 'created_at' => now()]);
        $claim = DB::table('platform_gcash_references')->where('direction', $direction)->where('reference', $reference)->lockForUpdate()->first();
        if (! $claim || $claim->subject_type !== $kind || (int) $claim->subject_id !== $id) {
            throw ValidationException::withMessages(['reference' => 'This GCash transfer is already recorded for another transaction.']);
        }
    }
}
