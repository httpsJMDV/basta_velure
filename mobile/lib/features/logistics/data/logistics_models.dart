import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';

/// The website's words and the app's status colours, the same everywhere: amber = waiting, blue = on the way,
/// emerald = done, rose = failed or lost, gray = closed.
abstract final class StatusWords {
  /// A parcel, from `pages/logistics/LogisticsParcelsPage.tsx`.
  static (String, StatusTone) parcel(String? status) => switch (status) {
    'READY_FOR_PICKUP' => ('Ready for pickup', StatusTone.amber),
    'PICKED_UP' => ('Picked up', StatusTone.blue),
    'AT_SORTING_CENTER' => ('At hub', StatusTone.amber),
    'SORTED' => ('Sorted', StatusTone.amber),
    'ASSIGNED_TO_RIDER' => ('With rider', StatusTone.blue),
    'OUT_FOR_DELIVERY' => ('Out for delivery', StatusTone.blue),
    'DELIVERED' => ('Delivered', StatusTone.emerald),
    'DELIVERY_FAILED' => ('Delivery failed', StatusTone.rose),
    'RETURN_TO_SENDER' => ('Return to sender', StatusTone.rose),
    'RETURNED' => ('Returned to seller', StatusTone.gray),
    'LOST' => ('Lost', StatusTone.rose),
    'DAMAGED' => ('Damaged', StatusTone.rose),
    _ => ((status ?? '—').replaceAll('_', ' '), StatusTone.gray),
  };

  /// A rider on the hub's pages (`pages/hub/HubRidersPage.tsx`).
  static (String, StatusTone) hubRider(String? status) => switch (status) {
    'PENDING' => ('Pending', StatusTone.amber),
    'ACTIVE' => ('Active', StatusTone.emerald),
    'DISAPPROVED' => ('Disapproved', StatusTone.rose),
    'PENDING_ACTIVATION' => ('Pending activation', StatusTone.blue),
    'SUSPENDED' => ('Suspended', StatusTone.rose),
    _ => (status ?? '—', StatusTone.gray),
  };

  /// A rider on the courier's pages (`pages/logistics/LogisticsRidersPage.tsx`).
  static (String, StatusTone) courierRider(String? status) => switch (status) {
    'PENDING' => ('Waiting for verification', StatusTone.amber),
    'ACTIVE' => ('Active', StatusTone.emerald),
    'DISAPPROVED' => ('Not approved', StatusTone.rose),
    'PENDING_ACTIVATION' => ('Pending activation', StatusTone.blue),
    'SUSPENDED' => ('Suspended', StatusTone.rose),
    _ => (status ?? '—', StatusTone.gray),
  };

  /// A hub in the courier's network (`pages/logistics/LogisticsHubsPage.tsx`).
  static (String, StatusTone) hub(String? status) => switch (status) {
    'PENDING' => ('Pending review', StatusTone.amber),
    'APPROVED' => ('Active', StatusTone.emerald),
    'REJECTED' => ('Rejected', StatusTone.rose),
    'SUSPENDED' => ('Suspended', StatusTone.gray),
    _ => (status ?? '—', StatusTone.gray),
  };
}

// Hub: dashboard (D1) ---------------------------------------------------------------------------------------------

/// `GET /hub/dashboard/metrics`.
class HubMetrics {
  const HubMetrics({
    required this.receivedToday,
    required this.toSort,
    required this.activeRiders,
    required this.outForDelivery,
    required this.failedDeliveries,
    required this.hubName,
    required this.place,
  });

  final int receivedToday;
  final int toSort;
  final int activeRiders;
  final int outForDelivery;
  final int failedDeliveries;
  final String hubName;
  final String place;

  factory HubMetrics.fromJson(Json json) {
    final hub = asJson(json['hub']);
    return HubMetrics(
      receivedToday: asInt(json['inbound_today']),
      toSort: asInt(json['in_sorting']),
      activeRiders: asInt(json['active_riders']),
      outForDelivery: asInt(json['out_for_delivery']),
      failedDeliveries: asInt(json['failed_deliveries']),
      hubName: asString(hub['hub_name']) ?? 'Hub',
      place: [
        asString(hub['address_barangay']),
        asString(hub['address_city']),
        asString(hub['address_province']),
      ].whereType<String>().join(', '),
    );
  }
}

/// Everything the hub's Home shows.
class HubHome {
  const HubHome({
    required this.metrics,
    required this.expected,
    required this.pendingRiders,
    required this.unreadMessages,
  });

  final HubMetrics metrics;
  final int expected;
  final int pendingRiders;
  final int unreadMessages;
}

/// `GET /hub/profile`: read-only here, because the hub's courier approves these details.
class HubProfile {
  const HubProfile({
    required this.hubName,
    required this.address,
    required this.coverageCount,
    this.courierName,
    this.courierEmail,
    this.courierPhone,
  });

  final String hubName;
  final String address;
  final int coverageCount;
  final String? courierName;
  final String? courierEmail;
  final String? courierPhone;

  factory HubProfile.fromJson(Json json) {
    final courier = asJson(json['courier']);
    return HubProfile(
      hubName: asString(json['hub_name']) ?? 'Hub',
      address: [
        asString(json['address_street']),
        asString(json['address_barangay']),
        asString(json['address_city']),
        asString(json['address_province']),
      ].whereType<String>().join(', '),
      coverageCount: asInt(json['coverage_barangays_count']),
      courierName: asString(courier['name']),
      courierEmail: asString(courier['contact_email']),
      courierPhone: asString(courier['contact_phone']),
    );
  }
}

// Hub: parcels coming in (D2) --------------------------------------------------------------------------------------

/// A parcel at intake. The hub never gets the recipient's phone or the COD amount.
class IntakeParcel {
  const IntakeParcel({
    required this.trackingNumber,
    this.orderNumber,
    this.status,
    this.shopName,
    this.barangayName,
    this.riderName,
    this.riderPlate,
    this.pickedUpAt,
    this.scannedInAt,
    this.recipientName,
    this.recipientAddress,
  });

