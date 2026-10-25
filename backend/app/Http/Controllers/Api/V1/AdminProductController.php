<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AdminProductController extends Controller
{
    /** GET /admin/products */
    public function index(Request $request): JsonResponse
    {
        $query = Product::with(['variants', 'images', 'seller.sellerProfile', 'category'])
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, function ($q) use ($request) {
                $s = "%{$request->search}%";
                $q->where(function ($inner) use ($s, $request) {
                    $inner->where('name', 'like', $s)
                          ->orWhereHas('seller', fn ($sq) =>
                              $sq->where('first_name', 'like', $s)
                                 ->orWhere('last_name', 'like', $s)
                                 ->orWhere('email', 'like', $s)
                          )
                          ->orWhere('base_price', 'like', $s)
                          ->orWhere('status', 'like', $s)
                          ->orWhere('created_at', 'like', $s);
                });
            })
            ->when($request->seller_id, fn ($q) => $q->where('seller_id', $request->seller_id))
            ->latest();

        $perPage = min((int) $request->input('per_page', 50), 100);
        $paginated = $query->paginate($perPage);

        return response()->json([
            'data' => collect($paginated->items())->map(fn ($p) => $this->formatProduct($p)),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
                'from'         => $paginated->firstItem(),
                'to'           => $paginated->lastItem(),
            ],
        ]);
    }

    /** GET /admin/products/stats */
    public function stats(): JsonResponse
    {
        $counts = Product::selectRaw('status, count(*) as cnt')
            ->groupBy('status')
            ->pluck('cnt', 'status');

        return response()->json(['data' => [
            'pending_review' => (int) ($counts['pending_review'] ?? 0),
            'active'         => (int) ($counts['active'] ?? 0),
            'rejected'       => (int) ($counts['rejected'] ?? 0),
            'archived'       => (int) ($counts['archived'] ?? 0),
            'draft'          => (int) ($counts['draft'] ?? 0),
        ]]);
    }

    /** GET /admin/products/{product} */
    public function show(Product $product): JsonResponse
    {
        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'seller.sellerProfile', 'category']))]);
    }

    /** POST /admin/products/{product}/approve */
    public function approve(Request $request, Product $product): JsonResponse
    {
        abort_if($product->status !== 'pending_review', 422, 'Product is not pending review.');

        // A product held for the AI check has not been published yet.
        $product->update(['status' => 'active', 'rejection_reason' => null, 'published_at' => $product->published_at ?? now()]);
        app(\App\Services\MailNotifier::class)->productApproved($product->loadMissing('seller'));
        app(\App\Services\Notifier::class)->listingDecision($product, 'Product approved', "{$product->name} is live. Buyers can find and order it now.");

        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'seller.sellerProfile']))]);
    }

    /** POST /admin/products/{product}/reject */
    public function reject(Request $request, Product $product): JsonResponse
    {
        abort_if($product->status !== 'pending_review', 422, 'Product is not pending review.');

        $data = $request->validate(['reason' => 'required|string|max:1000']);
        $product->update(['status' => 'rejected', 'rejection_reason' => $data['reason']]);
        app(\App\Services\MailNotifier::class)->productRejected($product->loadMissing('seller'), $data['reason']);
        app(\App\Services\Notifier::class)->listingDecision($product, 'Changes needed', "{$product->name} was not approved: {$data['reason']}");

        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'seller.sellerProfile']))]);
    }

    /** POST /admin/products/{product}/archive */
    public function archive(Request $request, Product $product): JsonResponse
    {
        // Admin can archive active products OR seller-archived products (to lock them)
        abort_if(
            !in_array($product->status, ['active', 'draft']) && !($product->status === 'archived' && $product->archived_by === 'seller'),
            422,
            'Only active, draft, or seller-archived products can be archived by admin.'
        );

        $data = $request->validate(['reason' => 'required|string|max:1000']);
        $product->update([
            'status'         => 'archived',
            'archive_reason' => $data['reason'],
            'archived_by'    => 'admin',
        ]);
        app(\App\Services\MailNotifier::class)->productArchived($product->loadMissing('seller'), $data['reason']);
        app(\App\Services\Notifier::class)->listingDecision($product, 'Product archived', "Loved-IT archived {$product->name}: {$data['reason']}");

        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'seller.sellerProfile']))]);
    }

    /** POST /admin/products/{product}/reactivate */
    public function reactivate(Product $product): JsonResponse
    {
        abort_if(
            $product->status !== 'archived' || $product->archived_by !== 'admin',
            422,
            'Only admin-archived products can be reactivated by admin.'
        );

        $product->update([
            'status'         => 'active',
            'archive_reason' => null,
            'archived_by'    => null,
        ]);
        app(\App\Services\MailNotifier::class)->productReactivated($product->loadMissing('seller'));
        app(\App\Services\Notifier::class)->listingDecision($product, 'Product live again', "{$product->name} is back on sale.");

        return response()->json(['data' => $this->formatProduct($product->load(['variants', 'images', 'seller.sellerProfile']))]);
    }

    /** GET /admin/products/{product}/fda-lto */
    public function fdaLto(Product $product): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        abort_unless($product->fda_lto_path && Storage::disk('local')->exists($product->fda_lto_path), 404);
        return response()->file(Storage::disk('local')->path($product->fda_lto_path));
    }

    /** GET /admin/products/{product}/fda-cpr */
    public function fdaCpr(Product $product): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        abort_unless($product->fda_cpr_path && Storage::disk('local')->exists($product->fda_cpr_path), 404);
        return response()->file(Storage::disk('local')->path($product->fda_cpr_path));
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private function formatProduct(Product $product): array
    {
        $primaryImage = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

        return [
            'id'                   => $product->id,
            'name'                 => $product->name,
            'description'          => $product->description,
            'status'               => $product->status,
            'rejection_reason'     => $product->rejection_reason,
            'archive_reason'       => $product->archive_reason,
            'archived_by'          => $product->archived_by,
            // The AI product check (Amaru task 7): checking / approved / flagged / unavailable / rejected, the verdict
            // it gave (approve, send_to_admin, reject) and its reason.
            'ai_review'            => $product->ai_review_status ? [
                'status'      => $product->ai_review_status,
                'verdict'     => $product->ai_review_verdict,
                'reason'      => $product->ai_review_reason,
                'reviewed_at' => $product->ai_reviewed_at?->toIso8601String(),
            ] : null,
            'base_price'           => (float) $product->base_price,
            'units_sold'           => $product->units_sold,
            'weight_kg'            => $product->weight_kg ? (float) $product->weight_kg : null,
            'dimension_l_cm'       => $product->dimension_l_cm ? (float) $product->dimension_l_cm : null,
            'dimension_w_cm'       => $product->dimension_w_cm ? (float) $product->dimension_w_cm : null,
            'dimension_h_cm'       => $product->dimension_h_cm ? (float) $product->dimension_h_cm : null,
            'sku'                  => $product->sku,
            'category'             => $product->category ? [
                'id'   => $product->category->id,
                'name' => $product->category->name,
                'slug' => $product->category->slug,
            ] : null,
            'thumbnail_url'        => $primaryImage ? asset('storage/' . $primaryImage->path) : null,
            'images'               => $product->images->map(fn ($img) => [
                'id'         => $img->id,
                'url'        => asset('storage/' . $img->path),
                'is_primary' => (bool) $img->is_primary,
                'sort_order' => $img->sort_order,
            ]),
            'variants'             => $product->variants->map(fn ($v) => [
                'id'             => $v->id,
                'label'          => $v->label,
                'sku'            => $v->sku,
                'price'          => (float) $v->price,
                'stock_quantity' => $v->stock_quantity,
            ]),
            'seller'               => $product->seller ? [
                'id'         => $product->seller->id,
                'full_name'  => $product->seller->first_name . ' ' . $product->seller->last_name,
                'email'      => $product->seller->email,
                'phone'      => $product->seller->phone,
                'shop_name'  => $product->seller->sellerProfile?->shop_name,
                // Shop pages are addressed by the slugged shop name, as everywhere else (/shop/{slug}).
                'shop_slug'  => $product->seller->sellerProfile?->shop_name ? \Illuminate\Support\Str::slug($product->seller->sellerProfile->shop_name) : null,
                'avatar_url' => $product->seller->avatar_path ? asset('storage/' . $product->seller->avatar_path) : null,
                // The public face of the shop, for the admin's shop profile card.
                'shop'       => $product->seller->sellerProfile ? [
                    'logo_url'       => $product->seller->sellerProfile->logo_url,
                    'banner_url'     => $product->seller->sellerProfile->banner_url,
                    'category'       => $product->seller->sellerProfile->shop_category,
                    'bio'            => $product->seller->sellerProfile->shop_bio ?: $product->seller->sellerProfile->shop_description,
                    'city'           => $product->seller->sellerProfile->address_city,
                    'province'       => $product->seller->sellerProfile->address_province,
                    'contact_number' => $product->seller->sellerProfile->shop_contact_number,
                    'response_time'  => $product->seller->sellerProfile->response_time,
                    'approved_at'    => $product->seller->sellerProfile->reviewed_at?->toIso8601String(),
                ] : null,
            ] : null,
            'created_at'           => $product->created_at,
            // FDA / food compliance
            'fda_lto_on_file'      => !empty($product->fda_lto_path),
            'fda_cpr_on_file'      => !empty($product->fda_cpr_path),
            'fda_lto_url'          => !empty($product->fda_lto_path) ? url("/api/v1/admin/products/{$product->id}/fda-lto") : null,
            'fda_cpr_url'          => !empty($product->fda_cpr_path) ? url("/api/v1/admin/products/{$product->id}/fda-cpr") : null,
            'net_weight_volume'    => $product->net_weight_volume,
            'expiry_best_before'   => $product->expiry_best_before,
            'ingredients'          => $product->ingredients,
            'storage_instructions' => $product->storage_instructions,
            'allergen_info'        => $product->allergen_info,
        ];
    }
}
