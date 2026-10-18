<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Dispute;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDisputeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $disputes = Dispute::with(['order.buyer', 'buyer'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, fn ($q) => $q->whereHas('order', fn ($q2) =>
                $q2->where('order_number', 'like', "%{$request->search}%")
            ))
            ->oldest()
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
        $dispute->load(['order.buyer', 'order.items', 'buyer', 'resolver']);
        return response()->json(['data' => $this->format($dispute, detail: true)]);
    }

    public function resolve(Request $request, Dispute $dispute): JsonResponse
    {
        $request->validate([
            'resolution_note' => ['required', 'string', 'max:1000'],
            'status'          => ['required_without:decision', 'nullable', 'in:resolved,closed'],
            // An escalated return (A31): refund the buyer, or side with the shop and complete the order.
            'decision'        => ['nullable', 'in:refund,reject'],
        ]);

        if ($request->filled('decision') && $dispute->order) {
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
        $open        = Dispute::where('status', 'open')->count();
        $inProgress  = Dispute::where('status', 'in_progress')->count();
        $resolved    = Dispute::whereIn('status', ['resolved', 'closed'])->count();

        return response()->json([
            'data' => [
                'open'        => $open,
                'in_progress' => $inProgress,
                'resolved'    => $resolved,
            ],
        ]);
    }

    private function format(Dispute $d, bool $detail = false): array
    {
        $base = [
            'id'              => $d->id,
            'reason'          => $d->reason,
            'status'          => $d->status,
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
            ] : null,
        ];

        if ($detail && $d->order) {
            $base['order']['items'] = $d->order->items->map(fn ($i) => [
                'product_name'  => $i->product_name,
                'variant_label' => $i->variant_label,
                'quantity'      => $i->quantity,
                'unit_price'    => (float) $i->unit_price,
            ])->values();
            $base['resolver'] = $d->resolver ? [
                'first_name' => $d->resolver->first_name,
                'last_name'  => $d->resolver->last_name,
            ] : null;
        }

        return $base;
    }
}
