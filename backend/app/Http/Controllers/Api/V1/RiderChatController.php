<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Rider;
use App\Services\RiderChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Feature 2.10: the rider's side of delivery chat. The seller and the buyer use the existing
 * /conversations endpoints, and the hub uses /hub/chat (see HubChatController).
 */
class RiderChatController extends Controller
{
    private const ROLES = [RiderChatService::ROLE_RIDER];

    public function __construct(private readonly RiderChatService $chat)
    {
    }

    /**
     * GET /api/v1/rider/chat/threads: this rider's threads (open and closed), newest activity first.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Conversation::query()
            ->where('rider_id', $request->user()->id)
            ->whereIn('type', Conversation::RIDER_TYPES);

        [$page, $totalUnread] = $this->chat->paginateFor(RiderChatService::ROLE_RIDER, $request, $query);

        return $this->chat->listResponse(RiderChatService::ROLE_RIDER, $page, $totalUnread);
    }

    /**
     * GET /api/v1/rider/chat/unread: only the threads with unread messages, for the badges on stop cards.
     */
    public function unread(Request $request): JsonResponse
    {
        $threads = Conversation::query()
            ->with('parcel:id,tracking_number')
            ->where('rider_id', $request->user()->id)
            ->whereIn('type', Conversation::RIDER_TYPES)
            ->where('rider_unread', '>', 0)
            ->get();

        return response()->json([
            'data' => $threads->map(fn (Conversation $c) => [
                'thread_id'       => $c->id,
                'tracking_number' => $c->parcel?->tracking_number,
                'counterpart'     => $this->chat->counterpartOf($c),
                'unread'          => (int) $c->rider_unread,
            ])->values(),
            'meta' => ['unread_total' => (int) $threads->sum('rider_unread')],
        ]);
    }

    /**
     * POST /api/v1/rider/chat/parcels/{tracking}/threads { counterpart: seller|buyer|hub }
     *
     * Opens (or returns) the rider's one thread with that counterpart for the parcel. 201 when created, 200 when it
     * already existed.
     */
    public function open(Request $request, string $tracking): JsonResponse
    {
        $validated = $request->validate([
            'counterpart' => ['required', 'string', Rule::in(array_keys(RiderChatService::TYPE_BY_COUNTERPART))],
        ]);

        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();
        [$conversation, $created] = $this->chat->openThread($rider, $tracking, $validated['counterpart']);

        return $this->chat->showResponse($request, $conversation, self::ROLES)->setStatusCode($created ? 201 : 200);
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
