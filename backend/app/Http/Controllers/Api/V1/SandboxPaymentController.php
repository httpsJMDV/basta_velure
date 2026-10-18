<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PaymentSession;
use App\Services\Commerce\SandboxGateway;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The sandbox e-wallet and card gateway (B9). The buyer's gateway page reads its session and reports the outcome
 * the buyer picks; a real gateway would call the signed callback instead. No real money moves.
 */
class SandboxPaymentController extends Controller
{
    public function __construct(private readonly SandboxGateway $gateway) {}

    /** GET /payments/sessions/{token} */
    public function show(Request $request, string $token): JsonResponse
    {
        $session = $this->own($request, $token);
        if ($session->status === 'pending' && $session->expires_at->lte(now())) {
            $session->update(['status' => 'expired']);
        }

        return response()->json(['data' => SandboxGateway::present($session->fresh())]);
    }

    /** POST /payments/sessions/{token}/complete {outcome: success|decline|cancel} */
    public function complete(Request $request, string $token): JsonResponse
    {
        $session = $this->own($request, $token);
        $data = $request->validate(['outcome' => ['required', 'in:success,decline,cancel']]);
        $result = $this->gateway->settle($session, $data['outcome']);
        $paid = $result['session']->status === 'paid';

        return response()->json([
            'message' => $result['message'],
            'data'    => SandboxGateway::present($result['session']),
        ], $paid || $result['session']->status !== 'expired' ? 200 : 409);
    }

    /** POST /payments/sandbox/callback {token, status: paid|failed|cancelled, reference, signature} */
    public function callback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'     => ['required', 'string', 'max:64'],
            'status'    => ['required', 'in:paid,failed,cancelled'],
            'reference' => ['nullable', 'string', 'max:40'],
            'signature' => ['required', 'string'],
        ]);
        $reference = (string) ($data['reference'] ?? '');
        if (! hash_equals(SandboxGateway::signature($data['token'], $data['status'], $reference), $data['signature'])) {
            return response()->json(['message' => 'Invalid signature.'], 403);
        }
        $session = PaymentSession::where('token', $data['token'])->firstOrFail();
        $outcome = ['paid' => 'success', 'failed' => 'decline', 'cancelled' => 'cancel'][$data['status']];
        $result = $this->gateway->settle($session, $outcome, $reference ?: null);

        return response()->json(['message' => $result['message'], 'status' => $result['session']->status]);
    }

    private function own(Request $request, string $token): PaymentSession
    {
        $session = PaymentSession::where('token', $token)->first();
        abort_if(! $session || $session->buyer_id !== $request->user()->id, 404, 'This payment was not found.');

        return $session;
    }
}
