import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/media/photo_picker.dart';
import 'rider_models.dart';

final riderApiProvider = Provider<RiderApi>(
  (ref) => RiderApi(ref.watch(dioProvider)),
);

/// Every rider endpoint the app calls (Part C, king.md). Each method returns the server's data as a model, or throws
/// an [ApiFailure] ready to show. The app sends tracking numbers and what the rider typed; the server checks
/// everything again and decides every status change.
class RiderApi {
  RiderApi(this._dio);

  final Dio _dio;

  Future<T> _run<T>(Future<T> Function() request) async {
    try {
      return await request();
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  Future<Json> _get(String path, {Map<String, dynamic>? query}) => _run(
    () async =>
        asJson((await _dio.get<Object?>(path, queryParameters: query)).data),
  );

  Future<Json> _post(
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
    ProgressCallback? onSendProgress,
    String method = 'POST',
  }) => _run(
    () async => asJson(
      (await _dio.request<Object?>(
        path,
        data: data,
        options: Options(method: method, headers: headers),
        onSendProgress: onSendProgress,
      )).data,
    ),
  );

  static String _tn(String trackingNumber) =>
      Uri.encodeComponent(trackingNumber);

  // Profile and Online/Offline (C1, C2) ----------------------------------------

  Future<RiderProfile> me() async =>
      RiderProfile.fromJson(asJson((await _get('/rider/me'))['data']));

  Future<RiderWorkState> status() async =>
      RiderWorkState.fromJson(asJson((await _get('/rider/status'))['data']));

  /// Returns the server's message ("You are Online…") and the new state.
  Future<(String, RiderWorkState)> setOnline(bool online) async {
    final body = await _post('/rider/availability', data: {'online': online});
    return (
      asString(body['message']) ?? '',
      RiderWorkState.fromJson(asJson(body['data'])),
    );
  }

  // Job offers (C3) -------------------------------------------------------------

  Future<(List<RiderOffer>, RiderWorkState)> offers() async {
    final body = await _get('/rider/offers');
    final now = DateTime.now();
    return (
      asJsonList(body['data'])
          .map((o) => RiderOffer.fromJson(o, receivedAt: now))
          .toList(),
      RiderWorkState.fromJson(asJson(body['meta'])),
    );
  }

  Future<String> acceptOffer(int id) async =>
      asString((await _post('/rider/offers/$id/accept'))['message']) ??
      'Job accepted.';

  Future<String> declineOffer(int id) async =>
      asString((await _post('/rider/offers/$id/decline'))['message']) ??
      'Job declined.';

  // Pickups (C4) ----------------------------------------------------------------

  Future<PickupList> pickups(PickupView view) async {
    final body = await _get('/rider/pickups', query: {'view': view.key});
    return PickupList(
      groups: asJsonList(body['data']).map(PickupGroup.fromJson).toList(),
      counts: PickupCounts.fromJson(asJson(body['meta'])),
    );
  }

  Future<String> acceptPickup(int sellerId) async =>
      asString(
        (await _post('/rider/pickups/sellers/$sellerId/accept'))['message'],
      ) ??
      'Pickup accepted.';

  Future<String> declinePickup(int sellerId) async =>
      asString(
        (await _post('/rider/pickups/sellers/$sellerId/decline'))['message'],
      ) ??
      'Pickup declined.';

  Future<String> releasePickup(int sellerId) async =>
      asString(
        (await _post('/rider/pickups/sellers/$sellerId/release'))['message'],
      ) ??
      'Pickup released.';

  /// Checks one scanned waybill. Returns the tracking number as the server stores it.
  Future<String> verifyPickup(String trackingNumber) async {
    final body = await _post(
      '/rider/pickups/verify',
      data: {'tracking_number': trackingNumber},
    );
    return asString(asJson(body['data'])['tracking_number']) ?? trackingNumber;
  }

  /// The handover with the seller: every scanned parcel at once. A 422 names the refused ones by index.
  Future<({String message, List<String> done, RiderPlace? hub})> confirmPickup(
    List<String> trackingNumbers,
  ) async {
    final body = await _post(
      '/rider/pickups/confirm',
      data: {'tracking_numbers': trackingNumbers},
    );
    return (
      message: asString(body['message']) ?? 'Handover confirmed.',
      done: asStringList(body['tracking_numbers']),
      hub: RiderPlace.maybe(body['hub']),
    );
  }

  // Deliveries (C5) ---------------------------------------------------------------

  Future<DeliveryList> deliveries(DeliveryView view) async =>
      DeliveryList.fromJson(
        await _get('/rider/deliveries', query: {'view': view.key}),
      );

  /// Collect at the hub: the scanned parcels go out for delivery. All or nothing; a 422 names the refused ones.
  Future<List<String>> startDeliveries(List<String> trackingNumbers) async =>
      asStringList(
        (await _post(
          '/rider/deliveries/start',
          data: {'tracking_numbers': trackingNumbers},
        ))['tracking_numbers'],
      );

  Future<List<FailureReason>> failureReasons() async =>
      asJsonList((await _get('/rider/deliveries/failure-reasons'))['data'])
          .map(FailureReason.fromJson)
          .toList();

  /// Delivered: one or two proof photos from the camera and, for COD, the exact cash. No delivery code.
  Future<({String message, String? pay})> delivered(
    String trackingNumber, {
    required PickedPhoto photo,
    PickedPhoto? secondPhoto,
    String? receivedBy,
    String? codAmount,
    ProgressCallback? onSendProgress,
  }) async {
    final form = FormData.fromMap({
      'proof_photo': photo.toMultipart(),
      'proof_photo_2': ?secondPhoto?.toMultipart(),
      if (receivedBy != null && receivedBy.isNotEmpty)
        'received_by': receivedBy,
      'cod_amount': ?codAmount,
    });
    final body = await _post(
      '/rider/deliveries/${_tn(trackingNumber)}/delivered',
      data: form,
      onSendProgress: onSendProgress,
    );
    return (
      message: asString(body['message']) ?? 'Delivery recorded.',
      pay: asString(body['pay']),
    );
  }

  Future<FailedResult> failed(
    String trackingNumber, {
    required String reason,
    String? note,
  }) async => FailedResult.fromJson(
    await _post(
      '/rider/deliveries/${_tn(trackingNumber)}/failed',
      data: {'reason': reason, 'note': note},
    ),
  );

  // Returns to the seller ---------------------------------------------------------

  Future<List<ReturnJob>> returns() async =>
      asJsonList((await _get('/rider/returns'))['data'])
          .map(ReturnJob.fromJson)
          .toList();

  Future<String> returned(String trackingNumber) async =>
      asString(
        (await _post(
          '/rider/returns/${_tn(trackingNumber)}/delivered',
        ))['message'],
      ) ??
      'Returned to the seller.';

  // Live location (C6) -------------------------------------------------------------

  Future<LocationStatus> locationStatus() async => LocationStatus.fromJson(
    asJson((await _get('/rider/location/status'))['data']),
  );

  Future<void> sendLocation({
    required double latitude,
    required double longitude,
    double? heading,
    double? accuracy,
  }) => _post(
    '/rider/location',
    data: {
      'latitude': latitude,
      'longitude': longitude,
      'heading': ?heading,
      'accuracy': ?accuracy,
    },
  );

  // COD, earnings and GCash (C7) -------------------------------------------------------

  Future<CodSummary> cod() async =>
      CodSummary.fromJson(asJson((await _get('/rider/cod'))['data']));

  /// [idempotencyKey] stays the same when the rider retries after a network error, so a retry never hands over twice.
  Future<String> remit({
    required String amount,
    String? reference,
    required String idempotencyKey,
  }) async =>
      asString(
        (await _post(
          '/rider/cod/remittances',
          data: {'amount': amount, 'reference': ?reference},
          headers: {'Idempotency-Key': idempotencyKey},
        ))['message'],
      ) ??
      'Remittance submitted.';

  Future<EarningsSummary> earningsSummary(EarningsPeriod period) async =>
      EarningsSummary.fromJson(
        asJson(
          (await _get(
            '/rider/earnings/summary',
            query: {'period': period.key},
          ))['data'],
        ),
      );

  Future<ApiPage<EarnedJob>> earnedJobs(
    EarningsPeriod period,
    int page,
  ) async => ApiPage.from(
    await _get(
      '/rider/earnings/deliveries',
      query: {'period': period.key, 'page': page},
    ),
    EarnedJob.fromJson,
  );

  Future<ApiPage<HistoryEntry>> history(HistoryFilter filter, int page) async =>
      ApiPage.from(
        await _get(
          '/rider/history',
          query: {'outcome': filter.key, 'page': page},
        ),
        HistoryEntry.fromJson,
      );

  Future<GcashAccount> gcash() async =>
      GcashAccount.fromJson(asJson((await _get('/rider/gcash'))['data']));

  /// Both null removes the account.
  Future<GcashAccount> saveGcash({String? number, String? name}) async =>
      GcashAccount.fromJson(
        asJson(
          (await _post(
            '/rider/gcash',
            method: 'PATCH',
            data: {'gcash_number': number, 'gcash_name': name},
          ))['data'],
        ),
      );

  // Chat (C8) -----------------------------------------------------------------------

  Future<ApiPage<RiderThread>> threads(int page) async => ApiPage.from(
    await _get('/rider/chat/threads', query: {'page': page}),
    RiderThread.fromJson,
  );

  /// Unread per parcel and counterpart, and the total for the badge.
  Future<({int total, Map<String, int> byThreadKey})> chatUnread() async {
    final body = await _get('/rider/chat/unread');
    final byKey = <String, int>{};
    for (final item in asJsonList(body['data'])) {
      final key = threadKey(
        asString(item['tracking_number']),
        Counterpart.parse(item['counterpart']),
      );
      byKey[key] = (byKey[key] ?? 0) + asInt(item['unread']);
    }
    return (
      total: asInt(asJson(body['meta'])['unread_total']),
      byThreadKey: byKey,
    );
  }

  static String threadKey(String? trackingNumber, Counterpart? counterpart) =>
      '${trackingNumber ?? ''}:${counterpart?.key ?? ''}';

  /// Opens (or finds) the thread about a parcel with the seller, the buyer or the hub.
  Future<RiderThread> openThread(
    String trackingNumber,
    Counterpart counterpart,
  ) async => RiderThread.fromJson(
    asJson(
      (await _post(
        '/rider/chat/parcels/${_tn(trackingNumber)}/threads',
        data: {'counterpart': counterpart.key},
      ))['data'],
    ),
  );

  Future<RiderThread> thread(int id) async => RiderThread.fromJson(
    asJson((await _get('/rider/chat/threads/$id'))['data']),
  );

  Future<ThreadMessages> messages(int threadId, {int? afterId}) async =>
      ThreadMessages.fromJson(
        await _get(
          '/rider/chat/threads/$threadId/messages',
          query: {'after_id': ?afterId},
        ),
      );

  Future<ThreadMessage> send(int threadId, String body) async =>
      ThreadMessage.fromJson(
        asJson(
          (await _post(
            '/rider/chat/threads/$threadId/messages',
            data: {'body': body},
          ))['data'],
        ),
      );

  Future<void> markRead(int threadId) =>
      _post('/rider/chat/threads/$threadId/read');

  // Vehicle, license and documents (C8) -------------------------------------------------

  /// A new plate or vehicle needs a new OR/CR, and the courier company checks it again.
  Future<String> updateVehicle({
    required String vehicleType,
    required String plateNumber,
    required PickedPhoto orCr,
    ProgressCallback? onSendProgress,
  }) async =>
      asString(
        (await _post(
          '/rider/vehicle',
          data: FormData.fromMap({
            'vehicle_type': vehicleType,
            'plate_number': plateNumber,
            'or_cr_image': orCr.toMultipart(),
          }),
          onSendProgress: onSendProgress,
        ))['message'],
      ) ??
      'Vehicle updated.';

  Future<String> updateLicense({
    required String licenseNumber,
    required String licenseExpiry,
    PickedPhoto? photo,
    ProgressCallback? onSendProgress,
  }) async =>
      asString(
        (await _post(
          '/rider/license',
          data: FormData.fromMap({
            'license_number': licenseNumber,
            'license_expiry': licenseExpiry,
            'drivers_license_image': ?photo?.toMultipart(),
          }),
          onSendProgress: onSendProgress,
        ))['message'],
      ) ??
      'License updated.';

  /// The rider's own license or OR/CR, fetched with the token and kept in memory only.
  Future<List<int>> document(String key) => _run(() async {
    final response = await _dio.get<List<int>>(
      '/rider/documents/$key',
      options: Options(responseType: ResponseType.bytes),
    );
    return response.data ?? const [];
  });

  // Applying (C1, signed out) ----------------------------------------------------------

  Future<List<PublicHub>> hubs() async =>
      asJsonList((await _get('/logistics/hubs'))['data'])
          .map(PublicHub.fromJson)
          .toList();

  /// The public "Become a rider" form. Returns the server's message ("Application sent to …").
  Future<String> apply(
    Map<String, Object?> fields, {
    required PickedPhoto license,
    required PickedPhoto orCr,
    ProgressCallback? onSendProgress,
  }) async =>
      asString(
        (await _post(
          '/auth/register-rider',
          data: FormData.fromMap({
            ...fields,
            'drivers_license_image': license.toMultipart(),
            'or_cr_image': orCr.toMultipart(),
          }),
          onSendProgress: onSendProgress,
        ))['message'],
      ) ??
      'Application sent.';
}
