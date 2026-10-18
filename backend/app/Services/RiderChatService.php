<?php

namespace App\Services;

use App\Events\ConversationUpdated;
use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Rider delivery chat (feature 2.10).
 *
 * A thread belongs to one parcel and has two participants: the rider and one counterpart (the seller,
 * the buyer, or the hub). It is stored as a normal Conversation of type rider_seller, rider_buyer or
 * rider_hub, so the buyer and the seller reach it through the existing /conversations endpoints.
 *
 * Openness is never stored: it is derived from the parcel on every read, so a status change on the
 * parcel closes (or reopens) the thread immediately. A closed thread stays readable but refuses sends.
 */
class RiderChatService
{
    public const PHASE_PICKUP = 'pickup';
    public const PHASE_DELIVERY = 'delivery';

    public const ROLE_RIDER = 'rider';
    public const ROLE_SELLER = 'seller';
    public const ROLE_BUYER = 'buyer';
    public const ROLE_HUB = 'hub';

    /** Parcel statuses in which the pickup rider (pickup_rider_id) may chat. */
    public const PICKUP_STATUSES = [Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP];

    /** Parcel statuses in which the delivery rider (assigned_rider_id) may chat. */
    public const DELIVERY_STATUSES = [Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY];

    /** Who the rider may talk to in each phase. */
    public const PHASE_COUNTERPARTS = [
        self::PHASE_PICKUP   => [self::ROLE_SELLER, self::ROLE_HUB],
        self::PHASE_DELIVERY => [self::ROLE_BUYER, self::ROLE_HUB],
    ];

    /** Counterpart kind to conversation type. */
    public const TYPE_BY_COUNTERPART = [
        self::ROLE_SELLER => Conversation::TYPE_RIDER_SELLER,
        self::ROLE_BUYER  => Conversation::TYPE_RIDER_BUYER,
        self::ROLE_HUB    => Conversation::TYPE_RIDER_HUB,
    ];

    /** The unread column that belongs to each participant. */
    private const UNREAD_COLUMN = [
        self::ROLE_RIDER  => 'rider_unread',
        self::ROLE_SELLER => 'seller_unread',
        self::ROLE_BUYER  => 'buyer_unread',
        self::ROLE_HUB    => 'hub_unread',
    ];

    private const DEFAULT_MESSAGE_LIMIT = 100;
    private const MAX_MESSAGE_LIMIT = 200;

    // ── Opening a thread ─────────────────────────────────────────────────────