  final String trackingNumber;
  final String? orderNumber;
  final String? status;
  final String? shopName;
  final String? barangayName;
  final String? riderName;
  final String? riderPlate;
  final DateTime? pickedUpAt;
  final DateTime? scannedInAt;

  /// Only on the lookup of one parcel.
  final String? recipientName;
  final String? recipientAddress;

  factory IntakeParcel.fromJson(Json json) {
    final rider = asJson(json['pickup_rider']);
    final recipient = asJson(json['recipient']);
    final address = asJson(recipient['address']);
    return IntakeParcel(
      trackingNumber: asString(json['tracking_number']) ?? '',
      orderNumber: asString(json['order_number']),
      status: asString(json['status']),
      shopName: asString(json['shop_name']),
      barangayName: asString(asJson(json['destination_barangay'])['name']),
      riderName: asString(rider['name']),
      riderPlate: asString(rider['plate_number']),
      pickedUpAt: asDate(json['picked_up_at']),
      scannedInAt: asDate(json['scanned_in_at']),
      recipientName: asString(recipient['name']),
      recipientAddress: address.isEmpty
          ? null
          : [
              asString(address['street']),
              asString(address['barangay']),
              asString(address['city']),
              asString(address['province']),
            ].whereType<String>().join(', '),
    );
  }
}

// Hub: sorting and dispatch (D3, D4) ------------------------------------------------------------------------------

/// `GET /hub/sorting/groups`: parcels at the hub, by destination barangay.
class SortingGroup {
  const SortingGroup({
    required this.barangayCode,
    required this.barangayName,
    required this.city,
    required this.parcelCount,
    required this.inCoverage,
    required this.ridersCovering,
    this.oldestAt,
  });

  final String barangayCode;
  final String barangayName;
  final String city;
  final int parcelCount;
  final bool inCoverage;
  final int ridersCovering;
  final DateTime? oldestAt;

  factory SortingGroup.fromJson(Json json) => SortingGroup(
    barangayCode: asString(json['barangay_code']) ?? '',
    barangayName: asString(json['barangay_name']) ?? '',
    city: asString(json['city']) ?? '',
    parcelCount: asInt(json['parcel_count']),
    inCoverage: asBool(json['in_coverage']),
    ridersCovering: asInt(json['riders_covering']),
    oldestAt: asDate(json['oldest_scanned_in_at']),
  );
}

/// `GET /hub/dispatch/batches`: sorted parcels, by destination barangay.
class DispatchBatch {
  const DispatchBatch({
    required this.barangayCode,
    required this.barangayName,
    required this.city,
    required this.parcelCount,
    required this.eligibleRiders,
    this.oldestAt,
  });

  final String barangayCode;
  final String barangayName;
  final String city;
  final int parcelCount;
  final int eligibleRiders;
  final DateTime? oldestAt;

  factory DispatchBatch.fromJson(Json json) => DispatchBatch(
    barangayCode: asString(json['barangay_code']) ?? '',
    barangayName: asString(json['barangay_name']) ?? '',
    city: asString(json['city']) ?? '',
    parcelCount: asInt(json['parcel_count']),
    eligibleRiders: asInt(json['eligible_riders']),
    oldestAt: asDate(json['oldest_sorted_at']),
  );
}

/// One parcel of a sorting group or a dispatch batch.
class WaitingParcel {
  const WaitingParcel({
    required this.trackingNumber,
    this.orderNumber,
    this.since,
  });

  final String trackingNumber;
  final String? orderNumber;
  final DateTime? since;

  factory WaitingParcel.fromJson(Json json) => WaitingParcel(
    trackingNumber: asString(json['tracking_number']) ?? '',
    orderNumber: asString(json['order_number']),
    since: asDate(json['scanned_in_at'] ?? json['sorted_at']),
  );
}

/// A rider who may take a barangay's parcels, least busy first.
class EligibleRider {
  const EligibleRider({
    required this.id,
    required this.name,
    required this.currentLoad,
    this.vehicleType,
    this.plateNumber,
    this.areaLabels = const [],
  });

  final int id;
  final String name;
  final int currentLoad;
  final String? vehicleType;
  final String? plateNumber;
  final List<String> areaLabels;

  factory EligibleRider.fromJson(Json json) => EligibleRider(
    id: asInt(json['id']),
    name: asString(json['name']) ?? 'Rider',
    currentLoad: asInt(json['current_load']),
    vehicleType: asString(json['vehicle_type']),
    plateNumber: asString(json['plate_number']),
    areaLabels: asStringList(json['area_labels']),
  );
}

/// `GET /hub/dispatch/awaiting-pickup`: parcels waiting at the hub for one rider to collect.
class AwaitingRider {
  const AwaitingRider({required this.riderName, required this.parcels});

  final String riderName;
  final List<AwaitingParcel> parcels;

  factory AwaitingRider.fromJson(Json json) => AwaitingRider(
    riderName: asString(asJson(json['rider'])['name']) ?? 'Rider',
    parcels: asJsonList(json['parcels']).map(AwaitingParcel.fromJson).toList(),
  );
}

class AwaitingParcel {
  const AwaitingParcel({
    required this.trackingNumber,
    this.barangay,
    this.recipientName,
    this.assignedAt,
  });

  final String trackingNumber;
  final String? barangay;
  final String? recipientName;
  final DateTime? assignedAt;

  factory AwaitingParcel.fromJson(Json json) => AwaitingParcel(
    trackingNumber: asString(json['tracking_number']) ?? '',
    barangay: asString(json['barangay']),
    recipientName: asString(json['recipient_name']),
    assignedAt: asDate(json['assigned_at']),
  );
}

// Hub: deliveries (D5) ----------------------------------------------------------------------------------------------

class OutDelivery {
  const OutDelivery({
    required this.trackingNumber,
    required this.barangayName,
    required this.city,
    this.riderName,
    this.riderPlate,
    this.recipientName,
    this.elapsedMinutes,
  });

  final String trackingNumber;
  final String barangayName;
  final String city;
  final String? riderName;
  final String? riderPlate;
  final String? recipientName;
  final int? elapsedMinutes;

