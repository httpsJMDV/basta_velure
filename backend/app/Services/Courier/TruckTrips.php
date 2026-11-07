<?php

namespace App\Services\Courier;

use App\Models\AuditLog;
use App\Models\LogisticsCompany;
use App\Models\Parcel;
use App\Models\ParcelHubStop;
use App\Models\Rider;
use App\Models\SortingCenter;
use App\Models\TruckTrip;
use App\Models\User;
use App\Services\Notifier;
use App\Services\TrackingNumberGenerator;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Truck trips between hubs. The courier company hires its truck drivers (riders with duty "truck") and pays them a set
 * amount per trip. The sending hub picks a driver when it sends parcels on; the trip is complete once the next hub has
 * scanned in every parcel, and the courier marks the driver's finished trips paid. This is the courier's own money:
 * the shipping fee split between riders and hubs does not change.
 */
class TruckTrips
{
    public function __construct(private readonly Notifier $notifier)
    {
    }

    /** The courier company of a hub, or null for a hub without one and no default courier. */
    public function companyOf(SortingCenter $hub): ?LogisticsCompany
    {
        $id = LogisticsCompany::effectiveId($hub->logistics_company_id);

        return $id ? LogisticsCompany::find($id) : null;
    }

    /** What the courier pays a driver for one trip. */
    public function rate(?LogisticsCompany $company): float
    {
        $own = $company?->truck_trip_rate;

        return $own !== null ? (float) $own : (float) config('logistics.truck_trip_rate', 800);
    }

    /**
     * The courier's truck drivers a hub can hand parcels to: active, of the same courier.
     *
     * @return Collection<int, Rider>
     */
    public function driversFor(SortingCenter $hub): Collection
    {
        $company = $this->companyOf($hub);
        if (! $company) {
            return collect();
        }

        return \App\Http\Controllers\Api\V1\LogisticsRiderController::companyRiders($company)
            ->with(['user', 'sortingCenter'])
            ->where('duty', Rider::DUTY_TRUCK)
            ->where('status', Rider::STATUS_ACTIVE)
            ->get()
            ->sortBy(fn (Rider $r) => [$r->sorting_center_id === $hub->id ? 0 : 1, (string) $r->user?->first_name])
            ->values();
    }

    /** The trip a driver is on now, if any. A driver takes one trip at a time. */
    public function currentTrip(Rider $driver): ?TruckTrip
    {
        return TruckTrip::where('driver_id', $driver->id)->where('status', TruckTrip::STATUS_ON_THE_WAY)->latest('id')->first();
    }

    /**
     * Checks the driver before the hub sends anything. Throws a 422 naming the field.
     */
    public function assertCanDrive(SortingCenter $hub, int $driverId): Rider
    {
        $driver = $this->driversFor($hub)->firstWhere('id', $driverId);
        if (! $driver) {
            throw ValidationException::withMessages(['driver_id' => 'Choose one of your courier\'s active truck drivers.']);
        }
        if ($this->currentTrip($driver)) {
            throw ValidationException::withMessages(['driver_id' => 'This driver is still on another trip. Choose another driver.']);
        }

        return $driver;
    }

    /**
     * Opens the trip for parcels the hub is about to send to one hub. The caller then sends each parcel with it.
     */
    public function start(SortingCenter $from, SortingCenter $to, Rider $driver, int $parcelCount, User $by): TruckTrip
    {
        $company = $this->companyOf($from);
        $trip = TruckTrip::create([
            'code'                 => $this->code(),
            'logistics_company_id' => $company?->id,
            'from_hub_id'          => $from->id,
            'to_hub_id'            => $to->id,
            'driver_id'            => $driver->id,
            'plate_number'         => $driver->plate_number,
            'status'               => TruckTrip::STATUS_ON_THE_WAY,
            'parcel_count'         => $parcelCount,
            'received_count'       => 0,
            'created_by'           => $by->id,
            'departed_at'          => now(),
            'pay_amount'           => $this->rate($company),
        ]);

        AuditLog::record($by, 'truck_trip.departed', $trip, null, [
            'code' => $trip->code, 'from' => $from->hub_name, 'to' => $to->hub_name, 'parcels' => $parcelCount,
            'driver' => $this->name($driver), 'plate_number' => $trip->plate_number,
        ], companyId: $company?->id, actorRole: 'hub');

        $this->notifier->send($driver->loadMissing('user')->user, 'rider.truck_trip', 'New truck trip',
            "{$parcelCount} " . ($parcelCount === 1 ? 'parcel' : 'parcels') . " from {$from->hub_name} to {$to->hub_name}. Trip {$trip->code}.",
            '/rider/trips', ['truck_trip_id' => $trip->id]);

        return $trip;
    }

