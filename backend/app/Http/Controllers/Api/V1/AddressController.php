<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Address;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AddressController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $addresses = $request->user()->addresses()->orderByDesc('is_default')->orderByDesc('created_at')->get();
        return response()->json(['data' => $addresses]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! $request->has('district')) {
            if ($request->filled('city')) $request->merge(['district' => $request->input('city')]);
            elseif ($request->filled('city_municipality')) $request->merge(['district' => $request->input('city_municipality')]);
        }
        if (! $request->has('ward')) {
            if ($request->filled('barangay')) $request->merge(['ward' => $request->input('barangay')]);
        }

        $data = $request->validate([
            'full_name'     => ['required', 'string', 'max:100'],
            'phone'         => ['required', 'string', 'max:20'],
            'address'       => ['required', 'string', 'max:255'],
            'floor_unit'    => ['nullable', 'string', 'max:100'],
            'province'      => ['required', 'string', 'max:100'],
            'district'      => ['required', 'string', 'max:100'],
            'ward'          => ['required', 'string', 'max:100'],
            'province_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'city_code'     => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'barangay_code' => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'label'         => ['required', 'in:home,office'],
            'is_default'    => ['boolean'],
        ]);

        $user = $request->user();

        if ($user->addresses()->count() >= 5) {
            return response()->json(['message' => 'You can only save up to 5 addresses.'], 422);
        }

        $address = DB::transaction(function () use ($user, $data) {
            if (!empty($data['is_default'])) {
                $user->addresses()->update(['is_default' => false]);
            }
            // First address is always default
            if ($user->addresses()->count() === 0) {
                $data['is_default'] = true;
            }
            return $user->addresses()->create($data);
        });

        return response()->json(['data' => $address], 201);
    }

    public function update(Request $request, Address $address): JsonResponse
    {
        $this->authorizeAddress($request, $address);

        if (! $request->has('district')) {
            if ($request->filled('city')) $request->merge(['district' => $request->input('city')]);
            elseif ($request->filled('city_municipality')) $request->merge(['district' => $request->input('city_municipality')]);
        }
        if (! $request->has('ward')) {
            if ($request->filled('barangay')) $request->merge(['ward' => $request->input('barangay')]);
        }

        $rules = [
            'full_name'  => ['sometimes', 'string', 'max:100'],
            'phone'      => ['sometimes', 'string', 'max:20'],
            'address'    => ['sometimes', 'string', 'max:255'],
            'floor_unit' => ['nullable', 'string', 'max:100'],
            'province'   => ['sometimes', 'string', 'max:100'],
            'district'   => ['sometimes', 'string', 'max:100'],
            'ward'       => ['sometimes', 'string', 'max:100'],
            'label'      => ['sometimes', 'in:home,office'],
        ];

        $locationFields = ['province', 'district', 'ward', 'address', 'province_code', 'city_code', 'barangay_code'];
        if ($request->hasAny($locationFields)) {
            $rules['province_code'] = ['required', 'string', 'regex:/^\d{9,10}$/'];
            $rules['city_code']     = ['required', 'string', 'regex:/^\d{9,10}$/'];
            $rules['barangay_code'] = ['required', 'string', 'regex:/^\d{9,10}$/'];
        }

        $data = $request->validate($rules);

        $address->update($data);
        return response()->json(['data' => $address->fresh()]);
    }

    public function destroy(Request $request, Address $address): JsonResponse
    {
        $this->authorizeAddress($request, $address);
        $address->delete();
        return response()->json(null, 204);
    }

    public function setDefault(Request $request, Address $address): JsonResponse
    {
        $this->authorizeAddress($request, $address);

        DB::transaction(function () use ($request, $address) {
            $request->user()->addresses()->update(['is_default' => false]);
            $address->update(['is_default' => true]);
        });

        return response()->json(['data' => $address->fresh()]);
    }

    private function authorizeAddress(Request $request, Address $address): void
    {
        abort_if($address->user_id !== $request->user()->id, 403);
    }
}