    /**
     * Find or create the rider's thread with one counterpart for a parcel.
     *
     * @return array{0: Conversation, 1: bool} the thread and whether it was just created
     */
    public function openThread(Rider $rider, string $trackingNumber, string $counterpart): array
    {
        return DB::transaction(function () use ($rider, $trackingNumber, $counterpart) {
            // Another rider's parcel and an unknown one are indistinguishable on purpose.
            $parcel = Parcel::with('order')
                ->where('tracking_number', Str::upper(trim($trackingNumber)))
                ->where(function ($q) use ($rider) {
                    $q->where('pickup_rider_id', $rider->id)->orWhere('assigned_rider_id', $rider->id);
                })
                ->lockForUpdate()
                ->first();

            if (! $parcel) {
                abort(404, 'Parcel not found among your pickups or deliveries.');
            }

            $phase = $this->phaseOf($parcel, $rider->id);
            if ($phase === null) {
                $this->fail409('This parcel is no longer active for you, so a new conversation cannot be started.');
            }

            if (! in_array($counterpart, self::PHASE_COUNTERPARTS[$phase], true)) {
                throw ValidationException::withMessages([
                    'counterpart' => [$phase === self::PHASE_PICKUP
                        ? 'During pickup you can message the seller or the hub.'
                        : 'During delivery you can message the buyer or the hub.'],
                ]);
            }

            $attributes = ['status' => 'open'];
            if ($counterpart === self::ROLE_SELLER) {
                $attributes['seller_id'] = $parcel->seller_id;
            } elseif ($counterpart === self::ROLE_BUYER) {
                $attributes['buyer_id'] = $parcel->order?->buyer_id;
            } else {
                $hub = $parcel->sorting_center_id ? SortingCenter::find($parcel->sorting_center_id) : null;
                if (! $hub || (int) $hub->id !== (int) $rider->sorting_center_id || $hub->status !== SortingCenter::STATUS_APPROVED) {
                    throw ValidationException::withMessages(['counterpart' => ['The hub for this parcel is not available for chat.']]);
                }
                $attributes['sorting_center_id'] = $hub->id;
            }

            $counterpartUserKey = ['seller' => 'seller_id', 'buyer' => 'buyer_id'][$counterpart] ?? null;
            if ($counterpartUserKey && empty($attributes[$counterpartUserKey])) {
                throw ValidationException::withMessages(['counterpart' => ["This parcel has no {$counterpart} to message."]]);
            }

            $attributes += [
                'order_id'        => $parcel->order_id,
                'subject'         => 'Delivery ' . $parcel->tracking_number,
                'last_message_at' => now(),
            ];

            $conversation = Conversation::firstOrCreate(
                ['parcel_id' => $parcel->id, 'rider_id' => $rider->user_id, 'type' => self::TYPE_BY_COUNTERPART[$counterpart]],
                $attributes,
            );

            return [$conversation, $conversation->wasRecentlyCreated];
        });
    }

    // ── Who is in a thread ───────────────────────────────────────────────────

    /** The role this user plays in the thread, or null when they are not a participant. */
    public function roleOf(User $user, Conversation $conversation): ?string
    {
        if (! $conversation->isRiderThread()) {
            return null;
        }

        if ((int) $conversation->rider_id === (int) $user->id) {
            return self::ROLE_RIDER;
        }

        return match ($conversation->type) {
            Conversation::TYPE_RIDER_SELLER => $conversation->seller_id && (int) $conversation->seller_id === (int) $user->id
                ? self::ROLE_SELLER : null,
            Conversation::TYPE_RIDER_BUYER => $conversation->buyer_id && (int) $conversation->buyer_id === (int) $user->id
                ? self::ROLE_BUYER : null,
            Conversation::TYPE_RIDER_HUB => $conversation->sorting_center_id
                && $user->sortingCenter
                && $user->sortingCenter->status === SortingCenter::STATUS_APPROVED
                && (int) $user->sortingCenter->id === (int) $conversation->sorting_center_id
                ? self::ROLE_HUB : null,
            default => null,
        };
    }

    /**
     * The viewer's role in the thread. Anyone else, or a participant using the wrong endpoint family,
     * gets a 404 so the thread's existence is not revealed.
     *
     * @param array<int, string> $allowedRoles
     */
    public function requireRole(User $user, Conversation $conversation, array $allowedRoles): string
    {
        $role = $this->roleOf($user, $conversation);
        if ($role === null || ! in_array($role, $allowedRoles, true)) {
            abort(404, 'Conversation not found.');
        }

        return $role;
    }

    public function counterpartOf(Conversation $conversation): string
    {
        return array_search($conversation->type, self::TYPE_BY_COUNTERPART, true) ?: self::ROLE_HUB;
    }

    // ── Open / closed ────────────────────────────────────────────────────────

    /** The phase in which this rider currently works the parcel, or null when the parcel is not active for them. */
    public function phaseOf(Parcel $parcel, int $riderId): ?string
    {
        if (in_array($parcel->status, self::PICKUP_STATUSES, true) && (int) $parcel->pickup_rider_id === $riderId) {
            return self::PHASE_PICKUP;
        }
        if (in_array($parcel->status, self::DELIVERY_STATUSES, true) && (int) $parcel->assigned_rider_id === $riderId) {
            return self::PHASE_DELIVERY;
        }

        return null;
    }

