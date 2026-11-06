<?php

namespace App\Services\Commerce;

use App\Enums\DeliveryFailureReason;
use App\Models\DeliveryLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Cash on delivery after refused parcels. Every parcel a buyer refuses at the door costs the shop and the rider a trip,
 * so after orders.cod_refusal_limit refusals (3 by default) the buyer pays by GCash instead, like the big marketplaces
 * do. Only "Refused" counts: "not at home" and an unreachable address do not.
 *
 * Nothing is stored per refusal: the count is read from the riders' delivery logs. An admin turns COD back on by
 * setting users.cod_refusals_reset_at, after which earlier refusals no longer count.
 */
class CodRefusals
{
    public static function limit(): int
    {
        return (int) config('orders.cod_refusal_limit', 3);
    }

    /** Parcels of this buyer refused at the door since COD was last turned back on. */
    public static function count(User $buyer): int
    {
        return (int) DeliveryLog::query()
            ->join('parcels', 'parcels.id', '=', 'delivery_logs.parcel_id')
            ->join('orders', 'orders.id', '=', 'parcels.order_id')
            ->where('orders.buyer_id', $buyer->id)
            ->where('delivery_logs.outcome', DeliveryLog::OUTCOME_DELIVERY_FAILED)
            ->where('delivery_logs.notes', 'like', DeliveryFailureReason::REFUSED->value . ':%')
            ->when($buyer->cod_refusals_reset_at, fn ($q) => $q->where('delivery_logs.logged_at', '>', $buyer->cod_refusals_reset_at))
            ->count(DB::raw('DISTINCT delivery_logs.parcel_id'));
    }

    public static function blocked(User $buyer): bool
    {
        return self::limit() > 0 && self::count($buyer) >= self::limit();
    }

    public static function blockedMessage(): string
    {
        return 'Cash on delivery is off for your account because ' . self::limit() . ' parcels were refused at the door. Pay by GCash instead.';
    }

    /** Right after a refusal is logged: when this one reaches the limit, the buyer is told COD is now off. */
    public static function afterRefusal(?User $buyer): void
    {
        if (! $buyer || self::limit() === 0 || self::count($buyer) !== self::limit()) {
            return;
        }
        app(\App\Services\Notifier::class)->send($buyer, 'account.cod_off', 'Cash on delivery is off',
            'You refused ' . self::limit() . ' parcels at the door, so you can pay by GCash for now. Message Loved-IT Support if this is a mistake.',
            '/settings/orders');
        app(\App\Services\MailNotifier::class)->codTurnedOff($buyer, self::limit());
    }

    /** The admin turns COD back on: earlier refusals stop counting. */
    public static function restore(User $buyer): void
    {
        $buyer->forceFill(['cod_refusals_reset_at' => now()])->save();
    }
}
