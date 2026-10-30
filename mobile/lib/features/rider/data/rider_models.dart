import '../../../core/api/json.dart';

/// The rider's models, read from the `/rider/*` endpoints (docs/api/rider-*.md). Amounts stay exactly as the server
/// sent them: the app shows them, it never works one out.

/// `GET /rider/status`: Online or not, and how many of the job slots are used.
class RiderWorkState {
  const RiderWorkState({
    required this.online,
    required this.status,
    required this.activeJobs,
    required this.maxActiveJobs,
    this.onlineSince,
  });

  final bool online;

  /// `ACTIVE` or `SUSPENDED` (a suspended rider still sees the screens and why).
  final String status;
  final int activeJobs;
  final int maxActiveJobs;
  final DateTime? onlineSince;

  bool get isFull => activeJobs >= maxActiveJobs;

  factory RiderWorkState.fromJson(Json json) => RiderWorkState(
    online: asBool(json['online']),
    status: asString(json['status']) ?? '',
    activeJobs: asInt(json['active_jobs']),
    maxActiveJobs: asInt(json['max_active_jobs'], 3),
    onlineSince: asDate(json['online_since']),
  );
}

/// A pickup job offered to this rider for 60 seconds.
class RiderOffer {
  const RiderOffer({
    required this.id,
    required this.trackingNumber,
    required this.expiresAt,
    required this.shopName,
    required this.pickupAddress,
    required this.dropoffArea,
    required this.pay,
    this.shopPhone,
    this.codAmount,
    this.weightKg,
  });

  final int id;
  final String trackingNumber;
  final DateTime expiresAt;
  final String shopName;
  final String? shopPhone;
  final String pickupAddress;

  /// Only the barangay and city: the recipient comes with the delivery leg.
  final String dropoffArea;
  final double? codAmount;
  final double? weightKg;

  /// What the pickup pays, a decimal string like "8.50".
  final String pay;

  /// The offer's full time, for the countdown ring.
  static const lifetime = Duration(seconds: 60);

  Duration leftAt(DateTime now) {
    final left = expiresAt.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  factory RiderOffer.fromJson(Json json, {DateTime? receivedAt}) {
    final pickup = asJson(json['pickup']);
    // The countdown runs from the server's seconds_left, so a phone clock that is a few minutes off doesn't matter.
    final secondsLeft = asIntOrNull(json['seconds_left']);
    return RiderOffer(
      id: asInt(json['id']),
      trackingNumber: asString(json['tracking_number']) ?? '',
      expiresAt: secondsLeft != null
          ? (receivedAt ?? DateTime.now()).add(Duration(seconds: secondsLeft))
          : (asDate(json['expires_at'])?.toLocal() ?? DateTime.now()),
      shopName: asString(pickup['shop_name']) ?? 'Shop',
      shopPhone: asString(pickup['phone']),
      pickupAddress: asString(pickup['address']) ?? '',
      dropoffArea: asString(json['dropoff_area']) ?? '',
      codAmount: asDoubleOrNull(json['cod_amount']),
      weightKg: asDoubleOrNull(json['weight_kg']),
      pay: asString(json['pay']) ?? '0',
    );
  }
}

/// A street address as the rider endpoints send it.
class RiderPlace {
  const RiderPlace({
    required this.fullAddress,
    this.name,
    this.street,
    this.barangay,
    this.city,
    this.province,
  });

  final String fullAddress;
  final String? name;
  final String? street;
  final String? barangay;
  final String? city;
  final String? province;

  factory RiderPlace.fromJson(Json json, {String? name}) {
    final parts = [
      asString(json['street']),
      asString(json['barangay']),
      asString(json['city']),
      asString(json['province']),
    ].whereType<String>().toList();
    return RiderPlace(
      name: name ?? asString(json['hub_name']),
      fullAddress: asString(json['full_address']) ?? parts.join(', '),
      street: asString(json['street']),
      barangay: asString(json['barangay']),
      city: asString(json['city']),
      province: asString(json['province']),
    );
  }

  static RiderPlace? maybe(Object? json) =>
      json is Map ? RiderPlace.fromJson(asJson(json)) : null;
}

/// Which pickup list: offered to the rider's areas, accepted by this rider, or collected and on the way to the hub.
enum PickupView {
  available('available'),
  mine('mine'),
  pickedUp('picked_up');

