<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\OrderItem;
use App\Models\Review;
use App\Models\ReviewImage;
use App\Support\ProductRatings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * A buyer's product reviews (A12). A product can be reviewed once per order, only once that order is Completed and
 * within 30 days of completion; the review is a verified purchase with 1 to 5 stars, up to 500 characters of text and
 * up to five JPG or PNG photos. It can be edited once, within those 30 days.
 */
class BuyerReviewController extends Controller
{
    private const EDIT_DAYS = 30;
    private const MAX_PHOTOS = 5;
    private const MAX_TEXT = 500;
    private const MAX_EDITS = 1;

    /** Only a Completed order's products can be reviewed (A12). */
    private static function reviewableStatuses(): array
    {
        return [OrderStatus::COMPLETED->value];
    }

    /** GET /buyer/reviews/pending: products the buyer received and has not reviewed yet, newest first. */
    public function pending(Request $request): JsonResponse
    {
        $user = $request->user();

        $items = OrderItem::query()
            ->whereNotNull('product_id')
            ->whereHas('order', fn ($q) => $q->where('buyer_id', $user->id)->whereIn('status', self::reviewableStatuses())
                ->where(fn ($w) => $w->whereNull('completed_at')->orWhere('completed_at', '>=', now()->subDays(self::EDIT_DAYS))))
            ->with(['order:id,order_number,status,updated_at,completed_at', 'product.images', 'seller.sellerProfile'])
            ->orderByDesc('id')
            ->get();

        $reviewed = Review::withTrashed()
            ->where('buyer_id', $user->id)
            ->whereIn('order_id', $items->pluck('order_id')->unique())
            ->get(['order_id', 'product_id'])
            ->mapWithKeys(fn ($r) => ["{$r->order_id}-{$r->product_id}" => true]);

        $rows = $items
            ->filter(fn (OrderItem $i) => $i->product && ! isset($reviewed["{$i->order_id}-{$i->product_id}"]))
            ->unique(fn (OrderItem $i) => "{$i->order_id}-{$i->product_id}")
            ->values()
            ->map(fn (OrderItem $i) => [
                'order_id'      => $i->order_id,
                'order_number'  => $i->order->order_number,
                'delivered_at'  => ($i->delivered_at ?? $i->order->updated_at)?->toIso8601String(),
                'variant_label' => $i->variant_label,
                'shop_name'     => $i->seller?->sellerProfile?->shop_name,
                'product'       => [
                    'id'        => $i->product->id,
                    'name'      => $i->product->name,
                    'image_url' => $i->image_url ?? $i->product->primaryImageUrl(),
                ],
            ]);

        return response()->json(['data' => $rows]);
    }

    /** GET /buyer/reviews: the buyer's own reviews, newest first. */
    public function index(Request $request): JsonResponse
    {
        $reviews = Review::where('buyer_id', $request->user()->id)
            ->with(['product.images', 'order:id,order_number', 'images'])
            ->latest()
            ->get();

        return response()->json(['data' => $reviews->map(fn (Review $r) => $this->format($r))]);
    }