    /** The next hub scanned in a parcel this trip carried. The last one completes the trip. */
    public function parcelArrived(ParcelHubStop $stop): void
    {
        if (! $stop->truck_trip_id) {
            return;
        }
        $trip = TruckTrip::whereKey($stop->truck_trip_id)->lockForUpdate()->first();
        if (! $trip || $trip->isFinished()) {
            return;
        }

        $received = ParcelHubStop::where('truck_trip_id', $trip->id)->whereNotNull('arrived_at')->count();
        $trip->received_count = $received;
        if ($received >= $trip->parcel_count) {
            $trip->status = TruckTrip::STATUS_COMPLETED;
            $trip->completed_at = now();
            $trip->driver_arrived_at ??= now();
        }
        $trip->save();

        if ($trip->status === TruckTrip::STATUS_COMPLETED) {
            $trip->loadMissing(['driver.user', 'toHub']);
            $this->notifier->send($trip->driver?->user, 'rider.truck_trip_completed', 'Trip complete',
                "{$trip->toHub?->hub_name} received all {$trip->parcel_count} parcels of trip {$trip->code}. ₱" . number_format((float) $trip->pay_amount, 2) . ' is added to your trip pay.',
                '/rider/trips', ['truck_trip_id' => $trip->id]);
        }
    }

    /** The driver says the truck is at the next hub's dock: the hub is told to scan the parcels in. */
    public function reportArrival(TruckTrip $trip, Rider $driver): TruckTrip
    {
        if ($trip->status !== TruckTrip::STATUS_ON_THE_WAY) {
            throw ValidationException::withMessages(['trip' => 'This trip is already finished.']);
        }
        if ($trip->driver_arrived_at === null) {
            $trip->forceFill(['driver_arrived_at' => now()])->save();
            $trip->loadMissing(['toHub.user', 'fromHub']);
            $this->notifier->send($trip->toHub?->user, 'hub.truck_arrived', 'Truck at your hub',
                $this->name($driver) . " is at your hub with {$trip->parcel_count} " . ($trip->parcel_count === 1 ? 'parcel' : 'parcels')
                . " from {$trip->fromHub?->hub_name} (trip {$trip->code}" . ($trip->plate_number ? ", plate {$trip->plate_number}" : '') . '). Scan them in.',
                '/hub/intake', ['truck_trip_id' => $trip->id]);
        }

        return $trip;
    }

    /** The courier closes a trip whose parcels did not all arrive. The driver is still owed the trip. */
    public function close(TruckTrip $trip, User $by, string $reason): TruckTrip
    {
        if ($trip->status !== TruckTrip::STATUS_ON_THE_WAY) {
            throw ValidationException::withMessages(['trip' => 'This trip is already finished.']);
        }
        $old = ['status' => $trip->status, 'received_count' => $trip->received_count];
        $trip->forceFill(['status' => TruckTrip::STATUS_CLOSED, 'completed_at' => now(), 'close_reason' => $reason])->save();

        AuditLog::record($by, 'truck_trip.closed', $trip, $old, [
            'status' => TruckTrip::STATUS_CLOSED, 'code' => $trip->code, 'received_count' => $trip->received_count, 'parcel_count' => $trip->parcel_count,
        ], $reason, $trip->logistics_company_id, 'logistics');

        return $trip;
    }