  const PickupView(this.key);
  final String key;
}

/// One shop's parcels in the pickup lists.
class PickupGroup {
  const PickupGroup({
    required this.sellerId,
    required this.shopName,
    required this.parcelCount,
    required this.trackingNumbers,
    this.shopPhone,
    this.pickupAddress,
    this.readySince,
    this.areaLabel,
    this.acceptedAt,
    this.pickedUpAt,
    this.hub,
  });

  final int sellerId;
  final String shopName;
  final String? shopPhone;
  final RiderPlace? pickupAddress;
  final int parcelCount;

  /// Empty in the available view: tracking numbers are only shown once the rider accepts the shop.
  final List<String> trackingNumbers;
  final DateTime? readySince;
  final String? areaLabel;
  final DateTime? acceptedAt;
  final DateTime? pickedUpAt;

  /// Where to drop the collected parcels (the picked-up view).
  final RiderPlace? hub;

  factory PickupGroup.fromJson(Json json) => PickupGroup(
    sellerId: asInt(json['seller_id']),
    shopName: asString(json['shop_name']) ?? 'Shop',
    shopPhone: asString(json['shop_phone']),
    pickupAddress: RiderPlace.maybe(json['pickup_address']),
    parcelCount: asInt(json['parcel_count']),
    trackingNumbers: asStringList(json['tracking_numbers']),
    readySince: asDate(json['ready_since']),
    areaLabel: asString(json['matched_area_label']),
    acceptedAt: asDate(json['pickup_accepted_at']),
    pickedUpAt: asDate(json['picked_up_at']),
    hub: RiderPlace.maybe(json['hub']),
  );
}

class PickupCounts {
  const PickupCounts({
    this.available = 0,
    this.mine = 0,
    this.pickedUp = 0,
    this.hasAreas = true,
  });

  final int available;
  final int mine;
  final int pickedUp;

  /// False when the hub has not given this rider an area yet: no pickups can show.
  final bool hasAreas;

  int of(PickupView view) => switch (view) {
    PickupView.available => available,
    PickupView.mine => mine,
    PickupView.pickedUp => pickedUp,
  };

  factory PickupCounts.fromJson(Json json) => PickupCounts(
    available: asInt(json['available_count']),
    mine: asInt(json['mine_count']),
    pickedUp: asInt(json['picked_up_count']),
    hasAreas: json['has_areas'] == null || asBool(json['has_areas']),
  );
}

class PickupList {
  const PickupList({required this.groups, required this.counts});

  final List<PickupGroup> groups;
  final PickupCounts counts;
}

/// The two delivery lists: parcels waiting at the hub for this rider, and parcels on the road.
enum DeliveryView {
  assigned('assigned'),
  outForDelivery('out_for_delivery');

  const DeliveryView(this.key);
  final String key;
}

/// One stop: a parcel and its recipient.
class DeliveryStop {
  const DeliveryStop({
    required this.trackingNumber,
    required this.recipientName,
    required this.recipientPhone,
    required this.address,
    required this.itemCount,
    required this.itemSummary,
    this.orderNumber,
    this.codAmount,
    this.attempt,
    this.maxAttempts,
    this.previousFailure,
    this.weightKg,
    this.assignedAt,
    this.outForDeliveryAt,
  });

  final String trackingNumber;
  final String? orderNumber;
  final String recipientName;
  final String recipientPhone;
  final RiderPlace address;

  /// Cash to collect; null for a prepaid (GCash) order.
  final double? codAmount;
  final int? attempt;
  final int? maxAttempts;
  final String? previousFailure;
  final double? weightKg;
  final int itemCount;
  final String itemSummary;
  final DateTime? assignedAt;
  final DateTime? outForDeliveryAt;

  bool get isCod => codAmount != null;

  factory DeliveryStop.fromJson(Json json) {
    final recipient = asJson(json['recipient']);
    return DeliveryStop(
      trackingNumber: asString(json['tracking_number']) ?? '',
      orderNumber: asString(json['order_number']),
      recipientName: asString(recipient['name']) ?? 'Recipient',
      recipientPhone: asString(recipient['phone']) ?? '',
      address: RiderPlace.fromJson(asJson(recipient['address'])),
      codAmount: asDoubleOrNull(json['cod_amount']),
      attempt: asIntOrNull(json['attempt']),
      maxAttempts: asIntOrNull(json['max_attempts']),
      previousFailure: asString(json['previous_failure']),
      weightKg: asDoubleOrNull(json['weight_kg']),
      itemCount: asInt(json['item_count']),
      itemSummary: asString(json['item_summary']) ?? '',
      assignedAt: asDate(json['assigned_at']),
      outForDeliveryAt: asDate(json['out_for_delivery_at']),
    );
  }
}

/// The stops in one barangay.
class DeliveryGroup {
  const DeliveryGroup({
    required this.barangayCode,
    required this.barangayName,
    required this.city,
    required this.stops,
  });

