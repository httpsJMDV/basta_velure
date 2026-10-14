<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\OrderItem;
use App\Models\PayoutRequest;

/**
 * A seller's money position, read from order items and payout requests. One place, so the earnings
 * page and the dashboard card can never disagree. This only READS: it changes no amount and no status.
 */
class SellerBalanceCalculator
{
    /**
     * @return array{available_balance: float, pending_balance: float, total_paid_out: float, lifetime_earnings: float, total_commission_paid: float}
     */
    public function forSeller(int $sellerId): array
    {
        // Earnings whose escrow has been released (payout_status = available).
        $grossAvailable = (float) OrderItem::where('seller_id', $sellerId)
            ->where('payout_status', 'available')
            ->sum('seller_earnings');

        // Already requested in pending, processing or completed payouts.
        $requestedPayouts = (float) PayoutRequest::where('seller_id', $sellerId)
            ->whereIn('status', ['pending', 'processing', 'completed'])
            ->sum('amount');

        $availableBalance = max(0, round($grossAvailable - $requestedPayouts, 2));

        $excludedStatuses = [OrderStatus::CANCELLED->value, OrderStatus::RETURNED->value, 'cancelled', 'returned'];

        // Still in escrow: in transit, delivered but unconfirmed, or inside the protection period.
        $pendingBalance = (float) OrderItem::where('seller_id', $sellerId)
            ->where('payout_status', 'pending_release')
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', $excludedStatuses))
            ->sum('seller_earnings');

        $totalPaidOut = (float) PayoutRequest::where('seller_id', $sellerId)
            ->where('status', 'completed')
            ->sum('amount');

        $lifetimeEarnings = (float) OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', $excludedStatuses))
            ->sum('seller_earnings');

        $totalCommissionPaid = (float) OrderItem::where('seller_id', $sellerId)
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', $excludedStatuses))
            ->sum('commission_amount');

        return [
            'available_balance'     => $availableBalance,
            'pending_balance'       => round($pendingBalance, 2),
            'total_paid_out'        => round($totalPaidOut, 2),
            'lifetime_earnings'     => round($lifetimeEarnings, 2),
            'total_commission_paid' => round($totalCommissionPaid, 2),
        ];
    }
}