    /** POST /buyer/reviews (multipart): rating, comment and up to five photos for a delivered order's product. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'order_id'   => ['required', 'integer'],
            'product_id' => ['required', 'integer'],
            'rating'     => ['required', 'integer', 'between:1,5'],
            'comment'    => ['nullable', 'string', 'max:' . self::MAX_TEXT],
            'photos'     => ['nullable', 'array', 'max:' . self::MAX_PHOTOS],
            'photos.*'   => ['file', 'mimes:jpg,jpeg,png', 'max:5120'],
        ], [
            'rating.required' => 'Choose 1 to 5 stars.',
            'rating.between'  => 'Choose 1 to 5 stars.',
            'comment.max'     => 'A review can be at most ' . self::MAX_TEXT . ' characters.',
            'photos.max'      => 'You can add up to ' . self::MAX_PHOTOS . ' photos.',
            'photos.*.mimes'  => 'Review photos must be JPG or PNG.',
            'photos.*.max'    => 'Each photo must be 5 MB or smaller.',
        ]);

        $item = OrderItem::where('order_id', $data['order_id'])
            ->where('product_id', $data['product_id'])
            ->whereHas('order', fn ($q) => $q->where('buyer_id', $user->id))
            ->with('order:id,status,completed_at')
            ->first();
        abort_unless($item, 422, 'You can only review products from your own orders.');
        $status = $item->order->status instanceof OrderStatus ? $item->order->status->value : (string) $item->order->status;
        abort_unless(in_array($status, self::reviewableStatuses(), true), 422, 'You can rate this product once the order is Completed (after you confirm you received it).');
        abort_if($item->order->completed_at && $item->order->completed_at->lt(now()->subDays(self::EDIT_DAYS)), 422, 'Reviews can be written within ' . self::EDIT_DAYS . ' days of the order being completed.');

        $already = Review::withTrashed()
            ->where('buyer_id', $user->id)->where('order_id', $data['order_id'])->where('product_id', $data['product_id'])
            ->exists();
        abort_if($already, 422, 'You already reviewed this product for this order. You can edit that review instead.');

        $stored = [];
        try {
            $review = DB::transaction(function () use ($user, $data, $request, $item, &$stored) {
                $review = Review::create([
                    'buyer_id'          => $user->id,
                    'product_id'        => $data['product_id'],
                    'order_id'          => $data['order_id'],
                    'order_item_id'     => $item->id,
                    'variant_label'     => $item->variant_label,
                    'rating'            => $data['rating'],
                    'comment'           => $this->clean($data['comment'] ?? null),
                    'verified_purchase' => true,
                    'moderation_status' => 'visible',
                ]);
                foreach (array_values($request->file('photos', [])) as $i => $photo) {
                    $path = $photo->store('review_images', 'public');
                    $stored[] = $path;
                    ReviewImage::create(['review_id' => $review->id, 'path' => $path, 'sort_order' => $i]);
                }

                return $review;
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($stored);
            throw $e;
        }

        ProductRatings::refresh((int) $data['product_id']);

        return response()->json(['data' => $this->format($review->load(['product.images', 'order:id,order_number', 'images']))], 201);
    }

    /** PATCH /buyer/reviews/{review}: change the rating or text once, within 30 days (A12). */
    public function update(Request $request, Review $review): JsonResponse
    {
        abort_unless((int) $review->buyer_id === (int) $request->user()->id, 403, 'This is not your review.');
        abort_if($review->created_at->lt(now()->subDays(self::EDIT_DAYS)), 422, 'Reviews can be edited for ' . self::EDIT_DAYS . ' days after posting.');
        abort_if($review->edit_count >= self::MAX_EDITS, 422, 'You already edited this review. A review can be edited once.');

        $data = $request->validate([
            'rating'  => ['sometimes', 'required', 'integer', 'between:1,5'],
            'comment' => ['sometimes', 'nullable', 'string', 'max:' . self::MAX_TEXT],
        ], [
            'comment.max' => 'A review can be at most ' . self::MAX_TEXT . ' characters.',
        ]);
        $data['edit_count'] = $review->edit_count + 1;
        if (array_key_exists('comment', $data)) {
            $data['comment'] = $this->clean($data['comment']);
        }
        $review->update($data);
        ProductRatings::refresh((int) $review->product_id);

        return response()->json(['data' => $this->format($review->fresh(['product.images', 'order:id,order_number', 'images']))]);
    }

    private function clean(?string $comment): ?string
    {
        $text = trim(strip_tags((string) $comment));

        return $text === '' ? null : $text;
    }

    private function format(Review $r): array
    {
        return [
            'id'                => $r->id,
            'rating'            => (int) $r->rating,
            'comment'           => $r->comment,
            'verified_purchase' => (bool) $r->verified_purchase,
            'images'            => $r->imageUrls(),
            'created_at'        => $r->created_at?->toIso8601String(),
            'updated_at'        => $r->updated_at?->toIso8601String(),
            'can_edit'          => ($r->created_at?->gte(now()->subDays(self::EDIT_DAYS)) ?? false) && $r->edit_count < self::MAX_EDITS,
            'edit_count'        => $r->edit_count,
            'variant_label'     => $r->variant_label,
            'seller_reply'      => $r->seller_reply ? ['body' => $r->seller_reply, 'replied_at' => $r->seller_replied_at?->toIso8601String()] : null,
            'order'             => $r->order ? ['id' => $r->order->id, 'order_number' => $r->order->order_number] : null,
            'product'           => $r->product ? [
                'id'        => $r->product->id,
                'name'      => $r->product->name,
                'image_url' => $r->product->primaryImageUrl(),
            ] : null,
        ];
    }
}
