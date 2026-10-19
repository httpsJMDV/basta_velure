<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CourierSettlement;
use App\Models\User;
use App\Services\SettlementPayments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * The GCash receipt of a weekly courier ↔ shop payment, from the private disk. Readable by the shop, the courier
 * company's members and admins; admins can also open the receipt of an earlier, voided payment (?attempt=1 is the
 * first). Everyone else gets the same 404 as a missing receipt.
 */
class SettlementReceiptController extends Controller
{
    /** GET /settlements/{settlement}/receipt?attempt= */
    public function show(Request $request, CourierSettlement $settlement): BinaryFileResponse
    {
        /** @var User $user */
        $user = $request->user();
        $admin = $user->role === 'admin';
        abort_unless($admin || $settlement->sideOf($user) !== null, 404, 'Receipt not found.');

        $attempt = $request->integer('attempt');
        $path = $attempt > 0
            ? ($admin ? ($settlement->attempts[$attempt - 1]['receipt_path'] ?? null) : null)
            : $settlement->receipt_path;

        abort_unless($path && Storage::disk(SettlementPayments::RECEIPT_DISK)->exists($path), 404, 'Receipt not found.');

        return response()->file(Storage::disk(SettlementPayments::RECEIPT_DISK)->path($path), [
            'Cache-Control'          => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
