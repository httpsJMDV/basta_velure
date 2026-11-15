<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PayoutRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPayoutController extends Controller
{
    /**
     * GET /api/v1/admin/payouts
     */
    public function index(Request $request): JsonResponse
    {
        $payouts = PayoutRequest::with(['seller.sellerProfile', 'processedBy'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, function ($q, $search) {
                $q->where(function ($sub) use ($search) {
                    $sub->where('reference_code', 'like', "%{$search}%")
                        ->orWhere('gcash_number', 'like', "%{$search}%")
                        ->orWhere('gcash_name', 'like', "%{$search}%")
                        ->orWhereHas('seller', fn ($sq) => $sq->where('email', 'like', "%{$search}%")->orWhere('first_name', 'like', "%{$search}%"));
                });
            })
            ->latest()
            ->paginate(20);

        return response()->json([
            'data' => $payouts->map(fn (PayoutRequest $p) => [
                'id'               => $p->id,
                'reference_code'   => $p->reference_code,
                'amount'           => (float) $p->amount,
                'gcash_number'     => $p->gcash_number,
                'gcash_name'       => $p->gcash_name,
                'status'           => $p->status,
                'rejection_reason' => $p->rejection_reason,
                'manual_reference_required' => $p->manual_reference_required,
                'transfer_reference' => $p->transfer_reference,
                'sent_at' => $p->sent_at?->toIso8601String(),
                'admin_notes'      => $p->admin_notes,
                'processed_at'     => $p->processed_at?->toIso8601String(),
                'created_at'       => $p->created_at?->toIso8601String(),
                'seller' => [
                    'id'        => $p->seller?->id,
                    'name'      => trim($p->seller?->first_name . ' ' . $p->seller?->last_name),
                    'shop_name' => $p->seller?->sellerProfile?->shop_name ?? ($p->seller?->first_name . "'s Shop"),
                    'email'     => $p->seller?->email,
                ],
                'processed_by' => $p->processedBy ? [
                    'id'   => $p->processedBy->id,
                    'name' => trim($p->processedBy->first_name . ' ' . $p->processedBy->last_name),
                ] : null,
            ]),
            'meta' => [
                'current_page' => $payouts->currentPage(),
                'last_page'    => $payouts->lastPage(),
                'total'        => $payouts->total(),
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/mark-sent
     */
    public function markSent(Request $request, PayoutRequest $payout): JsonResponse
    {
        $v = $request->validate(['transfer_reference' => [$payout->manual_reference_required ? 'required' : 'nullable', 'regex:/^\d{13}$/'], 'admin_notes' => ['nullable', 'string', 'max:500']]);
        $changed = \Illuminate\Support\Facades\DB::transaction(function () use ($payout, $request, $v) {
            $p = PayoutRequest::whereKey($payout->id)->lockForUpdate()->firstOrFail();
            if (in_array($p->status, ['processing', 'completed'], true)) {
                abort_if(isset($v['transfer_reference']) && $p->transfer_reference !== $v['transfer_reference'], 409, 'This payout already has a different transfer.');
                return false;
            }
            abort_unless($p->status === 'pending', 409, 'Only waiting payouts can be sent.');
            if (! empty($v['transfer_reference'])) \App\Services\Payments\PlatformGcash::claim('outgoing', $v['transfer_reference'], 'payout', $p->id);
            $p->update(['status' => 'processing', 'processed_by' => $request->user()->id, 'admin_notes' => $v['admin_notes'] ?? 'Manual GCash transfer recorded',
                'transfer_reference' => $v['transfer_reference'] ?? null, 'sent_at' => now()]);
            return true;
        });
        if (! $changed) return response()->json(['message' => 'This transfer is already recorded.']);
        $payout->refresh();
        app(\App\Services\MailNotifier::class)->payoutUpdated($payout, 'processing');
        app(\App\Services\Notifier::class)->payout($payout->seller_id, 'Payout sent', '₱' . number_format((float) $payout->amount, 2) . ' is on its way to your GCash.');

        return response()->json(['message' => 'Payout marked as Sent (Processing).']);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/complete
     */
    public function complete(Request $request, PayoutRequest $payout): JsonResponse
    {
        $changed = \Illuminate\Support\Facades\DB::transaction(function () use ($payout, $request) {
            $p = PayoutRequest::whereKey($payout->id)->lockForUpdate()->firstOrFail();
            if ($p->status === 'completed') return false;
            abort_unless($p->status === 'processing' || (! $p->manual_reference_required && $p->status === 'pending'), 409, 'Record the actual transfer before completing this payout.');
            $p->update(['status' => 'completed', 'processed_by' => $request->user()->id, 'processed_at' => now(), 'admin_notes' => $request->admin_notes ?? $p->admin_notes]);
            return true;
        });
        if (! $changed) return response()->json(['message' => 'This payout is already completed.']);
        $payout->refresh();
        app(\App\Services\MailNotifier::class)->payoutUpdated($payout, 'completed');
        app(\App\Services\Notifier::class)->payout($payout->seller_id, 'Payout completed', '₱' . number_format((float) $payout->amount, 2) . ' was transferred to your GCash.');

        return response()->json(['message' => 'Payout marked as completed.']);
    }

    /**
     * POST /api/v1/admin/payouts/{payout}/reject
     */
    public function reject(Request $request, PayoutRequest $payout): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $changed = \Illuminate\Support\Facades\DB::transaction(function () use ($payout, $request, $data) {
            $p = PayoutRequest::whereKey($payout->id)->lockForUpdate()->firstOrFail();
            if ($p->status === 'rejected') return false;
            abort_unless($p->status === 'pending' && ! $p->sent_at, 409, 'A sent payout cannot be rejected or returned to the balance.');
            $p->update(['status' => 'rejected', 'rejection_reason' => $data['reason'], 'processed_by' => $request->user()->id, 'processed_at' => now()]);
            return true;
        });
        if (! $changed) return response()->json(['message' => 'This payout is already rejected.']);
        $payout->refresh();
        app(\App\Services\MailNotifier::class)->payoutUpdated($payout, 'rejected', $data['reason']);
        app(\App\Services\Notifier::class)->payout($payout->seller_id, 'Payout not processed', 'Your payout of ' . '₱' . number_format((float) $payout->amount, 2) . " was returned to your balance: {$data['reason']}");

        return response()->json(['message' => 'Payout rejected. Balance has been restored.']);
    }
}

