<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\SellerProfile;
use App\Models\ShopReview;
use App\Models\User;
use App\Services\Notifier;
use App\Support\Validation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Shop comments (Amaru task 6, "shop reviews" in the URLs and tables): what buyers say about a shop itself (shipping,
 * packing, how the seller answers), apart from its product reviews. They are comments, not ratings: there are no
 * stars (product reviews keep theirs).
 *
 * - Only a buyer with at least one completed order from the shop can comment on it.
 * - One comment per buyer per shop: the buyer edits it instead of posting another, at most twice a day (Manila days).
 * - A comment of 2 to 500 characters (required) and the quick tags in ShopReview::TAGS (optional).
 * - The seller can post one reply per comment and edit it. Nobody hides or deletes a comment: it is honest feedback.
 * - Viewing them needs a signed-in account, like the rest of the shop's page.
 */
class ShopReviewController extends Controller
{
    // ── Signed-in visitors of the shop's page ───────────────────────────────

    /** GET /shops/{shop}/shop-reviews?tag=&page=: every comment on the shop, newest first, with the summary. */
    public function index(Request $request, string $shop): JsonResponse
    {
        $profile = $this->profile($shop);
        $page = ShopReview::with('buyer:id,first_name,last_name,avatar_path')
            ->where('seller_id', $profile->user_id)
            ->when(in_array($request->query('tag'), ShopReview::TAGS, true), fn ($q) => $q->whereJsonContains('tags', $request->query('tag')))
            ->latest()->orderByDesc('id')
            ->paginate(min(30, max(5, (int) $request->query('per_page', 10))));

        return response()->json([
            'data' => $page->getCollection()->map(fn (ShopReview $r) => self::row($r))->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'summary' => self::summary($profile->user_id, latest: 0),
            'shop' => ['name' => $profile->shop_name, 'slug' => \Illuminate\Support\Str::slug((string) $profile->shop_name), 'seller_id' => $profile->user_id],
        ]);
    }

    /**
     * How many comments, how often each quick tag was picked (most picked first) and (for the shop page) the latest.
     *
     * @return array{count: int, tag_counts: array<int, array{tag: string, count: int}>, latest: array<int, array<string, mixed>>}
     */
    public static function summary(int $sellerId, int $latest = 3): array
    {
        $tags = ShopReview::where('seller_id', $sellerId)->whereNotNull('tags')->pluck('tags')->flatten()->countBy();

        return [
            'count'      => ShopReview::where('seller_id', $sellerId)->count(),
            'tag_counts' => collect(ShopReview::TAGS)
                ->map(fn ($t) => ['tag' => $t, 'count' => (int) ($tags[$t] ?? 0)])
                ->filter(fn ($t) => $t['count'] > 0)
                ->sortByDesc('count')->values()->all(),
            'latest'     => $latest > 0
                ? ShopReview::with('buyer:id,first_name,last_name,avatar_path')->where('seller_id', $sellerId)->latest()->orderByDesc('id')
                    ->limit($latest)->get()->map(fn (ShopReview $r) => self::row($r))->all()
                : [],
        ];
    }

    // ── The signed-in buyer ──────────────────────────────────────────────────

    /** GET /shops/{shop}/my-shop-review: whether the buyer can comment on the shop, and their comment if they have one. */
    public function mine(Request $request, string $shop): JsonResponse
    {
        $profile = $this->profile($shop);
        $review = ShopReview::where('seller_id', $profile->user_id)->where('buyer_id', $request->user()->id)->first();
        $reason = $this->cannotReview($request->user(), $profile);

        return response()->json(['data' => [
            'can_review'       => $reason === null,
            'reason'           => $reason,
            'review'           => $review ? self::row($review->load('buyer')) : null,
            'edits_left_today' => $review?->editsLeftToday() ?? ShopReview::MAX_EDITS_PER_DAY,
            'tags'             => ShopReview::TAGS,
        ]]);
    }

