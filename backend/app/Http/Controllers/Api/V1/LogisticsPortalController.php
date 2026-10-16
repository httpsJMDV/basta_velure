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

    /** GET /logistics/dashboard: the network right now and over the last 30 days. */
    public function dashboard(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $hubIds = $this->hubs($company)->pluck('id');
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
                'active'  => Rider::whereIn('sorting_center_id', $hubIds)->where('status', Rider::STATUS_ACTIVE)->count(),
                'pending' => Rider::whereIn('sorting_center_id', $hubIds)->where('status', Rider::STATUS_PENDING)->count(),
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

    /** GET /logistics/riders?status=&search=&hub_id= : the riders of every hub in the network (read-only). */
    public function riders(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $search = trim((string) $request->query('search', ''));

        $riders = Rider::with(['user', 'sortingCenter'])
            ->whereIn('sorting_center_id', $this->hubs($company)->pluck('id'))
            ->when($request->query('hub_id'), fn ($q, $hubId) => $q->where('sorting_center_id', (int) $hubId))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', strtoupper($status)))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('plate_number', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('first_name', 'like', "%{$search}%")->orWhere('last_name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            ->latest('id')
            ->limit(500)
            ->get();

        return response()->json(['data' => $riders->map(fn (Rider $r) => [
            'id'           => $r->id,
            'name'         => $r->user ? trim($r->user->first_name . ' ' . $r->user->last_name) : '—',
            'email'        => $r->user?->email,
            'phone'        => $r->user?->phone,
            'avatar_url'   => $r->user?->avatar_url,
            'status'       => $r->status,
            'vehicle_type' => $r->vehicle_type,
            'plate_number' => $r->plate_number,
            'hub_id'       => $r->sorting_center_id,
            'hub_name'     => $r->sortingCenter?->hub_name,
            'account_status' => $r->user?->status,
        ])->all()]);
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
            ->when($request->boolean('problems'), fn ($q) => $q->whereIn('status', [Parcel::STATUS_DELIVERY_FAILED, Parcel::STATUS_RETURNED]))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', strtoupper($status)))
            ->when($request->query('hub_id'), fn ($q, $hubId) => $q->where('sorting_center_id', (int) $hubId))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('tracking_number', 'like', "%{$search}%")
                ->orWhereHas('order', fn ($o) => $o->where('order_number', 'like', "%{$search}%"))))
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