  /// PSGC code, a string (leading zeros matter).
  final String barangayCode;
  final String barangayName;
  final String city;
  final List<DeliveryStop> stops;

  factory DeliveryGroup.fromJson(Json json) => DeliveryGroup(
    barangayCode: asString(json['barangay_code']) ?? '',
    barangayName: asString(json['barangay_name']) ?? '',
    city: asString(json['city']) ?? '',
    stops: asJsonList(json['parcels']).map(DeliveryStop.fromJson).toList(),
  );
}

class DeliveryList {
  const DeliveryList({
    required this.groups,
    required this.assignedCount,
    required this.outForDeliveryCount,
    this.hub,
  });

  final List<DeliveryGroup> groups;
  final RiderPlace? hub;
  final int assignedCount;
  final int outForDeliveryCount;

  List<DeliveryStop> get stops => [for (final g in groups) ...g.stops];

  factory DeliveryList.fromJson(Json json) {
    final meta = asJson(json['meta']);
    return DeliveryList(
      groups: asJsonList(json['data']).map(DeliveryGroup.fromJson).toList(),
      hub: RiderPlace.maybe(json['hub']),
      assignedCount: asInt(meta['assigned_count']),
      outForDeliveryCount: asInt(meta['out_for_delivery_count']),
    );
  }
}

/// A reason a delivery failed. Only some need a note ("Other").
class FailureReason {
  const FailureReason({
    required this.code,
    required this.label,
    required this.requiresNote,
  });

  final String code;
  final String label;
  final bool requiresNote;

  factory FailureReason.fromJson(Json json) => FailureReason(
    code: asString(json['code']) ?? '',
    label: asString(json['label']) ?? '',
    requiresNote: asBool(json['requires_note']),
  );
}

/// What `POST …/failed` answered: the attempt count and whether the parcel now goes back to the seller.
class FailedResult {
  const FailedResult({
    required this.message,
    required this.attempts,
    this.maxAttempts,
    this.returnToSender = false,
  });

  final String message;
  final int attempts;
  final int? maxAttempts;
  final bool returnToSender;

  factory FailedResult.fromJson(Json json) => FailedResult(
    message: asString(json['message']) ?? 'Delivery failure recorded.',
    attempts: asInt(json['delivery_attempts']),
    maxAttempts: asIntOrNull(json['max_attempts']),
    returnToSender: asBool(json['return_to_sender']),
  );
}

/// A parcel this rider is taking back to the seller.
class ReturnJob {
  const ReturnJob({
    required this.trackingNumber,
    required this.shopName,
    required this.address,
    required this.failures,
    this.orderNumber,
    this.shopPhone,
    this.assignedAt,
  });

  final String trackingNumber;
  final String? orderNumber;
  final String shopName;
  final String? shopPhone;
  final String address;

  /// Each failed attempt's reason, oldest first.
  final List<String> failures;
  final DateTime? assignedAt;

  factory ReturnJob.fromJson(Json json) {
    final seller = asJson(json['seller']);
    final address =
        asString(seller['full_address']) ??
        [
          asString(seller['street']),
          asString(seller['barangay']),
          asString(seller['city']),
        ].whereType<String>().join(', ');
    return ReturnJob(
      trackingNumber: asString(json['tracking_number']) ?? '',
      orderNumber: asString(json['order_number']),
      shopName: asString(seller['shop_name']) ?? 'Shop',
      shopPhone: asString(seller['contact_phone']),
      address: address,
      failures: asJsonList(json['failures'])
          .map((f) => asString(f['reason']))
          .whereType<String>()
          .toList(),
      assignedAt: asDate(json['assigned_at']),
    );
  }
}

/// `GET /rider/cod`: cash collected and handed over.
class CodSummary {
  const CodSummary({
    required this.collected,
    required this.confirmed,
    required this.pending,
    required this.outstanding,
    required this.canRemit,
    required this.collections,
    required this.remittances,
  });

  final String collected;
  final String confirmed;
  final String pending;

