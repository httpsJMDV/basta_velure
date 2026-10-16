<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
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
            ->with('logisticsCompany:id,name,code')
            ->select(['id', 'hub_name', 'address_city', 'address_province', 'logistics_company_id']);

        if ($request->filled('search')) {
            $search = '%' . trim($request->input('search')) . '%';
            $query->where(function ($q) use ($search) {
                $q->where('hub_name', 'like', $search)
                    ->orWhere('address_city', 'like', $search)
                    ->orWhere('address_province', 'like', $search);
            });
        }
        if ($request->filled('courier_id')) {
            LogisticsCompany::constrain($query, (int) $request->input('courier_id'));
        }

        $limit = min(max((int) ($request->input('limit', 100)), 1), 100);
        $hubs = $query->orderBy('hub_name', 'asc')->take($limit)->get();
        $default = LogisticsCompany::defaultId() ? LogisticsCompany::find(LogisticsCompany::defaultId(), ['id', 'name', 'code']) : null;

        return response()->json([
            'data' => $hubs->map(fn (SortingCenter $h) => [
                'id'               => $h->id,
                'hub_name'         => $h->hub_name,
                'address_city'     => $h->address_city,
                'address_province' => $h->address_province,
                // The courier company the hub belongs to (hubs without one are the default courier's).
                'courier'          => ($c = $h->logisticsCompany ?? $default) ? ['id' => $c->id, 'name' => $c->name, 'code' => $c->code] : null,
            ])->all(),
        ]);
    }

    /**
     * GET /logistics/couriers : approved courier companies, the choices at checkout and on the hub application.
     * The courier with the biggest network comes first.
     */
    public function couriers(): JsonResponse
    {
        $couriers = LogisticsCompany::where('status', LogisticsCompany::STATUS_APPROVED)
            ->withCount(['hubs as hubs_count' => fn ($q) => $q->where('status', SortingCenter::STATUS_APPROVED)])
            ->orderByDesc('hubs_count')->orderBy('name')
            ->get();

        return response()->json(['data' => $couriers->map(fn (LogisticsCompany $c) => [
            'id'          => $c->id,
            'name'        => $c->name,
            'code'        => $c->code,
            'logo_url'    => $c->logo_url,
            'hubs_count'  => (int) $c->hubs_count,
        ])->all()]);
    }
}
