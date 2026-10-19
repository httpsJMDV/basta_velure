<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SellerProfile;
use App\Support\Gcash;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * How each shop gets paid: the cart and checkout ask for the shops in the cart. Anyone sees whether a shop takes
 * GCash and its free delivery minimum; only a signed-in buyer sees the GCash name, number and QR to pay.
 *
 * Also the shop's own payment settings (Seller Center): the GCash it receives payments on and free delivery.
 */
class ShopPaymentController extends Controller
{
    /** GET /checkout/shops?seller_ids=1,2 */
    public function shops(Request $request): JsonResponse
    {
        $ids = collect(explode(',', (string) $request->query('seller_ids', '')))
            ->map(fn ($id) => (int) trim($id))->filter()->unique()->take(50)->values();
        $signedIn = (bool) auth('sanctum')->user();

        $profiles = SellerProfile::whereIn('user_id', $ids)->get();

        return response()->json(['data' => $profiles->map(fn (SellerProfile $p) => [
            'seller_id'         => (int) $p->user_id,
            'shop_name'         => $p->shop_name,
            'accepts_gcash'     => (bool) $p->gcash_number,
            'free_delivery_min' => $p->free_delivery_min !== null ? (float) $p->free_delivery_min : null,
            'gcash'             => $signedIn && $p->gcash_number ? [
                'name'   => $p->gcash_account_name,
                'number' => Gcash::format($p->gcash_number),
                'qr_url' => $p->gcash_qr_path ? asset('storage/' . $p->gcash_qr_path) : null,
            ] : null,
        ])->values()]);
    }

    /** GET /seller/payment-settings */
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->settings($request->user()->sellerProfile)]);
    }

    /** POST /seller/payment-settings (multipart: gcash_number, gcash_account_name, gcash_qr, remove_qr, free_delivery_min) */
    public function update(Request $request): JsonResponse
    {
        $profile = $request->user()->sellerProfile;
        abort_if(! $profile, 404);

        $data = $request->validate([
            'gcash_number'       => ['sometimes', 'nullable', ...Gcash::RULE],
            'gcash_account_name' => ['sometimes', ...\App\Support\Validation::accountName(false)],
            'gcash_qr'           => ['sometimes', 'image', 'max:4096'],
            'remove_qr'          => ['sometimes', 'boolean'],
            'free_delivery_min'  => ['sometimes', 'nullable', 'numeric', 'decimal:0,2', 'min:1', 'max:1000000'],
        ], \App\Support\Validation::accountNameMessages('gcash_account_name') + [
            'free_delivery_min.decimal' => 'Enter the amount in pesos and centavos, like 999 or 999.50.',
            'free_delivery_min.min'     => 'The free-delivery amount must be at least ₱1.00.',
        ]);

        $updates = [];
        if (array_key_exists('gcash_number', $data)) {
            $number = $data['gcash_number'] === null || trim((string) $data['gcash_number']) === '' ? null : Gcash::normalize($data['gcash_number']);
            if ($data['gcash_number'] !== null && trim((string) $data['gcash_number']) !== '' && ! $number) {
                throw \Illuminate\Validation\ValidationException::withMessages(['gcash_number' => 'Enter the 11-digit mobile number of your GCash account, like 0917 123 4567.']);
            }
            $updates['gcash_number'] = $number;
        }
        if (array_key_exists('gcash_account_name', $data)) {
            $updates['gcash_account_name'] = $data['gcash_account_name'] ? preg_replace('/\s+/u', ' ', trim($data['gcash_account_name'])) : null;
        }
        if (array_key_exists('free_delivery_min', $data)) {
            $updates['free_delivery_min'] = $data['free_delivery_min'];
        }
        if ($request->hasFile('gcash_qr')) {
            if ($profile->gcash_qr_path) Storage::disk('public')->delete($profile->gcash_qr_path);
            $updates['gcash_qr_path'] = $request->file('gcash_qr')->store('shops/gcash-qr', 'public');
        } elseif ($request->boolean('remove_qr') && $profile->gcash_qr_path) {
            Storage::disk('public')->delete($profile->gcash_qr_path);
            $updates['gcash_qr_path'] = null;
        }

        // Taking GCash needs both the number and the name on the account, so buyers can check who they pay.
        $number = array_key_exists('gcash_number', $updates) ? $updates['gcash_number'] : $profile->gcash_number;
        $name = array_key_exists('gcash_account_name', $updates) ? $updates['gcash_account_name'] : $profile->gcash_account_name;
        if ($number && ! $name) {
            throw \Illuminate\Validation\ValidationException::withMessages(['gcash_account_name' => 'Enter the name on the GCash account, as GCash shows it to people who pay you.']);
        }

        $profile->update($updates);

        return response()->json(['data' => $this->settings($profile->fresh())]);
    }

    private function settings(?SellerProfile $p): array
    {
        abort_if(! $p, 404);

        return [
            'accepts_gcash'      => (bool) $p->gcash_number,
            'gcash_number'       => Gcash::format($p->gcash_number),
            'gcash_account_name' => $p->gcash_account_name,
            'gcash_qr_url'       => $p->gcash_qr_path ? asset('storage/' . $p->gcash_qr_path) : null,
            'free_delivery_min'  => $p->free_delivery_min !== null ? (float) $p->free_delivery_min : null,
            'delivery_fee'       => (float) \App\Support\ShippingSplit::fee(),
        ];
    }
}