  /// Cash the rider still holds.
  final String outstanding;

  /// The most the rider can hand over now (outstanding minus remittances still pending).
  final String canRemit;
  final List<CodCollection> collections;
  final List<CodRemittance> remittances;

  double get canRemitValue => asDouble(canRemit);

  factory CodSummary.fromJson(Json json) {
    final balance = asJson(json['balance']);
    return CodSummary(
      collected: asString(balance['collected']) ?? '0',
      confirmed: asString(balance['confirmed']) ?? '0',
      pending: asString(balance['pending']) ?? '0',
      outstanding: asString(balance['outstanding']) ?? '0',
      canRemit: asString(balance['can_remit']) ?? '0',
      collections: asJsonList(json['collections'])
          .map(CodCollection.fromJson)
          .toList(),
      remittances: asJsonList(json['remittances'])
          .map(CodRemittance.fromJson)
          .toList(),
    );
  }
}

class CodCollection {
  const CodCollection({
    required this.trackingNumber,
    required this.amount,
    this.orderNumber,
    this.collectedAt,
  });

  final String trackingNumber;
  final String? orderNumber;
  final String amount;
  final DateTime? collectedAt;

  factory CodCollection.fromJson(Json json) => CodCollection(
    trackingNumber: asString(json['tracking_number']) ?? '',
    orderNumber: asString(json['order_number']),
    amount: asString(json['amount']) ?? '0',
    collectedAt: asDate(json['collected_at']),
  );
}

class CodRemittance {
  const CodRemittance({
    required this.id,
    required this.amount,
    required this.shortfall,
    required this.isConfirmed,
    this.reference,
    this.submittedAt,
    this.confirmedAt,
  });

  final int id;
  final String amount;
  final String shortfall;
  final bool isConfirmed;
  final String? reference;
  final DateTime? submittedAt;
  final DateTime? confirmedAt;

  factory CodRemittance.fromJson(Json json) => CodRemittance(
    id: asInt(json['id']),
    amount: asString(json['amount']) ?? '0',
    shortfall: asString(json['shortfall']) ?? '0',
    isConfirmed: json['status'] == 'confirmed',
    reference: asString(json['reference']),
    submittedAt: asDate(json['submitted_at']),
    confirmedAt: asDate(json['confirmed_at']),
  );
}

enum EarningsPeriod {
  day('day', 'Today'),
  week('week', 'This week'),
  month('month', 'This month');

  const EarningsPeriod(this.key, this.label);
  final String key;
  final String label;
}

/// `GET /rider/earnings/summary`.
class EarningsSummary {
  const EarningsSummary({
    required this.startDate,
    required this.endDate,
    required this.isCurrent,
    required this.totalEarned,
    required this.count,
    required this.previousTotal,
    required this.lifetimeTotal,
    this.unpaidTotal,
  });

  /// Manila calendar dates, `YYYY-MM-DD`, both inclusive.
  final String startDate;
  final String endDate;
  final bool isCurrent;
  final String totalEarned;
  final int count;
  final String previousTotal;
  final String lifetimeTotal;

  /// Earned but not yet paid by the courier company.
  final String? unpaidTotal;

  factory EarningsSummary.fromJson(Json json) {
    final period = asJson(json['period']);
    final previous = asJson(json['previous']);
    return EarningsSummary(
      startDate: asString(period['start_date']) ?? '',
      endDate: asString(period['end_date']) ?? '',
      isCurrent: asBool(period['is_current']),
      totalEarned: asString(json['total_earned']) ?? '0',
      count: asInt(json['deliveries_count']),
      previousTotal: asString(previous['total_earned']) ?? '0',
      lifetimeTotal: asString(json['lifetime_total']) ?? '0',
      unpaidTotal: asString(json['unpaid_total']),
    );
  }
}

/// One paid leg: a pickup brought to the hub, or a delivery to the buyer.
class EarnedJob {
  const EarnedJob({
    required this.id,
    required this.isPickup,
    required this.trackingNumber,
    required this.area,
    required this.fee,
    this.orderNumber,
    this.earnedAt,
    this.paidAt,
  });

  final int id;
  final bool isPickup;
  final String trackingNumber;
  final String? orderNumber;
  final String area;
  final String fee;
  final DateTime? earnedAt;
  final DateTime? paidAt;