  factory OutDelivery.fromJson(Json json) {
    final rider = asJson(json['rider']);
    final destination = asJson(json['destination']);
    return OutDelivery(
      trackingNumber: asString(json['tracking_number']) ?? '',
      barangayName: asString(destination['barangay_name']) ?? '',
      city: asString(destination['city']) ?? '',
      riderName: asString(rider['name']),
      riderPlate: asString(rider['plate_number']),
      recipientName: asString(json['recipient_name']),
      elapsedMinutes: asIntOrNull(json['elapsed_minutes']),
    );
  }
}

/// One rider in the Out for delivery filter. It counts every parcel, whatever the search says.
class RiderOnRoad {
  const RiderOnRoad({
    required this.riderId,
    required this.name,
    required this.count,
  });

  final int riderId;
  final String name;
  final int count;

  factory RiderOnRoad.fromJson(Json json) => RiderOnRoad(
    riderId: asInt(json['rider_id']),
    name: asString(json['name']) ?? 'Rider',
    count: asInt(json['count']),
  );
}

class OutDeliveries {
  const OutDeliveries({
    required this.parcels,
    required this.riders,
    required this.truncated,
  });

  final List<OutDelivery> parcels;
  final List<RiderOnRoad> riders;

  /// The server sends at most 500; more are on the road.
  final bool truncated;

  factory OutDeliveries.fromJson(Json json) {
    final meta = asJson(json['meta']);
    return OutDeliveries(
      parcels: asJsonList(json['data']).map(OutDelivery.fromJson).toList(),
      riders: asJsonList(meta['riders']).map(RiderOnRoad.fromJson).toList(),
      truncated: asBool(meta['truncated']),
    );
  }
}

class FailedDelivery {
  const FailedDelivery({
    required this.trackingNumber,
    required this.barangayCode,
    required this.barangayName,
    required this.city,
    required this.attempts,
    required this.maxAttempts,
    required this.canReschedule,
    this.riderName,
    this.recipientName,
    this.reason,
    this.note,
    this.failedAt,
  });

  final String trackingNumber;
  final String barangayCode;
  final String barangayName;
  final String city;
  final int attempts;
  final int maxAttempts;
  final bool canReschedule;
  final String? riderName;
  final String? recipientName;
  final String? reason;
  final String? note;
  final DateTime? failedAt;

  factory FailedDelivery.fromJson(Json json) {
    final destination = asJson(json['destination']);
    return FailedDelivery(
      trackingNumber: asString(json['tracking_number']) ?? '',
      barangayCode: asString(destination['barangay_code']) ?? '',
      barangayName: asString(destination['barangay_name']) ?? '',
      city: asString(destination['city']) ?? '',
      attempts: asInt(json['delivery_attempts']),
      maxAttempts: asInt(json['max_attempts'], 3),
      canReschedule: asBool(json['can_reschedule']),
      riderName: asString(asJson(json['rider'])['name']),
      recipientName: asString(json['recipient_name']),
      reason: asString(asJson(json['failure_reason'])['label']),
      note: asString(json['failure_note']),
      failedAt: asDate(json['failed_at']),
    );
  }
}

/// A delivery failure reason for the filter (`meta.reasons`), the same list riders choose from.
class FailureOption {
  const FailureOption(this.code, this.label);

  final String code;
  final String label;

  factory FailureOption.fromJson(Json json) => FailureOption(
    asString(json['code']) ?? '',
    asString(json['label']) ?? '',
  );
}

// Hub: riders (D6) --------------------------------------------------------------------------------------------------

/// The hub's tabs: `pending`, `active`, `disapproved`, `all`.
class HubRiderCounts {
  const HubRiderCounts({
    required this.pending,
    required this.active,
    required this.disapproved,
    required this.all,
  });

  final int pending;
  final int active;
  final int disapproved;
  final int all;

  factory HubRiderCounts.fromJson(Json json) => HubRiderCounts(
    pending: asInt(json['pending']),
    active: asInt(json['active']),
    disapproved: asInt(json['disapproved']),
    all: asInt(json['all']),
  );
}

class HubRiderRow {
  const HubRiderRow({
    required this.id,
    required this.name,
    required this.status,
    required this.applicant,
    required this.activeAreas,
    this.vehicleType,
    this.plateNumber,
    this.submittedAt,
  });

  final int id;
  final String name;
  final String status;
  final bool applicant;
  final int activeAreas;
  final String? vehicleType;
  final String? plateNumber;
  final DateTime? submittedAt;

  factory HubRiderRow.fromJson(Json json) {
    final user = asJson(json['user']);
    return HubRiderRow(
      id: asInt(json['id']),
      name: [
        asString(user['first_name']),
        asString(user['last_name']),
      ].whereType<String>().join(' '),
      status: asString(json['status']) ?? '',
      applicant: asBool(json['applicant']),
      activeAreas: asInt(json['active_areas_count']),
      vehicleType: asString(json['vehicle_type']),
      plateNumber: asString(json['plate_number']),
      submittedAt: asDate(json['submitted_at'] ?? json['created_at']),
    );
  }
}

class RiderArea {
  const RiderArea({
    required this.id,
    required this.label,
    required this.barangays,
    required this.isActive,
  });

  final int id;
  final String label;
  final List<String> barangays;
  final bool isActive;

  factory RiderArea.fromJson(Json json) => RiderArea(
    id: asInt(json['id']),
    label: asString(json['area_label']) ?? '',
    barangays: asStringList(json['coverage_barangays']),
    isActive: asBool(json['is_active']),
  );
}

class HubRiderDetail {
  const HubRiderDetail({
    required this.id,
    required this.name,
    required this.status,
    required this.applicant,
    required this.areas,
    required this.hasLicense,
    required this.hasOrCr,
    this.email,
    this.phone,
    this.dateOfBirth,
    this.address,
    this.vehicleType,
    this.plateNumber,
    this.licenseNumber,
    this.licenseExpiry,
    this.rejectionReason,
    this.reviewerName,
    this.reviewedAt,
    this.submittedAt,
  });

