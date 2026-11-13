<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\Order;
use App\Models\User;
use App\Services\Ai\AiModel;
use App\Services\BuyerRiskService;
use App\Services\Commerce\OrderCanceller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AdminBuyerRiskController extends Controller
{
    public function __construct(private readonly BuyerRiskService $risk) {}

    public function index(Request $request): JsonResponse
    {
        $input = $request->validate([
            'level' => ['sometimes', 'in:flagged,high,medium,low,all'],
            'search' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $base = $this->risk->query();
        $summary = [
            'buyers' => (clone $base)->count(),
            'flagged' => $this->risk->filterLevel(clone $base, 'flagged')->count(),
            'high' => $this->risk->filterLevel(clone $base, 'high')->count(),
        ];
        $query = $this->risk->filterLevel($base, $input['level'] ?? 'flagged');
        if ($search = trim($input['search'] ?? '')) {
            $like = '%'.addcslashes($search, '\\%_').'%';
            $query->where(fn ($q) => $q->where('buyers.first_name', 'like', $like)
                ->orWhere('buyers.last_name', 'like', $like)->orWhere('buyers.email', 'like', $like));
        }
        $rows = $query->orderByDesc('score')->orderBy('buyers.id')->paginate(12);

        return response()->json(['data' => $rows->map(fn ($row) => $this->risk->present($row)),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total(),
                'summary' => $summary, 'window_days' => 30, 'checked_at' => now()->toIso8601String()]]);
    }

    public function show(User $buyer): JsonResponse
    {
        return response()->json(['data' => $this->risk->detail($buyer)]);
    }

    public function analyze(User $buyer, AiModel $model): JsonResponse
    {
        $data = $this->risk->detail($buyer);
        // No names, messages, contact information, address, or instructions supplied by a buyer leave the app.
        $facts = array_intersect_key($data, array_flip(['score', 'level', 'order_count', 'buyer_cancellations',
            'failed_payments', 'refused_parcels', 'hourly_checkouts', 'signals']));
        $key = 'buyer-risk:'.$buyer->id.':'.hash('sha256', json_encode($facts).config('ai.provider').config('ai.groq.model'));
        if ($cached = Cache::get($key)) {
            return response()->json(['data' => $cached]);
        }
        if (! $model->available()) {
            return response()->json(['message' => 'AI review is unavailable. You can still review the recorded evidence.'], 503);
        }
        try {
            $reply = $model->message([
                'system' => 'You assist Loved-IT administrators reviewing order patterns over 30 days (checkout bursts: last hour). '
                    .'Only use the supplied aggregate facts. Signals are not proof of abuse. Payment failures may be technical. '
                    .'Never infer intent, protected traits, fraud, or app attacks. Do not recommend automatic bans or cancellations. '
                    .'Explain uncertainty and suggest checking evidence and contacting the buyer. You cannot take actions. '
                    .'Return JSON with summary (string, at most 700 characters) and checks (array of 1 to 4 short strings).',
                'messages' => [['role' => 'user', 'content' => json_encode($facts)]], 'maxTokens' => 700,
                'outputConfig' => ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => [
                    'type' => 'object', 'required' => ['summary', 'checks'], 'additionalProperties' => false,
                    'properties' => ['summary' => ['type' => 'string', 'maxLength' => 700],
                        'checks' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 4, 'items' => ['type' => 'string', 'maxLength' => 240]]],
                ]]],
            ]);
            $answer = json_decode($reply->text, true, 16, JSON_THROW_ON_ERROR);
            if ($reply->stopReason !== 'end_turn' || ! is_array($answer) || ! is_string($answer['summary'] ?? null)
                || trim($answer['summary']) === '' || ! is_array($answer['checks'] ?? null)
                || count($answer['checks']) < 1 || count($answer['checks']) > 4
                || count(array_filter($answer['checks'], fn ($v) => is_string($v) && trim($v) !== '')) !== count($answer['checks'])) {
                throw new \RuntimeException('Unusable AI review.');
            }
            $result = ['summary' => mb_substr($answer['summary'], 0, 700),
                'checks' => array_map(fn ($v) => mb_substr($v, 0, 240), array_values($answer['checks'])),
                'generated_at' => now()->toIso8601String(), 'provider' => config('ai.provider')];
            Cache::put($key, $result, now()->addMinutes(5));

            return response()->json(['data' => $result]);
        } catch (\Throwable) {
            // Provider errors can contain credentials or request contents: never return them to the browser.
            return response()->json(['message' => 'AI review could not be completed. Review the evidence or try again shortly.'], 503);
        }
    }

    public function cancel(Request $request, User $buyer, Order $order, OrderCanceller $canceller): JsonResponse
    {
        abort_unless($buyer->role === 'buyer' && $order->buyer_id === $buyer->id, 404);
        $input = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:500'], 'confirmed' => ['required', 'accepted']]);
        abort_if(mb_strlen(trim($input['reason'])) < 10, 422, 'Explain your decision in at least 10 characters.');
        DB::transaction(function () use ($request, $buyer, $order, $canceller, $input) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            abort_unless(BuyerRiskService::canCancel($locked), 409, 'This order can no longer be cancelled from buyer risk review. Refresh to see its current status.');
            $reason = trim($input['reason']);
            $canceller->cancel($locked, 'admin', $request->user()->id, $reason);
            AdminActivityLog::log($request->user()->id, 'buyer_risk.cancel_order',
                "Cancelled {$locked->order_number} after buyer risk review: {$reason}", 'order', $locked->id,
                ['buyer_id' => $buyer->id, 'reason' => $reason, 'decision_by' => 'admin']);
        });

        return response()->json(['message' => 'Order cancelled. Stock, vouchers and any refund follow the existing cancellation process.']);
    }
}
