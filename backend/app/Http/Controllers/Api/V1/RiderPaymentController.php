<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompanyMember;
use App\Models\Rider;
use App\Models\RiderPaymentRequest;
use App\Models\User;
use App\Services\Notifier;
use App\Services\RiderPayments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class RiderPaymentController extends Controller
{
    public function __construct(private readonly RiderPayments $payments) {}

    public function index(Request $request)
    {
        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();
        $page = RiderPaymentRequest::with(['rider.user', 'hub'])->where('rider_id', $rider->id)->latest('id')->paginate(10);

        return response()->json(['data' => $page->map(fn ($p) => $this->present($p)),
            'summary' => $this->payments->summary($rider), 'meta' => $this->meta($page)]);
    }

    public function store(Request $request)
    {
        $input = $request->validate(['confirmed' => ['required', 'accepted'], 'expected_amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0'],
            'expected_gcash_number' => ['required', 'string', 'max:30'], 'expected_gcash_name' => ['required', 'string', 'max:255']]);
        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();

        return response()->json(['message' => 'Payment requested. Your hub and courier can now review it.',
            'data' => $this->present($this->payments->request($rider, (string) $input['expected_amount'], $input['expected_gcash_number'], $input['expected_gcash_name']))], 201);
    }

    private function payerQuery(Request $request)
    {
        $company = $request->attributes->get('logistics_company');
        if ($company) {
            return RiderPaymentRequest::where('logistics_company_id', $company->id);
        }
        $hub = $request->user()->sortingCenter;
        abort_unless($hub, 403);

        return RiderPaymentRequest::where('sorting_center_id', $hub->id);
    }

    public function queue(Request $request)
    {
        $input = $request->validate(['status' => ['nullable', 'in:open,pending,processing,completed,rejected,all']]);
        $query = $this->payerQuery($request)->with(['rider.user', 'hub']);
        $status = $input['status'] ?? 'open';
        if ($status === 'open') {
            $query->whereIn('status', ['pending', 'processing']);
        } elseif ($status !== 'all') {
            $query->where('status', $status);
        }
        $page = $query->latest('id')->paginate(15);

        return response()->json(['data' => $page->map(fn ($p) => $this->present($p)), 'meta' => $this->meta($page)]);
    }

    public function send(Request $request, int $payment)
    {
        $p = $this->payerQuery($request)->findOrFail($payment);
        $data = $request->validate(['reference' => ['required', 'regex:/^\d{13}$/'],
            'receipt' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'], 'confirmed' => ['required', 'accepted']]);
        $p = $this->payments->send($p, $request->user(), $data['reference'], $request->file('receipt'));

        return response()->json(['message' => 'Transfer recorded. The rider can confirm receipt.', 'data' => $this->present($p)]);
    }

    public function claim(Request $request, int $payment)
    {
        $p = $this->payerQuery($request)->findOrFail($payment);
        $p = DB::transaction(function () use ($p, $request) {
            $p = RiderPaymentRequest::whereKey($p->id)->lockForUpdate()->firstOrFail();
            abort_unless($p->status === 'pending', 409, 'This request is no longer awaiting payment.');
            abort_if($p->processed_by !== null && (int) $p->processed_by !== (int) $request->user()->id, 409, 'Another staff member is handling this payment. Do not send money.');
            $p->update(['processed_by' => $request->user()->id]);

            return $p;
        });

        return response()->json(['message' => 'Assigned to you. Verify and send the exact payment, then record its receipt.', 'data' => $this->present($p)]);
    }

    public function release(Request $request, int $payment)
    {
        $request->validate(['not_sent' => ['required', 'accepted']]);
        $p = $this->payerQuery($request)->findOrFail($payment);
        DB::transaction(function () use ($p, $request) {
            $p = RiderPaymentRequest::whereKey($p->id)->lockForUpdate()->firstOrFail();
            abort_unless($p->status === 'pending' && (int) $p->processed_by === (int) $request->user()->id, 409, 'Only your own pending assignment can be released.');
            $p->update(['processed_by' => null]);
            AuditLog::record($request->user(), 'rider_payment.released', $p, companyId: $p->logistics_company_id);
        });

        return response()->json(['message' => 'Assignment released. No transfer was recorded.']);
    }

    public function reject(Request $request, int $payment)
    {
        $p = $this->payerQuery($request)->findOrFail($payment);
        $data = $request->validate(['note' => ['required', 'string', 'min:10', 'max:1000']]);
        $note = trim($data['note']);
        abort_if(mb_strlen($note) < 10, 422, 'Explain the decision in at least 10 characters.');

        return response()->json(['message' => 'Request declined. Its unpaid earnings are available again.',
            'data' => $this->present($this->payments->reject($p, $request->user(), $note))]);
    }

    public function confirm(Request $request, int $payment)
    {
        $request->validate(['confirmed' => ['required', 'accepted']]);
        $p = $this->own($request, $payment);
        DB::transaction(function () use ($p, $request) {
            $locked = RiderPaymentRequest::whereKey($p->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'completed') {
                return;
            }
            abort_unless($locked->status === 'processing', 409, 'A transfer must be recorded before you can confirm it.');
            $locked->update(['status' => 'completed', 'completed_at' => now()]);
            AuditLog::record($request->user(), 'rider_payment.received', $locked, companyId: $locked->logistics_company_id, actorRole: 'rider');
        });

        return response()->json(['message' => 'Payment confirmed as received.', 'data' => $this->present($p->fresh())]);
    }

    public function report(Request $request, int $payment)
    {
        $p = $this->own($request, $payment);
        $data = $request->validate(['note' => ['required', 'string', 'min:10', 'max:1000']]);
        $note = trim($data['note']);
        abort_if(mb_strlen($note) < 10, 422, 'Describe the issue in at least 10 characters.');
        DB::transaction(function () use ($p, $note, $request) {
            $p = RiderPaymentRequest::whereKey($p->id)->lockForUpdate()->firstOrFail();
            abort_unless($p->status === 'processing', 409, 'Only a sent payment can be reported.');
            abort_if($p->report_note !== null, 409, 'Your report is already with the hub and courier.');
            $p->update(['report_note' => $note]);
            AuditLog::record($request->user(), 'rider_payment.reported', $p, reason: $note, companyId: $p->logistics_company_id, actorRole: 'rider');
            $ids = LogisticsCompanyMember::where('logistics_company_id', $p->logistics_company_id)->pluck('user_id')->push($p->hub?->user_id)->filter()->unique();
            foreach (User::whereIn('id', $ids)->get() as $user) {
                app(Notifier::class)->send($user, 'rider_payment.reported', 'Rider payment needs review', $p->reference_code.': '.$note,
                    $user->sortingCenter ? '/hub/earnings' : '/logistics/money?tab=requests', ['rider_payment_id' => $p->id]);
            }
        });

        return response()->json(['message' => 'Report recorded. The hub and courier will check the transfer.']);
    }

    private function own(Request $request, int $id): RiderPaymentRequest
    {
        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();

        return RiderPaymentRequest::where('rider_id', $rider->id)->findOrFail($id);
    }

    public function receipt(Request $request, RiderPaymentRequest $payment)
    {
        $user = $request->user();
        $allowed = $user->role === 'admin' || (int) $user->rider?->id === (int) $payment->rider_id
            || (int) $user->sortingCenter?->id === (int) $payment->sorting_center_id
            || LogisticsCompanyMember::where('user_id', $user->id)->where('logistics_company_id', $payment->logistics_company_id)->exists();
        $disk = Storage::disk('ids');
        abort_unless($allowed && $payment->receipt_path && $disk->exists($payment->receipt_path), 404);

        return $disk->response($payment->receipt_path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    private function present(RiderPaymentRequest $p): array
    {
        $p->loadMissing(['rider.user', 'hub', 'processor']);

        return ['id' => $p->id, 'reference_code' => $p->reference_code, 'amount' => (string) $p->amount, 'status' => $p->status,
            'assigned_to' => $p->status === 'pending' ? $p->processed_by : null,
            'processor_name' => $p->processor ? trim($p->processor->first_name.' '.$p->processor->last_name) : null,
            'can_process' => $p->status === 'pending' && ($p->processed_by === null || (int) $p->processed_by === (int) request()->user()?->id),
            'rider_name' => trim($p->rider?->user?->first_name.' '.$p->rider?->user?->last_name), 'hub_name' => $p->hub?->hub_name,
            'gcash_number' => $p->gcash_number, 'gcash_name' => $p->gcash_name, 'breakdown' => $p->breakdown,
            'transfer_reference' => $p->transfer_reference, 'has_receipt' => (bool) $p->receipt_path, 'note' => $p->note,
            'report_note' => $p->report_note, 'created_at' => $p->created_at->toIso8601String(),
            'sent_at' => $p->sent_at?->toIso8601String(), 'completed_at' => $p->completed_at?->toIso8601String()];
    }

    private function meta($page): array
    {
        return ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()];
    }
}
