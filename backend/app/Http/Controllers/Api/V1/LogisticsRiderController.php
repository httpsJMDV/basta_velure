<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Logistics\AddRiderRequest;
use App\Models\AuditLog;
use App\Models\DispatchOffer;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Services\Notifier;
use App\Services\RiderOnboarding;
use App\Services\RiderWorkload;
use App\Support\PhMobile;
use App\Support\Validation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * The courier company's riders (Logistics workbook L3, Rider Account Creation): add a rider, resend the activation
 * email, approve or reject a rider waiting for verification, suspend and reactivate, and see who is Online and how
 * many jobs each rider holds. Every action is scoped to the signed-in member's company and the approvals and
 * suspensions are written to the audit log (A35).
 */
class LogisticsRiderController extends Controller
{
    public function __construct(
        private readonly RiderWorkload $workload,
        private readonly RiderOnboarding $onboarding,
    ) {}

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }

    /** @return Builder<Rider> */
    public static function companyRiders(LogisticsCompany $company): Builder
    {
        $hubIds = LogisticsCompany::constrain(SortingCenter::query(), $company->id)->pluck('id');

        return Rider::query()->where(fn ($q) => $q
            ->where('logistics_company_id', $company->id)
            ->orWhere(fn ($w) => $w->whereNull('logistics_company_id')->whereIn('sorting_center_id', $hubIds)));
    }

    private function riderOr404(Request $request, int $rider): Rider
    {
        return self::companyRiders($this->company($request))->with(['user', 'sortingCenter'])->findOrFail($rider);
    }

    /** GET /logistics/riders?status=&search=&availability=online|offline */
    public function index(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $search = trim((string) $request->query('search', ''));

        $riders = self::companyRiders($company)->with(['user', 'sortingCenter'])
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', strtoupper($status)))
            ->when($request->query('hub_id'), fn ($q, $hubId) => $q->where('sorting_center_id', (int) $hubId))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w
                ->where('plate_number', 'like', "%{$search}%")
                ->orWhere('license_number', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('first_name', 'like', "%{$search}%")->orWhere('last_name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            ->orderByRaw("CASE status WHEN 'PENDING' THEN 0 WHEN 'PENDING_ACTIVATION' THEN 1 WHEN 'ACTIVE' THEN 2 WHEN 'SUSPENDED' THEN 3 ELSE 4 END")
            ->latest('id')
            ->limit(500)
            ->get();

        $ids = $riders->pluck('id');
        $jobs = $this->workload->activeJobCounts($ids);
        $today = $this->workload->deliveredToday($ids);

        $rows = $riders->map(fn (Rider $r) => $this->row($r, $jobs[$r->id] ?? 0, $today[$r->id] ?? 0));
        if (in_array($request->query('availability'), ['online', 'offline'], true)) {
            $rows = $rows->filter(fn ($row) => $row['online'] === ($request->query('availability') === 'online'));
        }

        return response()->json([
            'data' => $rows->values()->all(),
            'summary' => [
                'total'              => $riders->count(),
                'online'             => $rows->where('online', true)->count(),
                'active'             => $riders->where('status', Rider::STATUS_ACTIVE)->count(),
                'pending_activation' => $riders->where('status', Rider::STATUS_PENDING_ACTIVATION)->count(),
                'pending_verification' => $riders->filter(fn ($r) => $r->status === Rider::STATUS_PENDING || $r->needs_reverification)->count(),
                'suspended'          => $riders->where('status', Rider::STATUS_SUSPENDED)->count(),
                'max_active_jobs'    => Rider::MAX_ACTIVE_JOBS,
            ],
        ]);
    }

    /** GET /logistics/riders/{rider} */
    public function show(Request $request, int $rider): JsonResponse
    {
        $r = $this->riderOr404($request, $rider);
        $row = $this->row($r, $this->workload->activeJobs($r), $this->workload->deliveredToday([$r->id])[$r->id] ?? 0);

        $row['documents'] = array_values(array_filter([
            $r->drivers_license_path ? ['key' => 'license', 'label' => "Driver's license", 'url' => url("/api/v1/logistics/riders/{$r->id}/documents/license")] : null,
            $r->or_cr_path ? ['key' => 'or-cr', 'label' => 'Vehicle OR/CR', 'url' => url("/api/v1/logistics/riders/{$r->id}/documents/or-cr")] : null,
        ]));
        $row['audit'] = AuditLog::with('actor:id,first_name,last_name')
            ->where('subject_type', 'Rider')->where('subject_id', $r->id)
            ->latest('id')->limit(50)->get()
            ->map(fn (AuditLog $a) => [
                'id' => $a->id, 'action' => $a->action, 'reason' => $a->reason,
                'old_value' => $a->old_value, 'new_value' => $a->new_value,
                'actor' => $a->actor ? trim($a->actor->first_name . ' ' . $a->actor->last_name) : 'System',
                'created_at' => $a->created_at?->toIso8601String(),
            ])->all();

        return response()->json(['data' => $row]);
    }

    /** GET /logistics/riders/{rider}/documents/{license|or-cr} */
    public function document(Request $request, int $rider, string $doc): BinaryFileResponse
    {
        $r = $this->riderOr404($request, $rider);
        $path = $doc === 'license' ? $r->drivers_license_path : ($doc === 'or-cr' ? $r->or_cr_path : null);
        abort_unless($path && Storage::disk('ids')->exists($path), 404, 'Document not found.');

        return response()->file(Storage::disk('ids')->path($path));
    }

    /** POST /logistics/riders: the Add Rider form. */
    public function store(AddRiderRequest $request): JsonResponse
    {
        $company = $this->company($request);
        $rider = $this->onboarding->add($company, $request->user(), $request->validated(), $request->file('drivers_license_image'), $request->file('or_cr_image'));
        $rider->load(['user', 'sortingCenter']);

        return response()->json([
            'message' => 'Rider added. We emailed ' . $rider->user->email . ' a link to set a password; it works for 24 hours.',
            'data'    => $this->row($rider, 0, 0),
        ], 201);
    }

    /** POST /logistics/riders/{rider}/resend-activation: a new link; the previous one stops working. */
    public function resendActivation(Request $request, int $rider): JsonResponse
    {
        $r = $this->riderOr404($request, $rider);
        $this->onboarding->sendActivation($r, $this->company($request));
        AuditLog::record($request->user(), 'rider.activation_resent', $r, companyId: $this->company($request)->id, actorRole: 'logistics');

        return response()->json(['message' => 'A new activation email was sent to ' . $r->user->email . '. The previous link no longer works.']);
    }

    /** POST /logistics/riders/{rider}/approve: a rider waiting for verification (or changed documents) is verified. */
    public function approve(Request $request, int $rider): JsonResponse
    {
        $r = $this->riderOr404($request, $rider);
        abort_unless($r->status === Rider::STATUS_PENDING || ($r->status === Rider::STATUS_ACTIVE && $r->needs_reverification), 409,
            'Only a rider waiting for verification can be approved.');

        $old = ['status' => $r->status, 'needs_reverification' => $r->needs_reverification];
        $r->forceFill([
            'status' => Rider::STATUS_ACTIVE, 'needs_reverification' => false, 'rejection_reason' => null,
            'reviewed_by' => $request->user()->id, 'reviewed_at' => now(),
        ])->save();
        AuditLog::record($request->user(), 'rider.approved', $r, $old, ['status' => Rider::STATUS_ACTIVE, 'needs_reverification' => false],
            companyId: $this->company($request)->id, actorRole: 'logistics');
        app(Notifier::class)->riderDecision($r, true);

        return response()->json(['message' => 'Rider approved. They can go Online now.', 'data' => $this->row($r->fresh(['user', 'sortingCenter']), $this->workload->activeJobs($r), 0)]);
    }

    /** POST /logistics/riders/{rider}/reject {reason} */
    public function reject(Request $request, int $rider): JsonResponse
    {
        $reason = $request->validate(['reason' => Validation::reason()], Validation::reasonMessages())['reason'];
        $r = $this->riderOr404($request, $rider);
        abort_unless($r->status === Rider::STATUS_PENDING || ($r->status === Rider::STATUS_ACTIVE && $r->needs_reverification), 409,
            'Only a rider waiting for verification can be rejected.');

        $old = ['status' => $r->status];
        $r->forceFill([
            'status' => Rider::STATUS_DISAPPROVED, 'is_online' => false, 'rejection_reason' => $reason,
            'reviewed_by' => $request->user()->id, 'reviewed_at' => now(),
        ])->save();
        AuditLog::record($request->user(), 'rider.rejected', $r, $old, ['status' => Rider::STATUS_DISAPPROVED], $reason,
            companyId: $this->company($request)->id, actorRole: 'logistics');
        app(Notifier::class)->riderDecision($r, false, $reason);

        return response()->json(['message' => 'Rider rejected. They were told the reason.']);
    }

    /**
     * POST /logistics/riders/{rider}/suspend {reason}: the rider goes Offline and cannot go Online. Pickups assigned
     * to them that are not picked up yet return to the Unassigned queue; parcels already picked up stay with them
     * (A34).
     */
    public function suspend(Request $request, int $rider): JsonResponse
    {
        $reason = $request->validate(['reason' => Validation::reason()], Validation::reasonMessages())['reason'];
        $r = $this->riderOr404($request, $rider);
        abort_if($r->status === Rider::STATUS_SUSPENDED, 409, 'This rider is already suspended.');
        abort_unless(in_array($r->status, [Rider::STATUS_ACTIVE, Rider::STATUS_PENDING], true), 409, 'Only an active rider can be suspended.');

        $released = DB::transaction(function () use ($request, $r, $reason) {
            $old = ['status' => $r->status, 'online' => $r->is_online];
            $r->forceFill([
                'status' => Rider::STATUS_SUSPENDED, 'is_online' => false,
                'suspended_at' => now(), 'suspension_reason' => $reason,
            ])->save();

            DispatchOffer::where('rider_id', $r->id)->where('status', DispatchOffer::STATUS_OFFERED)
                ->update(['status' => DispatchOffer::STATUS_CANCELLED, 'responded_at' => now()]);

            $jobs = Parcel::where('pickup_rider_id', $r->id)->where('status', Parcel::STATUS_READY_FOR_PICKUP)->lockForUpdate()->get();
            foreach ($jobs as $parcel) {
                $parcel->forceFill([
                    'pickup_rider_id' => null, 'pickup_accepted_at' => null,
                    'dispatch_state' => Parcel::DISPATCH_UNASSIGNED,
                ])->save();
            }

            AuditLog::record($request->user(), 'rider.suspended', $r, $old,
                ['status' => Rider::STATUS_SUSPENDED, 'online' => false, 'released_jobs' => $jobs->pluck('tracking_number')->all()],
                $reason, companyId: $this->company($request)->id, actorRole: 'logistics');

            return $jobs->count();
        });

        app(Notifier::class)->riderSuspended($r, $reason);

        return response()->json([
            'message' => $released > 0
                ? "Rider suspended. {$released} pickup job(s) not yet picked up moved to the Unassigned queue."
                : 'Rider suspended.',
            'released_jobs' => $released,
        ]);
    }

    /** POST /logistics/riders/{rider}/reactivate */
    public function reactivate(Request $request, int $rider): JsonResponse
    {
        $r = $this->riderOr404($request, $rider);
        abort_unless($r->status === Rider::STATUS_SUSPENDED, 409, 'Only a suspended rider can be reactivated.');

        $r->forceFill(['status' => Rider::STATUS_ACTIVE, 'suspended_at' => null, 'suspension_reason' => null])->save();
        AuditLog::record($request->user(), 'rider.reactivated', $r, ['status' => Rider::STATUS_SUSPENDED], ['status' => Rider::STATUS_ACTIVE],
            companyId: $this->company($request)->id, actorRole: 'logistics');

        return response()->json(['message' => 'Rider reactivated. They can go Online again.']);
    }

    /** @return array<string, mixed> */
    private function row(Rider $r, int $activeJobs, int $deliveredToday): array
    {
        $u = $r->user;

        return [
            'id'                    => $r->id,
            'name'                  => $u ? trim($u->first_name . ' ' . $u->last_name) : '—',
            'first_name'            => $u?->first_name,
            'last_name'             => $u?->last_name,
            'email'                 => $u?->email,
            'phone'                 => PhMobile::local($u?->phone),
            'avatar_url'            => $u?->avatar_url,
            'date_of_birth'         => $u?->date_of_birth?->toDateString(),
            'status'                => $r->status,
            'online'                => $r->isAvailable(),
            'last_seen_at'          => $r->last_seen_at?->toIso8601String(),
            'active_jobs'           => $activeJobs,
            'delivered_today'       => $deliveredToday,
            'vehicle_type'          => $r->vehicle_type,
            'plate_number'          => $r->plate_number,
            'license_number'        => $r->license_number,
            'license_expiry'        => $r->license_expiry?->toDateString(),
            'hub_id'                => $r->sorting_center_id,
            'hub_name'              => $r->sortingCenter?->hub_name,
            'needs_reverification'  => (bool) $r->needs_reverification,
            'vehicle_updated_at'    => $r->vehicle_updated_at?->toIso8601String(),
            'rejection_reason'      => $r->rejection_reason,
            'suspension_reason'     => $r->suspension_reason,
            'suspended_at'          => $r->suspended_at?->toIso8601String(),
            'activation_sent_at'    => $r->activation_sent_at?->toIso8601String(),
            'activation_expires_at' => $r->activation_expires_at?->toIso8601String(),
            'activated_at'          => $r->activated_at?->toIso8601String(),
            'account_status'        => $u?->status,
            'created_at'            => $r->created_at?->toIso8601String(),
        ];
    }
}