  final int id;
  final String name;
  final String status;
  final bool applicant;
  final List<RiderArea> areas;
  final bool hasLicense;
  final bool hasOrCr;
  final String? email;
  final String? phone;
  final String? dateOfBirth;
  final String? address;
  final String? vehicleType;
  final String? plateNumber;
  final String? licenseNumber;
  final String? licenseExpiry;
  final String? rejectionReason;
  final String? reviewerName;
  final DateTime? reviewedAt;
  final DateTime? submittedAt;

  bool get isPending => status == 'PENDING';

  factory HubRiderDetail.fromJson(Json json) {
    final user = asJson(json['user']);
    final address = asJson(json['address']);
    final documents = asJson(json['documents']);
    return HubRiderDetail(
      id: asInt(json['id']),
      name: [
        asString(user['first_name']),
        asString(user['middle_name']),
        asString(user['last_name']),
      ].whereType<String>().join(' '),
      status: asString(json['status']) ?? '',
      applicant: asBool(json['applicant']),
      areas: asJsonList(json['area_assignments'])
          .map(RiderArea.fromJson)
          .toList(),
      hasLicense: asString(documents['drivers_license_url']) != null,
      hasOrCr: asString(documents['or_cr_url']) != null,
      email: asString(user['email']),
      phone: asString(user['phone']),
      dateOfBirth: asString(user['date_of_birth']),
      address: address.isEmpty
          ? null
          : [
              asString(address['street']),
              asString(address['barangay']),
              asString(address['city']),
              asString(address['province']),
            ].whereType<String>().join(', '),
      vehicleType: asString(json['vehicle_type']),
      plateNumber: asString(json['plate_number']),
      licenseNumber: asString(json['license_number']),
      licenseExpiry: asString(json['license_expiry']),
      rejectionReason: asString(json['rejection_reason']),
      reviewerName: asString(json['reviewer_name']),
      reviewedAt: asDate(json['reviewed_at']),
      submittedAt: asDate(json['submitted_at'] ?? json['created_at']),
    );
  }
}

// Courier team: dashboard and hubs (D7) ---------------------------------------------------------------------------

/// `GET /logistics/dashboard`.
class CourierDashboard {
  const CourierDashboard({
    required this.hubsActive,
    required this.hubApplications,
    required this.ridersActive,
    required this.ridersInReview,
    required this.ridersOnline,
    required this.awaitingPickup,
    required this.atHubs,
    required this.outForDelivery,
    required this.failed,
  });

  final int hubsActive;
  final int hubApplications;
  final int ridersActive;
  final int ridersInReview;
  final int ridersOnline;
  final int awaitingPickup;
  final int atHubs;
  final int outForDelivery;
  final int failed;

  factory CourierDashboard.fromJson(Json json) {
    final hubs = asJson(json['hubs']);
    final riders = asJson(json['riders']);
    final parcels = asJson(json['parcels_now']);
    return CourierDashboard(
      hubsActive: asInt(hubs['approved']),
      hubApplications: asInt(hubs['pending']),
      ridersActive: asInt(riders['active']),
      ridersInReview: asInt(riders['pending']),
      ridersOnline: asInt(riders['online']),
      awaitingPickup: asInt(parcels['awaiting_pickup']),
      atHubs: asInt(parcels['at_hubs']),
      outForDelivery: asInt(parcels['out_for_delivery']),
      failed: asInt(parcels['failed']),
    );
  }
}

/// `GET /logistics/me`.
class CourierCompany {
  const CourierCompany({
    required this.name,
    this.code,
    this.logoUrl,
    this.contactEmail,
    this.contactPhone,
  });

  final String name;
  final String? code;
  final String? logoUrl;
  final String? contactEmail;
  final String? contactPhone;

  factory CourierCompany.fromJson(Json json) => CourierCompany(
    name: asString(json['name']) ?? 'Courier',
    code: asString(json['code']),
    logoUrl: asString(json['logo_url']),
    contactEmail: asString(json['contact_email']),
    contactPhone: asString(json['contact_phone']),
  );
}

class NetworkHub {
  const NetworkHub({
    required this.id,
    required this.name,
    required this.status,
    required this.place,
    required this.coverageCount,
    required this.activeRiders,
    required this.activeParcels,
    this.applicantName,
    this.rejectionReason,
    this.submittedAt,
  });

  final int id;
  final String name;
  final String status;
  final String place;
  final int coverageCount;
  final int activeRiders;
  final int activeParcels;
  final String? applicantName;
  final String? rejectionReason;
  final DateTime? submittedAt;

  factory NetworkHub.fromJson(Json json) => NetworkHub(
    id: asInt(json['id']),
    name: asString(json['hub_name']) ?? 'Hub',
    status: asString(json['status']) ?? '',
    place: asString(json['city_province']) ?? '',
    coverageCount: asInt(json['coverage_count']),
    activeRiders: asInt(json['active_riders']),
    activeParcels: asInt(json['active_parcels']),
    applicantName: asString(json['applicant_name']),
    rejectionReason: asString(json['rejection_reason']),
    submittedAt: asDate(json['submitted_at']),
  );
}

/// `GET /logistics/network/hubs/{hub}`: the application with its documents.
class NetworkHubDetail {
  const NetworkHubDetail({
    required this.id,
    required this.name,
    required this.status,
    required this.address,
    required this.coverage,
    required this.hasPermit,
    required this.hasId,
    required this.hasIdBack,
    this.applicantName,
    this.applicantEmail,
    this.applicantPhone,
    this.governmentIdType,
    this.rejectionReason,
    this.submittedAt,
  });

  final int id;
  final String name;
  final String status;
  final String address;
  final List<String> coverage;
  final bool hasPermit;
  final bool hasId;
  final bool hasIdBack;
  final String? applicantName;
  final String? applicantEmail;
  final String? applicantPhone;
  final String? governmentIdType;
  final String? rejectionReason;
  final DateTime? submittedAt;

