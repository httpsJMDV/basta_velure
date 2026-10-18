<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Voucher;
use App\Models\VoucherClaim;
use App\Services\Commerce\VoucherEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Vouchers for buyers (B7): claimable vouchers on a shop, a product and the platform, claiming one into the wallet
 * (once), and My Vouchers. Code-only vouchers are never listed; typing the code at checkout applies them.
 */
class BuyerVoucherController extends Controller
{
    public function __construct(private readonly VoucherEngine $engine) {}

    /** GET /shops/{seller}/vouchers: the shop's claimable store vouchers running now. */
    public function forShop(Request $request, int $seller): JsonResponse
    {
        $rows = Voucher::with(['products:id', 'seller.sellerProfile'])->where('seller_id', $seller)->where('scope', Voucher::SCOPE_STORE)
            ->where('claimable', true)->running()->orderBy('min_spend')->get();

        return $this->listing($rows);
    }

    /** GET /products/{product}/vouchers: the shop's claimable vouchers that apply to this product. */
    public function forProduct(Request $request, Product $product): JsonResponse
    {
        $rows = Voucher::with(['products:id', 'seller.sellerProfile'])->where('seller_id', $product->seller_id)->where('scope', Voucher::SCOPE_STORE)
            ->where('claimable', true)->running()->orderBy('min_spend')->get()
            ->filter(fn (Voucher $v) => $v->applies_to === 'all' || $v->products->contains('id', $product->id))
            ->values();

        return $this->listing($rows);
    }

    /** GET /vouchers/platform: Loved-IT's claimable platform and shipping vouchers. */
    public function platform(Request $request): JsonResponse
    {
        $rows = Voucher::whereNull('seller_id')->whereIn('scope', [Voucher::SCOPE_PLATFORM, Voucher::SCOPE_SHIPPING])
            ->where('claimable', true)->running()->orderBy('scope')->orderBy('min_spend')->get();

        return $this->listing($rows);
    }

    /** GET /buyer/vouchers: My Vouchers, the wallet. */
    public function wallet(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['data' => $this->engine->wallet($user)->map(fn (Voucher $v) => $this->engine->present($v, $user))->values()]);
    }

    /** POST /buyer/vouchers/claim {voucher_id? | code?} */
    public function claim(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['voucher_id' => ['nullable', 'integer'], 'code' => ['nullable', 'string', 'max:20']]);
        $voucher = ! empty($data['voucher_id']) ? Voucher::find($data['voucher_id']) : $this->engine->find($data['code'] ?? null);
        if (! $voucher || (! $voucher->claimable && empty($data['code']))) {
            return response()->json(['message' => 'No voucher matches this code.'], 404);
        }
        if ($reason = $this->engine->unusableReason($voucher, $user)) {
            return response()->json(['message' => $reason], 422);
        }

        return DB::transaction(function () use ($voucher, $user) {
            $v = Voucher::lockForUpdate()->find($voucher->id);
            $exists = VoucherClaim::where('voucher_id', $v->id)->where('user_id', $user->id)->exists();
            if ($exists) {
                return response()->json(['message' => 'You already claimed this voucher. It is in My Vouchers.'], 409);
            }
            VoucherClaim::create(['voucher_id' => $v->id, 'user_id' => $user->id, 'claimed_at' => now()]);
            $v->increment('claimed_count');

            return response()->json(['message' => 'Voucher claimed. Use it at checkout before it ends.', 'data' => $this->engine->present($v->fresh(['products:id', 'seller.sellerProfile']), $user)], 201);
        });
    }

    private function listing($rows): JsonResponse
    {
        $viewer = auth('sanctum')->user();

        return response()->json(['data' => collect($rows)->map(fn (Voucher $v) => $this->engine->present($v, $viewer) + [
            'used_up_by_you' => $viewer ? $v->usesBy($viewer->id) >= max(1, $v->per_buyer_limit) : false,
        ])->values()]);
    }
}
