<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LogisticsCompany;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Services\Courier\ActivityFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The activity logs of the logistics side: a hub's, a courier company's and a rider's. Each lists the newest first,
 * 40 at a time (`next_before` asks for the next page), and can be narrowed to one category or a tracking number.
 * Read only.
 */
class ActivityLogController extends Controller
{
    public function __construct(private readonly ActivityFeed $feed)
    {
    }

    /** GET /api/v1/hub/activity?category=&search=&before= */
    public function hub(Request $request): JsonResponse
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $this->respond($this->feed->forHub($hub, $this->filters($request)));
    }

    /** GET /api/v1/logistics/activity?category=&search=&before= */
    public function company(Request $request): JsonResponse
    {
        /** @var LogisticsCompany $company */
        $company = $request->attributes->get('logistics_company');

        return $this->respond($this->feed->forCompany($company, $this->filters($request)));
    }

    /** GET /api/v1/rider/activity?category=&search=&before= */
    public function rider(Request $request): JsonResponse
    {
        $rider = Rider::where('user_id', $request->user()->id)->firstOrFail();

        return $this->respond($this->feed->forRider($rider, $this->filters($request)));
    }

    /** @return array{category: ?string, search: ?string, before: ?string} */
    private function filters(Request $request): array
    {
        $data = $request->validate([
            'category' => ['nullable', 'string', Rule::in(array_keys(ActivityFeed::CATEGORIES))],
            'search'   => ['nullable', 'string', 'max:60'],
            'before'   => ['nullable', 'date'],
        ]);

        return ['category' => $data['category'] ?? null, 'search' => $data['search'] ?? null, 'before' => $data['before'] ?? null];
    }

    /** @param array{data: list<array<string, mixed>>, next_before: ?string} $page */
    private function respond(array $page): JsonResponse
    {
        return response()->json([
            'data' => $page['data'],
            'meta' => ['next_before' => $page['next_before'], 'categories' => ActivityFeed::categories()],
        ]);
    }
}
