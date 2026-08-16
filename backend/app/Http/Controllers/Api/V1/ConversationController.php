<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    // ── Admin: list all conversations ────────────────────────────────────────

    public function index(): JsonResponse
    {
        $conversations = Conversation::with(['seller.sellerProfile', 'latestMessage.sender'])
            ->orderByDesc('last_message_at')
            ->get()
            ->map(fn ($c) => $this->formatConversation($c, isAdmin: true));

        return response()->json(['data' => $conversations]);
    }

    // ── Seller: get or create own conversation ───────────────────────────────

    public function mine(Request $request): JsonResponse
    {
        $conversation = Conversation::firstOrCreate(
            ['seller_id' => $request->user()->id],
            ['last_message_at' => now()]
        );

        return response()->json(['data' => $this->formatConversation($conversation->load(['seller.sellerProfile', 'latestMessage.sender']), isAdmin: false)]);
    }

    // ── Messages in a conversation ───────────────────────────────────────────

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);

        // Mark messages from the other party as read
        $isAdmin = $request->user()->role === 'admin';
        Message::where('conversation_id', $conversation->id)
            ->whereNull('read_at')
            ->where('sender_id', '!=', $request->user()->id)
            ->update(['read_at' => now()]);

        // Reset unread counter for the reading party
        $conversation->update($isAdmin ? ['admin_unread' => 0] : ['seller_unread' => 0]);

        $since = $request->query('since'); // ISO timestamp for polling
        $query = $conversation->messages()->with('sender')->orderBy('created_at');
        if ($since) {
            $query->where('created_at', '>', $since);
        }

        return response()->json([
            'data' => $query->get()->map(fn ($m) => $this->formatMessage($m)),
        ]);
    }

    // ── Send a message ───────────────────────────────────────────────────────

    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);

        $request->validate([
            'body' => ['required', 'string', 'max:2000'],
        ]);

        $isAdmin = $request->user()->role === 'admin';
        $body    = strip_tags(trim($request->body)); // sanitize — plain text only

        $message = DB::transaction(function () use ($request, $conversation, $body, $isAdmin) {
            $msg = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id'       => $request->user()->id,
                'body'            => $body,
            ]);

            $conversation->update([
                'last_message_at' => now(),
                // increment the OTHER party's unread counter
                'admin_unread'   => $isAdmin ? $conversation->admin_unread   : DB::raw('admin_unread + 1'),
                'seller_unread'  => $isAdmin ? DB::raw('seller_unread + 1')  : $conversation->seller_unread,
            ]);

            return $msg;
        });

        return response()->json(['data' => $this->formatMessage($message->load('sender'))], 201);
    }

    // ── Admin: open/create conversation for a specific seller ────────────────

    public function openForSeller(Request $request, User $seller): JsonResponse
    {
        abort_unless($seller->role === 'seller', 422, 'User is not a seller.');

        $conversation = Conversation::firstOrCreate(
            ['seller_id' => $seller->id],
            ['last_message_at' => now()]
        );

        return response()->json(['data' => $this->formatConversation($conversation->load(['seller.sellerProfile', 'latestMessage.sender']), isAdmin: true)]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function authorizeConversation(Request $request, Conversation $conversation): void
    {
        $user = $request->user();
        if ($user->role !== 'admin' && $conversation->seller_id !== $user->id) {
            abort(403, 'Access denied.');
        }
    }

    private function formatConversation(Conversation $c, bool $isAdmin): array
    {
        $latest = $c->latestMessage;
        return [
            'id'            => $c->id,
            'seller_id'     => $c->seller_id,
            'shop_name'     => $c->seller?->sellerProfile?->shop_name ?? ($c->seller?->first_name . ' ' . $c->seller?->last_name),
            'seller_name'   => $c->seller ? $c->seller->first_name . ' ' . $c->seller->last_name : null,
            'last_message'  => $latest ? ['body' => $latest->body, 'created_at' => $latest->created_at] : null,
            'last_message_at' => $c->last_message_at,
            'unread'        => $isAdmin ? $c->admin_unread : $c->seller_unread,
        ];
    }

    private function formatMessage(Message $m): array
    {
        return [
            'id'         => $m->id,
            'body'       => $m->body,
            'sender_id'  => $m->sender_id,
            'sender_role'=> $m->sender?->role,
            'read_at'    => $m->read_at,
            'created_at' => $m->created_at,
        ];
    }
}