  factory NetworkHubDetail.fromJson(Json json) {
    final applicant = asJson(json['applicant']);
    return NetworkHubDetail(
      id: asInt(json['id']),
      name: asString(json['hub_name']) ?? 'Hub',
      status: asString(json['status']) ?? '',
      address: [
        asString(json['address_street']),
        asString(json['address_barangay']),
        asString(json['address_city']),
        asString(json['address_province']),
      ].whereType<String>().join(', '),
      coverage: asStringList(json['coverage_barangays']),
      hasPermit: asString(json['dti_permit_url']) != null,
      hasId: asString(applicant['government_id_image_url']) != null,
      hasIdBack: asString(applicant['government_id_image_back_url']) != null,
      applicantName: applicant.isEmpty
          ? null
          : [
              asString(applicant['first_name']),
              asString(applicant['last_name']),
            ].whereType<String>().join(' '),
      applicantEmail: asString(applicant['email']),
      applicantPhone: asString(applicant['phone']),
      governmentIdType: asString(applicant['government_id_type']),
      rejectionReason: asString(json['rejection_reason']),
      submittedAt: asDate(json['created_at']),
    );
  }
}

// Courier team: riders (D7) ------------------------------------------------------------------------------------------

class CourierRiderSummary {
  const CourierRiderSummary({
    required this.total,
    required this.online,
    required this.active,
    required this.pendingActivation,
    required this.toVerify,
    required this.applications,
    required this.suspended,
    required this.maxActiveJobs,
  });

  final int total;
  final int online;
  final int active;
  final int pendingActivation;
  final int toVerify;
  final int applications;
  final int suspended;
  final int maxActiveJobs;

  factory CourierRiderSummary.fromJson(Json json) => CourierRiderSummary(
    total: asInt(json['total']),
    online: asInt(json['online']),
    active: asInt(json['active']),
    pendingActivation: asInt(json['pending_activation']),
    toVerify: asInt(json['pending_verification']),
    applications: asInt(json['applications']),
    suspended: asInt(json['suspended']),
    maxActiveJobs: asInt(json['max_active_jobs'], 3),
  );
}

class CourierRider {
  const CourierRider({
    required this.id,
    required this.name,
    required this.status,
    required this.online,
    required this.activeJobs,
    required this.deliveredToday,
    required this.applicant,
    required this.needsReverification,
    this.email,
    this.phone,
    this.vehicleType,
    this.plateNumber,
    this.licenseNumber,
    this.licenseExpiry,
    this.hubName,
    this.rejectionReason,
    this.suspensionReason,
    this.activationExpiresAt,
    this.documents = const [],
    this.audit = const [],
  });

  final int id;
  final String name;
  final String status;
  final bool online;
  final int activeJobs;
  final int deliveredToday;
  final bool applicant;
  final bool needsReverification;
  final String? email;
  final String? phone;
  final String? vehicleType;
  final String? plateNumber;
  final String? licenseNumber;
  final String? licenseExpiry;
  final String? hubName;
  final String? rejectionReason;
  final String? suspensionReason;
  final DateTime? activationExpiresAt;

  /// Only on the detail: `{key, label}` of what is on file.
  final List<RiderDocument> documents;
  final List<AuditEntry> audit;

  /// A rider waiting for a decision: an application, or a rider whose changed documents need checking.
  bool get canDecide =>
      status == 'PENDING' || (status == 'ACTIVE' && needsReverification);
  bool get canSuspend =>
      status == 'ACTIVE' || (status == 'PENDING' && !applicant);
  bool get isSuspended => status == 'SUSPENDED';
  bool get canResendActivation => status == 'PENDING_ACTIVATION';

  factory CourierRider.fromJson(Json json) => CourierRider(
    id: asInt(json['id']),
    name: asString(json['name']) ?? 'Rider',
    status: asString(json['status']) ?? '',
    online: asBool(json['online']),
    activeJobs: asInt(json['active_jobs']),
    deliveredToday: asInt(json['delivered_today']),
    applicant: asBool(json['applicant']),
    needsReverification: asBool(json['needs_reverification']),
    email: asString(json['email']),
    phone: asString(json['phone']),
    vehicleType: asString(json['vehicle_type']),
    plateNumber: asString(json['plate_number']),
    licenseNumber: asString(json['license_number']),
    licenseExpiry: asString(json['license_expiry']),
    hubName: asString(json['hub_name']),
    rejectionReason: asString(json['rejection_reason']),
    suspensionReason: asString(json['suspension_reason']),
    activationExpiresAt: asDate(json['activation_expires_at']),
    documents: asJsonList(json['documents'])
        .map(RiderDocument.fromJson)
        .toList(),
    audit: asJsonList(json['audit']).map(AuditEntry.fromJson).toList(),
  );
}

class RiderDocument {
  const RiderDocument(this.key, this.label);

  final String key;
  final String label;

  factory RiderDocument.fromJson(Json json) => RiderDocument(
    asString(json['key']) ?? '',
    asString(json['label']) ?? 'Document',
  );
}

/// One line of a read-only audit trail.
class AuditEntry {
  const AuditEntry({required this.action, this.reason, this.by, this.at});

  final String action;
  final String? reason;
  final String? by;
  final DateTime? at;

  factory AuditEntry.fromJson(Json json) => AuditEntry(
    action: asString(json['action']) ?? '',
    reason: asString(json['reason']),
    by: asString(json['by'] ?? json['actor']),
    at: asDate(json['at'] ?? json['created_at']),
  );
}

// Courier team: dispatch (D7) ---------------------------------------------------------------------------------------

/// The pickup board's tabs.
enum DispatchState {
  unassigned('unassigned', 'Unassigned'),
  offering('offering', 'Being offered'),
  assigned('assigned', 'Assigned, not picked up'),
  all('all', 'All');

  const DispatchState(this.key, this.label);

  final String key;
  final String label;
}

class DispatchJob {
  const DispatchJob({
    required this.id,
    required this.trackingNumber,
    required this.state,
    this.shopName,
    this.pickupArea,
    this.dropoffArea,
    this.codAmount,
    this.readyAt,
    this.riderName,
    this.offerRider,
    this.offerExpiresAt,
    this.attempts = 0,
    this.maxAttempts = 3,
  });

  final int id;
  final String trackingNumber;
  final String state;
  final String? shopName;
  final String? pickupArea;
  final String? dropoffArea;
  final double? codAmount;
  final DateTime? readyAt;
  final String? riderName;
  final String? offerRider;
  final DateTime? offerExpiresAt;
  final int attempts;
  final int maxAttempts;