    /**
     * Whether new messages are allowed, for many threads at once (one query for the riders).
     *
     * @param Collection<int, Conversation> $conversations with the parcel relation loaded
     * @return array<int, bool> keyed by conversation id
     */
    public function openStates(Collection $conversations): array
    {
        $riderIds = Rider::whereIn('user_id', $conversations->pluck('rider_id')->unique())
            ->where('status', Rider::STATUS_ACTIVE)
            ->pluck('id', 'user_id');

        $states = [];
        foreach ($conversations as $conversation) {
            $parcel = $conversation->parcel;
            $riderId = $riderIds[$conversation->rider_id] ?? null;
            $phase = ($parcel && $riderId) ? $this->phaseOf($parcel, (int) $riderId) : null;
            $states[$conversation->id] = $phase !== null
                && in_array($this->counterpartOf($conversation), self::PHASE_COUNTERPARTS[$phase], true);
        }

        return $states;
    }

    public function isOpen(Conversation $conversation): bool
    {
        $conversation->loadMissing('parcel');

        return $this->openStates(collect([$conversation]))[$conversation->id];
    }

    private function closedMessage(Conversation $conversation): string
    {
        return match ($conversation->parcel?->status) {
            Parcel::STATUS_DELIVERED       => 'This conversation is closed because the parcel was delivered.',
            Parcel::STATUS_DELIVERY_FAILED => 'This conversation is closed because the delivery attempt failed.',
            Parcel::STATUS_RETURN_TO_SENDER => 'This conversation is closed because the parcel is going back to the seller.',
            Parcel::STATUS_RETURNED        => 'This conversation is closed because the parcel was returned.',
            default                        => 'This conversation is closed because the parcel is no longer in an active stage for this rider.',
        };
    }

    // ── HTTP behaviour shared by the rider, hub and /conversations endpoints ─

    /**
     * @param array<int, string> $roles roles allowed through this endpoint family
     */
    public function showResponse(Request $request, Conversation $conversation, array $roles): JsonResponse
    {
        $role = $this->requireRole($request->user(), $conversation, $roles);
        $this->loadForFormatting(collect([$conversation]));

        return response()->json(['data' => $this->formatConversation($conversation, $role, $this->isOpen($conversation))]);
    }

    /**
     * Messages oldest first. Incremental polling: pass after_id (preferred, exact) or since (created_at, as in
     * the existing chat). Without either, the latest `limit` messages are returned.
     *
     * @param array<int, string> $roles
     */
    public function messagesResponse(Request $request, Conversation $conversation, array $roles, bool $markRead): JsonResponse
    {
        $user = $request->user();
        $role = $this->requireRole($user, $conversation, $roles);

        $validated = $request->validate([
            'after_id' => ['nullable', 'integer', 'min:0'],
            'since'    => ['nullable', 'date'],
            'limit'    => ['nullable', 'integer', 'min:1', 'max:' . self::MAX_MESSAGE_LIMIT],
        ]);
        $limit = (int) ($validated['limit'] ?? self::DEFAULT_MESSAGE_LIMIT);

        $query = $conversation->messages();
        if (isset($validated['after_id'])) {
            $messages = $query->where('id', '>', $validated['after_id'])->orderBy('id')->limit($limit)->get();
        } elseif (! empty($validated['since'])) {
            $messages = $query->where('created_at', '>', $validated['since'])->orderBy('id')->limit($limit)->get();
        } else {
            $messages = $query->orderByDesc('id')->limit($limit)->get()->reverse()->values();
        }

        // Existing chat behaviour: fetching marks the other side's messages read. The rider and hub
        // endpoints mark read explicitly instead (POST .../read) so a background poll never does.
        if ($markRead) {
            $this->markRead($conversation, $user, $role);
        }

        // Names are only needed to label messages, so an empty poll skips these queries.
        if ($messages->isNotEmpty()) {
            $this->loadForFormatting(collect([$conversation]));
        }

        $open = $this->isOpen($conversation);

        return response()->json([
            'data' => $messages->map(fn (Message $m) => $this->formatMessage($m, $conversation, $role))->values(),
            'meta' => [
                'is_closed'      => ! $open,
                'can_send'       => $open,
                'closed_message' => $open ? null : $this->closedMessage($conversation),
            ],
        ]);
    }

