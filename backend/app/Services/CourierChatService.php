<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\LogisticsCompany;
use App\Models\Message;
use App\Models\SortingCenter;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Courier company chat (Amaru task 2). A courier company talks with each of its hubs in one `courier_hub` thread per
 * company and hub: who is short of riders, a parcel stuck at intake, a settlement question. Only the company's team
 * and the hub's manager are in it; the admin does not read it. Plain text, polled like the rider threads (no sockets).
 *
 * A thread with a hub that is no longer approved (suspended, or moved to another courier) stays readable but refuses
 * new messages.
 */
class CourierChatService
{
    public const ROLE_COURIER = 'courier';
    public const ROLE_HUB = 'hub';

    public const MAX_MESSAGE = 1000;
    private const SENDS_PER_MINUTE = 20;

    // ── Opening a thread ─────────────────────────────────────────────────────

    /** The company's thread with one of its approved hubs, created on first use. */
    public function threadWithHub(LogisticsCompany $company, SortingCenter $hub): Conversation
    {
        $keys = ['logistics_company_id' => $company->id, 'sorting_center_id' => $hub->id, 'type' => Conversation::TYPE_COURIER_HUB];
        // An earlier thread always opens (read-only if the hub left); a new one needs a hub that is in the network now.
        if ($existing = Conversation::where($keys)->first()) {
            return $existing;
        }
        if (! $this->hubBelongs($company, $hub)) {
            abort(404, 'Hub not found in your network.');
        }
        if ($hub->status !== SortingCenter::STATUS_APPROVED) {
            $this->fail409('This hub is not approved, so a new conversation cannot be started.');
        }

        return Conversation::firstOrCreate($keys, ['status' => 'open', 'subject' => 'Courier and hub', 'last_message_at' => now()]);
    }

    /** The hub's thread with its own courier company, created on first use. */
    public function threadForHub(SortingCenter $hub): Conversation
    {
        $companyId = LogisticsCompany::effectiveId($hub->logistics_company_id);
        abort_unless($companyId, 404, 'Your hub has no courier company yet.');

        return Conversation::firstOrCreate(
            ['logistics_company_id' => $companyId, 'sorting_center_id' => $hub->id, 'type' => Conversation::TYPE_COURIER_HUB],
            ['status' => 'open', 'subject' => 'Courier and hub', 'last_message_at' => now()],
        );
    }

    // ── Who is in a thread ───────────────────────────────────────────────────

    /** The viewer's side of the thread, or a 404 so a thread's existence is never revealed to anyone else. */
    public function requireRole(Conversation $c, ?LogisticsCompany $company, ?SortingCenter $hub, string $role): void
    {
        $ok = $c->isCourierThread() && match ($role) {
            self::ROLE_COURIER => $company && (int) $c->logistics_company_id === (int) $company->id,
            self::ROLE_HUB     => $hub && (int) $c->sorting_center_id === (int) $hub->id,
            default            => false,
        };
        abort_unless($ok, 404, 'Conversation not found.');
    }

    /** Open while the hub is approved and still belongs to the thread's courier. */
    public function isOpen(Conversation $c): bool
    {
        $hub = $c->sortingCenter;

        return $hub !== null
            && $hub->status === SortingCenter::STATUS_APPROVED
            && LogisticsCompany::effectiveId($hub->logistics_company_id) === (int) $c->logistics_company_id;
    }

    private function hubBelongs(LogisticsCompany $company, SortingCenter $hub): bool
    {
        return LogisticsCompany::effectiveId($hub->logistics_company_id) === (int) $company->id;
    }

    // ── HTTP behaviour shared by both sides ──────────────────────────────────

    /** GET …/messages?after_id=: the messages (oldest first) and whether the thread takes new ones. */
    public function messagesResponse(Request $request, Conversation $c, string $role): JsonResponse
    {
        $c->loadMissing(['sortingCenter', 'logisticsCompany']);
        $afterId = (int) $request->query('after_id', 0);
        $messages = Message::where('conversation_id', $c->id)
            ->when($afterId > 0, fn ($q) => $q->where('id', '>', $afterId))
            ->orderBy('id')
            ->limit(200)
            ->get();

        return response()->json([
            'data' => $messages->map(fn (Message $m) => $this->formatMessage($m, $c))->values(),
            'meta' => $this->meta($c),
        ]);
    }