    /** POST /shops/{shop}/my-shop-review {comment, tags?} */
    public function store(Request $request, string $shop): JsonResponse
    {
        $profile = $this->profile($shop);
        $buyer = $request->user();
        if ($reason = $this->cannotReview($buyer, $profile)) {
            abort(403, $reason);
        }
        $data = $this->validated($request);

        $review = DB::transaction(function () use ($profile, $buyer, $data) {
            abort_if(ShopReview::where('seller_id', $profile->user_id)->where('buyer_id', $buyer->id)->lockForUpdate()->exists(), 409,
                'You already commented on this shop. Edit your comment instead.');

            return ShopReview::create(['seller_id' => $profile->user_id, 'buyer_id' => $buyer->id] + $data);
        });

        app(Notifier::class)->toSeller($profile->user_id, 'new_review', 'shop_review.new', 'New comment on your shop',
            ($buyer->first_name ?: 'A buyer') . ' commented on your shop: "' . \Illuminate\Support\Str::limit((string) $review->comment, 80) . '"',
            '/seller/reviews?tab=shop', ['shop_review_id' => $review->id]);

        return response()->json(['message' => 'Thanks! Your comment is posted.', 'data' => self::row($review->load('buyer'))], 201);
    }

    /** PATCH /shops/{shop}/my-shop-review {comment, tags?}: at most 2 edits a day. */
    public function update(Request $request, string $shop): JsonResponse
    {
        $profile = $this->profile($shop);
        $data = $this->validated($request);

        $review = DB::transaction(function () use ($profile, $request, $data) {
            $review = ShopReview::where('seller_id', $profile->user_id)->where('buyer_id', $request->user()->id)->lockForUpdate()->first();
            abort_if(! $review, 404, 'You have not commented on this shop yet.');
            abort_if($review->editsLeftToday() === 0, 429, 'You can edit your comment twice a day. Try again tomorrow.');

            $today = now('Asia/Manila')->toDateString();
            $sameDay = $review->edit_day?->toDateString() === $today;
            $review->fill($data);
            $review->forceFill([
                'edit_count'   => $review->edit_count + 1,
                'edit_day'     => $today,
                'edits_on_day' => $sameDay ? $review->edits_on_day + 1 : 1,
            ])->save();

            return $review;
        });

        return response()->json([
            'message' => 'Your comment is updated.',
            'data' => self::row($review->load('buyer')),
            'edits_left_today' => $review->editsLeftToday(),
        ]);
    }

    // ── The seller ───────────────────────────────────────────────────────────

