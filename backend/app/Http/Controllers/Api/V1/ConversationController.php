<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\ConversationUpdated;
use App\Events\MessageRead;
use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    // ── List conversations for current user ──────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->query('scope'); // 'buyer' or 'seller'
        $query = Conversation::with([
            'buyer',
            'seller.sellerProfile',
            'product.images',
            'product.category',
            'order.items',
            'latestMessage.sender',
        ]);

        if ($user->role === 'admin') {
            // Admin can see all or filter by role / status / type / search
            if ($request->filled('type')) {
                $query->where('type', $request->type);
            }
            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }
            if ($request->boolean('unread_only')) {
                $query->where('admin_unread', '>', 0);
            }
            if ($request->filled('search')) {
                $s = '%' . trim($request->search) . '%';
                $query->where(function ($q) use ($s) {
                    $q->whereHas('buyer', fn ($b) => $b->where('first_name', 'like', $s)->orWhere('last_name', 'like', $s)->orWhere('email', 'like', $s))
                      ->orWhereHas('seller.sellerProfile', fn ($sp) => $sp->where('shop_name', 'like', $s))
                      ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $s))
                      ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', $s))
                      ->orWhere('subject', 'like', $s);
                });
            }
        } elseif ($scope === 'seller' || ($user->role === 'seller' && $scope !== 'buyer')) {
            // Seller Center view: ONLY seller-related conversations (buyer_seller & seller_admin)
            $query->where('seller_id', $user->id)
                  ->whereIn('type', ['buyer_seller', 'seller_admin']);

            if ($request->filled('type')) {
                $query->where('type', $request->type);
            }
            if ($request->filled('status')) {
                $query->where('status', $request->status);
            }
            if ($request->boolean('unread_only')) {
                $query->where('seller_unread', '>', 0);
            }
            if ($request->filled('search')) {
                $s = '%' . trim($request->search) . '%';
                $query->where(function ($q) use ($s) {
                    $q->whereHas('buyer', fn ($b) => $b->where('first_name', 'like', $s)->orWhere('last_name', 'like', $s))
                      ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $s))
                      ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', $s))
                      ->orWhere('subject', 'like', $s);
                });
            }
        } else {
            // Buyer view: ONLY buyer conversations (buyer_seller & buyer_admin)
            $query->where('buyer_id', $user->id)
                  ->whereIn('type', ['buyer_seller', 'buyer_admin']);

            if ($request->filled('type')) {
                $query->where('type', $request->type);
            }
            if ($request->boolean('unread_only')) {
                $query->where('buyer_unread', '>', 0);
            }
            if ($request->filled('search')) {
                $s = '%' . trim($request->search) . '%';
                $query->where(function ($q) use ($s) {
                    $q->whereHas('seller.sellerProfile', fn ($sp) => $sp->where('shop_name', 'like', $s))
                      ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $s))
                      ->orWhere('subject', 'like', $s);
                });
            }
        }

        $conversations = $query->orderByDesc('last_message_at')
            ->orderByDesc('updated_at')
            ->get()
            ->map(fn ($c) => $this->formatConversation($c, $user));

        return response()->json(['data' => $conversations]);
    }

    // ── Get total unread count for current user ──────────────────────────────

    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->query('scope');
        $count = 0;

        if ($user->role === 'admin') {
            $count = (int) Conversation::sum('admin_unread');
        } elseif ($scope === 'seller' || ($user->role === 'seller' && $scope !== 'buyer')) {
            $count = (int) Conversation::where('seller_id', $user->id)
                ->whereIn('type', ['buyer_seller', 'seller_admin'])
                ->sum('seller_unread');
        } else {
            $count = (int) Conversation::where('buyer_id', $user->id)
                ->whereIn('type', ['buyer_seller', 'buyer_admin'])
                ->sum('buyer_unread');
        }

        return response()->json(['data' => ['unread_count' => $count]]);
    }

    // ── Start or find an existing conversation ───────────────────────────────

    public function start(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'type'            => ['required', 'in:buyer_seller,buyer_admin,seller_admin'],
            'seller_id'       => ['nullable', 'exists:users,id'],
            'product_id'      => ['nullable', 'exists:products,id'],
            'order_id'        => ['nullable', 'exists:orders,id'],
            'subject'         => ['nullable', 'string', 'max:255'],
            'initial_message' => ['nullable', 'string', 'max:2000'],
        ]);

        $type = $request->type;
        $sellerId = $request->seller_id;
        $productId = $request->product_id;
        $orderId = $request->order_id;

        // Role enforcement & validation
        if ($type === 'buyer_seller') {
            if (!$sellerId && $productId) {
                $sellerId = Product::find($productId)?->seller_id;
            }
            if (!$sellerId && $orderId) {
                $sellerId = Order::find($orderId)?->seller_id;
            }
            if (!$sellerId) {
                return response()->json(['message' => 'Seller ID is required for buyer-seller chat.'], 422);
            }

            // Check if seller is approved
            $seller = User::with('sellerProfile')->find($sellerId);
            if (!$seller || $seller->role !== 'seller') {
                return response()->json(['message' => 'Target user is not a registered seller.'], 422);
            }

            // Find or create conversation
            $conversation = Conversation::where('buyer_id', $user->id)
                ->where('seller_id', $sellerId)
                ->where('type', 'buyer_seller')
                ->first();

            if (!$conversation) {
                $conversation = Conversation::create([
                    'buyer_id'        => $user->id,
                    'seller_id'       => $sellerId,
                    'type'            => 'buyer_seller',
                    'status'          => 'open',
                    'product_id'      => $productId,
                    'order_id'        => $orderId,
                    'last_message_at' => now(),
                ]);
            } else {
                if ($productId && !$conversation->product_id) {
                    $conversation->update(['product_id' => $productId]);
                }
                if ($orderId && !$conversation->order_id) {
                    $conversation->update(['order_id' => $orderId]);
                }
            }
        } elseif ($type === 'buyer_admin') {
            $targetBuyerId = ($user->role === 'admin' && $request->filled('buyer_id')) ? (int) $request->buyer_id : $user->id;

            $conversation = Conversation::where('buyer_id', $targetBuyerId)
                ->where('type', 'buyer_admin')
                ->first();

            if (!$conversation) {
                $conversation = Conversation::create([
                    'buyer_id'        => $targetBuyerId,
                    'type'            => 'buyer_admin',
                    'status'          => 'open',
                    'order_id'        => $orderId,
                    'subject'         => $request->subject ?? 'Customer Support',
                    'last_message_at' => now(),
                ]);
            }
        } elseif ($type === 'seller_admin') {
            $targetSellerId = ($user->role === 'admin' && $request->filled('seller_id')) ? (int) $request->seller_id : ($user->role === 'seller' ? $user->id : $sellerId);
            if (!$targetSellerId) {
                return response()->json(['message' => 'Seller ID is required for seller-admin chat.'], 422);
            }

            $conversation = Conversation::where('seller_id', $targetSellerId)
                ->where('type', 'seller_admin')
                ->first();

            if (!$conversation) {
                $conversation = Conversation::create([
                    'seller_id'       => $targetSellerId,
                    'type'            => 'seller_admin',
                    'status'          => 'open',
                    'subject'         => $request->subject ?? 'Platform Support',
                    'last_message_at' => now(),
                ]);
            }
        } else {
            return response()->json(['message' => 'Invalid conversation type.'], 422);
        }

        // Send initial message if provided
        if ($request->filled('initial_message')) {
            $msgBody = strip_tags(trim($request->initial_message));
            $attachmentType = null;
            $attachmentData = null;

            if ($productId) {
                $prod = Product::with('category')->find($productId);
                if ($prod) {
                    $attachmentType = 'product_card';
                    $attachmentData = [
                        'id'        => $prod->id,
                        'name'      => $prod->name,
                        'price'     => (float) $prod->price,
                        'image'     => $prod->main_image_url ?? $prod->images->first()?->image_path,
                        'category'  => $prod->category?->name,
                    ];
                }
            } elseif ($orderId) {
                $ord = Order::find($orderId);
                if ($ord) {
                    $attachmentType = 'order_card';
                    $attachmentData = [
                        'id'           => $ord->id,
                        'order_number' => $ord->order_number,
                        'total'        => (float) $ord->total,
                        'status'       => $ord->status,
                    ];
                }
            }

            $initialMsg = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id'       => $user->id,
                'body'            => $msgBody,
                'attachment_type' => $attachmentType,
                'attachment_data' => $attachmentData,
            ]);

            $this->incrementUnread($conversation, $user);

            $this->safeBroadcast(fn () => MessageSent::dispatch($initialMsg->load('sender.sellerProfile')));
            $this->broadcastConversationUpdates($conversation);
        }

        $conversation->load([
            'buyer',
            'seller.sellerProfile',
            'product.images',
            'order.items',
            'latestMessage.sender',
        ]);

        return response()->json([
            'data' => $this->formatConversation($conversation, $user),
        ], 201);
    }

    // ── Get single conversation details ─────────────────────────────────────

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);

        $conversation->load([
            'buyer',
            'seller.sellerProfile',
            'product.images',
            'order.items',
            'latestMessage.sender',
        ]);

        return response()->json([
            'data' => $this->formatConversation($conversation, $request->user()),
        ]);
    }

    // ── Messages in a conversation ───────────────────────────────────────────

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);
        $user = $request->user();

        // Mark messages from others as read
        $readCount = Message::where('conversation_id', $conversation->id)
            ->whereNull('read_at')
            ->where('sender_id', '!=', $user->id)
            ->update(['read_at' => now()]);

        // Reset unread counter for current user role
        if ($user->role === 'admin') {
            $conversation->update(['admin_unread' => 0]);
        } elseif ($user->role === 'seller' && $conversation->seller_id === $user->id) {
            $conversation->update(['seller_unread' => 0]);
        } else {
            $conversation->update(['buyer_unread' => 0]);
        }

        if ($readCount > 0) {
            $this->safeBroadcast(fn () => MessageRead::dispatch($conversation->id, $user->id, now()->toISOString()));
            $this->broadcastConversationUpdates($conversation);
        }

        $since = $request->query('since');
        $query = $conversation->messages()->with('sender.sellerProfile')->orderBy('created_at', 'asc');
        if ($since) {
            $query->where('created_at', '>', $since);
        }

        return response()->json([
            'data' => $query->get()->map(fn ($m) => $this->formatMessage($m)),
        ]);
    }

    // ── Send a message (with support for image/product_card/order_card) ──────

    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);
        $user = $request->user();

        $request->validate([
            'body'            => ['nullable', 'string', 'max:2000'],
            'image'           => ['nullable', 'image', 'max:5120'],
            'attachment_type' => ['nullable', 'string', 'in:product_card,order_card,image'],
            'attachment_data' => ['nullable', 'array'],
        ]);

        $body = strip_tags(trim($request->body ?? ''));
        $attachmentType = $request->attachment_type;
        $attachmentData = $request->attachment_data;

        // Handle multipart image file upload
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store('chat_attachments', 'public');
            $attachmentType = 'image';
            $attachmentData = [
                'url'      => '/storage/' . $path,
                'filename' => $request->file('image')->getClientOriginalName(),
                'size'     => $request->file('image')->getSize(),
            ];
            if (empty($body)) {
                $body = 'Sent an image';
            }
        }

        // Validate product_card attachment
        if ($attachmentType === 'product_card') {
            $prodId = $attachmentData['id'] ?? $request->input('product_id');
            /** @var Product|null $prod */
            $prod = Product::with(['images', 'category'])->where('id', $prodId)->first();
            if (!$prod instanceof Product) {
                return response()->json(['message' => 'Product not found.'], 422);
            }
            if ($conversation->seller_id && $prod->seller_id !== $conversation->seller_id && $user->role !== 'admin') {
                return response()->json(['message' => 'Product does not belong to this shop.'], 403);
            }
            $attachmentData = [
                'id'       => $prod->id,
                'name'     => $prod->name,
                'price'    => (float) $prod->price,
                'image'    => $prod->main_image_url ?? $prod->images->first()?->image_path,
                'category' => $prod->category?->name,
            ];
            if (empty($body)) {
                $body = 'Shared a product: ' . $prod->name;
            }
        }

        // Validate order_card attachment
        if ($attachmentType === 'order_card') {
            $ordId = $attachmentData['id'] ?? $request->input('order_id');
            /** @var Order|null $ord */
            $ord = Order::with('items')->where('id', $ordId)->first();
            if (!$ord instanceof Order) {
                return response()->json(['message' => 'Order not found.'], 422);
            }
            $items = $ord->items;
            if ($user->role === 'seller' && !$items->contains('seller_id', $user->id)) {
                return response()->json(['message' => 'You cannot attach orders from other sellers.'], 403);
            }
            if ($user->role === 'buyer' && $ord->buyer_id !== $user->id) {
                return response()->json(['message' => 'You cannot attach orders belonging to other buyers.'], 403);
            }
            $itemsSummary = ($items && $items->isNotEmpty())
                ? $items->pluck('product_name')->filter()->take(2)->implode(', ')
                : ($attachmentData['items_summary'] ?? ('Order #' . $ord->order_number));

            $attachmentData = [
                'id'            => $ord->id,
                'order_number'  => $ord->order_number,
                'total'         => (float) $ord->total,
                'status'        => $ord->status,
                'items_count'   => $items ? $items->count() : ($attachmentData['items_count'] ?? 1),
                'items_summary' => $itemsSummary,
            ];
            if (empty($body)) {
                $body = 'Shared Order #' . $ord->order_number;
            }
        }

        if (empty($body) && empty($attachmentType)) {
            return response()->json(['message' => 'Message body or attachment is required.'], 422);
        }

        $message = DB::transaction(function () use ($conversation, $body, $attachmentType, $attachmentData, $user) {
            $msg = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id'       => $user->id,
                'body'            => $body,
                'attachment_type' => $attachmentType,
                'attachment_data' => $attachmentData,
            ]);

            $this->incrementUnread($conversation, $user);

            return $msg;
        });

        $message->load('sender.sellerProfile');

        $this->safeBroadcast(fn () => MessageSent::dispatch($message));
        $this->broadcastConversationUpdates($conversation);

        return response()->json([
            'data' => $this->formatMessage($message),
        ], 201);
    }

    // ── Get attachable products for a conversation ───────────────────────────

    public function attachableProducts(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);
        $user = $request->user();

        $sellerId = $conversation->seller_id;
        if (!$sellerId && $user->role === 'seller') {
            $sellerId = $user->id;
        }

        if (!$sellerId) {
            // If buyer chatting with admin, return recently active marketplace products
            $products = Product::where('status', 'active')
                ->with('images', 'category')
                ->latest()
                ->limit(20)
                ->get();
        } else {
            $products = Product::where('seller_id', $sellerId)
                ->where('status', 'active')
                ->with('images', 'category')
                ->latest()
                ->limit(30)
                ->get();
        }

        return response()->json([
            'data' => $products->map(fn ($p) => [
                'id'       => $p->id,
                'name'     => $p->name,
                'price'    => (float) $p->price,
                'stock'    => (int) $p->stock,
                'image'    => $p->main_image_url ?? $p->images->first()?->image_path,
                'category' => $p->category?->name,
            ]),
        ]);
    }

    // ── Get attachable orders for a conversation ─────────────────────────────

    public function attachableOrders(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorizeConversation($request, $conversation);
        $user = $request->user();

        $query = Order::with('items');

        if ($user->role === 'buyer') {
            $query->where('buyer_id', $user->id);
            if ($conversation->type === 'buyer_seller' && $conversation->seller_id) {
                $query->where('seller_id', $conversation->seller_id);
            }
        } elseif ($user->role === 'seller') {
            $query->where('seller_id', $user->id);
            if ($conversation->buyer_id) {
                $query->where('buyer_id', $conversation->buyer_id);
            }
        } else {
            // Admin
            if ($conversation->order_id) {
                $query->where('id', $conversation->order_id);
            } elseif ($conversation->buyer_id) {
                $query->where('buyer_id', $conversation->buyer_id);
            }
        }

        $orders = $query->latest()->limit(20)->get();

        return response()->json([
            'data' => $orders->map(fn ($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'total'        => (float) $o->total,
                'status'       => $o->status,
                'created_at'   => $o->created_at->toISOString(),
                'items_count'  => $o->items->count(),
                'items_summary'=> $o->items->pluck('product_name')->take(2)->implode(', '),
            ]),
        ]);
    }

    // ── Update conversation status (Open / Resolved) ─────────────────────────

    public function updateStatus(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin' && $conversation->seller_id !== $user->id) {
            abort(403, 'Unauthorized to modify conversation status.');
        }

        $request->validate([
            'status' => ['required', 'in:open,resolved'],
        ]);

        $conversation->update(['status' => $request->status]);

        $this->broadcastConversationUpdates($conversation);

        return response()->json([
            'message' => "Conversation marked as {$request->status}.",
            'data'    => $this->formatConversation($conversation->fresh(['buyer', 'seller.sellerProfile']), $user),
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    protected function safeBroadcast(callable $callback): void
    {
        try {
            $callback();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Broadcast skipped: '.$e->getMessage());
        }
    }

    protected function broadcastConversationUpdates(Conversation $conversation): void
    {
        $conversation->loadMissing([
            'buyer',
            'seller.sellerProfile',
            'product.images',
            'order.items',
            'latestMessage.sender',
        ]);

        $this->safeBroadcast(function () use ($conversation) {
            if ($conversation->buyer_id) {
                ConversationUpdated::dispatch(
                    $conversation->buyer_id,
                    $conversation,
                    (int) $conversation->buyer_unread
                );
            }

            if ($conversation->seller_id) {
                ConversationUpdated::dispatch(
                    $conversation->seller_id,
                    $conversation,
                    (int) $conversation->seller_unread
                );
            }

            if ($conversation->type === 'buyer_admin' || $conversation->type === 'seller_admin') {
                $adminUsers = User::where('role', 'admin')->get();
                foreach ($adminUsers as $admin) {
                    ConversationUpdated::dispatch(
                        $admin->id,
                        $conversation,
                        (int) $conversation->admin_unread
                    );
                }
            }
        });
    }

    private function incrementUnread(Conversation $conversation, User $sender): void
    {
        $updates = ['last_message_at' => now()];

        if ($conversation->type === 'buyer_seller') {
            if ($sender->id === $conversation->buyer_id) {
                $updates['seller_unread'] = DB::raw('seller_unread + 1');
            } else {
                $updates['buyer_unread'] = DB::raw('buyer_unread + 1');
            }
        } elseif ($conversation->type === 'buyer_admin') {
            if ($sender->id === $conversation->buyer_id) {
                $updates['admin_unread'] = DB::raw('admin_unread + 1');
            } else {
                $updates['buyer_unread'] = DB::raw('buyer_unread + 1');
            }
        } elseif ($conversation->type === 'seller_admin') {
            if ($sender->id === $conversation->seller_id) {
                $updates['admin_unread'] = DB::raw('admin_unread + 1');
            } else {
                $updates['seller_unread'] = DB::raw('seller_unread + 1');
            }
        }

        $conversation->update($updates);
    }

    private function authorizeConversation(Request $request, Conversation $conversation): void
    {
        $user = $request->user();
        if ($user->role === 'admin') {
            return;
        }

        if ($conversation->buyer_id === $user->id || $conversation->seller_id === $user->id) {
            return;
        }

        abort(403, 'You do not have permission to view or participate in this conversation.');
    }

    private function formatConversation(Conversation $c, User $currentUser): array
    {
        $latest = $c->latestMessage;

        // Unread for current user
        $unread = 0;
        if ($currentUser->role === 'admin') {
            $unread = (int) $c->admin_unread;
        } elseif ($currentUser->role === 'seller' && $c->seller_id === $currentUser->id) {
            $unread = (int) $c->seller_unread;
        } elseif ($c->buyer_id === $currentUser->id) {
            $unread = (int) $c->buyer_unread;
        }

        // Shop information
        $shopName = $c->seller?->sellerProfile?->shop_name ?? ($c->seller ? "{$c->seller->first_name}'s Shop" : 'Store');
        $shopLogo = $c->seller?->sellerProfile?->logo_url ?? $c->seller?->avatar_url;
        $sellerOwnerName = $c->seller ? "{$c->seller->first_name} {$c->seller->last_name}" : null;

        // Context recipient info
        $recipient = null;
        if ($currentUser->role === 'buyer') {
            if ($c->type === 'buyer_admin') {
                $recipient = [
                    'id'        => null,
                    'name'      => 'Loved-IT Customer Support',
                    'role'      => 'admin',
                    'avatar'    => null,
                    'subtext'   => 'Official Platform Support',
                ];
            } else {
                $recipient = [
                    'id'        => $c->seller_id,
                    'name'      => $shopName, // Buyer ONLY sees the shop name, never the personal name
                    'role'      => 'seller',
                    'avatar'    => $shopLogo,
                    'subtext'   => 'Store Merchant',
                ];
            }
        } elseif ($currentUser->role === 'seller') {
            if ($c->type === 'seller_admin') {
                $recipient = [
                    'id'        => null,
                    'name'      => 'Loved-IT Partner Support',
                    'role'      => 'admin',
                    'avatar'    => null,
                    'subtext'   => 'Admin Support Team',
                ];
            } else {
                $recipient = [
                    'id'        => $c->buyer_id,
                    'name'      => $c->buyer ? "{$c->buyer->first_name} {$c->buyer->last_name}" : 'Buyer',
                    'role'      => 'buyer',
                    'avatar'    => $c->buyer?->avatar_url,
                    'email'     => $c->buyer?->email,
                    'subtext'   => 'Customer',
                ];
            }
        } else {
            // Admin view - sees shop name AND owner name underneath
            $recipient = [
                'buyer_name'  => $c->buyer ? "{$c->buyer->first_name} {$c->buyer->last_name}" : null,
                'buyer_email' => $c->buyer?->email,
                'buyer_avatar'=> $c->buyer?->avatar_url,
                'shop_name'   => $shopName,
                'seller_name' => $sellerOwnerName,
                'seller_email'=> $c->seller?->email,
                'seller_avatar'=> $shopLogo,
            ];
        }

        // Product context snapshot
        $productContext = null;
        if ($c->product) {
            $productContext = [
                'id'       => $c->product->id,
                'name'     => $c->product->name,
                'price'    => (float) $c->product->price,
                'image'    => $c->product->main_image_url ?? $c->product->images->first()?->image_path,
                'category' => $c->product->category?->name,
            ];
        }

        // Order context snapshot
        $orderContext = null;
        if ($c->order) {
            $orderContext = [
                'id'           => $c->order->id,
                'order_number' => $c->order->order_number,
                'total'        => (float) $c->order->total,
                'status'       => $c->order->status,
                'items_count'  => $c->order->items->count(),
            ];
        }

        return [
            'id'              => $c->id,
            'type'            => $c->type,
            'status'          => $c->status,
            'subject'         => $c->subject,
            'buyer_id'        => $c->buyer_id,
            'seller_id'       => $c->seller_id,
            'recipient'       => $recipient,
            'buyer'           => $c->buyer ? [
                'id'         => $c->buyer->id,
                'first_name' => $c->buyer->first_name,
                'last_name'  => $c->buyer->last_name,
                'email'      => $c->buyer->email,
                'avatar_url' => $c->buyer->avatar_url,
            ] : null,
            'seller'          => $c->seller ? [
                'id'         => $c->seller->id,
                'first_name' => $c->seller->first_name,
                'last_name'  => $c->seller->last_name,
                'email'      => $c->seller->email,
                'avatar_url' => $shopLogo,
                'shop_name'  => $shopName,
                'owner_name' => $sellerOwnerName, // Visible to Admin
            ] : null,
            'product'         => $productContext,
            'order'           => $orderContext,
            'last_message'    => $latest ? [
                'id'         => $latest->id,
                'body'       => $latest->body,
                'sender_id'  => $latest->sender_id,
                'created_at' => $latest->created_at,
            ] : null,
            'last_message_at' => $c->last_message_at,
            'unread'          => $unread,
            'created_at'      => $c->created_at,
        ];
    }

    private function formatMessage(Message $m): array
    {
        $senderAvatar = null;
        $senderName = 'User';
        $senderShopName = null;
        $senderOwnerName = null;
        $senderRole = $m->sender?->role ?? 'buyer';

        if ($m->sender) {
            $senderOwnerName = "{$m->sender->first_name} {$m->sender->last_name}";
            $sellerProfile = $m->sender->sellerProfile;

            // If the conversation is a seller conversation or the user has a shop profile
            $isSellerInContext = ($m->conversation && $m->conversation->seller_id === $m->sender_id) 
                || $senderRole === 'seller' 
                || $sellerProfile !== null;

            if ($senderRole === 'admin') {
                $senderName = 'Loved-IT Customer Support';
                $senderAvatar = null;
            } elseif ($isSellerInContext && $sellerProfile) {
                $senderRole = 'seller';
                $senderShopName = $sellerProfile->shop_name ?? $senderOwnerName;
                $senderName = $senderShopName;
                $senderAvatar = $sellerProfile->logo_url ?? $m->sender->avatar_url;
            } else {
                $senderName = $senderOwnerName;
                $senderAvatar = $m->sender->avatar_url;
            }
        }

        return [
            'id'                => $m->id,
            'conversation_id'   => $m->conversation_id,
            'body'              => $m->body,
            'sender_id'         => $m->sender_id,
            'sender_role'       => $senderRole,
            'sender_name'       => $senderName,
            'sender_shop_name'  => $senderShopName,
            'sender_owner_name' => $senderOwnerName, // Visible only to Admin in admin views
            'sender_avatar'     => $senderAvatar,
            'attachment_type'   => $m->attachment_type,
            'attachment_data'   => $m->attachment_data,
            'read_at'           => $m->read_at,
            'created_at'        => $m->created_at,
        ];
    }
}
