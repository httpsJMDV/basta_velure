<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LogisticsCompanyResource;
use App\Http\Resources\SortingCenterApplicationResource;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Services\HubApplicationReviewer;
use App\Services\HubReportService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * The courier company's own portal (/logistics): its network of hubs, their riders and parcels. Every query is
 * scoped to the signed-in member's company (EnsureLogisticsMember); another company's hub is a 404.
 */
class LogisticsPortalController extends Controller
{
    public function __construct(private readonly HubReportService $reports) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** @return Builder<SortingCenter> */
    private function hubs(LogisticsCompany $company): Builder
    {
        return LogisticsCompany::constrain(SortingCenter::query(), $company->id);
    }

    /** @return Builder<Parcel> */
    private function networkParcels(LogisticsCompany $company): Builder
    {
        return LogisticsCompany::constrain(Parcel::query(), $company->id);
    }

    private function hubOr404(LogisticsCompany $company, int $hubId): SortingCenter
    {
        return $this->hubs($company)->with('user')->findOrFail($hubId);
    }

    /** GET /logistics/me */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => (new LogisticsCompanyResource($this->company($request)))->full()]);
    }

    /**
     * GET /logistics/dashboard?from=&to= : the network right now, and the shipments of a period (L1): by default
     * the last 30 days; from/to are Manila dates and both days are included.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $window = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to'   => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], ['to.after_or_equal' => 'The end date cannot be before the start date.']);
        $company = $this->company($request);
        $to = \Carbon\CarbonImmutable::parse($window['to'] ?? now('Asia/Manila')->toDateString(), 'Asia/Manila');
        $from = \Carbon\CarbonImmutable::parse($window['from'] ?? $to->subDays(29)->toDateString(), 'Asia/Manila');
        $range = [$from->startOfDay()->utc(), $to->endOfDay()->utc()];
        $inRange = fn (string $column) => $this->networkParcels($company)->whereBetween($column, $range)->count();
        $byStatus = $this->hubs($company)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $parcelStatus = $this->networkParcels($company)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $since = now()->subDays(30);

        $count = fn (array $statuses) => (int) collect($statuses)->sum(fn ($s) => $parcelStatus[$s] ?? 0);

        return response()->json(['data' => [
            'hubs' => [
                'approved'  => (int) ($byStatus[SortingCenter::STATUS_APPROVED] ?? 0),
                'pending'   => (int) ($byStatus[SortingCenter::STATUS_PENDING] ?? 0),
                'suspended' => (int) ($byStatus[SortingCenter::STATUS_SUSPENDED] ?? 0),
                'rejected'  => (int) ($byStatus[SortingCenter::STATUS_REJECTED] ?? 0),
            ],
            'riders' => [
                'active'  => LogisticsRiderController::companyRiders($company)->where('status', Rider::STATUS_ACTIVE)->count(),
                'pending' => LogisticsRiderController::companyRiders($company)->whereIn('status', [Rider::STATUS_PENDING, Rider::STATUS_PENDING_ACTIVATION])->count(),
                'online'  => LogisticsRiderController::companyRiders($company)->where('status', Rider::STATUS_ACTIVE)->where('is_online', true)
                    ->where('last_seen_at', '>', now()->subMinutes(Rider::PRESENCE_TIMEOUT_MINUTES))->count(),
            ],
            'parcels_now' => [
                'awaiting_pickup'  => $count([Parcel::STATUS_READY_FOR_PICKUP, Parcel::STATUS_PICKED_UP]),
                'at_hubs'          => $count([Parcel::STATUS_AT_SORTING_CENTER, Parcel::STATUS_SORTED]),
                'out_for_delivery' => $count([Parcel::STATUS_ASSIGNED_TO_RIDER, Parcel::STATUS_OUT_FOR_DELIVERY]),
                'failed'           => $count([Parcel::STATUS_DELIVERY_FAILED]),
            ],
            'last_30_days' => [
                'delivered' => $this->networkParcels($company)->where('delivered_at', '>=', $since)->count(),
                'returned'  => $this->networkParcels($company)->where('returned_at', '>=', $since)->count(),
            ],
            'period' => [
                'from'      => $from->toDateString(),
                'to'        => $to->toDateString(),
                'shipments' => $inRange('ready_at'),
                'picked_up' => $inRange('picked_up_at'),
                'delivered' => $inRange('delivered_at'),
                'failed'    => \App\Models\DeliveryLog::whereIn('parcel_id', $this->networkParcels($company)->select('id'))
                    ->where('outcome', \App\Models\DeliveryLog::OUTCOME_DELIVERY_FAILED)->whereBetween('logged_at', $range)->count(),
                'returned'  => $inRange('returned_at'),
                'cod_collected' => round((float) $this->networkParcels($company)->whereBetween('cod_collected_at', $range)->sum(\Illuminate\Support\Facades\DB::raw('COALESCE(cod_collected_amount, cod_amount)')), 2),
            ],
        ]]);
    }

    /** GET /logistics/hubs?status=&search= : every hub of the network, applications included. */
    public function hubsIndex(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $status = strtoupper((string) $request->query('status', 'ALL'));
        $search = trim((string) $request->query('search', ''));

        $hubs = $this->hubs($company)->with('user')
            ->withCount(['parcels as active_parcels' => fn ($q) => $q->whereNotIn('status', [Parcel::STATUS_DELIVERED, Parcel::STATUS_RETURNED])])
            ->when($status !== 'ALL', fn ($q) => $q->where('status', $status))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('hub_name', 'like', "%{$search}%")
                ->orWhere('address_city', 'like', "%{$search}%")
                ->orWhere('address_province', 'like', "%{$search}%")))
            ->orderByRaw("CASE status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'SUSPENDED' THEN 2 ELSE 3 END")
            ->latest('id')
            ->get();

        $riders = Rider::whereIn('sorting_center_id', $hubs->pluck('id'))->where('status', Rider::STATUS_ACTIVE)
            ->selectRaw('sorting_center_id, count(*) as n')->groupBy('sorting_center_id')->pluck('n', 'sorting_center_id');

        return response()->json(['data' => $hubs->map(fn (SortingCenter $h) => [
            'id'               => $h->id,
            'hub_name'         => $h->hub_name,
            'status'           => $h->status,
            'city_province'    => trim($h->address_city . ', ' . $h->address_province, ', '),
            'coverage_count'   => count($h->coverage_barangays ?? []),
            'active_riders'    => (int) ($riders[$h->id] ?? 0),
            'active_parcels'   => (int) $h->active_parcels,
            'applicant_name'   => $h->user ? trim($h->user->first_name . ' ' . $h->user->last_name) : null,
            'applicant_email'  => $h->user?->email,
            'applicant_avatar_url' => $h->user?->avatar_url,
            'rejection_reason' => $h->rejection_reason,
            'submitted_at'     => $h->created_at?->toIso8601String(),
        ])->all()]);
    }

    /** GET /logistics/hubs/{hub}: the full application, with links to its documents in this portal. */
    public function hubShow(Request $request, int $hub): JsonResponse
    {
        $hub = $this->hubOr404($this->company($request), $hub);
        $data = (new SortingCenterApplicationResource($hub))->resolve();
        $data['dti_permit_url'] = $hub->dti_permit_path ? url("/api/v1/logistics/network/hubs/{$hub->id}/documents/permit") : null;
        if (isset($data['applicant'])) {
            $data['applicant']['government_id_image_url'] = $hub->user?->government_id_image_path ? url("/api/v1/logistics/network/hubs/{$hub->id}/documents/id") : null;
            $data['applicant']['government_id_image_back_url'] = $hub->user?->government_id_image_back_path ? url("/api/v1/logistics/network/hubs/{$hub->id}/documents/id-back") : null;
        }

        return response()->json(['data' => $data]);
    }

    /** GET /logistics/hubs/{hub}/documents/{doc} : permit | id | id-back, from private storage. */
    public function hubDocument(Request $request, int $hub, string $doc): BinaryFileResponse
    {
        $hub = $this->hubOr404($this->company($request), $hub);
        $path = match ($doc) {
            'permit'  => $hub->dti_permit_path,
            'id'      => $hub->user?->government_id_image_path,
            'id-back' => $hub->user?->government_id_image_back_path,
            default   => null,
        };
        abort_unless($path && Storage::disk('ids')->exists($path), 404, 'Document not found.');

        return response()->file(Storage::disk('ids')->path($path));
    }

    public function approveHub(Request $request, int $hub, HubApplicationReviewer $reviewer): JsonResponse
    {
        $reviewer->approve($this->hubOr404($this->company($request), $hub), $request->user());

        return response()->json(['message' => 'Hub approved.']);
    }

    public function rejectHub(Request $request, int $hub, HubApplicationReviewer $reviewer): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];
        $reviewer->reject($this->hubOr404($this->company($request), $hub), $request->user(), $reason);

        return response()->json(['message' => 'Hub rejected.']);
    }

    public function suspendHub(Request $request, int $hub, HubApplicationReviewer $reviewer): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];
        $reviewer->suspend($this->hubOr404($this->company($request), $hub), $request->user(), $reason);

        return response()->json(['message' => 'Hub suspended.']);
    }

    public function reactivateHub(Request $request, int $hub, HubApplicationReviewer $reviewer): JsonResponse
    {
        $reviewer->reactivate($this->hubOr404($this->company($request), $hub), $request->user());

        return response()->json(['message' => 'Hub reactivated.']);
    }

    /**
     * GET /logistics/parcels?search=&status=&hub_id=&problems=1 : any parcel in the network, by tracking or order
     * number. problems=1 lists failed deliveries and returns.
     */
    public function parcels(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $search = trim((string) $request->query('search', ''));

        $parcels = $this->networkParcels($company)->with(['order:id,order_number,payment_method,total', 'sortingCenter:id,hub_name'])
            ->when($request->boolean('problems'), fn ($q) => $q->whereIn('status', [Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURN_TO_SENDER, Parcel::STATUS_RETURNED, Parcel::STATUS_LOST, Parcel::STATUS_DAMAGED]))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', strtoupper($status)))
            ->when($request->query('hub_id'), fn ($q, $hubId) => $q->where('sorting_center_id', (int) $hubId))
            // Tracking number, order number, order ID or the buyer's name (L6). A number on its own is an order ID and
            // matches exactly. Every value is a bound parameter.
            ->when($search !== '' && ctype_digit($search), fn ($q) => $q->where('order_id', (int) $search))
            ->when($search !== '' && ! ctype_digit($search), fn ($q) => $q->where(fn ($w) => $w
                ->where('tracking_number', 'like', '%' . addcslashes($search, '%_\\') . '%')
                ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', '%' . addcslashes($search, '%_\\') . '%')
                    ->orWhereHas('buyer', fn ($b) => $b->whereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ['%' . addcslashes($search, '%_\\') . '%'])))))
            ->latest('id')
            ->paginate(min(100, max(1, (int) $request->query('per_page', 30))));

        return response()->json([
            'data' => $parcels->getCollection()->map(fn (Parcel $p) => [
                'id'              => $p->id,
                'tracking_number' => $p->tracking_number,
                'status'          => $p->status,
                'order_number'    => $p->order?->order_number,
                'payment_method'  => $p->order?->payment_method,
                'cod_amount'      => $p->order?->payment_method === 'cod' ? (float) $p->order->total : null,
                'hub_id'          => $p->sorting_center_id,
                'hub_name'        => $p->sortingCenter?->hub_name,
                'barangay'        => $p->destination_barangay,
                'order_id'        => $p->order_id,
                'attempts'        => (int) $p->delivery_attempts,
                'updated_at'      => $p->updated_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $parcels->currentPage(), 'last_page' => $parcels->lastPage(), 'per_page' => $parcels->perPage(),
                'total' => $parcels->total(), 'from' => $parcels->firstItem(), 'to' => $parcels->lastItem(),
            ],
        ]);
    }

    /** GET /logistics/reports?from=&to= : every approved hub's figures side by side, plus network totals. */
    public function reports(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to'   => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $to = $data['to'] ?? $this->reports->today();
        $from = $data['from'] ?? \Carbon\Carbon::parse($to)->subDays(29)->format('Y-m-d');
        $range = $this->reports->range($from, $to);

        $rows = [];
        $keys = ['received', 'delivered', 'failed_attempts', 'returned', 'on_time_deliveries'];
        $totals = array_fill_keys($keys, 0);
        foreach ($this->hubs($this->company($request))->where('status', SortingCenter::STATUS_APPROVED)->orderBy('hub_name')->get() as $hub) {
            $t = $this->reports->summary($hub, $range)['totals'];
            $rows[] = ['hub_id' => $hub->id, 'hub_name' => $hub->hub_name] + $t;
            foreach ($keys as $k) {
                $totals[$k] += (int) $t[$k];
            }
        }
        $totals['on_time_rate'] = $totals['delivered'] > 0 ? round($totals['on_time_deliveries'] / $totals['delivered'], 4) : null;
        $totals['success_rate'] = ($totals['delivered'] + $totals['failed_attempts']) > 0
            ? round($totals['delivered'] / ($totals['delivered'] + $totals['failed_attempts']), 4) : null;

        return response()->json(['data' => [
            'range'     => ['from' => $range['from'], 'to' => $range['to'], 'days' => $range['days']],
            'sla_hours' => $this->reports->slaHours(),
            'totals'    => $totals,
            'hubs'      => $rows,
        ]]);
    }
}
