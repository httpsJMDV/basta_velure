<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Review;
use App\Models\SellerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SellerShopProfileController extends Controller
{
    /** GET /seller/shop-profile */
    public function show(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->sellerProfile;
        abort_if(!$profile, 404);

        $productCount  = Product::where('seller_id', $user->id)->where('status', 'active')->count();
        $avgRating     = Review::whereHas('product', fn ($q) => $q->where('seller_id', $user->id))->avg('rating');
        $followerCount = 0;

        return response()->json(['data' => $this->format($profile, $productCount, $avgRating, $followerCount)]);
    }

    /** POST /seller/shop-profile */
    public function update(Request $request): JsonResponse
    {
        $user    = $request->user();
        $profile = $user->sellerProfile;
        abort_if(!$profile, 404);

        $data = $request->validate([
            'shop_name'           => 'sometimes|string|max:100|unique:seller_profiles,shop_name,' . $profile->id,
            'shop_category'       => 'sometimes|nullable|string|max:100',
            'shop_description'    => 'sometimes|nullable|string|max:500',
            'shop_bio'            => 'sometimes|nullable|string|max:100',
            'address_province'    => 'sometimes|nullable|string|max:100',
            'address_city'        => 'sometimes|nullable|string|max:100',
            'address_barangay'    => 'sometimes|nullable|string|max:100',
            'address_street'      => 'sometimes|nullable|string|max:255',
            'shop_contact_number' => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[0-9+]+$/'],
            'return_policy'       => 'sometimes|nullable|string|max:500',
            'shipping_policy'     => 'sometimes|nullable|string|max:500',
            'business_hours'      => 'sometimes|nullable|string|max:100',
            'response_time'       => 'sometimes|nullable|string|max:50',
            'logo'                => 'sometimes|image|max:2048',
            'banner'              => 'sometimes|image|max:5120',
        ]);

        if ($request->hasFile('logo')) {
            if ($profile->logo_path) Storage::disk('public')->delete($profile->logo_path);
            $data['logo_path'] = $request->file('logo')->store('shops/logos', 'public');
        }

        if ($request->hasFile('banner')) {
            if ($profile->banner_path) Storage::disk('public')->delete($profile->banner_path);
            $data['banner_path'] = $request->file('banner')->store('shops/banners', 'public');
        }

        unset($data['logo'], $data['banner']);
        $profile->update($data);

        $productCount = Product::where('seller_id', $user->id)->where('status', 'active')->count();
        $avgRating    = Review::whereHas('product', fn ($q) => $q->where('seller_id', $user->id))->avg('rating');

        return response()->json(['data' => $this->format($profile->fresh(), $productCount, $avgRating, 0)]);
    }

    private function format(SellerProfile $p, int $productCount, ?float $avgRating, int $followerCount): array
    {
        return [
            'shop_name'           => $p->shop_name,
            'shop_slug'           => Str::slug($p->shop_name ?? ''),
            'shop_category'       => $p->shop_category,
            'shop_description'    => $p->shop_description,
            'shop_bio'            => $p->shop_bio,
            'address_province'    => $p->address_province,
            'address_city'        => $p->address_city,
            'address_barangay'    => $p->address_barangay,
            'address_street'      => $p->address_street,
            'shop_contact_number' => $p->shop_contact_number,
            'return_policy'       => $p->return_policy,
            'shipping_policy'     => $p->shipping_policy,
            'business_hours'      => $p->business_hours,
            'response_time'       => $p->response_time,
            'logo_url'            => $p->logo_path ? Storage::disk('public')->url($p->logo_path) : null,
            'banner_url'          => $p->banner_path ? Storage::disk('public')->url($p->banner_path) : null,
            'application_status'  => $p->application_status,
            'submitted_at'        => $p->submitted_at,
            'reviewed_at'         => $p->reviewed_at,
            'created_at'          => $p->created_at,
            'avg_rating'          => $avgRating ? round($avgRating, 1) : null,
            'total_products'      => $productCount,
            'follower_count'      => $followerCount,
        ];
    }
}
