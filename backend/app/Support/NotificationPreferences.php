<?php

namespace App\Support;

use App\Models\User;

/**
 * What a seller wants to hear about, by the bell (in-app) and by email. Each category covers the notifications of one
 * kind of event; anything not listed here (account, security, application decisions, a buyer's own orders) is always
 * sent. Stored on users.notification_preferences as {category: {app: bool, email: bool}}; a missing value is the default.
 */
final class NotificationPreferences
{
    /** category => [label, what it covers, default for the bell, default for email] */
    public const SELLER = [
        'new_order'     => ['New orders', 'A buyer places an order, or pays for one, in your shop.', true, true],
        'order_updates' => ['Order updates and cancellations', 'Orders delivered, completed, cancelled, or coming back from the courier.', true, true],
        'returns'       => ['Returns', 'A buyer asks to return an order, or escalates a return to Loved-IT.', true, true],
        'low_stock'     => ['Low stock', 'A product falls to its low-stock level, or sells out.', true, false],
        'new_review'    => ['New reviews', 'A buyer reviews one of your products.', true, false],
        'payouts'       => ['Earnings and payouts', 'Earnings become available, and your payout requests are processed.', true, true],
        'listings'      => ['Product decisions', 'Loved-IT approves, rejects, archives or restores one of your products.', true, true],
    ];

    public const CHANNELS = ['app', 'email'];

    /** @return array<string, array{app: bool, email: bool}> the seller's settings, defaults filled in */
    public static function forSeller(User $user): array
    {
        $saved = is_array($user->notification_preferences) ? $user->notification_preferences : [];
        $out = [];
        foreach (self::SELLER as $category => [, , $app, $email]) {
            $out[$category] = [
                'app'   => (bool) ($saved[$category]['app'] ?? $app),
                'email' => (bool) ($saved[$category]['email'] ?? $email),
            ];
        }

        return $out;
    }

    /** Whether $user wants $category by $channel (app or email). Unknown categories are always allowed. */
    public static function allows(?User $user, string $category, string $channel): bool
    {
        if (! $user || ! isset(self::SELLER[$category])) {
            return true;
        }

        return self::forSeller($user)[$category][$channel] ?? true;
    }

    /** @param array<string, array<string, mixed>> $input only known categories and channels are kept */
    public static function save(User $user, array $input): array
    {
        $current = self::forSeller($user);
        foreach ($input as $category => $channels) {
            if (! isset($current[$category]) || ! is_array($channels)) {
                continue;
            }
            foreach (self::CHANNELS as $channel) {
                if (array_key_exists($channel, $channels)) {
                    $current[$category][$channel] = filter_var($channels[$channel], FILTER_VALIDATE_BOOLEAN);
                }
            }
        }
        $user->forceFill(['notification_preferences' => $current])->save();

        return $current;
    }
}
