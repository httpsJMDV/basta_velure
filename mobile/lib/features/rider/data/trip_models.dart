import '../../../core/api/json.dart';

/// Truck trips between hubs, read from `/rider/trips` and `/hub/truck-*`. A truck driver drives parcels from one hub to
/// another; the next hub's scans finish the trip, and the courier pays a set amount per trip.

/// `on_the_way`, `completed` or `closed` (the courier closed it with parcels missing).
class TruckTrip {
  const TruckTrip({
    required this.id,
    required this.code,
    required this.status,
    required this.fromHub,
    required this.toHub,
    required this.parcelCount,
    required this.receivedCount,
    required this.payAmount,
    required this.parcels,
    this.toCity,
    this.driverName,
    this.driverPhone,
    this.plateNumber,
    this.departedAt,
    this.driverArrivedAt,
    this.completedAt,
    this.paidAt,
    this.paidReference,
    this.closeReason,
  });

  final int id;
  final String code;
  final String status;
  final String fromHub;
  final String toHub;
  final String? toCity;
  final String? driverName;
  final String? driverPhone;
  final String? plateNumber;
  final int parcelCount;
  final int receivedCount;
  final double payAmount;
  final DateTime? departedAt;

  /// The driver said the truck is at the next hub's dock.
  final DateTime? driverArrivedAt;
  final DateTime? completedAt;
  final DateTime? paidAt;
  final String? paidReference;
  final String? closeReason;

  /// Only on the trip on the road now.
  final List<({String trackingNumber, bool received})> parcels;

  bool get onTheWay => status == 'on_the_way';

  String get statusLabel => switch (status) {
    'on_the_way' => 'On the way',
    'completed' => 'Completed',
    'closed' => 'Closed by courier',
    _ => status,
  };

  factory TruckTrip.fromJson(Json json) {
    final from = asJson(json['from_hub']);
    final to = asJson(json['to_hub']);
    final driver = asJson(json['driver']);
    return TruckTrip(
      id: asInt(json['id']),
      code: asString(json['code']) ?? '',
      status: asString(json['status']) ?? '',
      fromHub: asString(from['name']) ?? 'Hub',
      toHub: asString(to['name']) ?? 'Hub',
      toCity: asString(to['city']),
      driverName: asString(driver['name']),
      driverPhone: asString(driver['phone']),
      plateNumber: asString(json['plate_number']),
      parcelCount: asInt(json['parcel_count']),
      receivedCount: asInt(json['received_count']),
      payAmount: asDouble(json['pay_amount']),
      departedAt: asDate(json['departed_at']),
      driverArrivedAt: asDate(json['driver_arrived_at']),
      completedAt: asDate(json['completed_at']),
      paidAt: asDate(json['paid_at']),
      paidReference: asString(json['paid_reference']),
      closeReason: asString(json['close_reason']),
      parcels: [
        for (final p in asJsonList(json['parcels']))
          (
            trackingNumber: asString(p['tracking_number']) ?? '',
            received: asBool(p['received']),
          ),
      ],
    );
  }
}

/// `GET /rider/trips`: the trip on the road now, the ones before it, and the trip pay.
class TruckTrips {
  const TruckTrips({
    required this.isTruckDriver,
    required this.current,
    required this.trips,
    required this.unpaidTotal,
    required this.unpaidTrips,
    required this.paidTotal,
    required this.tripsThisWeek,
    required this.rate,
  });

  final bool isTruckDriver;
  final TruckTrip? current;
  final List<TruckTrip> trips;
  final double unpaidTotal;
  final int unpaidTrips;
  final double paidTotal;
  final int tripsThisWeek;

  /// What one trip pays, set by the courier.
  final double rate;

  factory TruckTrips.fromJson(Json json) {
    final pay = asJson(json['pay']);
    final current = asJson(json['current']);
    return TruckTrips(
      isTruckDriver: asBool(json['is_truck_driver']),
      current: current.isEmpty ? null : TruckTrip.fromJson(current),
      trips: asJsonList(json['trips']).map(TruckTrip.fromJson).toList(),
      unpaidTotal: asDouble(pay['unpaid_total']),
      unpaidTrips: asInt(pay['unpaid_trips']),
      paidTotal: asDouble(pay['paid_total']),
      tripsThisWeek: asInt(pay['trips_this_week']),
      rate: asDouble(pay['rate']),
    );
  }
}

/// `GET /hub/truck-drivers`: one of the courier's truck drivers a hub can hand parcels to.
class HubTruckDriver {
  const HubTruckDriver({
    required this.id,
    required this.name,
    required this.vehicleType,
    required this.busy,
    this.plateNumber,
    this.onTripTo,
  });

  final int id;
  final String name;
  final String vehicleType;
  final String? plateNumber;

  /// On another trip: can't take this one.
  final bool busy;
  final String? onTripTo;

  factory HubTruckDriver.fromJson(Json json) => HubTruckDriver(
    id: asInt(json['id']),
    name: asString(json['name']) ?? 'Driver',
    vehicleType: asString(json['vehicle_type']) ?? '',
    plateNumber: asString(json['plate_number']),
    busy: asBool(json['busy']),
    onTripTo: asString(json['on_trip_to']),
  );
}

/// `GET /logistics/truck-drivers`: one of the courier's truck drivers, the trip they are on and what is owed.
class CourierTruckDriver {
  const CourierTruckDriver({
    required this.id,
    required this.name,
    required this.status,
    required this.vehicleType,
    required this.unpaidTrips,
    required this.unpaidAmount,
    required this.tripsThisWeek,
    this.plateNumber,
    this.homeHub,
    this.currentTrip,
  });

  final int id;
  final String name;
  final String status;
  final String vehicleType;
  final String? plateNumber;
  final String? homeHub;
  final TruckTrip? currentTrip;
  final int unpaidTrips;
  final double unpaidAmount;
  final int tripsThisWeek;

  factory CourierTruckDriver.fromJson(Json json) {
    final trip = asJson(json['current_trip']);
    return CourierTruckDriver(
      id: asInt(json['id']),
      name: asString(json['name']) ?? 'Driver',
      status: asString(json['status']) ?? '',
      vehicleType: asString(json['vehicle_type']) ?? '',
      plateNumber: asString(json['plate_number']),
      homeHub: asString(json['home_hub']),
      currentTrip: trip.isEmpty ? null : TruckTrip.fromJson(trip),
      unpaidTrips: asInt(json['unpaid_trips']),
      unpaidAmount: asDouble(json['unpaid_amount']),
      tripsThisWeek: asInt(json['trips_this_week']),
    );
  }
}

/// The courier's truck drivers and the totals over them.
class CourierTrucks {
  const CourierTrucks({
    required this.drivers,
    required this.onTheWay,
    required this.unpaidAmount,
    required this.rate,
  });

  final List<CourierTruckDriver> drivers;
  final int onTheWay;
  final double unpaidAmount;

  /// What one trip pays.
  final double rate;

  factory CourierTrucks.fromJson(Json json) {
    final summary = asJson(json['summary']);
    return CourierTrucks(
      drivers: asJsonList(json['data'])
          .map(CourierTruckDriver.fromJson)
          .toList(),
      onTheWay: asInt(summary['on_the_way']),
      unpaidAmount: asDouble(summary['unpaid_amount']),
      rate: asDouble(summary['rate']),
    );
  }
}
