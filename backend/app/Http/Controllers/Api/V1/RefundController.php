<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Order;
use App\Models\Refund;
use App\Models\User;
use App\Services\Commerce\BuyerOrderPresenter;
use App\Services\Commerce\ManualRefunds;
use App\Support\Gcash;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Refunds the shop sends by hand (ManualRefunds): the buyer's GCash account, confirm or report; the shop's transfer;
 * Loved-IT's decision on a reported or late one; and the receipt, from the private disk.
 */
class RefundController extends Controller
{
    private const BUYER_WITH = ['items.seller.sellerProfile', 'payment', 'parcel', 'dispute.photos', 'refund', 'statusHistories'];

    public function __construct(private readonly ManualRefunds $refunds) {}

    // ── Buyer ────────────────────────────────────────────────────────────────

    /** PUT /buyer/orders/{order}/refund/account {gcash_number, gcash_name}: until the shop has sent it. */
    public function buyerAccount(Request $request, Order $order): JsonResponse
    {
        $refund = $this->buyerRefund($request, $order);
        $data = $request->validate([
            'gcash_number' => ['required', ...Gcash::RULE],
            'gcash_name'   => Validation::accountName(),
        ], [
            'gcash_number.required' => 'Enter the GCash number that gets the refund.',
            'gcash_number.regex'    => 'Enter the 11-digit mobile number of the GCash account, like 0917 123 4567.',
            'gcash_name.required'   => 'Enter the name on the GCash account.',
        ] + Validation::accountNameMessages('gcash_name'));

        $number = Gcash::normalize($data['gcash_number']);
        if (! $number) {
            throw ValidationException::withMessages(['gcash_number' => 'Enter the 11-digit mobile number of the GCash account, like 0917 123 4567.']);
        }
        $this->refunds->setAccount($refund, $request->user(), $number, \Illuminate\Support\Str::squish($data['gcash_name']));

        return $this->buyerResponse($order, 'Saved. The shop sends the refund to ' . Gcash::format($number) . '.');
    }

    /** POST /buyer/orders/{order}/refund/confirm: the money arrived. */
    public function buyerConfirm(Request $request, Order $order): JsonResponse
    {
        $this->refunds->confirm($this->buyerRefund($request, $order), $request->user());

        return $this->buyerResponse($order, 'Thanks. The refund is marked as received.');
    }

    /** POST /buyer/orders/{order}/refund/report {note}: nothing arrived. */
    public function buyerReport(Request $request, Order $order): JsonResponse
    {
        $refund = $this->buyerRefund($request, $order);
        $note = $request->validate(['note' => Validation::sentence(true, 10, 500)], Validation::sentenceMessages('note', 'What happened', 10, 500))['note'];
        $this->refunds->report($refund, $request->user(), trim(strip_tags($note)));

        return $this->buyerResponse($order, 'Reported. Loved-IT will check the shop\'s receipt and get back to you.');
    }

    // ── Seller ───────────────────────────────────────────────────────────────