  factory DispatchJob.fromJson(Json json) {
    final offer = asJson(json['offer']);
    return DispatchJob(
      id: asInt(json['id']),
      trackingNumber: asString(json['tracking_number']) ?? '',
      state: asString(json['state']) ?? '',
      shopName: asString(json['shop_name']),
      pickupArea: asString(json['pickup_area']),
      dropoffArea: asString(json['dropoff_area']),
      codAmount: asDoubleOrNull(json['cod_amount']),
      readyAt: asDate(json['ready_at']),
      riderName: asString(asJson(json['rider'])['name']),
      offerRider: asString(offer['rider']),
      offerExpiresAt: asDate(offer['expires_at']),
      attempts: asInt(json['attempts']),
      maxAttempts: asInt(json['max_attempts'], 3),
    );
  }
}

class DispatchBoard {
  const DispatchBoard({
    required this.jobs,
    required this.unassigned,
    required this.offering,
    required this.assigned,
  });

  final List<DispatchJob> jobs;
  final int unassigned;
  final int offering;
  final int assigned;

  int? count(DispatchState state) => switch (state) {
    DispatchState.unassigned => unassigned,
    DispatchState.offering => offering,
    DispatchState.assigned => assigned,
    DispatchState.all => null,
  };

  factory DispatchBoard.fromJson(Json json) {
    final counts = asJson(json['counts']);
    return DispatchBoard(
      jobs: asJsonList(json['data']).map(DispatchJob.fromJson).toList(),
      unassigned: asInt(counts['unassigned']),
      offering: asInt(counts['offering']),
      assigned: asInt(counts['assigned']),
    );
  }
}

/// A rider and whether they can take a job right now.
class DispatchRider {
  const DispatchRider({
    required this.id,
    required this.name,
    required this.activeJobs,
    required this.assignable,
    this.problem,
    this.distance,
  });

  final int id;
  final String name;
  final int activeJobs;
  final bool assignable;
  final String? problem;
  final String? distance;

  factory DispatchRider.fromJson(Json json) => DispatchRider(
    id: asInt(json['id']),
    name: asString(json['name']) ?? 'Rider',
    activeJobs: asInt(json['active_jobs']),
    assignable: asBool(json['assignable']),
    problem: asString(json['problem']),
    distance: asString(json['distance']),
  );
}

class DispatchRiders {
  const DispatchRiders({
    required this.available,
    required this.unavailable,
    required this.maxActiveJobs,
  });

  final List<DispatchRider> available;
  final List<DispatchRider> unavailable;
  final int maxActiveJobs;

  factory DispatchRiders.fromJson(Json json) => DispatchRiders(
    available: asJsonList(json['data']).map(DispatchRider.fromJson).toList(),
    unavailable: asJsonList(json['unavailable'])
        .map(DispatchRider.fromJson)
        .toList(),
    maxActiveJobs: asInt(json['max_active_jobs'], 3),
  );
}

// Courier team: hub scanning (D7) -----------------------------------------------------------------------------------

/// `GET /logistics/hub-ops`: the company's approved hubs and how many parcels are at each step.
class HubOps {
  const HubOps({
    required this.hubs,
    required this.incoming,
    required this.atHub,
    required this.sorted,
  });

  final List<OpsHub> hubs;
  final int incoming;
  final int atHub;
  final int sorted;

  factory HubOps.fromJson(Json json) {
    final counts = asJson(json['counts']);
    return HubOps(
      hubs: asJsonList(json['hubs']).map(OpsHub.fromJson).toList(),
      incoming: asInt(counts['incoming']),
      atHub: asInt(counts['at_hub']),
      sorted: asInt(counts['sorted']),
    );
  }
}

class OpsHub {
  const OpsHub(this.id, this.name);

  final int id;
  final String name;

  factory OpsHub.fromJson(Json json) =>
      OpsHub(asInt(json['id']), asString(json['name']) ?? 'Hub');
}

/// `GET /logistics/hub-ops/zones`: what each station works on.
class OpsBoard {
  const OpsBoard({
    required this.incoming,
    required this.toSort,
    required this.zones,
  });

  final List<OpsParcel> incoming;
  final List<OpsParcel> toSort;
  final List<OpsZone> zones;

  factory OpsBoard.fromJson(Json json) => OpsBoard(
    incoming: asJsonList(json['incoming']).map(OpsParcel.fromJson).toList(),
    toSort: asJsonList(json['to_sort']).map(OpsParcel.fromJson).toList(),
    zones: asJsonList(json['zones']).map(OpsZone.fromJson).toList(),
  );
}

class OpsZone {
  const OpsZone(this.name, this.parcels);

  final String name;
  final List<OpsParcel> parcels;

  factory OpsZone.fromJson(Json json) => OpsZone(
    asString(json['zone']) ?? 'No zone',
    asJsonList(json['parcels']).map(OpsParcel.fromJson).toList(),
  );
}

class OpsParcel {
  const OpsParcel({
    required this.trackingNumber,
    this.barangay,
    this.city,
    this.shop,
    this.rider,
  });

  final String trackingNumber;
  final String? barangay;
  final String? city;
  final String? shop;
  final String? rider;

  factory OpsParcel.fromJson(Json json) => OpsParcel(
    trackingNumber: asString(json['tracking_number']) ?? '',
    barangay: asString(json['barangay']),
    city: asString(json['city']),
    shop: asString(json['shop']),
    rider: asString(json['rider']),
  );
}

// Courier team: parcels (D7) -----------------------------------------------------------------------------------------

class ParcelRow {
  const ParcelRow({
    required this.id,
    required this.trackingNumber,
    required this.status,
    required this.attempts,
    this.orderNumber,
    this.hubName,
    this.barangay,
    this.codAmount,
    this.updatedAt,
  });

  final int id;
  final String trackingNumber;
  final String status;
  final int attempts;
  final String? orderNumber;
  final String? hubName;
  final String? barangay;
  final double? codAmount;
  final DateTime? updatedAt;

