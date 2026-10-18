<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FlashSale;
use App\Models\FlashSaleReminder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A buyer's reminder for an upcoming flash sale (BUY-CHAT-004): one notification just before the slot starts. */
class FlashSaleReminderController extends Controller
{
    /** POST /flash-sales/{flash}/reminder */
    public function store(Request $request, int $flash): JsonResponse
    {
        $sale = FlashSale::with('product:id,name,status')->findOrFail($flash);
        abort_unless($sale->product && $sale->product->status === 'active', 404, 'This flash sale is not available.');
        abort_unless($sale->statusAt() === 'upcoming', 409, 'This flash sale has already started.');

        FlashSaleReminder::firstOrCreate(['flash_sale_id' => $sale->id, 'user_id' => $request->user()->id]);

        return response()->json([
            'message' => 'Reminder set. We will notify you just before the flash sale starts.',
            'data'    => ['reminder_set' => true, 'starts_at' => $sale->slot_start->toIso8601String()],
        ]);
    }

    /** DELETE /flash-sales/{flash}/reminder */
    public function destroy(Request $request, int $flash): JsonResponse
    {
        FlashSaleReminder::where('flash_sale_id', $flash)->where('user_id', $request->user()->id)->whereNull('notified_at')->delete();

        return response()->json(['message' => 'Reminder removed.', 'data' => ['reminder_set' => false]]);
    }
}