  factory EarnedJob.fromJson(Json json) {
    final to = asJson(json['destination']);
    return EarnedJob(
      id: asInt(json['id']),
      isPickup: json['kind'] == 'pickup',
      trackingNumber: asString(json['tracking_number']) ?? '',
      orderNumber: asString(json['order_number']),
      area: [
        asString(to['barangay_name']),
        asString(to['city']),
      ].whereType<String>().join(', '),
      fee: asString(json['fee']) ?? '0',
      earnedAt: asDate(json['delivered_at']),
      paidAt: asDate(json['paid_at']),
    );
  }
}

enum HistoryFilter {
  all('all', 'All'),
  delivered('delivered', 'Delivered'),
  failed('failed', 'Failed'),
  returned('returned', 'Returned');

  const HistoryFilter(this.key, this.label);
  final String key;
  final String label;
}

class HistoryEntry {
  const HistoryEntry({
    required this.outcome,
    required this.trackingNumber,
    required this.area,
    this.occurredAt,
    this.orderNumber,
    this.failureReason,
    this.fee,
    this.codCollected,
  });

  /// `delivered`, `failed` or `returned`.
  final String outcome;
  final DateTime? occurredAt;
  final String trackingNumber;
  final String? orderNumber;
  final String area;
  final String? failureReason;
  final String? fee;
  final String? codCollected;

  factory HistoryEntry.fromJson(Json json) {
    final to = asJson(json['destination']);
    return HistoryEntry(
      outcome: asString(json['outcome']) ?? '',
      occurredAt: asDate(json['occurred_at']),
      trackingNumber: asString(json['tracking_number']) ?? '',
      orderNumber: asString(json['order_number']),
      area: [
        asString(to['barangay_name']),
        asString(to['city']),
      ].whereType<String>().join(', '),
      failureReason: asString(asJson(json['failure_reason'])['label']),
      fee: asString(json['fee']),
      codCollected: asString(json['cod_collected']),
    );
  }
}

/// `GET /rider/me`.
class RiderProfile {
  const RiderProfile({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.status,
    required this.vehicleType,
    required this.plateNumber,
    required this.needsReverification,
    required this.activeAreas,
    required this.documents,
    this.licenseNumber,
    this.licenseExpiry,
    this.companyName,
    this.hubName,
    this.hubCity,
    this.suspensionReason,
  });

  final int id;
  final String fullName;
  final String email;
  final String phone;
  final String status;
  final String vehicleType;
  final String plateNumber;
  final String? licenseNumber;

  /// `YYYY-MM-DD`.
  final String? licenseExpiry;
  final String? companyName;
  final String? hubName;
  final String? hubCity;
  final String? suspensionReason;

  /// A new license or OR/CR waits for the courier company to check it again.
  final bool needsReverification;
  final List<String> activeAreas;

  /// `license` and `or-cr`, with their labels.
  final List<({String key, String label})> documents;

  bool get isSuspended => status == 'SUSPENDED';

  DateTime? get licenseExpiryDate =>
      licenseExpiry == null ? null : DateTime.tryParse(licenseExpiry!);

  factory RiderProfile.fromJson(Json json) {
    final hub = asJson(json['hub']);
    return RiderProfile(
      id: asInt(json['id']),
      fullName: asString(json['full_name']) ?? '',
      email: asString(json['email']) ?? '',
      phone: asString(json['phone']) ?? '',
      status: asString(json['status']) ?? '',
      vehicleType: asString(json['vehicle_type']) ?? '',
      plateNumber: asString(json['plate_number']) ?? '',
      licenseNumber: asString(json['license_number']),
      licenseExpiry: asString(json['license_expiry'])?.split('T').first,
      companyName: asString(asJson(json['company'])['name']),
      hubName: asString(hub['hub_name']),
      hubCity: [
        asString(hub['address_city']),
        asString(hub['address_province']),
      ].whereType<String>().join(', '),
      suspensionReason: asString(json['suspension_reason']),
      needsReverification: asBool(json['needs_reverification']),
      activeAreas: asJsonList(json['active_areas'])
          .map((a) => asString(a['area_label']))
          .whereType<String>()
          .toList(),
      documents: [
        for (final d in asJsonList(json['documents']))
          if (asString(d['key']) != null)
            (key: asString(d['key'])!, label: asString(d['label']) ?? ''),
      ],
    );
  }
}

/// A GCash account for payouts. Both null when none is saved.
class GcashAccount {
  const GcashAccount({this.number, this.name});

  final String? number;
  final String? name;

