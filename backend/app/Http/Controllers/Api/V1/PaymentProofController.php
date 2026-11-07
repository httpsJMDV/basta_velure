<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A buyer's GCash receipt. It lives on the private disk and is served only through a signed link that expires
 * (Order::paymentProofUrl), which only the buyer, the shop and admins are given in their order payloads. A plain
 * <img src> works with it, and a copied link stops working within the hour. Receipts uploaded before the move to the
 * private disk are still read from the public one.
 */
class PaymentProofController extends Controller
{
    /** GET /orders/{order}/payment-proof?expires=&signature= */
    public function show(Order $order): StreamedResponse
    {
        $path = $order->payment_proof_path;
        abort_unless($path, 404, 'Receipt not found.');
        $disk = Storage::disk('ids')->exists($path) ? 'ids' : (Storage::disk('public')->exists($path) ? 'public' : null);
        abort_unless($disk, 404, 'Receipt not found.');

        return Storage::disk($disk)->response($path, null, [
            'Cache-Control'          => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
