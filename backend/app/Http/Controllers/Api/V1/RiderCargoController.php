<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ReturnPickup;
use App\Models\Rider;
use App\Services\Courier\PickupPolicy;
use App\Services\RiderCargo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RiderCargoController extends Controller
{
    private function hub(Request $request)
    {
        return $request->is('api/v1/hub/*') ? $request->user()->sortingCenter : null;
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company') ?? LogisticsCompany::findOrFail(LogisticsCompany::effectiveId($this->hub($request)?->logistics_company_id));
    }

    private function riders(Request $request)
    {
        return LogisticsRiderController::companyRiders($this->company($request))->carriesParcels()
            ->when($this->hub($request), fn ($q, $hub) => $q->where('sorting_center_id', $hub->id));
    }

    public function index(Request $request, RiderCargo $cargo): JsonResponse
    {
        $search = trim((string) ($request->validate(['search' => ['nullable', 'string', 'max:100']])['search'] ?? ''));
        $like = '%'.addcslashes($search, '%_\\').'%';

        return response()->json(['data' => $this->riders($request)->with('user')
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('plate_number', 'like', $like)
                ->orWhereHas('user', fn ($u) => $u->where('first_name', 'like', $like)->orWhere('last_name', 'like', $like)
                    ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like]))))
            ->latest('id')->limit(100)->get()->map(fn ($r) => [
                'id' => $r->id, 'name' => trim($r->user?->first_name.' '.$r->user?->last_name),
                'vehicle_type' => $r->vehicle_type, 'plate_number' => $r->plate_number,
                'capacity' => ['mode' => $cargo->reviewed($r) ? 'weight' : 'legacy', 'capacity_kg' => $r->cargo_configuration['usable_cargo_kg'] ?? null],
            ])]);
    }

    public function show(Request $request, int $rider, RiderCargo $cargo): JsonResponse
    {
        return response()->json(['data' => $cargo->profile($this->riders($request)->findOrFail($rider))]);
    }

    public function mine(Request $request, RiderCargo $cargo): JsonResponse
    {
        return response()->json(['data' => $cargo->profile(Rider::where('user_id', $request->user()->id)->firstOrFail())]);
    }

    public function review(Request $request, int $rider, RiderCargo $cargo): JsonResponse
    {
        abort_if($this->hub($request) !== null, 403, 'Only courier-company staff can review or increase a vehicle cargo allowance.');
        $values = $request->validate([
            'registered_payload_kg' => ['required', 'numeric', 'gt:0', 'max:100000'],
            'manufacturer_payload_kg' => ['required', 'numeric', 'gt:0', 'max:100000'],
            'rider_gear_kg' => ['required', 'numeric', 'gt:0', 'max:1000'],
            'carrier_rating_kg' => ['required', 'numeric', 'gt:0', 'max:100000'],
            'empty_carrier_kg' => ['required', 'numeric', 'min:0', 'max:10000'],
            'length_cm' => ['required', 'numeric', 'gt:0', 'max:1500'],
            'width_cm' => ['required', 'numeric', 'gt:0', 'max:500'],
            'height_cm' => ['required', 'numeric', 'gt:0', 'max:500'],
            'carrier_type' => ['required', Rule::in(['manufacturer', 'custom', 'vehicle_bay'])],
            'source_note' => ['required', 'string', 'min:20', 'max:1000'],
            'reviewed_documents_and_mounting' => ['required', 'accepted'],
        ]);
        $usable = min((float) $values['registered_payload_kg'], (float) $values['manufacturer_payload_kg']) - $values['rider_gear_kg'] - $values['empty_carrier_kg'];
        $usable = floor(min($usable, $values['carrier_rating_kg'] - $values['empty_carrier_kg']) * 1000) / 1000;
        if ($usable <= 0) {
            throw ValidationException::withMessages(['rider_gear_kg' => 'The documented ratings leave no cargo allowance after the rider, gear and empty carrier.']);
        }

        return DB::transaction(function () use ($request, $rider, $values, $usable, $cargo) {
            $r = $this->riders($request)->lockForUpdate()->findOrFail($rider);
            if ($r->vehicle_type === Rider::VEHICLE_MOTORCYCLE && $values['carrier_type'] === 'custom'
                && max($values['length_cm'], $values['width_cm'], $values['height_cm']) > 60.96) {
                throw ValidationException::withMessages(['length_cm' => 'Custom motorcycle top boxes must remain within the LTO 2 ft (60.96 cm) limit per side. Verify external dimensions, inspection and registration as well.']);
            }
            if ($r->vehicle_type === Rider::VEHICLE_MOTORCYCLE && $values['carrier_type'] === 'vehicle_bay') {
                throw ValidationException::withMessages(['carrier_type' => 'Choose the motorcycle carrier type. A motorcycle has no van cargo bay.']);
            }
            $config = [...$values, 'usable_cargo_kg' => $usable];
            $r->forceFill(['cargo_configuration' => $config, 'cargo_verified_at' => now(), 'cargo_verified_by' => $request->user()->id,
                'cargo_vehicle_signature' => $cargo->signature($r)])->save();
            AuditLog::record($request->user(), 'rider.cargo_reviewed', $r, null, $config, companyId: $this->company($request)->id, actorRole: $this->hub($request) ? 'hub' : 'logistics');

            return response()->json(['data' => $cargo->profile($r), 'message' => 'Reviewed cargo limits saved. Measured packages can now be assigned by weight and space.']);
        });
    }

    public function measure(Request $request): JsonResponse
    {
        $values = $request->validate([
            'kind' => ['required', Rule::in(['parcel', 'return'])], 'code' => ['required', 'string', 'max:64'],
            'weight_kg' => ['required', 'numeric', 'gt:0', 'max:100000'],
            'length_cm' => ['required', 'numeric', 'gt:0', 'max:1500'], 'width_cm' => ['required', 'numeric', 'gt:0', 'max:500'], 'height_cm' => ['required', 'numeric', 'gt:0', 'max:500'],
        ]);

        return DB::transaction(function () use ($request, $values) {
            $company = $this->company($request);
            $hub = $this->hub($request);
            $query = $values['kind'] === 'parcel' ? Parcel::where('tracking_number', strtoupper(trim($values['code']))) : ReturnPickup::where('code', strtoupper(trim($values['code'])));
            $job = LogisticsCompany::constrain($query, $company->id)->lockForUpdate()->firstOrFail();
            if ($hub) {
                $allowed = $job instanceof Parcel
                    ? (int) $job->sorting_center_id === $hub->id || app(PickupPolicy::class)->originHub($job)?->id === $hub->id
                    : in_array($hub->id, array_map('intval', [$job->sorting_center_id, $job->current_hub_id, $job->destination_hub_id]), true);
                abort_unless($allowed, 404, 'This package is not handled by your hub.');
            }
            $measurements = array_intersect_key($values, array_flip(['weight_kg', 'length_cm', 'width_cm', 'height_cm']));
            $old = $job->load_measurements;
            $job->forceFill(['load_measurements' => $measurements, 'load_measured_by' => $request->user()->id, 'load_measured_at' => now()])->save();
            AuditLog::record($request->user(), 'cargo.package_measured', $job, $old, $measurements, companyId: $company->id, actorRole: $hub ? 'hub' : 'logistics');

            return response()->json(['message' => 'Packed measurements saved. Shipping charges are unchanged.', 'data' => $measurements]);
        });
    }
}