    /** GET /seller/refunds?status=open|done: the shop's refunds, the ones to act on first. */
    public function sellerIndex(Request $request): JsonResponse
    {
        $open = $request->query('status', 'open') !== 'done';
        $page = Refund::with('order:id,order_number,payment_method,total')
            ->where('seller_id', $request->user()->id)
            ->when($open, fn ($q) => $q->whereIn('status', Refund::OPEN), fn ($q) => $q->where('status', Refund::STATUS_RECEIVED))
            ->orderByRaw("CASE status WHEN 'awaiting_shop' THEN 0 WHEN 'not_received' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END")
            ->orderBy($open ? 'send_by' : 'received_at', $open ? 'asc' : 'desc')
            ->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Refund $r) => $this->withOrder($r, 'seller'))->values(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'to_send' => Refund::where('seller_id', $request->user()->id)->where('status', Refund::STATUS_AWAITING_SHOP)->count(),
            ],
        ]);
    }

    /** POST /seller/orders/{order}/refund/sent (multipart) {reference, receipt}: the shop sent it. */
    public function sellerSent(Request $request, Order $order): JsonResponse
    {
        $refund = Refund::where('order_id', $order->id)->where('seller_id', $request->user()->id)->first();
        abort_unless($refund, 404, 'There is no refund to send for this order.');
        $data = $request->validate([
            'reference' => ['required', 'string', 'max:30'],
            'receipt'   => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ], [
            'reference.required' => 'Enter the 13-digit reference number of the GCash transfer.',
            'receipt.required'   => 'Add a screenshot of the GCash receipt.',
            'receipt.mimes'      => 'The receipt must be a JPG, PNG or WebP picture.',
            'receipt.max'        => 'The receipt picture must be 8 MB or smaller.',
        ]);
        $reference = Gcash::reference($data['reference']);
        if (strlen($reference) !== 13) {
            throw ValidationException::withMessages(['reference' => 'Enter the 13-digit reference number of the GCash transfer.']);
        }
        $fresh = $this->refunds->markSent($refund, $request->user(), $reference, $request->file('receipt'));

        return response()->json([
            'message' => 'Refund recorded. The buyer is asked to confirm it arrived.',
            'data'    => ManualRefunds::present($fresh, 'seller'),
        ]);
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /** GET /admin/refunds?status=attention|open|done|<status>: "attention" is reported or late, oldest first. */
    public function adminIndex(Request $request): JsonResponse
    {
        $status = (string) $request->query('status', 'attention');
        $query = Refund::with(['order:id,order_number,payment_method,total', 'buyer:id,first_name,last_name,email', 'seller.sellerProfile:id,user_id,shop_name']);
        match ($status) {
            'attention' => $query->where(fn ($q) => $q->where('status', Refund::STATUS_NOT_RECEIVED)
                ->orWhere(fn ($w) => $w->where('status', Refund::STATUS_AWAITING_SHOP)->where('send_by', '<', now())))->orderBy('updated_at'),
            'open'      => $query->whereIn('status', Refund::OPEN)->orderBy('created_at'),
            'done'      => $query->where('status', Refund::STATUS_RECEIVED)->orderByDesc('received_at'),
            default     => in_array($status, [...Refund::OPEN, Refund::STATUS_RECEIVED], true) ? $query->where('status', $status)->latest() : $query->latest(),
        };
        $page = $query->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Refund $r) => $this->withOrder($r, 'admin') + [
                'buyer'  => $r->buyer ? ['id' => $r->buyer->id, 'name' => trim("{$r->buyer->first_name} {$r->buyer->last_name}"), 'email' => $r->buyer->email] : null,
                'shop'   => $r->seller ? ['id' => $r->seller->id, 'shop_name' => $r->seller->sellerProfile?->shop_name] : null,
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'attention' => Refund::where('status', Refund::STATUS_NOT_RECEIVED)
                    ->orWhere(fn ($w) => $w->where('status', Refund::STATUS_AWAITING_SHOP)->where('send_by', '<', now()))->count(),
            ],
        ]);
    }

    /** POST /admin/refunds/{refund}/resolve {decision: received|send_again, note}. */
    public function adminResolve(Request $request, Refund $refund): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', Rule::in(['received', 'send_again'])],
            'note'     => Validation::sentence(true, 10, 1000),
        ], Validation::sentenceMessages('note', 'The note', 10, 1000) + ['decision.in' => 'Choose received or send again.']);
        $note = trim(strip_tags($data['note']));
        $fresh = $this->refunds->resolve($refund, $request->user(), $data['decision'], $note);

        AdminActivityLog::create([
            'admin_id' => $request->user()->id, 'action' => 'resolve_refund', 'target_type' => 'refund', 'target_id' => $refund->id,
            'description' => "Refund #{$refund->id} decided: {$data['decision']}.", 'meta' => ['order_id' => $refund->order_id],
        ]);

        return response()->json(['data' => $this->withOrder($fresh, 'admin')]);
    }

    // ── Receipt ──────────────────────────────────────────────────────────────

    /** GET /refunds/{refund}/receipt: the buyer, the shop and admins; anyone else gets the same 404 as no receipt. */
    public function receipt(Request $request, Refund $refund): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $allowed = $user->role === 'admin' || (int) $refund->buyer_id === (int) $user->id || (int) $refund->seller_id === (int) $user->id;
        $path = $refund->receipt_path;
        abort_unless($allowed && $path && Storage::disk(Refund::RECEIPT_DISK)->exists($path), 404, 'Receipt not found.');

        return Storage::disk(Refund::RECEIPT_DISK)->response($path, null, [
            'Cache-Control'          => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function buyerRefund(Request $request, Order $order): Refund
    {
        abort_if($order->buyer_id !== $request->user()->id, 404, 'Order not found.');
        $refund = Refund::where('order_id', $order->id)->first();
        abort_unless($refund, 404, 'There is no refund to manage for this order.');

        return $refund;
    }

    private function buyerResponse(Order $order, string $message): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'data'    => BuyerOrderPresenter::present($order->fresh(self::BUYER_WITH), detail: true),
        ]);
    }

    /** @param 'seller'|'admin' $viewer */
    private function withOrder(Refund $r, string $viewer): array
    {
        return ManualRefunds::present($r, $viewer) + ['order' => $r->order ? [
            'id' => $r->order->id, 'order_number' => $r->order->order_number,
            'payment_method' => $r->order->payment_method, 'total' => (float) $r->order->total,
        ] : null];
    }
}
