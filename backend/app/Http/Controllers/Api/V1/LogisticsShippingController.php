<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\ShippingZoneArea;
use App\Services\Commerce\ShippingCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * A courier's delivery zones and shipping rates (L8). A zone covers regions, provinces or cities, and can carve one
 * out (Batanes out of Luzon). A rate is the fee from one zone to another: the first kilogram and each additional
 * kilogram, each more than ₱0. Every rate change is in the audit log (A35); it applies to checkouts started after
 * it, and placed orders keep the fee they were charged.
 */
class LogisticsShippingController extends Controller
{
    private const MONEY = ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:100000'];
    private const MONEY_MESSAGES = [
        'first_kg.required' => 'Enter the fee for the first kilogram.',
        'first_kg.numeric' => 'Enter the fee as a number, like 50 or 49.50.',
        'first_kg.gt' => 'The fee must be more than ₱0.',
        'first_kg.decimal' => 'The fee can have at most 2 decimal places.',
        'additional_kg.required' => 'Enter the fee for each additional kilogram.',
        'additional_kg.numeric' => 'Enter the fee as a number, like 15 or 14.50.',
        'additional_kg.gt' => 'The fee must be more than ₱0.',
        'additional_kg.decimal' => 'The fee can have at most 2 decimal places.',
    ];