  factory ParcelRow.fromJson(Json json) => ParcelRow(
    id: asInt(json['id']),
    trackingNumber: asString(json['tracking_number']) ?? '',
    status: asString(json['status']) ?? '',
    attempts: asInt(json['attempts']),
    orderNumber: asString(json['order_number']),
    hubName: asString(json['hub_name']),
    barangay: asString(json['barangay']),
    codAmount: asDoubleOrNull(json['cod_amount']),
    updatedAt: asDate(json['updated_at']),
  );
}

class OverrideTarget {
  const OverrideTarget(this.value, this.label);

  final String value;
  final String label;

  factory OverrideTarget.fromJson(Json json) => OverrideTarget(
    asString(json['value']) ?? '',
    asString(json['label']) ?? '',
  );
}

class ParcelFailure {
  const ParcelFailure({required this.attempt, this.reason, this.note, this.at});

  final int attempt;
  final String? reason;
  final String? note;
  final DateTime? at;

  factory ParcelFailure.fromJson(Json json) => ParcelFailure(
    attempt: asInt(json['attempt']),
    reason: asString(json['reason']),
    note: asString(json['note']),
    at: asDate(json['at']),
  );
}

class TimelineEntry {
  const TimelineEntry({required this.text, this.actor, this.at});

  final String text;
  final String? actor;
  final DateTime? at;

  factory TimelineEntry.fromJson(Json json) => TimelineEntry(
    text:
        asString(json['note']) ??
        (asString(json['status']) ?? '').replaceAll('_', ' ').toLowerCase(),
    actor: asString(json['actor']),
    at: asDate(json['at']),
  );
}

class ParcelDetail {
  const ParcelDetail({
    required this.id,
    required this.trackingNumber,
    required this.status,
    required this.statusLabel,
    required this.attempts,
    required this.maxAttempts,
    required this.canMarkException,
    required this.overrideTargets,
    required this.failures,
    required this.timeline,
    required this.audit,
    this.orderNumber,
    this.paymentMethod,
    this.orderTotal,
    this.buyer,
    this.refundStatus,
    this.shopName,
    this.shopAddress,
    this.recipientName,
    this.recipientAddress,
    this.zone,
    this.weightKg,
    this.codAmount,
    this.hub,
    this.pickupRider,
    this.deliveryRider,
    this.returnRider,
    this.exceptionType,
    this.exceptionReason,
    this.exceptionAt,
    this.hasExceptionPhoto = false,
  });

  final int id;
  final String trackingNumber;
  final String status;
  final String statusLabel;
  final int attempts;
  final int maxAttempts;
  final bool canMarkException;
  final List<OverrideTarget> overrideTargets;
  final List<ParcelFailure> failures;
  final List<TimelineEntry> timeline;
  final List<AuditEntry> audit;
  final String? orderNumber;
  final String? paymentMethod;
  final double? orderTotal;
  final String? buyer;
  final String? refundStatus;
  final String? shopName;
  final String? shopAddress;
  final String? recipientName;
  final String? recipientAddress;
  final String? zone;
  final double? weightKg;
  final double? codAmount;
  final String? hub;
  final String? pickupRider;
  final String? deliveryRider;
  final String? returnRider;
  final String? exceptionType;
  final String? exceptionReason;
  final DateTime? exceptionAt;
  final bool hasExceptionPhoto;

  bool get canReschedule =>
      status == 'DELIVERY_FAILED' && attempts < maxAttempts;
  bool get isCod => paymentMethod == 'cod';

  factory ParcelDetail.fromJson(Json json) {
    final order = asJson(json['order']);
    final shop = asJson(json['shop']);
    final recipient = asJson(json['recipient']);
    final riders = asJson(json['riders']);
    final exception = asJson(json['exception']);
    return ParcelDetail(
      id: asInt(json['id']),
      trackingNumber: asString(json['tracking_number']) ?? '',
      status: asString(json['status']) ?? '',
      statusLabel:
          asString(json['status_label']) ??
          StatusWords.parcel(asString(json['status'])).$1,
      attempts: asInt(json['attempts']),
      maxAttempts: asInt(json['max_attempts'], 3),
      canMarkException: asBool(json['can_mark_exception']),
      overrideTargets: asJsonList(json['override_targets'])
          .map(OverrideTarget.fromJson)
          .toList(),
      failures: asJsonList(json['failures'])
          .map(ParcelFailure.fromJson)
          .toList(),
      timeline: asJsonList(json['timeline'])
          .map(TimelineEntry.fromJson)
          .toList(),
      audit: asJsonList(json['audit']).map(AuditEntry.fromJson).toList(),
      orderNumber: asString(order['order_number']),
      paymentMethod: asString(order['payment_method']),
      orderTotal: asDoubleOrNull(order['total']),
      buyer: asString(order['buyer']),
      refundStatus: asString(order['refund_status']),
      shopName: asString(shop['shop_name']),
      shopAddress: asString(shop['full_address']),
      recipientName: asString(recipient['name']),
      recipientAddress:
          asString(recipient['full_address']) ??
          [
            asString(recipient['barangay']),
            asString(recipient['city']),
          ].whereType<String>().join(', '),
      zone: asString(json['zone']),
      weightKg: asDoubleOrNull(json['weight_kg']),
      codAmount: asDoubleOrNull(json['cod_amount']),
      hub: asString(json['hub']),
      pickupRider: asString(riders['pickup']),
      deliveryRider: asString(riders['delivery']),
      returnRider: asString(riders['return']),
      exceptionType: asString(exception['type']),
      exceptionReason: asString(exception['reason']),
      exceptionAt: asDate(exception['at']),
      hasExceptionPhoto: asString(exception['photo_url']) != null,
    );
  }
}

// Courier team: COD (D7) ---------------------------------------------------------------------------------------------

class Remittance {
  const Remittance({
    required this.id,
    required this.amount,
    required this.shortfall,
    required this.status,
    this.rider,
    this.reference,
    this.balanceAtSubmission,
    this.submittedAt,
  });

  final int id;

  /// Money stays as the server sent it ("1250.00"): the app never works it out.
  final String amount;
  final String shortfall;
  final String status;
  final String? rider;
  final String? reference;
  final String? balanceAtSubmission;
  final DateTime? submittedAt;