    /**
     * @param array<int, string> $roles
     */
    public function sendResponse(Request $request, Conversation $conversation, array $roles): JsonResponse
    {
        $user = $request->user();
        $role = $this->requireRole($user, $conversation, $roles);

        $this->enforceSendLimit($user);

        $max = (int) config('logistics.chat.max_body_length');
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:' . $max],
        ], [
            'body.required' => 'Type a message first.',
            'body.max'      => "Messages can be at most {$max} characters.",
        ]);

        // Stored exactly as typed (trimmed). Nothing here or in any client may interpret it as HTML.
        $body = trim($validated['body']);
        if ($body === '') {
            throw ValidationException::withMessages(['body' => ['Type a message first.']]);
        }

        $conversation->loadMissing('parcel');
        if (! $this->isOpen($conversation)) {
            $this->fail409($this->closedMessage($conversation) . ' You can still read it, but new messages cannot be sent.');
        }

        $message = DB::transaction(function () use ($conversation, $user, $role, $body) {
            $message = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id'       => $user->id,
                'body'            => $body,
            ]);

            $unreadColumn = $role === self::ROLE_RIDER
                ? self::UNREAD_COLUMN[$this->counterpartOf($conversation)]
                : self::UNREAD_COLUMN[self::ROLE_RIDER];

            $conversation->update([
                'last_message_at' => now(),
                $unreadColumn     => DB::raw("{$unreadColumn} + 1"),
            ]);

            return $message;
        });

        $this->loadForFormatting(collect([$conversation]));
        $this->broadcast($conversation->fresh(), $message->load('sender'));

        return response()->json(['data' => $this->formatMessage($message, $conversation, $role)], 201);
    }

    /**
     * @param array<int, string> $roles
     */
    public function readResponse(Request $request, Conversation $conversation, array $roles): JsonResponse
    {
        $user = $request->user();
        $role = $this->requireRole($user, $conversation, $roles);

        return response()->json(['data' => ['marked' => $this->markRead($conversation, $user, $role)]]);
    }

    /** Mark the other side's messages read and clear this participant's unread counter. */
    public function markRead(Conversation $conversation, User $user, string $role): int
    {
        $marked = Message::where('conversation_id', $conversation->id)
            ->whereNull('read_at')
            ->where('sender_id', '!=', $user->id)
            ->update(['read_at' => now()]);

        $column = self::UNREAD_COLUMN[$role];
        if ($conversation->{$column} > 0 || $marked > 0) {
            $conversation->update([$column => 0]);
        }

        return $marked;
    }

    private function enforceSendLimit(User $user): void
    {
        $key = 'rider-chat-send:' . $user->id;
        $max = (int) config('logistics.chat.sends_per_minute');

        if (RateLimiter::tooManyAttempts($key, $max)) {
            $wait = RateLimiter::availableIn($key);
            throw new HttpResponseException(
                response()->json(['message' => "You are sending messages too quickly. Try again in {$wait} seconds."], 429)
                    ->header('Retry-After', (string) $wait)
            );
        }

        RateLimiter::hit($key, 60);
    }

    // ── Lists ────────────────────────────────────────────────────────────────

    /**
     * Threads for a rider or a hub, newest activity first.
     *
     * @return array{0: LengthAwarePaginator, 1: int} the page and the viewer's total unread across all threads
     */
    public function paginateFor(string $role, Request $request, Builder $query): array
    {
        $request->validate([
            'per_page'    => ['nullable', 'integer', 'min:1', 'max:100'],
            'unread_only' => ['nullable', 'boolean'],
        ]);

        $column = self::UNREAD_COLUMN[$role];
        $totalUnread = (int) (clone $query)->sum($column);

        if ($request->boolean('unread_only')) {
            $query->where($column, '>', 0);
        }

        $page = $query->orderByDesc('last_message_at')->orderByDesc('id')
            ->paginate((int) $request->query('per_page', 30));

        return [$page, $totalUnread];
    }

    public function listResponse(string $role, LengthAwarePaginator $page, int $totalUnread): JsonResponse
    {
        $conversations = collect($page->items());
        $this->loadForFormatting($conversations);
        $open = $this->openStates($conversations);

        return response()->json([
            'data' => $conversations->map(fn (Conversation $c) => $this->formatConversation($c, $role, $open[$c->id]))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'per_page'     => $page->perPage(),
                'total'        => $page->total(),
                'unread_total' => $totalUnread,
            ],
        ]);
    }

    /** Eager-load what formatConversation needs, once for a whole page. */
    public function loadForFormatting(Collection $conversations): void
    {
        // Eloquent's collection eager-loads in one query per relation; the models themselves are shared.
        (new EloquentCollection($conversations->all()))->load([
            'parcel.order:id,order_number,buyer_id',
            'rider:id,first_name,last_name',
            'seller.sellerProfile',
            'buyer:id,first_name,last_name',
            'sortingCenter:id,hub_name',
            'latestMessage',
        ]);
    }

    // ── Formatting (names only: never phone, email or address) ──────────────

    /**
     * @return array<string, mixed>
     */
    public function formatConversation(Conversation $c, string $viewerRole, bool $open): array
    {
        $latest = $c->latestMessage;
        $parcel = $c->parcel;
        $other = $this->otherParticipant($c, $viewerRole);
        $tracking = $parcel?->tracking_number ?? '';

        return [
            'id'              => $c->id,
            'type'            => $c->type,
            'status'          => $c->status,
            'counterpart'     => $this->counterpartOf($c),
            'subject'         => ($viewerRole === self::ROLE_RIDER ? $other['subtext'] : 'Delivery rider') . ' · ' . $tracking,
            'parcel'          => $parcel ? [
                'tracking_number' => $parcel->tracking_number,
                'order_number'    => $parcel->order?->order_number,
                'status'          => $parcel->status,
            ] : null,
            'recipient'       => $other,
            'buyer_id'        => $c->buyer_id,
            'seller_id'       => $c->seller_id,
            'is_closed'       => ! $open,
            'can_send'        => $open,
            'closed_message'  => $open ? null : $this->closedMessage($c),
            'last_message'    => $latest ? [
                'id'         => $latest->id,
                'body'       => $latest->body,
                'sender_id'  => $latest->sender_id,
                'created_at' => $latest->created_at,
            ] : null,
            'last_message_at' => $c->last_message_at,
            'unread'          => (int) $c->{self::UNREAD_COLUMN[$viewerRole]},
            'created_at'      => $c->created_at,
        ];
    }

    /**
     * Who the viewer is talking to. The rider sees the same names the delivery console already shows them;
     * buyers and sellers see the rider's first name only; the hub already sees riders' full names.
     *
     * @return array{id: null, name: string, role: string, avatar: null, subtext: string}
     */
    private function otherParticipant(Conversation $c, string $viewerRole): array
    {
        if ($viewerRole === self::ROLE_RIDER) {
            return match ($this->counterpartOf($c)) {
                self::ROLE_SELLER => [
                    'id' => null, 'avatar' => null, 'role' => self::ROLE_SELLER, 'subtext' => 'Seller',
                    'name' => $c->seller?->sellerProfile?->shop_name ?: ($c->parcel?->pickup_address_snapshot['shop_name'] ?? 'Seller'),
                ],
                self::ROLE_BUYER => [
                    'id' => null, 'avatar' => null, 'role' => self::ROLE_BUYER, 'subtext' => 'Buyer',
                    'name' => ($c->parcel?->recipient_snapshot['name'] ?? '') ?: ($c->buyer?->first_name ?? 'Buyer'),
                ],
                default => [
                    'id' => null, 'avatar' => null, 'role' => self::ROLE_HUB, 'subtext' => 'Hub',
                    'name' => $c->sortingCenter?->hub_name ?: 'Hub dispatcher',
                ],
            };
        }

        $riderName = $viewerRole === self::ROLE_HUB
            ? trim(($c->rider?->first_name ?? '') . ' ' . ($c->rider?->last_name ?? ''))
            : ($c->rider?->first_name ?? '');

        return [
            'id'      => null,
            'name'    => $riderName !== '' ? $riderName : 'Delivery rider',
            'role'    => self::ROLE_RIDER,
            'avatar'  => null,
            'subtext' => 'Delivery rider',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function formatMessage(Message $m, Conversation $c, string $viewerRole): array
    {
        $senderRole = (int) $m->sender_id === (int) $c->rider_id ? self::ROLE_RIDER : $this->counterpartOf($c);

        return [
            'id'              => $m->id,
            'conversation_id' => $m->conversation_id,
            'body'            => $m->body,
            'sender_id'       => $m->sender_id,
            'sender_role'     => $senderRole,
            'sender_name'     => $senderRole === $viewerRole ? 'You' : $this->otherParticipant($c, $viewerRole)['name'],
            'attachment_type' => null,
            'attachment_data' => null,
            'read_at'         => $m->read_at,
            'created_at'      => $m->created_at,
        ];
    }

    // ── Live updates for the buyer and seller pages ─────────────────────────

    /**
     * Payload for the ConversationUpdated websocket event, so the buyer's and seller's inbox lists gain the
     * thread and its unread badge live. Same shape as the REST list, and still names only.
     *
     * @return array<string, mixed>
     */
    public function broadcastPayload(Conversation $c, int $userId, int $unreadTotal): array
    {
        $role = (int) $c->buyer_id === $userId ? self::ROLE_BUYER : self::ROLE_SELLER;
        $this->loadForFormatting(collect([$c]));

        return [
            'conversation' => array_merge(
                $this->formatConversation($c, $role, $this->isOpen($c)),
                ['last_message_at' => $c->last_message_at?->toISOString(), 'created_at' => $c->created_at?->toISOString()],
            ),
            'unread_total' => $unreadTotal,
        ];
    }

    private function broadcast(Conversation $c, Message $message): void
    {
        try {
            MessageSent::dispatch($message);

            // The rider and the hub poll; only the buyer and seller pages listen on websockets.
            $counterpartUserId = match ($c->type) {
                Conversation::TYPE_RIDER_BUYER  => [$c->buyer_id, self::ROLE_BUYER],
                Conversation::TYPE_RIDER_SELLER => [$c->seller_id, self::ROLE_SELLER],
                default                         => null,
            };

            if ($counterpartUserId && $counterpartUserId[0] && (int) $counterpartUserId[0] !== (int) $message->sender_id) {
                [$userId, $role] = $counterpartUserId;
                ConversationUpdated::dispatch((int) $userId, $c, $this->unreadTotalFor((int) $userId, $role));
            }
        } catch (\Throwable $e) {
            Log::warning('Rider chat broadcast skipped: ' . $e->getMessage());
        }
    }

    /** The buyer's or seller's unread badge: every conversation they take part in, rider threads included. */
    private function unreadTotalFor(int $userId, string $role): int
    {
        $column = self::UNREAD_COLUMN[$role];
        $idColumn = $role === self::ROLE_SELLER ? 'seller_id' : 'buyer_id';

        return (int) Conversation::where($idColumn, $userId)->sum($column);
    }

    private function fail409(string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message], 409));
    }
}
