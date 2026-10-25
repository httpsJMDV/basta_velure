<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\LogisticsCompany;
use App\Services\CourierChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The hub's side of the courier company chat (Amaru task 2): the hub's one thread with its own courier company.
 */
class HubCourierChatController extends Controller
{
    public function __construct(private readonly CourierChatService $chat)
    {
    }

    /** GET /hub/courier-chat: the thread with the hub's courier company, started on first use. */
    public function show(Request $request): JsonResponse
    {
        $c = $this->thread($request);
        $company = LogisticsCompany::find($c->logistics_company_id);

        return response()->json(['data' => [
            'id'      => $c->id,
            'unread'  => (int) $c->hub_unread,
            'company' => $company ? ['name' => $company->name, 'code' => $company->code, 'logo_url' => $company->logo_url] : null,
            'last_message' => $c->latestMessage ? ['body' => $c->latestMessage->body, 'created_at' => $c->latestMessage->created_at?->toIso8601String()] : null,
            'meta'    => $this->chat->meta($c),
        ]]);
    }

    public function messages(Request $request): JsonResponse
    {
        return $this->chat->messagesResponse($request, $this->thread($request), CourierChatService::ROLE_HUB);
    }

    public function send(Request $request): JsonResponse
    {
        return $this->chat->sendResponse($request, $this->thread($request), CourierChatService::ROLE_HUB);
    }

    public function read(Request $request): JsonResponse
    {
        return $this->chat->readResponse($request, $this->thread($request), CourierChatService::ROLE_HUB);
    }

    private function thread(Request $request): Conversation
    {
        return $this->chat->threadForHub($request->user()->sortingCenter)->load(['sortingCenter', 'logisticsCompany', 'latestMessage']);
    }
}
