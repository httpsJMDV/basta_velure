<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

/**
 * The signed-in person's in-app notifications (A23): list, unread count, open one (marks it read), mark all read.
 * Another person's notification is a 404.
 */
class NotificationController extends Controller
{
    /** GET /notifications?unread=1&page= */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $page = $user->notifications()
            ->when($request->boolean('unread'), fn ($q) => $q->whereNull('read_at'))
            ->latest()
            ->paginate(min(50, max(5, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $page->getCollection()->map(fn (DatabaseNotification $n) => $this->row($n))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'total'        => $page->total(),
                'unread'       => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /** GET /notifications/unread-count */
    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['data' => ['unread' => $request->user()->unreadNotifications()->count()]]);
    }

    /** POST /notifications/{id}/read */
    public function markRead(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->whereKey($id)->firstOrFail();
        if (! $notification->read_at) {
            $notification->markAsRead();
        }

        return response()->json([
            'data' => $this->row($notification->fresh()),
            'meta' => ['unread' => $request->user()->unreadNotifications()->count()],
        ]);
    }

    /** POST /notifications/read-all */
    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['message' => 'All notifications marked as read.', 'meta' => ['unread' => 0]]);
    }

    /** @return array<string, mixed> */
    private function row(DatabaseNotification $n): array
    {
        $data = $n->data;

        return [
            'id'         => $n->id,
            'kind'       => $data['kind'] ?? $n->type,
            'title'      => $data['title'] ?? '',
            'body'       => $data['body'] ?? '',
            'link'       => $data['link'] ?? null,
            'meta'       => $data['meta'] ?? [],
            'read_at'    => $n->read_at?->toIso8601String(),
            'created_at' => $n->created_at?->toIso8601String(),
        ];
    }
}
