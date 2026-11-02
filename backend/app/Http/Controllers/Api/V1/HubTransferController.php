<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\SortingCenter;
use App\Services\Courier\HubRouter;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The hub's side of hub-to-hub transfers: parcels this hub received for a barangay another hub of the courier covers.
 * The parcels coming the other way show under Expected on the intake page, and are scanned in there.
 */
class HubTransferController extends Controller
{
    protected const MAX_SEND_BATCH = 200;

    public function __construct(protected HubRouter $router)
    {
    }

    /** GET /api/v1/hub/transfers: what to send, by the hub it goes to, oldest first. */
    public function index(Request $request): JsonResponse
    {
        $hub = $this->hub($request);
        if (! HubRouter::ready()) {
            return response()->json(['data' => [], 'meta' => ['total_parcels' => 0, 'on_the_way_here' => 0, 'sent_today' => 0]]);
        }

        $groups = Parcel::with('destinationHub')
            ->where('sorting_center_id', $hub->id)
            ->waitingToSend()
            ->orderBy('scanned_in_at')
            ->orderBy('id')
            ->get()
            ->groupBy('destination_hub_id')
            ->map(function ($parcels) {
                $to = $parcels->first()->destinationHub;

                return [
                    'hub'                  => ['id' => $to?->id, 'name' => (string) $to?->hub_name, 'city' => (string) $to?->address_city, 'province' => (string) $to?->address_province],
                    'parcel_count'         => $parcels->count(),
                    'oldest_scanned_in_at' => $parcels->first()->scanned_in_at?->toIso8601String(),
                    'tracking_numbers'     => $parcels->pluck('tracking_number')->values(),
                ];
            })
            ->values();

        $startOfDay = Carbon::now('Asia/Manila')->startOfDay()->utc();

        return response()->json([
            'data' => $groups,
            'meta' => [
                'total_parcels'   => $groups->sum('parcel_count'),
                'on_the_way_here' => Parcel::where('sorting_center_id', $hub->id)->whereNotNull('transit_since')->count(),
                'sent_today'      => ParcelHubStop::where('sorting_center_id', $hub->id)->where('departed_at', '>=', $startOfDay)->count(),
            ],
        ]);
    }

    /** POST /api/v1/hub/transfers/send: all or nothing, like sorting. */
    public function send(Request $request): JsonResponse
    {
        $input = $request->input('tracking_numbers');
        if (is_array($input)) {
            $request->merge(['tracking_numbers' => array_map(fn ($tn) => is_string($tn) ? Str::upper(trim($tn)) : $tn, $input)]);
        }
        $validated = $request->validate([
            'tracking_numbers'   => ['required', 'array', 'min:1', 'max:' . self::MAX_SEND_BATCH],
            'tracking_numbers.*' => ['required', 'string', 'max:50', 'distinct'],
        ]);

        $hub = $this->hub($request);
        $numbers = array_values($validated['tracking_numbers']);

        return DB::transaction(function () use ($request, $hub, $numbers) {
            $parcels = Parcel::with('order')
                ->where('sorting_center_id', $hub->id)
                ->whereIn('tracking_number', $numbers)
                ->lockForUpdate()
                ->get()
                ->keyBy('tracking_number');

            $errors = [];
            foreach ($numbers as $index => $number) {
                $parcel = $parcels->get($number);
                if (! $parcel) {
                    $errors["tracking_numbers.{$index}"] = ['Parcel not found for this hub.'];
                } elseif ($parcel->status !== Parcel::STATUS_AT_SORTING_CENTER || ! $this->router->nextHub($parcel)) {
                    $errors["tracking_numbers.{$index}"] = ['This parcel is not waiting to go to another hub.'];
                }
            }
            if ($errors !== []) {
                return response()->json(['message' => 'One or more parcels cannot be sent. Nothing was changed.', 'errors' => $errors], 422);
            }

            $going = [];
            foreach ($parcels as $parcel) {
                $going[$this->router->send($parcel, $request->user())->hub_name] = true;
            }

            return response()->json([
                'message'    => $parcels->count() === 1 ? 'Parcel sent.' : "{$parcels->count()} parcels sent.",
                'sent_count' => $parcels->count(),
                'to'         => array_keys($going),
            ]);
        });
    }

    protected function hub(Request $request): SortingCenter
    {
        /** @var SortingCenter $hub */
        $hub = $request->user()->sortingCenter;

        return $hub;
    }
}