  bool get isSet => number != null;

  factory GcashAccount.fromJson(Json json) => GcashAccount(
    number: asString(json['gcash_number']),
    name: asString(json['gcash_name']),
  );
}

/// Who a delivery thread is with.
enum Counterpart {
  seller('seller', 'Seller'),
  buyer('buyer', 'Buyer'),
  hub('hub', 'Hub');

  const Counterpart(this.key, this.label);
  final String key;
  final String label;

  static Counterpart? parse(Object? value) =>
      Counterpart.values.where((c) => c.key == value).firstOrNull;
}

/// A rider delivery thread (names only, never contact details).
class RiderThread {
  const RiderThread({
    required this.id,
    required this.counterpart,
    required this.title,
    required this.canSend,
    required this.unread,
    this.trackingNumber,
    this.closedMessage,
    this.lastMessage,
    this.lastMessageAt,
  });

  final int id;
  final Counterpart? counterpart;

  /// The person or hub on the other side.
  final String title;
  final String? trackingNumber;
  final bool canSend;
  final String? closedMessage;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unread;

  factory RiderThread.fromJson(Json json) {
    final last = asJson(json['last_message']);
    return RiderThread(
      id: asInt(json['id']),
      counterpart: Counterpart.parse(json['counterpart']),
      title:
          asString(asJson(json['recipient'])['name']) ??
          asString(json['subject']) ??
          'Chat',
      trackingNumber: asString(asJson(json['parcel'])['tracking_number']),
      canSend: asBool(json['can_send']),
      closedMessage: asString(json['closed_message']),
      lastMessage: asString(last['body']),
      lastMessageAt: asDate(json['last_message_at']),
      unread: asInt(json['unread']),
    );
  }
}

class ThreadMessage {
  const ThreadMessage({
    required this.id,
    required this.body,
    required this.senderId,
    required this.createdAt,
    this.senderName,
  });

  final int id;
  final String body;
  final int? senderId;
  final String? senderName;
  final DateTime? createdAt;

  factory ThreadMessage.fromJson(Json json) => ThreadMessage(
    id: asInt(json['id']),
    body: asString(json['body']) ?? '',
    senderId: asIntOrNull(json['sender_id']),
    senderName: asString(json['sender_name']),
    createdAt: asDate(json['created_at']),
  );
}

/// One fetch of a thread's messages, with whether the rider may still send.
class ThreadMessages {
  const ThreadMessages({
    required this.messages,
    required this.canSend,
    this.closedMessage,
  });

  final List<ThreadMessage> messages;
  final bool canSend;
  final String? closedMessage;

  factory ThreadMessages.fromJson(Json json) {
    final meta = asJson(json['meta']);
    return ThreadMessages(
      messages: asJsonList(json['data']).map(ThreadMessage.fromJson).toList(),
      canSend: meta['can_send'] == null || asBool(meta['can_send']),
      closedMessage: asString(meta['closed_message']),
    );
  }
}

/// An approved hub a new rider can apply to (`GET /logistics/hubs`).
class PublicHub {
  const PublicHub({
    required this.id,
    required this.name,
    required this.place,
    this.courier,
  });

  final int id;
  final String name;
  final String place;
  final String? courier;

  factory PublicHub.fromJson(Json json) => PublicHub(
    id: asInt(json['id']),
    name: asString(json['hub_name']) ?? 'Hub',
    place: [
      asString(json['address_city']),
      asString(json['address_province']),
    ].whereType<String>().join(', '),
    courier: asString(asJson(json['courier'])['name']),
  );
}

/// `GET /rider/location/status`.
class LocationStatus {
  const LocationStatus({required this.required, required this.activeParcels});

  final bool required;
  final int activeParcels;

  factory LocationStatus.fromJson(Json json) => LocationStatus(
    required: asBool(json['sharing_required']),
    activeParcels: asInt(json['active_parcels']),
  );
}

/// A 422 that names items by index (`tracking_numbers.2`), turned into tracking number → message.
Map<String, String> itemErrors(
  Map<String, String> fieldErrors,
  List<String> sent,
) {
  final out = <String, String>{};
  fieldErrors.forEach((key, message) {
    final match = RegExp(r'^tracking_numbers\.(\d+)$').firstMatch(key);
    final index = match == null ? null : int.parse(match.group(1)!);
    if (index != null && index < sent.length) out[sent[index]] = message;
  });
  return out;
}
