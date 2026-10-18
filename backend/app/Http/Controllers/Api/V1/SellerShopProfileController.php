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

        $addressFields = [
            'address_region', 'address_region_code', 'address_province', 'address_city', 'address_barangay', 'address_street',
            'address_province_code', 'address_city_code', 'address_barangay_code', 'address_postal_code',
        ];

        // Store name and contact are trimmed and the mobile number normalized before the rules (A4, A25).
        if (is_string($request->input('shop_name'))) {
            $request->merge(['shop_name' => preg_replace('/\s+/u', ' ', trim($request->input('shop_name')))]);
        }
        if ($request->has('shop_contact_number')) {
            $request->merge(['shop_contact_number' => \App\Support\PhMobile::prepare($request->input('shop_contact_number'))]);
        }

        $rules = [
            'shop_name'           => ['sometimes', 'required', 'string', 'min:3', 'max:30', function ($attr, $value, $fail) use ($user) {
                if (is_string($value) && \App\Http\Requests\Auth\SellerRegisterRequest::shopNameTaken($value, $user->id)) {
                    $fail('This store name is already taken. Choose another name.');
                }
            }],
            'shop_category'       => 'sometimes|nullable|string|max:100',
            'shop_description'    => 'sometimes|nullable|string|max:500',
            'shop_bio'            => 'sometimes|nullable|string|max:100',
            'shop_contact_number' => ['sometimes', 'required', ...\App\Support\PhMobile::rules()],
            'return_policy'       => 'sometimes|nullable|string|max:500',
            'shipping_policy'     => 'sometimes|nullable|string|max:500',
            'business_hours'      => 'sometimes|nullable|string|max:100',
            'response_time'       => 'sometimes|nullable|string|max:50',
            'logo'                => ['sometimes', ...\App\Support\Validation::image()],
            'banner'              => ['sometimes', ...\App\Support\Validation::image()],
            'on_vacation'         => ['sometimes', 'boolean'],
            // A29: alert at this stock or below (0: only when sold out); a product can set its own.
            'low_stock_threshold' => ['sometimes', 'required', 'integer', 'min:0', 'max:999'],
        ];

        if ($request->hasAny($addressFields)) {
            $rules['address_region']        = 'nullable|string|max:100';
            $rules['address_region_code']   = ['nullable', 'string', 'regex:/^\d{9,10}$/'];
            $rules['address_province']      = 'required|string|max:100';
            $rules['address_city']          = 'required|string|max:100';
            $rules['address_barangay']      = 'required|string|max:100';
            $rules['address_street']        = 'required|string|max:255';
            $rules['address_postal_code']   = ['nullable', 'string', 'regex:' . \App\Support\Validation::POSTAL_REGEX];
            $rules['address_province_code'] = ['required', 'string', 'regex:/^\d{9,10}$/'];
            $rules['address_city_code']     = ['required', 'string', 'regex:/^\d{9,10}$/'];
            $rules['address_barangay_code'] = ['required', 'string', 'regex:/^\d{9,10}$/'];
        }

        $data = $request->validate($rules, [
            'shop_name.required'           => 'Store name is required.',
            'shop_name.min'                => 'Store name must be 3 to 30 characters.',
            'shop_name.max'                => 'Store name must be 3 to 30 characters.',
            'shop_description.max'         => 'The store description can be at most 500 characters.',
            'shop_contact_number.required' => 'Contact number is required.',
            'shop_contact_number.regex'    => \App\Support\PhMobile::MESSAGE,
            'shop_contact_number.string'   => \App\Support\PhMobile::MESSAGE,
            'address_province.required'    => 'Province is required.',
            'address_city.required'        => 'City / Municipality is required.',
            'address_barangay.required'    => 'Barangay is required.',
            'address_street.required'      => 'Street address is required.',
            'address_province_code.required' => 'Province is required.',
            'address_city_code.required'   => 'City / Municipality is required.',
            'address_barangay_code.required' => 'Barangay is required.',
            'address_postal_code.regex'    => \App\Support\Validation::POSTAL_MESSAGE,
            'low_stock_threshold.required' => 'Enter a low-stock level from 0 to 999.',
            'low_stock_threshold.integer'  => 'The low-stock level must be a whole number from 0 to 999.',
            'low_stock_threshold.min'      => 'The low-stock level must be a whole number from 0 to 999.',
            'low_stock_threshold.max'      => 'The low-stock level must be a whole number from 0 to 999.',
            ...\App\Support\Validation::uploadMessages('logo', 'the logo'),
            ...\App\Support\Validation::uploadMessages('banner', 'the banner'),
        ]);
        if (array_key_exists('on_vacation', $data)) {
            $data['vacation_started_at'] = $data['on_vacation'] ? ($profile->vacation_started_at ?? now()) : null;
        }

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
            'address_province'      => $p->address_province,
            'address_city'          => $p->address_city,
            'address_barangay'      => $p->address_barangay,
            'address_street'        => $p->address_street,
            'address_province_code' => $p->address_province_code,
            'address_city_code'     => $p->address_city_code,
            'address_barangay_code' => $p->address_barangay_code,
            'address_region'        => $p->address_region,
            'address_region_code'   => $p->address_region_code,
            'address_postal_code'   => $p->address_postal_code,
            'address_needs_update'  => $p->address_needs_update,
            'shop_contact_number'   => \App\Support\PhMobile::local($p->shop_contact_number),
            'on_vacation'           => (bool) $p->on_vacation,
            'vacation_started_at'   => $p->vacation_started_at?->toIso8601String(),
            'return_policy'       => $p->return_policy,
            'shipping_policy'     => $p->shipping_policy,
            'business_hours'      => $p->business_hours,
            'response_time'       => $p->response_time,
            'low_stock_threshold' => (int) ($p->low_stock_threshold ?? \App\Models\ProductVariant::LOW_STOCK_THRESHOLD),
            'logo_url'            => $p->logo_path ? asset('storage/' . $p->logo_path) : null,
            'banner_url'          => $p->banner_path ? asset('storage/' . $p->banner_path) : null,
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
