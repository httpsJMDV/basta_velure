<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\LogisticsCompany;
use App\Models\SortingCenter;
use App\Services\CourierChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The courier company's Messages (Amaru task 2): one thread with each of its hubs. The hub manager answers from
 * the hub's Messages page (HubCourierChatController).
 */
class LogisticsChatController extends Controller
{
    public function __construct(private readonly CourierChatService $chat)
    {
    }

    /** GET /logistics/chat/hubs: every hub in the network with its thread (if one was started), newest activity first. */
    public function index(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $threads = Conversation::with('latestMessage')->where('logistics_company_id', $company->id)
            ->where('type', Conversation::TYPE_COURIER_HUB)->get()->keyBy('sorting_center_id');

        $hubs = LogisticsCompany::constrain(SortingCenter::query(), $company->id)
            ->where(fn ($q) => $q->where('status', SortingCenter::STATUS_APPROVED)->orWhereIn('id', $threads->keys()))
            ->get(['id', 'hub_name', 'address_city', 'address_province', 'status', 'user_id']);

        $rows = $hubs->map(function (SortingCenter $hub) use ($threads) {
            $t = $threads->get($hub->id);

            return [
                'hub' => ['id' => $hub->id, 'name' => $hub->hub_name, 'place' => trim(implode(', ', array_filter([$hub->address_city, $hub->address_province]))), 'status' => $hub->status],
                'thread_id' => $t?->id,
                'unread' => (int) ($t?->courier_unread ?? 0),
                'last_message' => $t?->latestMessage ? ['body' => $t->latestMessage->body, 'created_at' => $t->latestMessage->created_at?->toIso8601String(), 'from_hub' => (int) $t->latestMessage->sender_id === (int) $hub->user_id] : null,
                'last_message_at' => $t?->last_message_at?->toIso8601String(),
            ];
        })->sortByDesc(fn ($r) => $r['last_message']['created_at'] ?? '')->values();

        return response()->json(['data' => $rows, 'meta' => ['unread' => (int) $threads->sum('courier_unread')]]);
    }

    /** GET /logistics/chat/unread: the badge on the Messages menu item. */
    public function unread(Request $request): JsonResponse
    {
        $count = Conversation::where('logistics_company_id', $this->company($request)->id)
            ->where('type', Conversation::TYPE_COURIER_HUB)->sum('courier_unread');

        return response()->json(['data' => ['unread' => (int) $count]]);
    }

    /** POST /logistics/chat/hubs/{hub}/thread: the thread with one hub, started on first use. */
    public function open(Request $request, SortingCenter $hub): JsonResponse
    {
        $c = $this->chat->threadWithHub($this->company($request), $hub);

        return response()->json(['data' => ['id' => $c->id, 'unread' => (int) $c->courier_unread] + ['meta' => $this->chat->meta($c->load('sortingCenter'))]], $c->wasRecentlyCreated ? 201 : 200);
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->allowed($request, $conversation);

        return $this->chat->messagesResponse($request, $conversation, CourierChatService::ROLE_COURIER);
    }

    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $this->allowed($request, $conversation);

        return $this->chat->sendResponse($request, $conversation, CourierChatService::ROLE_COURIER);
    }

    public function read(Request $request, Conversation $conversation): JsonResponse
    {
        $this->allowed($request, $conversation);

        return $this->chat->readResponse($request, $conversation, CourierChatService::ROLE_COURIER);
    }

    private function allowed(Request $request, Conversation $conversation): void
    {
        $this->chat->requireRole($conversation, $this->company($request), null, CourierChatService::ROLE_COURIER);
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }
}