    /** GET /seller/shop-reviews?replied=0|1&page= */
    public function sellerIndex(Request $request): JsonResponse
    {
        $sellerId = $request->user()->id;
        $page = ShopReview::with('buyer:id,first_name,last_name,avatar_path')->where('seller_id', $sellerId)
            ->when($request->query('replied') === '0', fn ($q) => $q->whereNull('seller_reply'))
            ->when($request->query('replied') === '1', fn ($q) => $q->whereNotNull('seller_reply'))
            ->latest()->orderByDesc('id')
            ->paginate(min(50, max(5, (int) $request->query('per_page', 20))));

        return response()->json([
            'data' => $page->getCollection()->map(fn (ShopReview $r) => self::row($r))->all(),
            'meta' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(),
                'unreplied' => ShopReview::where('seller_id', $sellerId)->whereNull('seller_reply')->count(),
            ],
            'summary' => self::summary($sellerId, latest: 0),
        ]);
    }

    /** POST /seller/shop-reviews/{review}/reply {body} */
    public function reply(Request $request, int $review): JsonResponse
    {
        $r = ShopReview::where('seller_id', $request->user()->id)->findOrFail($review);
        abort_if($r->seller_reply !== null, 409, 'You already replied to this comment. Edit your reply instead.');
        $r->forceFill(['seller_reply' => $this->replyBody($request), 'seller_replied_at' => now()])->save();

        return response()->json(['message' => 'Reply posted. Buyers see it under the comment.', 'data' => self::row($r->load('buyer'))], 201);
    }

    /** PATCH /seller/shop-reviews/{review}/reply {body} */
    public function updateReply(Request $request, int $review): JsonResponse
    {
        $r = ShopReview::where('seller_id', $request->user()->id)->findOrFail($review);
        abort_if($r->seller_reply === null, 404, 'There is no reply to edit yet.');
        $r->forceFill(['seller_reply' => $this->replyBody($request), 'seller_reply_edited_at' => now()])->save();

        return response()->json(['message' => 'Reply updated.', 'data' => self::row($r->load('buyer'))]);
    }

    // ── The admin (read-only) ────────────────────────────────────────────────

    /** GET /admin/reviews/shops/{seller}/shop-reviews?page= */
    public function adminIndex(Request $request, User $seller): JsonResponse
    {
        $page = ShopReview::with('buyer:id,first_name,last_name,email,avatar_path')->where('seller_id', $seller->id)
            ->latest()->orderByDesc('id')
            ->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (ShopReview $r) => self::row($r) + [
                // The admin sees who wrote it; buyers and sellers see a masked name.
                'buyer_full_name' => trim(($r->buyer?->first_name ?? '') . ' ' . ($r->buyer?->last_name ?? '')),
                'buyer_email' => $r->buyer?->email,
            ])->all(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'summary' => self::summary($seller->id, latest: 0),
        ]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function profile(string $shop): SellerProfile
    {
        $profile = PublicShopController::resolveProfile($shop);
        abort_if(! $profile || ! $profile->user || $profile->user->status === 'suspended', 404, 'Shop not found.');

        return $profile;
    }

    /** Why this buyer cannot comment on the shop, or null when they can. */
    private function cannotReview(User $buyer, SellerProfile $profile): ?string
    {
        if ((int) $buyer->id === (int) $profile->user_id) {
            return 'You cannot comment on your own shop.';
        }
        $completed = Order::where('buyer_id', $buyer->id)
            ->where('status', OrderStatus::COMPLETED->value)
            ->whereHas('items', fn ($q) => $q->where('seller_id', $profile->user_id))
            ->exists();

        return $completed ? null : 'You can comment on this shop after one of your orders from it is completed.';
    }

    /** A comment (required) and optional quick tags; no stars. @return array{comment: string, tags: array<int, string>} */
    private function validated(Request $request): array
    {
        $request->merge(['comment' => is_string($request->input('comment')) ? trim(strip_tags($request->input('comment'))) : $request->input('comment')]);
        $data = $request->validate([
            'comment' => ['required', 'string', 'min:2', 'max:' . ShopReview::COMMENT_MAX, 'regex:' . Validation::TWO_LETTERS_REGEX],
            'tags'    => ['nullable', 'array', 'max:' . count(ShopReview::TAGS)],
            'tags.*'  => ['string', 'distinct', Rule::in(ShopReview::TAGS)],
        ], [
            'comment.required' => 'Write your comment about the shop.',
            'comment.min'      => 'Write your comment about the shop.',
            'comment.max'      => 'A comment can be at most ' . ShopReview::COMMENT_MAX . ' characters.',
            'comment.regex'    => 'Write your comment in words.',
            'tags.*.in'        => 'Choose tags from the list.',
            'tags.*.distinct'  => 'Each tag can be picked once.',
        ]);

        // Tags keep the list's order, whatever order they were picked in.
        $tags = array_values(array_intersect(ShopReview::TAGS, $data['tags'] ?? []));

        return ['comment' => $data['comment'], 'tags' => $tags];
    }

    private function replyBody(Request $request): string
    {
        $request->merge(['body' => is_string($request->input('body')) ? trim(strip_tags($request->input('body'))) : $request->input('body')]);

        return $request->validate(['body' => ['required', 'string', 'min:2', 'max:500', 'regex:' . Validation::TWO_LETTERS_REGEX]], [
            'body.required' => 'Write your reply.',
            'body.min'      => 'Write your reply.',
            'body.max'      => 'A reply can be at most 500 characters.',
            'body.regex'    => 'Write your reply in words.',
        ])['body'];
    }

    /** @return array<string, mixed> */
    public static function row(ShopReview $r): array
    {
        return [
            'id'         => $r->id,
            'comment'    => $r->comment,
            'tags'       => $r->tags ?? [],
            'edited'     => $r->edit_count > 0,
            'created_at' => $r->created_at?->toIso8601String(),
            'updated_at' => $r->updated_at?->toIso8601String(),
            'buyer'      => [
                'name'       => PublicProductController::maskName($r->buyer?->first_name, $r->buyer?->last_name),
                'avatar_url' => $r->buyer?->avatar_path ? asset('storage/' . $r->buyer->avatar_path) : null,
            ],
            'seller_reply' => $r->seller_reply ? [
                'body'       => $r->seller_reply,
                'replied_at' => $r->seller_replied_at?->toIso8601String(),
                'edited_at'  => $r->seller_reply_edited_at?->toIso8601String(),
            ] : null,
        ];
    }
}
