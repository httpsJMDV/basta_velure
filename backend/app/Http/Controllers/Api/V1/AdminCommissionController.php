<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\CommissionPayment;
use App\Models\PlatformSetting;
use App\Models\SellerProfile;
use App\Services\DirectSettlement;
use App\Support\Gcash;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Commission on direct orders: shops pay it to Loved-IT's GCash each month and an admin confirms the transfer.
 * Also where the admin sets that GCash.
 */
class AdminCommissionController extends Controller
{
    public function __construct(private DirectSettlement $money) {}

    /** GET /admin/commission?period=YYYY-MM */
    public function index(Request $request): JsonResponse
    {
        $period = (string) $request->query('period', '');
        [$from, $to] = $this->money->month(preg_match('/^\d{4}-\d{2}$/', $period) ? "{$period}-01" : null);

        $lines = $this->money->commissionLines($from, $to);
        $payments = CommissionPayment::whereDate('period', $from->toDateString())->get()->keyBy('seller_id');
        $sellerIds = $lines->keys()->merge($payments->keys())->unique();
        $profiles = SellerProfile::whereIn('user_id', $sellerIds)->get()->keyBy('user_id');

        $rows = $sellerIds->map(function ($sellerId) use ($lines, $payments, $profiles) {
            $line = $lines->get($sellerId);
            $payment = $payments->get($sellerId);
            $profile = $profiles->get($sellerId);

            return [
                'seller_id'    => (int) $sellerId,
                'shop_name'    => $profile?->shop_name ?? 'Shop',
                'logo_url'     => $profile?->logo_url,
                'orders_count' => $line['orders_count'] ?? $payment?->orders_count ?? 0,
                'amount'       => (float) Money::fromCents($line['cents'] ?? Money::toCents((string) ($payment?->amount ?? 0))),
                'payment'      => SellerSettlementController::commissionPayment($payment),
            ];
        })->sortByDesc('amount')->values();

        return response()->json(['data' => [
            'period'      => $from->format('Y-m'),
            'label'       => $from->format('F Y'),
            'in_progress' => $from->isSameMonth(now(DirectSettlement::TZ)),
            'rows'        => $rows,
            'totals'      => [
                'due'       => (float) Money::fromCents($lines->sum('cents')),
                'paid'      => (float) $payments->sum(fn ($p) => (float) $p->amount),
                'confirmed' => (float) $payments->whereNotNull('confirmed_at')->sum(fn ($p) => (float) $p->amount),
            ],
            'platform_gcash' => SellerSettlementController::platformGcash(),
        ]]);
    }

    /** POST /admin/commission/{payment}/confirm: the transfer arrived in Loved-IT's GCash. */
    public function confirm(Request $request, CommissionPayment $payment): JsonResponse
    {
        abort_if($payment->confirmed_at, 422, 'Already confirmed.');
        $payment->update(['confirmed_at' => now(), 'confirmed_by' => $request->user()->id]);

        AdminActivityLog::create([
            'admin_id'    => $request->user()->id,
            'action'      => 'confirm_commission',
            'target_type' => 'commission_payment',
            'target_id'   => $payment->id,
            'description' => "Confirmed commission of ₱{$payment->amount} for " . $payment->period->format('F Y') . '.',
            'meta'        => ['seller_id' => $payment->seller_id, 'reference' => $payment->reference],
        ]);

        return response()->json(['data' => SellerSettlementController::commissionPayment($payment->fresh())]);
    }

    /** GET /admin/settings/payments */
    public function settings(): JsonResponse
    {
        return response()->json(['data' => [
            'platform_gcash_number' => Gcash::format(Gcash::normalize((string) PlatformSetting::get('platform_gcash_number', ''))),
            'platform_gcash_name'   => PlatformSetting::get('platform_gcash_name'),
        ]]);
    }

    /** PUT /admin/settings/payments */
    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform_gcash_number' => ['nullable', ...Gcash::RULE],
            'platform_gcash_name'   => ['nullable', 'string', 'max:120'],
        ]);
        $raw = trim((string) ($data['platform_gcash_number'] ?? ''));
        $number = $raw === '' ? null : Gcash::normalize($raw);
        if ($raw !== '' && ! $number) {
            throw \Illuminate\Validation\ValidationException::withMessages(['platform_gcash_number' => 'Enter the 11-digit mobile number of the GCash account.']);
        }
        if ($number && ! trim((string) ($data['platform_gcash_name'] ?? ''))) {
            throw \Illuminate\Validation\ValidationException::withMessages(['platform_gcash_name' => 'Enter the name on the GCash account.']);
        }

        PlatformSetting::updateOrCreate(['key' => 'platform_gcash_number'], ['value' => $number, 'description' => 'GCash shops pay commission to']);
        PlatformSetting::updateOrCreate(['key' => 'platform_gcash_name'], ['value' => $number ? trim($data['platform_gcash_name']) : null, 'description' => 'Name on the commission GCash']);

        return $this->settings();
    }
}