    /** POST …/messages {body}: 1 to 1,000 characters of plain text, 20 a minute. */
    public function sendResponse(Request $request, Conversation $c, string $role): JsonResponse
    {
        $c->loadMissing(['sortingCenter', 'logisticsCompany']);
        if (! $this->isOpen($c)) {
            $this->fail409($this->closedMessage($c));
        }

        $request->merge(['body' => is_string($request->input('body')) ? trim(strip_tags($request->input('body'))) : $request->input('body')]);
        $body = $request->validate(['body' => ['required', 'string', 'max:' . self::MAX_MESSAGE]], [
            'body.required' => 'Write a message first.',
            'body.max'      => 'A message can be at most ' . self::MAX_MESSAGE . ' characters.',
        ])['body'];

        $key = 'courier-chat-send:' . $request->user()->id;
        if (RateLimiter::tooManyAttempts($key, self::SENDS_PER_MINUTE)) {
            throw new HttpResponseException(response()->json(['message' => 'You are sending messages too fast. Wait a moment and try again.'], 429));
        }
        RateLimiter::hit($key, 60);

        $message = DB::transaction(function () use ($c, $request, $body, $role) {
            $message = Message::create(['conversation_id' => $c->id, 'sender_id' => $request->user()->id, 'body' => $body]);
            // The other side's count goes up.
            $c->increment($role === self::ROLE_COURIER ? 'hub_unread' : 'courier_unread', 1, ['last_message_at' => now()]);

            return $message;
        });

        return response()->json(['data' => $this->formatMessage($message, $c)], 201);
    }

    /** POST …/read: the viewer has read everything the other side sent. */
    public function readResponse(Request $request, Conversation $c, string $role): JsonResponse
    {
        Message::where('conversation_id', $c->id)->whereNull('read_at')->where('sender_id', '!=', $request->user()->id)->update(['read_at' => now()]);
        $c->update([$role === self::ROLE_COURIER ? 'courier_unread' : 'hub_unread' => 0]);

        return response()->json(['data' => ['unread' => 0]]);
    }

    /** @return array{is_closed: bool, can_send: bool, closed_message: ?string} */
    public function meta(Conversation $c): array
    {
        $open = $this->isOpen($c);

        return ['is_closed' => ! $open, 'can_send' => $open, 'closed_message' => $open ? null : $this->closedMessage($c)];
    }

    /** @return array<string, mixed> */
    public function formatMessage(Message $m, Conversation $c): array
    {
        $fromHub = (int) $m->sender_id === (int) $c->sortingCenter?->user_id;
        $sender = $m->relationLoaded('sender') ? $m->sender : User::find($m->sender_id);

        return [
            'id'              => $m->id,
            'conversation_id' => $m->conversation_id,
            'body'            => $m->body,
            'sender_id'       => $m->sender_id,
            'sender_role'     => $fromHub ? self::ROLE_HUB : self::ROLE_COURIER,
            // The hub's name, or the company's name with the team member's first name.
            'sender_name'     => $fromHub
                ? ($c->sortingCenter?->hub_name ?? 'Hub')
                : trim(($c->logisticsCompany?->name ?? 'Courier') . ($sender?->first_name ? ' · ' . $sender->first_name : '')),
            'read_at'         => $m->read_at?->toIso8601String(),
            'created_at'      => $m->created_at?->toIso8601String(),
        ];
    }

    private function closedMessage(Conversation $c): string
    {
        return $c->sortingCenter?->status === SortingCenter::STATUS_SUSPENDED
            ? 'This hub is suspended, so the conversation is read-only.'
            : 'This hub is no longer active with this courier, so the conversation is read-only.';
    }

    private function fail409(string $message): never
    {
        throw new HttpResponseException(response()->json(['message' => $message], 409));
    }
}
