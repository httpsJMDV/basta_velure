<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\SortingCenter;
use App\Services\Courier\Dispatcher;
use App\Services\Courier\PickupPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PickupControlController extends Controller
{
    public function __construct(private readonly PickupPolicy $policy, private readonly Dispatcher $dispatcher) {}

    private function hub(Request $request): ?SortingCenter
    {
        return $request->is('api/v1/hub/*') ? $request->user()->sortingCenter : null;
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company')
            ?? LogisticsCompany::findOrFail(LogisticsCompany::effectiveId($this->hub($request)?->logistics_company_id));
    }

    public function show(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $company = $this->company($request);
        $target = $hub ?? $company;
        $settings = [];
        foreach (['auto_seller_pickups', 'auto_return_pickups'] as $field) {
            $settings[$field] = [
                'value' => $target->{$field} === null ? null : (bool) $target->{$field},
                'effective' => $this->policy->enabled($company->id, $hub, $field),
                'company_default' => (bool) $company->{$field},
            ];
        }

        return response()->json(['data' => ['scope' => $hub ? 'hub' : 'logistics', 'name' => $hub?->hub_name ?? $company->name, 'settings' => $settings]]);
    }

    public function update(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $company = $this->company($request);
        $rule = $hub ? ['present', 'nullable', 'boolean'] : ['required', 'boolean'];
        $values = $request->validate(['auto_seller_pickups' => $rule, 'auto_return_pickups' => $rule]);
        DB::transaction(function () use ($request, $hub, $company, $values) {
            $target = $hub ? SortingCenter::lockForUpdate()->findOrFail($hub->id) : LogisticsCompany::lockForUpdate()->findOrFail($company->id);
            $old = $target->only(array_keys($values));
            $target->forceFill($values)->save();
            AuditLog::record($request->user(), 'dispatch.settings_changed', $target, $old, $values, companyId: $company->id, actorRole: $hub ? 'hub' : 'logistics');
            $this->policy->reconcileOffers($company->id);
        });
        // Invalidate the authenticated request's cached profile before returning effective values.
        $request->user()->unsetRelation('sortingCenter');
        $request->attributes->set('logistics_company', $company->fresh());

        return $this->show($request);
    }

    public function jobs(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $company = $this->company($request);
        $this->dispatcher->expireDue();
        $rows = LogisticsCompany::constrain(Parcel::query(), $company->id)
            ->where('status', Parcel::STATUS_READY_FOR_PICKUP)->with('pickupRider.user')->orderBy('id')->get()
            ->filter(fn ($p) => ! $hub || $this->policy->originHub($p)?->id === $hub->id)
            ->take(200)->map(fn ($p) => [
                'id' => $p->id, 'tracking_number' => $p->tracking_number,
                'shop' => $p->pickup_address_snapshot['shop_name'] ?? 'Seller pickup',
                'address' => $p->pickup_address_snapshot['full_address'] ?? $p->pickup_barangay,
                'rider' => $p->pickupRider?->user?->first_name,
                'state' => $p->dispatch_state ?? 'unassigned',
                'pickup_date' => $p->pickup_date, 'pickup_window' => $p->pickup_window,
            ])->values();

        return response()->json(['data' => $rows]);
    }

    public function riders(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        $company = $this->company($request);
        $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->findOrFail($request->integer('parcel_id'));
        abort_if($hub && $this->policy->originHub($parcel)?->id !== $hub->id, 404);

        return response()->json(['data' => $this->dispatcher->eligibleRiders($parcel)
            ->filter(fn ($row) => ! $hub || (int) $row['rider']->sorting_center_id === $hub->id)
            ->map(fn ($row) => ['id' => $row['rider']->id, 'name' => Dispatcher::name($row['rider']), 'jobs' => $row['active_jobs'], 'distance' => $row['distance']])->values()]);
    }

    public function assign(Request $request): JsonResponse
    {
        $values = $request->validate(['parcel_id' => ['required', 'integer'], 'rider_id' => ['required', 'integer']]);
        $hub = $this->hub($request);
        $company = $this->company($request);
        DB::transaction(function () use ($request, $values, $hub, $company) {
            $parcel = LogisticsCompany::constrain(Parcel::query(), $company->id)->lockForUpdate()->findOrFail($values['parcel_id']);
            abort_if($hub && $this->policy->originHub($parcel)?->id !== $hub->id, 404);
            $rider = LogisticsRiderController::companyRiders($company)->carriesParcels()
                ->when($hub, fn ($q) => $q->where('sorting_center_id', $hub->id))->findOrFail($values['rider_id']);
            $this->dispatcher->assign($company, $parcel->id, $rider, $request->user());
        });

        return response()->json(['message' => 'Pickup rider assigned. Existing offers have been closed.']);
    }
}
