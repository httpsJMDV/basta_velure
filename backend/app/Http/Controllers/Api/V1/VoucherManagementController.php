<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Voucher;
use App\Services\Commerce\VoucherForm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Vouchers for their owners: a shop's store vouchers (/seller/vouchers) and Loved-IT's platform and shipping
 * vouchers (/admin/vouchers). Ending a voucher takes it out of every wallet; orders already placed keep their
 * discount (A27).
 */
class VoucherManagementController extends Controller
{
    public function __construct(private readonly VoucherForm $form) {}

    /** GET /seller/vouchers or /admin/vouchers */
    public function index(Request $request): JsonResponse
    {
        $rows = $this->scoped($request)->with('products:id')->latest('id')->limit(300)->get();

        return response()->json(['data' => $rows->map(fn (Voucher $v) => VoucherForm::present($v))->values()]);
    }

    /** POST /seller/vouchers or /admin/vouchers */
    public function store(Request $request): JsonResponse
    {
        [$scope, $sellerId] = $this->owner($request);
        $attrs = $this->form->validated($request, $scope, $sellerId);
        $voucher = $this->form->save($attrs, null, $request->user()->id);

        return response()->json(['message' => "Voucher {$voucher->code} saved.", 'data' => VoucherForm::present($voucher)], 201);
    }

    /** PATCH /seller/vouchers/{voucher} or /admin/vouchers/{voucher} */
    public function update(Request $request, int $voucher): JsonResponse
    {
        $v = $this->scoped($request)->findOrFail($voucher);
        abort_if($v->statusAt() === 'ended', 409, 'This voucher has ended and cannot be changed.');
        [$scope, $sellerId] = $this->owner($request, $v);
        $attrs = $this->form->validated($request, $scope, $sellerId, $v);
        $saved = $this->form->save($attrs, $v, $request->user()->id);

        return response()->json(['message' => 'Voucher updated.', 'data' => VoucherForm::present($saved)]);
    }

    /** POST /seller/vouchers/{voucher}/end */
    public function end(Request $request, int $voucher): JsonResponse
    {
        $v = $this->scoped($request)->findOrFail($voucher);
        abort_if($v->statusAt() === 'ended', 409, 'This voucher has already ended.');
        $v->update(['ended_at' => now()]);

        return response()->json(['message' => 'Voucher ended. Buyers can no longer use it; orders already placed keep their discount.', 'data' => VoucherForm::present($v->fresh('products'))]);
    }

    private function isAdmin(Request $request): bool
    {
        return $request->is('api/v1/admin/*');
    }

    private function scoped(Request $request)
    {
        return $this->isAdmin($request)
            ? Voucher::whereNull('seller_id')->whereIn('scope', [Voucher::SCOPE_PLATFORM, Voucher::SCOPE_SHIPPING])
            : Voucher::where('seller_id', $request->user()->id)->where('scope', Voucher::SCOPE_STORE);
    }

    /** @return array{0: string, 1: ?int} */
    private function owner(Request $request, ?Voucher $v = null): array
    {
        if (! $this->isAdmin($request)) {
            return [Voucher::SCOPE_STORE, $request->user()->id];
        }
        $scope = $v?->scope ?? $request->input('scope', Voucher::SCOPE_PLATFORM);
        abort_unless(in_array($scope, [Voucher::SCOPE_PLATFORM, Voucher::SCOPE_SHIPPING], true), 422, 'Choose a platform or a shipping voucher.');

        return [$scope, null];
    }
}
