<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Services\RiderChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Feature 2.10: the hub's side of rider delivery chat (approved hubs only, enforced by the route group).
 * Riders start the threads; the hub lists, reads and replies. Another hub's thread is a 404.
 */
class HubChatController extends Controller
{
    private const ROLES = [RiderChatService::ROLE_HUB];

    public function __construct(private readonly RiderChatService $chat)
    {
    }

    /**
     * GET /api/v1/hub/chat/threads: this hub's rider threads, newest activity first.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Conversation::query()
            ->where('sorting_center_id', $request->user()->sortingCenter->id)
            ->where('type', Conversation::TYPE_RIDER_HUB);

        [$page, $totalUnread] = $this->chat->paginateFor(RiderChatService::ROLE_HUB, $request, $query);

        return $this->chat->listResponse(RiderChatService::ROLE_HUB, $page, $totalUnread);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        return $this->chat->showResponse($request, $conversation, self::ROLES);
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        return $this->chat->messagesResponse($request, $conversation, self::ROLES, markRead: false);
    }

    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        return $this->chat->sendResponse($request, $conversation, self::ROLES);
    }

    public function markRead(Request $request, Conversation $conversation): JsonResponse
    {
        return $this->chat->readResponse($request, $conversation, self::ROLES);
    }
}
