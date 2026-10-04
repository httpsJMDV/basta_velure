<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SortingCenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicSortingCenterController extends Controller
{
    /**
     * Return a public list of active approved sorting center hubs.
     *
     * GET /api/v1/logistics/hubs
     */
    public function index(Request $request): JsonResponse
    {
        $query = SortingCenter::where('status', SortingCenter::STATUS_APPROVED)
            ->select(['id', 'hub_name', 'address_city', 'address_province']);

        if ($request->filled('search')) {
            $search = '%' . trim($request->input('search')) . '%';
            $query->where(function ($q) use ($search) {
                $q->where('hub_name', 'like', $search)
                    ->orWhere('address_city', 'like', $search)
                    ->orWhere('address_province', 'like', $search);
            });
        }

        $limit = min(max((int) ($request->input('limit', 100)), 1), 100);
        $hubs = $query->orderBy('hub_name', 'asc')->take($limit)->get();

        return response()->json([
            'data' => $hubs,
        ]);
    }
}