  bool get isShort => (double.tryParse(shortfall) ?? 0) > 0;

  factory Remittance.fromJson(Json json) => Remittance(
    id: asInt(json['id']),
    amount: asString(json['amount']) ?? '0',
    shortfall: asString(json['shortfall']) ?? '0',
    status: asString(json['status']) ?? '',
    rider: asString(json['rider']),
    reference: asString(json['reference']),
    balanceAtSubmission: asString(json['balance_at_submission']),
    submittedAt: asDate(json['submitted_at']),
  );
}

class CodRiderDay {
  const CodRiderDay({
    required this.rider,
    required this.collected,
    required this.remitted,
    required this.difference,
    required this.shortfall,
    required this.balance,
  });

  final String rider;
  final String collected;
  final String remitted;
  final String difference;
  final bool shortfall;
  final String balance;

  factory CodRiderDay.fromJson(Json json) => CodRiderDay(
    rider: asString(json['rider']) ?? 'Rider',
    collected: asString(json['collected']) ?? '0',
    remitted: asString(json['remitted']) ?? '0',
    difference: asString(json['difference']) ?? '0',
    shortfall: asBool(json['shortfall']),
    balance: asString(json['balance']) ?? '0',
  );
}

/// `GET /logistics/cod?date=`: one day per rider, and every remittance waiting for the company.
class CodDay {
  const CodDay({
    required this.date,
    required this.collected,
    required this.remitted,
    required this.difference,
    required this.riders,
    required this.pending,
  });

  final String date;
  final String collected;
  final String remitted;
  final String difference;
  final List<CodRiderDay> riders;
  final List<Remittance> pending;

  factory CodDay.fromJson(Json json) {
    final totals = asJson(json['totals']);
    return CodDay(
      date: asString(json['date']) ?? '',
      collected: asString(totals['collected']) ?? '0',
      remitted: asString(totals['remitted']) ?? '0',
      difference: asString(totals['difference']) ?? '0',
      riders: asJsonList(json['riders']).map(CodRiderDay.fromJson).toList(),
      pending: asJsonList(json['pending']).map(Remittance.fromJson).toList(),
    );
  }
}

// Chat (D8) -----------------------------------------------------------------------------------------------------------

/// One message of a logistics thread. [senderRole] is `hub`, `courier` or `rider`.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    this.senderRole,
    this.senderName,
    this.createdAt,
  });

  final int id;
  final String body;
  final String? senderRole;
  final String? senderName;
  final DateTime? createdAt;

  factory ChatMessage.fromJson(Json json) => ChatMessage(
    id: asInt(json['id']),
    body: asString(json['body']) ?? '',
    senderRole: asString(json['sender_role']),
    senderName: asString(json['sender_name']),
    createdAt: asDate(json['created_at']),
  );
}

/// One fetch of a thread's messages, and whether it still takes new ones.
class ChatMessages {
  const ChatMessages({
    required this.messages,
    required this.canSend,
    this.closedMessage,
  });

  final List<ChatMessage> messages;
  final bool canSend;
  final String? closedMessage;

  factory ChatMessages.fromJson(Json json) {
    final meta = asJson(json['meta']);
    return ChatMessages(
      messages: asJsonList(json['data']).map(ChatMessage.fromJson).toList(),
      canSend: meta['can_send'] == null || asBool(meta['can_send']),
      closedMessage: asString(meta['closed_message']),
    );
  }
}

/// The hub's one thread with its courier company (`GET /hub/courier-chat`).
class CourierThread {
  const CourierThread({
    required this.unread,
    this.companyName,
    this.lastMessage,
    this.lastMessageAt,
  });

  final int unread;
  final String? companyName;
  final String? lastMessage;
  final DateTime? lastMessageAt;

  factory CourierThread.fromJson(Json json) {
    final last = asJson(json['last_message']);
    return CourierThread(
      unread: asInt(json['unread']),
      companyName: asString(asJson(json['company'])['name']),
      lastMessage: asString(last['body']),
      lastMessageAt: asDate(last['created_at']),
    );
  }
}

/// A rider's thread about one parcel, as the hub sees it (`GET /hub/chat/threads`).
class RiderThreadRow {
  const RiderThreadRow({
    required this.id,
    required this.riderName,
    required this.unread,
    required this.canSend,
    this.trackingNumber,
    this.lastMessage,
    this.lastMessageAt,
  });

  final int id;
  final String riderName;
  final int unread;
  final bool canSend;
  final String? trackingNumber;
  final String? lastMessage;
  final DateTime? lastMessageAt;

  factory RiderThreadRow.fromJson(Json json) => RiderThreadRow(
    id: asInt(json['id']),
    riderName: asString(asJson(json['recipient'])['name']) ?? 'Delivery rider',
    unread: asInt(json['unread']),
    canSend: asBool(json['can_send']),
    trackingNumber: asString(asJson(json['parcel'])['tracking_number']),
    lastMessage: asString(asJson(json['last_message'])['body']),
    lastMessageAt: asDate(json['last_message_at']),
  );
}

/// A hub in the courier's Messages (`GET /logistics/chat/hubs`). [threadId] is null until someone writes.
class HubThreadRow {
  const HubThreadRow({
    required this.hubId,
    required this.hubName,
    required this.place,
    required this.unread,
    this.threadId,
    this.lastMessage,
    this.lastMessageAt,
  });

  final int hubId;
  final String hubName;
  final String place;
  final int unread;
  final int? threadId;
  final String? lastMessage;
  final DateTime? lastMessageAt;

  factory HubThreadRow.fromJson(Json json) {
    final hub = asJson(json['hub']);
    final last = asJson(json['last_message']);
    return HubThreadRow(
      hubId: asInt(hub['id']),
      hubName: asString(hub['name']) ?? 'Hub',
      place: asString(hub['place']) ?? '',
      unread: asInt(json['unread']),
      threadId: asIntOrNull(json['thread_id']),
      lastMessage: asString(last['body']),
      lastMessageAt: asDate(last['created_at']),
    );
  }
}