    /** GET /logistics/shipping */
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->table($this->company($request))]);
    }

    /** POST /logistics/shipping/zones {name, areas: [{level, psgc_code, name, excluded?}]} */
    public function storeZone(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $data = $this->zoneInput($request, $company);
        DB::transaction(function () use ($company, $data, $request) {
            $zone = ShippingZone::create(['logistics_company_id' => $company->id, 'name' => $data['name']]);
            $this->saveAreas($zone, $data['areas']);
            AuditLog::record($request->user(), 'shipping.zone_created', $zone, null, ['name' => $zone->name, 'areas' => $data['areas']], null, $company->id, 'logistics');
        });

        return response()->json(['message' => "Zone \"{$data['name']}\" added. Add its rates so checkout can use it.", 'data' => $this->table($company)], 201);
    }

    /** PATCH /logistics/shipping/zones/{zone} */
    public function updateZone(Request $request, int $zone): JsonResponse
    {
        $company = $this->company($request);
        $z = ShippingZone::with('areas')->where('logistics_company_id', $company->id)->findOrFail($zone);
        $data = $this->zoneInput($request, $company, $z);
        DB::transaction(function () use ($z, $data, $request, $company) {
            $old = ['name' => $z->name, 'areas' => $z->areas->map->only(['level', 'psgc_code', 'name', 'excluded'])->all()];
            $z->update(['name' => $data['name']]);
            $this->saveAreas($z, $data['areas']);
            AuditLog::record($request->user(), 'shipping.zone_updated', $z, $old, ['name' => $data['name'], 'areas' => $data['areas']], null, $company->id, 'logistics');
        });

        return response()->json(['message' => 'Zone saved.', 'data' => $this->table($company)]);
    }

    /** DELETE /logistics/shipping/zones/{zone}: its rates go with it. */
    public function destroyZone(Request $request, int $zone): JsonResponse
    {
        $company = $this->company($request);
        $z = ShippingZone::where('logistics_company_id', $company->id)->findOrFail($zone);
        AuditLog::record($request->user(), 'shipping.zone_deleted', $z, ['name' => $z->name], null, null, $company->id, 'logistics');
        $z->delete();

        return response()->json(['message' => 'Zone deleted.', 'data' => $this->table($company)]);
    }

    /** PUT /logistics/shipping/rates {origin_zone_id, destination_zone_id, first_kg, additional_kg} */
    public function upsertRate(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $own = Rule::exists('shipping_zones', 'id')->where('logistics_company_id', $company->id);
        $data = $request->validate([
            'origin_zone_id'      => ['required', 'integer', $own],
            'destination_zone_id' => ['required', 'integer', $own],
            'first_kg'            => self::MONEY,
            'additional_kg'       => self::MONEY,
            'reason'              => ['nullable', 'string', 'max:200'],
        ], self::MONEY_MESSAGES + ['origin_zone_id.exists' => 'Choose one of your zones.', 'destination_zone_id.exists' => 'Choose one of your zones.']);

        $rate = ShippingRate::firstOrNew(['origin_zone_id' => $data['origin_zone_id'], 'destination_zone_id' => $data['destination_zone_id']]);
        // The route goes into the audit entry, so the history still reads "NCR → Luzon" after a zone is renamed or deleted.
        $route = $this->routeName((int) $data['origin_zone_id'], (int) $data['destination_zone_id']);
        $old = $rate->exists ? ['route' => $route, 'first_kg' => (float) $rate->first_kg, 'additional_kg' => (float) $rate->additional_kg] : null;
        $rate->fill(['logistics_company_id' => $company->id, 'first_kg' => $data['first_kg'], 'additional_kg' => $data['additional_kg']])->save();
        $new = ['route' => $route, 'first_kg' => (float) $rate->first_kg, 'additional_kg' => (float) $rate->additional_kg];
        if ($old !== $new) {
            AuditLog::record($request->user(), $old ? 'shipping.rate_changed' : 'shipping.rate_added', $rate, $old, $new, $request->input('reason'), $company->id, 'logistics');
        }

        return response()->json(['message' => 'Rate saved. New checkouts use it from now on; placed orders keep their fee.', 'data' => $this->table($company)]);
    }

    /** DELETE /logistics/shipping/rates/{rate} */
    public function destroyRate(Request $request, int $rate): JsonResponse
    {
        $company = $this->company($request);
        $r = ShippingRate::where('logistics_company_id', $company->id)->findOrFail($rate);
        AuditLog::record($request->user(), 'shipping.rate_removed', $r, ['route' => $this->routeName($r->origin_zone_id, $r->destination_zone_id), 'first_kg' => (float) $r->first_kg, 'additional_kg' => (float) $r->additional_kg], null, null, $company->id, 'logistics');
        $r->delete();

        return response()->json(['message' => 'Rate removed. That route is no longer offered.', 'data' => $this->table($company)]);
    }

    /** GET /logistics/shipping/audit: the shipping changes in the audit log. */
    public function audit(Request $request): JsonResponse
    {
        $company = $this->company($request);
        $rows = AuditLog::with('actor:id,first_name,last_name')->where('logistics_company_id', $company->id)
            ->where('action', 'like', 'shipping.%')->latest('id')->limit(100)->get();

        return response()->json(['data' => $rows->map(fn ($r) => [
            'id' => $r->id, 'action' => $r->action, 'old' => $r->old_value, 'new' => $r->new_value, 'reason' => $r->reason,
            'by' => $r->actor ? trim($r->actor->first_name . ' ' . $r->actor->last_name) : null, 'at' => $r->created_at?->toIso8601String(),
        ])->values()]);
    }

    private function zoneInput(Request $request, LogisticsCompany $company, ?ShippingZone $editing = null): array
    {
        $data = $request->validate([
            'name'                => ['required', 'string', 'min:2', 'max:60'],
            'areas'               => ['required', 'array', 'min:1', 'max:200'],
            'areas.*.level'       => ['required', Rule::in(ShippingZoneArea::LEVELS)],
            'areas.*.psgc_code'   => ['required', 'string', 'regex:/^\d{9,10}$/'],
            'areas.*.name'        => ['required', 'string', 'max:120'],
            'areas.*.excluded'    => ['nullable', 'boolean'],
        ], [
            'name.required'  => 'Name the zone.',
            'areas.required' => 'Add at least one region, province or city to the zone.',
            'areas.min'      => 'Add at least one region, province or city to the zone.',
        ]);
        $name = trim($data['name']);
        $taken = ShippingZone::where('logistics_company_id', $company->id)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($editing, fn ($q) => $q->whereKeyNot($editing->id))->exists();
        if ($taken) {
            throw ValidationException::withMessages(['name' => 'You already have a zone with this name.']);
        }
        foreach ($data['areas'] as $i => $a) {
            if (ShippingCalculator::areaKey($a['level'], $a['psgc_code']) === null) {
                throw ValidationException::withMessages(["areas.{$i}.psgc_code" => 'This code does not match the level chosen.']);
            }
        }

        return ['name' => $name, 'areas' => array_map(fn ($a) => [
            'level' => $a['level'], 'psgc_code' => $a['psgc_code'], 'name' => trim($a['name']), 'excluded' => (bool) ($a['excluded'] ?? false),
        ], $data['areas'])];
    }

    private function saveAreas(ShippingZone $zone, array $areas): void
    {
        $zone->areas()->delete();
        foreach (collect($areas)->unique(fn ($a) => "{$a['level']}-{$a['psgc_code']}") as $a) {
            ShippingZoneArea::create($a + ['shipping_zone_id' => $zone->id]);
        }
    }

    private function table(LogisticsCompany $company): array
    {
        $zones = ShippingZone::with('areas')->where('logistics_company_id', $company->id)->orderBy('id')->get();
        $rates = ShippingRate::where('logistics_company_id', $company->id)->get();

        return [
            'zones' => $zones->map(fn (ShippingZone $z) => [
                'id' => $z->id, 'name' => $z->name,
                'areas' => $z->areas->map(fn ($a) => ['id' => $a->id, 'level' => $a->level, 'psgc_code' => $a->psgc_code, 'name' => $a->name, 'excluded' => (bool) $a->excluded])->values(),
            ])->values(),
            'rates' => $rates->map(fn (ShippingRate $r) => [
                'id' => $r->id, 'origin_zone_id' => $r->origin_zone_id, 'destination_zone_id' => $r->destination_zone_id,
                'first_kg' => (float) $r->first_kg, 'additional_kg' => (float) $r->additional_kg, 'updated_at' => $r->updated_at?->toIso8601String(),
            ])->values(),
        ];
    }

    private function routeName(int $originId, int $destinationId): string
    {
        $names = ShippingZone::whereKey([$originId, $destinationId])->pluck('name', 'id');

        return ($names[$originId] ?? '?') . ' → ' . ($names[$destinationId] ?? '?');
    }

    private function company(Request $request): LogisticsCompany
    {
        return $request->attributes->get('logistics_company');
    }
}
