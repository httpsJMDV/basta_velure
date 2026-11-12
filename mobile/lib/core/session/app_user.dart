/// The signed-in account, from `POST /auth/login` and `GET /auth/me` (backend `UserResource`). Only what the app
/// needs to decide screens; each feature reads its own details from its own endpoints.
class AppUser {
  const AppUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.role,
    required this.status,
    this.middleName,
    this.phoneLocal,
    this.dateOfBirth,
    this.sex,
    this.avatarUrl,
    this.governmentIdType,
    this.sellerApplicationStatus,
    this.shopName,
    this.sortingCenter,
    this.rider,
    this.logisticsCompany,
    this.workAccount,
  });

  final int id;
  final String firstName;
  final String? middleName;
  final String lastName;
  final String email;

  /// `09XXXXXXXXX`, the way forms show the number (stored as `+639…` on the server).
  final String? phoneLocal;

  /// `YYYY-MM-DD`, or null for a Google sign-up that has not finished its profile.
  final String? dateOfBirth;

  /// `male`, `female` or `prefer_not_to_say`.
  final String? sex;
  final String? avatarUrl;

  /// `buyer`, `seller`, `rider` or `admin`. Sellers, hub owners and courier staff are buyers whose application was
  /// approved, so the profiles below decide their screens, not the role.
  final String role;

  /// `active`, `unverified`, `suspended` or `pending_activation`.
  final String status;
  final String? governmentIdType;
  final String? sellerApplicationStatus;

  /// The shop's name, for an account with a seller profile.
  final String? shopName;
  final HubSummary? sortingCenter;
  final RiderSummary? rider;
  final CourierSummary? logisticsCompany;

  /// `work_account` from the server (User::isWorkAccount), when it sends it.
  final bool? workAccount;

  /// A hub, courier company, rider or truck driver account, an application in review included: it does deliveries
  /// and never shops. Only a seller switches between selling and buying.
  bool get isWorkAccount =>
      workAccount ??
      (role == 'rider' ||
          (rider != null && rider!.status != 'DISAPPROVED') ||
          (sortingCenter != null && sortingCenter!.status != 'REJECTED') ||
          (logisticsCompany != null && logisticsCompany!.status != 'REJECTED'));

  String get fullName => [
    firstName,
    middleName,
    lastName,
  ].where((part) => part != null && part.trim().isNotEmpty).join(' ');

  bool get isAdmin => role == 'admin';

  /// A Google sign-up starts without a birthday or mobile number and finishes them on Complete profile (the
  /// website's `isProfileIncomplete`). Accounts made with the sign-up form already have both.
  bool get needsProfile =>
      role == 'buyer' && (dateOfBirth == null || phoneLocal == null);
  bool get isSeller =>
      role == 'seller' || sellerApplicationStatus == 'approved';

  factory AppUser.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? object(String key) =>
        json[key] is Map ? Map<String, dynamic>.from(json[key] as Map) : null;
    final seller = object('seller_profile');
    final hub = object('sorting_center');
    final rider = object('rider');
    final courier = object('logistics_company');

    return AppUser(
      id: (json['id'] as num).toInt(),
      firstName: json['first_name'] as String? ?? '',
      middleName: json['middle_name'] as String?,
      lastName: json['last_name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      phoneLocal: json['phone_local'] as String?,
      dateOfBirth: json['date_of_birth'] as String?,
      sex: json['sex'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      role: json['role'] as String? ?? 'buyer',
      status: json['status'] as String? ?? 'active',
      governmentIdType: json['government_id_type'] as String?,
      sellerApplicationStatus: seller?['application_status'] as String?,
      shopName: seller?['shop_name'] as String?,
      sortingCenter: hub == null ? null : HubSummary.fromJson(hub),
      rider: rider == null ? null : RiderSummary.fromJson(rider),
      logisticsCompany: courier == null
          ? null
          : CourierSummary.fromJson(courier),
      workAccount: json['work_account'] as bool?,
    );
  }
}

/// The hub this account runs. `status`: `PENDING`, `APPROVED`, `REJECTED` or `SUSPENDED`.
class HubSummary {
  const HubSummary({
    required this.id,
    required this.hubName,
    required this.status,
  });

  final int id;
  final String hubName;
  final String status;

  bool get isApproved => status == 'APPROVED';

  factory HubSummary.fromJson(Map<String, dynamic> json) => HubSummary(
    id: (json['id'] as num).toInt(),
    hubName: json['hub_name'] as String? ?? '',
    status: json['status'] as String? ?? '',
  );
}

/// The rider profile. `status`: `PENDING`, `PENDING_ACTIVATION`, `ACTIVE`, `SUSPENDED` or `DISAPPROVED`.
class RiderSummary {
  const RiderSummary({
    required this.id,
    required this.status,
    this.hubName,
    this.companyName,
    this.vehicleType,
    this.duty,
  });

  final int id;
  final String status;

  /// `truck`: drives parcels between hubs and sees Trips, not pickups or deliveries. `delivery` otherwise.
  final String? duty;

  bool get isTruckDriver => duty == 'truck';
  final String? hubName;
  final String? companyName;

  /// Motorcycle, Tricycle, Car or Van: what their map marker looks like.
  final String? vehicleType;

  /// A suspended rider still opens the rider screens and sees why there, like the website (RID-PROF-006).
  bool get opensRiderHome => status == 'ACTIVE' || status == 'SUSPENDED';

  factory RiderSummary.fromJson(Map<String, dynamic> json) => RiderSummary(
    id: (json['id'] as num).toInt(),
    status: json['status'] as String? ?? '',
    hubName: json['hub_name'] as String?,
    companyName: json['company_name'] as String?,
    vehicleType: json['vehicle_type'] as String?,
    duty: json['duty'] as String?,
  );
}

/// The courier company this account belongs to. `status`: `PENDING`, `APPROVED`, `REJECTED` or `SUSPENDED`.
class CourierSummary {
  const CourierSummary({
    required this.id,
    required this.name,
    required this.status,
    this.memberRole,
  });

  final int id;
  final String name;
  final String status;
  final String? memberRole;

  bool get isApproved => status == 'APPROVED';

  factory CourierSummary.fromJson(Map<String, dynamic> json) => CourierSummary(
    id: (json['id'] as num).toInt(),
    name: json['name'] as String? ?? '',
    status: json['status'] as String? ?? '',
    memberRole: json['role'] as String?,
  );
}
