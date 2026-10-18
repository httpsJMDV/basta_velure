<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Dispute;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDisputeController extends Controller
{
    /** Cases waiting on Loved-IT: escalated returns, and claims raised before the return flow. */
    private const NEEDS_DECISION = ['escalated', 'open', 'in_progress'];

    private const STATUSES = ['escalated', 'open', 'in_progress', 'pending', 'rejected', 'approved', 'resolved', 'closed'];

    /**
     * GET /admin/disputes?status=escalated,open&search=: one status or several (comma-separated). The search matches the
     * order number, the buyer's name or email, the shop name and the reason. Cases waiting for a decision come oldest
     * first (first in, first decided); any other list newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $statuses = array_values(array_intersect(self::STATUSES, explode(',', (string) $request->query('status', ''))));
        $search = trim((string) $request->query('search', ''));
        $waiting = $statuses !== [] && array_diff($statuses, self::NEEDS_DECISION) === [];

        $disputes = Dispute::with(['order.buyer', 'buyer', 'seller.sellerProfile', 'photos'])
            ->when($statuses !== [], fn ($q) => $q->whereIn('status', $statuses))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . addcslashes($search, '%_\\') . '%';
                $q->where(fn ($w) => $w->where('reason', 'like', $like)->orWhere('description', 'like', $like)
                    ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', $like))
                    ->orWhereHas('buyer', fn ($b) => $b->where('email', 'like', $like)
                        ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]))
                    ->orWhereHas('seller.sellerProfile', fn ($s) => $s->where('shop_name', 'like', $like)));
            })
            ->orderBy('created_at', $waiting ? 'asc' : 'desc')->orderBy('id', $waiting ? 'asc' : 'desc')
            ->paginate(20);

        return response()->json([
            'data' => $disputes->map(fn ($d) => $this->format($d)),
            'meta' => [
                'current_page' => $disputes->currentPage(),
                'last_page'    => $disputes->lastPage(),
                'total'        => $disputes->total(),
            ],
        ]);
    }

    public function show(Dispute $dispute): JsonResponse
    {
        $dispute->load(['order.buyer', 'order.items', 'buyer', 'resolver', 'seller.sellerProfile', 'photos']);
        return response()->json(['data' => $this->format($dispute, detail: true)]);
    }

    public function resolve(Request $request, Dispute $dispute): JsonResponse
    {
        $request->validate([
            'resolution_note' => ['required', 'string', 'min:10', 'max:1000'],
            'status'          => ['required_without:decision', 'nullable', 'in:resolved,closed'],
            // An escalated return (A31): refund the buyer, or side with the shop and complete the order.
            'decision'        => ['nullable', 'in:refund,reject'],
        ]);

        if ($request->filled('decision') && $dispute->order) {
            // Only a return still waiting on a decision can be decided; an approved, rejected-and-not-escalated or
            // closed request stays as it is.
            if (! in_array($dispute->status, ['escalated', 'open', 'in_progress'], true)) {
                abort(409, $dispute->status === 'rejected'
                    ? 'The shop rejected this return and the buyer has not escalated it.'
                    : 'This return request has already been decided.');
            }
            $note = trim(strip_tags($request->resolution_note));
            if ($request->decision === 'refund') {
                app(\App\Services\Commerce\ReturnService::class)->approve($dispute->order, 'admin', $request->user()->id, "Loved-IT decided: refund. {$note}");
            } else {
                \Illuminate\Support\Facades\DB::transaction(function () use ($dispute, $request, $note) {
                    $dispute->update(['status' => 'closed', 'resolution_note' => "Loved-IT decided for the shop. {$note}", 'resolved_by' => $request->user()->id, 'resolved_at' => now()]);
                    app(\App\Services\OrderStateMachine::class)->transition($dispute->order, \App\Enums\OrderStatus::COMPLETED, 'admin', $request->user()->id, 'Return dispute closed in favour of the shop');
                });
            }
            AdminActivityLog::create([
                'admin_id' => $request->user()->id, 'action' => 'resolve_dispute', 'target_type' => 'dispute', 'target_id' => $dispute->id,
                'description' => "Dispute #{$dispute->id} decided: {$request->decision}.", 'meta' => ['order_id' => $dispute->order_id],
            ]);

            return response()->json(['data' => $this->format($dispute->fresh(['order.buyer', 'buyer', 'resolver']))]);
        }

        $dispute->update([
            'status'          => $request->status,
            'resolution_note' => $request->resolution_note,
            'resolved_by'     => $request->user()->id,
            'resolved_at'     => now(),
        ]);

        AdminActivityLog::create([
            'admin_id'    => $request->user()->id,
            'action'      => 'resolve_dispute',
            'target_type' => 'dispute',
            'target_id'   => $dispute->id,
            'description' => "Dispute #{$dispute->id} marked as {$request->status}.",
            'meta'        => ['order_id' => $dispute->order_id],
        ]);

        return response()->json(['data' => $this->format($dispute->fresh(['order.buyer', 'buyer', 'resolver']))]);
    }

    public function stats(): JsonResponse
    {
        $count = Dispute::selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
        $sum = fn (array $statuses) => (int) collect($statuses)->sum(fn ($s) => $count[$s] ?? 0);

        return response()->json([
            'data' => [
                'open'        => $sum(['open']),
                'in_progress' => $sum(['in_progress']),
                'resolved'    => $sum(['resolved', 'closed', 'approved']),
                // A31: returns the buyer escalated after the shop rejected them, waiting for Loved-IT.
                'escalated'   => $sum(['escalated']),
                // Returns still with the shop (3 days to answer).
                'awaiting_seller' => $sum(['pending']),
                // Rejected by the shop; the buyer has 3 days to escalate.
                'rejected'    => $sum(['rejected']),
                'needs_decision' => $sum(self::NEEDS_DECISION),
                // Of those, waiting more than 3 days.
                'overdue'     => Dispute::whereIn('status', self::NEEDS_DECISION)->whereRaw('COALESCE(escalated_at, created_at) < ?', [now()->subDays(3)])->count(),
                'total'       => $sum(self::STATUSES),
            ],
        ]);
    }

    private function format(Dispute $d, bool $detail = false): array
    {
        $base = [
            'id'              => $d->id,
            'reason'          => $d->reason,
            'description'     => $d->description,
            'status'          => $d->status,
            'photos'          => $d->photos->map(fn ($p) => $p->url())->values(),
            'seller'          => $d->seller ? [
                'id'        => $d->seller->id,
                'shop_name' => $d->seller->sellerProfile?->shop_name,
            ] : null,
            'seller_reason'   => $d->seller_reason,
            'seller_responded_at' => $d->seller_responded_at?->toIso8601String(),
            // The shop's deadline to answer, and the buyer's to escalate a rejection.
            'respond_by'      => $d->respond_by?->toIso8601String(),
            'escalate_by'     => $d->escalate_by?->toIso8601String(),
            'escalated_at'    => $d->escalated_at?->toIso8601String(),
            'auto_approved'   => (bool) $d->auto_approved,
            'refund_amount'   => $d->refund_amount !== null ? (float) $d->refund_amount : null,
            'can_decide'      => in_array($d->status, ['escalated', 'open', 'in_progress'], true),
            'resolution_note' => $d->resolution_note,
            'resolved_at'     => $d->resolved_at,
            'created_at'      => $d->created_at,
            'buyer' => $d->buyer ? [
                'id'         => $d->buyer->id,
                'first_name' => $d->buyer->first_name,
                'last_name'  => $d->buyer->last_name,
                'email'      => $d->buyer->email,
            ] : null,
            'order' => $d->order ? [
                'id'           => $d->order->id,
                'order_number' => $d->order->order_number,
                'total'        => (float) $d->order->total,
                'status'       => $d->order->status,
                'payment_method' => $d->order->payment_method,
                'refund_status'  => $d->order->refund_status,
            ] : null,
        ];

        if ($detail && $d->order) {
            $base['order']['items'] = $d->order->items->map(fn ($i) => [
                'id'            => $i->id,
                'image_url'     => $i->image_url,
                'product_name'  => $i->product_name,
                'variant_label' => $i->variant_label,
                'quantity'      => $i->quantity,
                'unit_price'    => (float) $i->unit_price,
                'subtotal'      => (float) $i->subtotal,
            ])->values();
            $base['resolver'] = $d->resolver ? [
                'first_name' => $d->resolver->first_name,
                'last_name'  => $d->resolver->last_name,
            ] : null;
        }

        return $base;
    }
}