    /**
     * The courier paid the driver for every finished, unpaid trip. Returns how many trips and how much.
     *
     * @return array{trips: int, amount: float}
     */
    public function markPaid(Rider $driver, User $by, ?string $reference, ?int $companyId): array
    {
        $trips = TruckTrip::unpaid()->where('driver_id', $driver->id)->lockForUpdate()->get();
        if ($trips->isEmpty()) {
            throw ValidationException::withMessages(['driver' => 'This driver has no unpaid trips.']);
        }

        $amount = round((float) $trips->sum(fn (TruckTrip $t) => (float) $t->pay_amount), 2);
        TruckTrip::whereIn('id', $trips->pluck('id'))->update(['paid_at' => now(), 'paid_by' => $by->id, 'paid_reference' => $reference]);

        AuditLog::record($by, 'truck_driver.paid', $driver, null, [
            'trips' => $trips->count(), 'amount' => $amount, 'reference' => $reference, 'trip_codes' => $trips->pluck('code')->all(),
        ], companyId: $companyId, actorRole: 'logistics');

        app(\App\Services\MailNotifier::class)->truckPaySent($driver, $amount, $trips->count(), $reference);
        $this->notifier->send($driver->loadMissing('user')->user, 'rider.truck_paid', 'Trip pay sent',
            'Your courier paid ₱' . number_format($amount, 2) . ' for ' . $trips->count() . ' ' . ($trips->count() === 1 ? 'trip' : 'trips') . ($reference ? " (reference {$reference})." : '.'),
            '/rider/trips', ['amount' => $amount]);

        return ['trips' => $trips->count(), 'amount' => $amount];
    }

    /**
     * Unpaid and paid totals for one driver.
     *
     * @return array{unpaid_total: float, unpaid_trips: int, paid_total: float, trips_this_week: int, rate: float}
     */
    public function payFor(Rider $driver): array
    {
        $unpaid = TruckTrip::unpaid()->where('driver_id', $driver->id);
        $weekStart = now('Asia/Manila')->startOfWeek()->utc();

        return [
            'unpaid_total'    => round((float) (clone $unpaid)->sum('pay_amount'), 2),
            'unpaid_trips'    => (clone $unpaid)->count(),
            'paid_total'      => round((float) TruckTrip::where('driver_id', $driver->id)->whereNotNull('paid_at')->sum('pay_amount'), 2),
            'trips_this_week' => TruckTrip::where('driver_id', $driver->id)->where('departed_at', '>=', $weekStart)->count(),
            'rate'            => $this->rate($driver->company ?? ($driver->companyId() ? LogisticsCompany::find($driver->companyId()) : null)),
        ];
    }

    /** @return array<string, mixed> */
    public function payload(TruckTrip $trip, bool $withParcels = false): array
    {
        $trip->loadMissing(['fromHub', 'toHub', 'driver.user']);
        $row = [
            'id'                => $trip->id,
            'code'              => $trip->code,
            'status'            => $trip->status,
            'from_hub'          => $this->hub($trip->fromHub),
            'to_hub'            => $this->hub($trip->toHub),
            'driver'            => $trip->driver ? [
                'id'    => $trip->driver->id,
                'name'  => $this->name($trip->driver),
                'phone' => \App\Support\PhMobile::local($trip->driver->user?->phone),
                'vehicle_type' => $trip->driver->vehicle_type,
            ] : null,
            'plate_number'      => $trip->plate_number,
            'parcel_count'      => $trip->parcel_count,
            'received_count'    => $trip->received_count,
            'departed_at'       => $trip->departed_at?->toIso8601String(),
            'driver_arrived_at' => $trip->driver_arrived_at?->toIso8601String(),
            'completed_at'      => $trip->completed_at?->toIso8601String(),
            'close_reason'      => $trip->close_reason,
            'pay_amount'        => (float) $trip->pay_amount,
            'paid_at'           => $trip->paid_at?->toIso8601String(),
            'paid_reference'    => $trip->paid_reference,
        ];
        if ($withParcels) {
            $row['parcels'] = ParcelHubStop::with('parcel:id,tracking_number,status')
                ->where('truck_trip_id', $trip->id)->orderBy('id')->get()
                ->map(fn (ParcelHubStop $s) => [
                    'tracking_number' => $s->parcel?->tracking_number,
                    'received'        => $s->arrived_at !== null,
                    'received_at'     => $s->arrived_at?->toIso8601String(),
                ])->values()->all();
        }

        return $row;
    }

    public function name(Rider $rider): string
    {
        $user = $rider->user;

        return $user ? trim($user->first_name . ' ' . $user->last_name) : 'Driver';
    }

    /** @return array{id: int, name: string, city: string}|null */
    private function hub(?SortingCenter $hub): ?array
    {
        return $hub ? ['id' => $hub->id, 'name' => (string) $hub->hub_name, 'city' => (string) $hub->address_city] : null;
    }

    private function code(): string
    {
        $generator = app(TrackingNumberGenerator::class);
        do {
            $code = 'TRK-' . now('Asia/Manila')->format('ymd') . '-' . $generator->randomString(4);
        } while (TruckTrip::where('code', $code)->exists());

        return $code;
    }
}
