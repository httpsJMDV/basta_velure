<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Order;
use App\Services\Payments\PlatformGcash;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Loved-IT funds the courier once; the courier pays its staff through its existing payout screens. */
class PlatformCourierFundingController extends Controller
{
    private function eligible(int $company)
    {
        return Order::where('logistics_company_id', $company)->where('settlement', Order::SETTLEMENT_PLATFORM)
            ->where('payment_method', 'gcash')->whereNotNull('collection_payee')->where('payment_status', 'paid')
            ->whereHas('parcel', fn ($q) => $q->whereNotNull('delivered_at'))
            ->whereNotIn('id', DB::table('platform_courier_funding_orders')->select('order_id'));
    }

    public function index(Request $request)
    {
        $admin = $request->user()->role === 'admin';
        $companies = $admin ? LogisticsCompany::orderBy('name')->get() : collect([$request->attributes->get('logistics_company')]);
        return response()->json(['data' => $companies->map(function ($c) use ($admin) {
            $orders = $this->eligible($c->id)->orderBy('id')->get();
            $history = DB::table('platform_courier_fundings')->where('logistics_company_id', $c->id)->orderByDesc('id')->limit(30)->get()
                ->map(fn ($f) => ['id' => $f->id, 'amount' => $f->amount, 'reference' => $f->reference, 'sent_at' => $f->sent_at,
                    'confirmed_at' => $f->confirmed_at, 'has_receipt' => (bool) $f->receipt_path, 'payee' => $f->payee ? json_decode($f->payee, true) : null]);
            return ['company_id' => $c->id, 'name' => $c->name, 'account' => ['number' => $c->gcash_number, 'name' => $c->gcash_name],
                'due' => Money::fromCents($orders->sum(fn ($o) => Money::toCents($o->courierFeeAmount()))),
                'order_ids' => $orders->pluck('id'), 'order_count' => $orders->count(), 'history' => $history, 'can_send' => $admin];
        })]);
    }

    public function send(Request $request, LogisticsCompany $company)
    {
        abort_unless($request->user()->role === 'admin', 403);
        $v = $request->validate(['reference' => ['required', 'regex:/^\d{13}$/'], 'amount' => ['required', 'numeric', 'gt:0', 'decimal:0,2'],
            'order_ids' => ['required', 'array', 'min:1', 'max:500'], 'order_ids.*' => ['required', 'integer', 'distinct'],
            'receipt' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:8192']]);
        $path = null;
        try {
            $id = DB::transaction(function () use ($request, $company, $v, &$path) {
                $c = LogisticsCompany::whereKey($company->id)->lockForUpdate()->firstOrFail();
                abort_unless($c->gcash_number && $c->gcash_name, 422, 'The courier must configure its GCash payout account first.');
                $orders = $this->eligible($c->id)->whereIn('id', $v['order_ids'])->orderBy('id')->lockForUpdate()->get();
                abort_unless($orders->count() === count($v['order_ids']), 409, 'Some orders have already been funded or are no longer eligible. Refresh before sending.');
                $cents = $orders->sum(fn ($o) => Money::toCents($o->courierFeeAmount()));
                abort_unless($cents === Money::toCents((string) $v['amount']), 422, 'The recorded amount must match the selected shipping fees.');
                $path = $request->file('receipt')->store('courier-funding-receipts', 'ids');
                $id = DB::table('platform_courier_fundings')->insertGetId(['logistics_company_id' => $c->id, 'amount' => Money::fromCents($cents),
                    'reference' => $v['reference'], 'receipt_path' => $path, 'payee' => json_encode(['name' => $c->gcash_name, 'number' => $c->gcash_number]),
                    'sent_by' => $request->user()->id, 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
                PlatformGcash::claim('outgoing', $v['reference'], 'courier_funding', $id);
                foreach ($orders as $o) DB::table('platform_courier_funding_orders')->insert(['funding_id' => $id, 'order_id' => $o->id, 'amount' => $o->courierFeeAmount()]);
                return $id;
            });
        } catch (\Throwable $e) {
            if ($path) Storage::disk('ids')->delete($path);
            throw $e;
        }
        return response()->json(['message' => 'Manual courier transfer recorded. Staff earnings remain payable by the courier.', 'data' => ['id' => $id]], 201);
    }

    public function confirm(Request $request, int $funding)
    {
        $request->validate(['received_in_gcash' => ['required', 'accepted']]);
        $company = $request->attributes->get('logistics_company');
        $row = DB::table('platform_courier_fundings')->where('id', $funding)->where('logistics_company_id', $company->id)->first();
        abort_unless($row, 404);
        DB::table('platform_courier_fundings')->where('id', $row->id)->whereNull('confirmed_at')
            ->update(['confirmed_by' => $request->user()->id, 'confirmed_at' => now(), 'updated_at' => now()]);
        return response()->json(['message' => 'Courier confirmed receipt.']);
    }

    public function receipt(Request $request, int $funding)
    {
        $row = DB::table('platform_courier_fundings')->where('id', $funding)->first();
        abort_unless($row && ($request->user()->role === 'admin' || (int) $request->attributes->get('logistics_company')?->id === (int) $row->logistics_company_id), 404);
        abort_unless($row->receipt_path && Storage::disk('ids')->exists($row->receipt_path), 404);
        return Storage::disk('ids')->response($row->receipt_path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
