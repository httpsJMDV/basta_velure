import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/media/photo_picker.dart';
import 'logistics_models.dart';

final hubApiProvider = Provider<HubApi>(
  (ref) => HubApi(ref.watch(dioProvider)),
);

final courierApiProvider = Provider<CourierApi>(
  (ref) => CourierApi(ref.watch(dioProvider)),
);

/// What the hub and courier calls share. Each returns the server's data as a model, or throws an [ApiFailure] ready
/// to show. The app sends tracking numbers and what the person typed; the server checks everything again.
abstract class _LogisticsApi {
  _LogisticsApi(this._dio);

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

  Future<Json> _send(
    String path, {
    Object? data,
    String method = 'POST',
    ProgressCallback? onSendProgress,
  }) => _run(
    () async => asJson(
      (await _dio.request<Object?>(
        path,
        data: data,
        options: Options(method: method),
        onSendProgress: onSendProgress,
      )).data,
    ),
  );

  /// The server's message, or [fallback] when it sent none.
  Future<String> _message(
    String path, {
    Object? data,
    String method = 'POST',
    required String fallback,
    ProgressCallback? onSendProgress,
  }) async =>
      asString(
        (await _send(
          path,
          data: data,
          method: method,
          onSendProgress: onSendProgress,
        ))['message'],
      ) ??
      fallback;

  /// A private file (license, OR/CR, permit, ID, damage photo), fetched with the token and kept in memory only.
  Future<List<int>> _bytes(String path) => _run(() async {
    final response = await _dio.get<List<int>>(
      path,
      options: Options(responseType: ResponseType.bytes),
    );
    return response.data ?? const [];
  });

  static String _tn(String trackingNumber) =>
      Uri.encodeComponent(trackingNumber);
}

/// Every endpoint of the hub's screens (`/hub`, Part D, liam.md). A hub only ever sees its own parcels and riders.
class HubApi extends _LogisticsApi {
  HubApi(super.dio);

  // Dashboard (D1) ------------------------------------------------------------------------------------------------

  Future<HubMetrics> metrics() async => HubMetrics.fromJson(
    asJson((await _get('/hub/dashboard/metrics'))['data']),
  );

  Future<HubProfile> profile() async =>
      HubProfile.fromJson(asJson((await _get('/hub/profile'))['data']));

  /// The Home screen: the numbers, and the counts behind its alerts.
  Future<HubHome> home() async {
    final results = await Future.wait<Object>([
      metrics(),
      _get('/hub/intake/expected', query: {'per_page': 1}),
      _get('/hub/riders', query: {'status': 'PENDING', 'per_page': 1}),
      unreadMessages(),
    ]);
    return HubHome(
      metrics: results[0] as HubMetrics,
      expected: asInt(asJson((results[1] as Json)['meta'])['total']),
      pendingRiders: asInt(asJson((results[2] as Json)['counts'])['pending']),
      unreadMessages: results[3] as int,
    );
  }

  // Parcels coming in (D2) ----------------------------------------------------------------------------------------

  Future<ApiPage<IntakeParcel>> expected(int page) async => ApiPage.from(
    await _get('/hub/intake/expected', query: {'page': page}),
    IntakeParcel.fromJson,
  );

  Future<ApiPage<IntakeParcel>> receivedToday(int page) async => ApiPage.from(
    await _get('/hub/intake/received-today', query: {'page': page}),
    IntakeParcel.fromJson,
  );

  Future<IntakeParcel> lookUp(String trackingNumber) async =>
      IntakeParcel.fromJson(
        asJson(
          (await _get(
            '/hub/parcels/${_LogisticsApi._tn(trackingNumber)}',
          ))['data'],
        ),
      );

  /// A repeat is a 409 whose body has `scanned_in_at`; another hub's parcel is a 404.
  Future<IntakeParcel> receive(String trackingNumber) async =>
      IntakeParcel.fromJson(
        asJson(
          (await _send(
            '/hub/parcels/${_LogisticsApi._tn(trackingNumber)}/receive',
          ))['data'],
        ),
      );

  // Sorting (D3) --------------------------------------------------------------------------------------------------

  Future<List<SortingGroup>> sortingGroups({
    String? search,
    String? sort,
  }) async => asJsonList(
    (await _get(
      '/hub/sorting/groups',
      query: {'search': ?search, 'sort': ?sort},
    ))['data'],
  ).map(SortingGroup.fromJson).toList();

  Future<ApiPage<WaitingParcel>> sortingParcels(String code, int page) async =>
      ApiPage.from(
        await _get(
          '/hub/sorting/groups/$code/parcels',
          query: {'page': page, 'per_page': 100},
        ),
        WaitingParcel.fromJson,
      );

  /// All or nothing. Returns the message and the barangay's name.
  Future<({String message, String? barangay})> sort(
    List<String> trackingNumbers,
  ) async {
    final body = await _send(
      '/hub/sorting/sort',
      data: {'tracking_numbers': trackingNumbers},
    );
    return (
      message: asString(body['message']) ?? 'Parcels sorted.',
      barangay: asString(asJson(body['barangay'])['name']),
    );
  }

  // Dispatch (D4) -------------------------------------------------------------------------------------------------

  Future<List<DispatchBatch>> dispatchBatches({
    String? search,
    String? sort,
  }) async => asJsonList(
    (await _get(
      '/hub/dispatch/batches',
      query: {'search': ?search, 'sort': ?sort},
    ))['data'],
  ).map(DispatchBatch.fromJson).toList();

  Future<ApiPage<WaitingParcel>> batchParcels(String code, int page) async =>
      ApiPage.from(
        await _get(
          '/hub/dispatch/batches/$code/parcels',
          query: {'page': page, 'per_page': 100},
        ),
        WaitingParcel.fromJson,
      );

  Future<List<EligibleRider>> batchRiders(String code) async =>
      asJsonList((await _get('/hub/dispatch/batches/$code/riders'))['data'])
          .map(EligibleRider.fromJson)
          .toList();

  Future<String> assign({
    required int riderId,
    required List<String> trackingNumbers,
  }) => _message(
    '/hub/dispatch/assign',
    data: {'rider_id': riderId, 'tracking_numbers': trackingNumbers},
    fallback: 'Parcels assigned.',
  );

  Future<List<AwaitingRider>> awaitingPickup() async =>
      asJsonList((await _get('/hub/dispatch/awaiting-pickup'))['data'])
          .map(AwaitingRider.fromJson)
          .toList();

  // Deliveries (D5) -----------------------------------------------------------------------------------------------

  Future<OutDeliveries> outForDelivery({String? search, int? riderId}) async =>
      OutDeliveries.fromJson(
        await _get(
          '/hub/deliveries/out',
          query: {'search': ?search, 'rider_id': ?riderId},
        ),
      );

  Future<ApiPage<FailedDelivery>> failedDeliveries(
    int page, {
    String? search,
    String? reason,
  }) async => ApiPage.from(
    await _get(
      '/hub/deliveries/failed',
      query: {'page': page, 'search': ?search, 'reason': ?reason},
    ),
    FailedDelivery.fromJson,
  );

  Future<String> reschedule(String trackingNumber, int riderId) => _message(
    '/hub/deliveries/${_LogisticsApi._tn(trackingNumber)}/reschedule',
    data: {'rider_id': riderId},
    fallback: 'Parcel rescheduled.',
  );

  Future<String> returnToSeller(String trackingNumber, {String? note}) =>
      _message(
        '/hub/deliveries/${_LogisticsApi._tn(trackingNumber)}/return-to-seller',
        data: {'note': ?note},
        fallback: 'Parcel returned to the seller.',
      );

  // Riders (D6) ---------------------------------------------------------------------------------------------------

  Future<({ApiPage<HubRiderRow> page, HubRiderCounts counts})> riders(
    int page, {
    required String status,
    String? search,
  }) async {
    final body = await _get(
      '/hub/riders',
      query: {'page': page, 'status': status, 'search': ?search},
    );
    return (
      page: ApiPage.from(body, HubRiderRow.fromJson),
      counts: HubRiderCounts.fromJson(asJson(body['counts'])),
    );
  }

  Future<HubRiderDetail> rider(int id) async =>
      HubRiderDetail.fromJson(asJson((await _get('/hub/riders/$id'))['data']));

  Future<List<int>> riderLicense(int id) => _bytes('/hub/riders/$id/license');

  Future<List<int>> riderOrCr(int id) => _bytes('/hub/riders/$id/or-cr');

  Future<String> approveRider(int id) => _message(
    '/hub/riders/$id/approve',
    fallback: 'Courier application approved successfully.',
  );

  Future<String> disapproveRider(int id, String reason) => _message(
    '/hub/riders/$id/disapprove',
    data: {'reason': reason},
    fallback: 'Courier application disapproved successfully.',
  );

  Future<List<RiderArea>> riderAreas(int id) async =>
      asJsonList((await _get('/hub/riders/$id/areas'))['data'])
          .map(RiderArea.fromJson)
          .toList();

  /// The barangay codes this hub covers, which a rider's areas are chosen from.
  Future<List<String>> coverage() async => asStringList(
    asJson((await _get('/hub/coverage-options'))['data'])['coverage_barangays'],
  );

  Future<String> addArea(
    int riderId, {
    required String label,
    required List<String> barangays,
  }) => _message(
    '/hub/riders/$riderId/areas',
    data: {'area_label': label, 'coverage_barangays': barangays},
    fallback: 'Delivery area assigned successfully.',
  );

  Future<String> updateArea(
    int riderId,
    int areaId, {
    String? label,
    List<String>? barangays,
    bool? isActive,
  }) => _message(
    '/hub/riders/$riderId/areas/$areaId',
    method: 'PUT',
    data: {
      'area_label': ?label,
      'coverage_barangays': ?barangays,
      'is_active': ?isActive,
    },
    fallback: 'Area assignment updated successfully.',
  );

  Future<String> deactivateArea(int riderId, int areaId) => _message(
    '/hub/riders/$riderId/areas/$areaId',
    method: 'DELETE',
    fallback: 'Area assignment deactivated successfully.',
  );

  // Chat (D8) -----------------------------------------------------------------------------------------------------

  Future<CourierThread> courierThread() async =>
      CourierThread.fromJson(asJson((await _get('/hub/courier-chat'))['data']));

  Future<ChatMessages> courierMessages({int? afterId}) async =>
      ChatMessages.fromJson(
        await _get('/hub/courier-chat/messages', query: {'after_id': ?afterId}),
      );

  Future<ChatMessage> sendToCourier(String body) async => ChatMessage.fromJson(
    asJson(
      (await _send('/hub/courier-chat/messages', data: {'body': body}))['data'],
    ),
  );

  Future<void> markCourierRead() => _send('/hub/courier-chat/read');

  Future<({ApiPage<RiderThreadRow> page, int unreadTotal})> riderThreads(
    int page,
  ) async {
    final body = await _get('/hub/chat/threads', query: {'page': page});
    final parsed = ApiPage.from(body, RiderThreadRow.fromJson);
    return (page: parsed, unreadTotal: asInt(parsed.meta['unread_total']));
  }

  Future<ChatMessages> riderMessages(int id, {int? afterId}) async =>
      ChatMessages.fromJson(
        await _get(
          '/hub/chat/threads/$id/messages',
          query: {'after_id': ?afterId},
        ),
      );

  Future<ChatMessage> sendToRider(int id, String body) async =>
      ChatMessage.fromJson(
        asJson(
          (await _send(
            '/hub/chat/threads/$id/messages',
            data: {'body': body},
          ))['data'],
        ),
      );

  Future<void> markRiderRead(int id) => _send('/hub/chat/threads/$id/read');

  /// Rider threads and the courier thread together, for the Messages badge.
  Future<int> unreadMessages() async {
    final results = await Future.wait<Object>([
      riderThreads(1),
      courierThread(),
    ]);
    return (results[0] as ({ApiPage<RiderThreadRow> page, int unreadTotal}))
            .unreadTotal +
        (results[1] as CourierThread).unread;
  }
}

/// Every endpoint of the courier team's screens (`/logistics`, Part D). Every query is scoped to the company on the
/// server; another company's hub or parcel is a 404.
class CourierApi extends _LogisticsApi {
  CourierApi(super.dio);

  Future<CourierCompany> company() async =>
      CourierCompany.fromJson(asJson((await _get('/logistics/me'))['data']));

  Future<CourierDashboard> dashboard() async => CourierDashboard.fromJson(
    asJson((await _get('/logistics/dashboard'))['data']),
  );

  // Hubs ----------------------------------------------------------------------------------------------------------

  Future<List<NetworkHub>> hubs({String? status, String? search}) async =>
      asJsonList(
        (await _get(
          '/logistics/network/hubs',
          query: {'status': ?status, 'search': ?search},
        ))['data'],
      ).map(NetworkHub.fromJson).toList();

  Future<NetworkHubDetail> hub(int id) async => NetworkHubDetail.fromJson(
    asJson((await _get('/logistics/network/hubs/$id'))['data']),
  );

  /// `permit`, `id` or `id-back`.
  Future<List<int>> hubDocument(int id, String doc) =>
      _bytes('/logistics/network/hubs/$id/documents/$doc');

  Future<String> approveHub(int id) => _message(
    '/logistics/network/hubs/$id/approve',
    fallback: 'Hub approved.',
  );

  Future<String> rejectHub(int id, String reason) => _message(
    '/logistics/network/hubs/$id/reject',
    data: {'reason': reason},
    fallback: 'Hub rejected.',
  );

  Future<String> suspendHub(int id, String reason) => _message(
    '/logistics/network/hubs/$id/suspend',
    data: {'reason': reason},
    fallback: 'Hub suspended.',
  );

  Future<String> reactivateHub(int id) => _message(
    '/logistics/network/hubs/$id/reactivate',
    fallback: 'Hub reactivated.',
  );

  // Hub scanning ----------------------------------------------------------------------------------------------------

  Future<HubOps> hubOps() async =>
      HubOps.fromJson(asJson((await _get('/logistics/hub-ops'))['data']));

  Future<OpsBoard> opsBoard({int? hubId}) async => OpsBoard.fromJson(
    asJson(
      (await _get(
        '/logistics/hub-ops/zones',
        query: {'hub_id': ?hubId},
      ))['data'],
    ),
  );

  Future<String> scanInbound(String trackingNumber, {int? hubId}) => _message(
    '/logistics/hub-ops/inbound',
    data: {'tracking_number': trackingNumber, 'hub_id': ?hubId},
    fallback: 'Received at the hub.',
  );

  Future<String> scanSort(String trackingNumber) => _message(
    '/logistics/hub-ops/sort',
    data: {'tracking_number': trackingNumber},
    fallback: 'Sorted.',
  );

  Future<String> scanOutbound(String trackingNumber, int riderId) => _message(
    '/logistics/hub-ops/outbound',
    data: {'tracking_number': trackingNumber, 'rider_id': riderId},
    fallback: 'Handed to the rider.',
  );

  // Dispatch --------------------------------------------------------------------------------------------------------

  Future<DispatchBoard> dispatch(DispatchState state) async =>
      DispatchBoard.fromJson(
        await _get('/logistics/dispatch', query: {'state': state.key}),
      );

  Future<DispatchRiders> dispatchRiders({int? parcelId}) async =>
      DispatchRiders.fromJson(
        await _get(
          '/logistics/dispatch/riders',
          query: {'parcel_id': ?parcelId},
        ),
      );

  Future<String> assign(List<int> parcelIds, int riderId) => _message(
    '/logistics/dispatch/assign',
    data: {'parcel_ids': parcelIds, 'rider_id': riderId},
    fallback: 'Assigned.',
  );

  Future<String> autoAssign({List<int>? parcelIds}) => _message(
    '/logistics/dispatch/auto-assign',
    data: {'parcel_ids': ?parcelIds},
    fallback: 'Auto-assign finished.',
  );

  // Parcels ---------------------------------------------------------------------------------------------------------

  Future<ApiPage<ParcelRow>> parcels(
    int page, {
    String? search,
    bool problems = false,
  }) async => ApiPage.from(
    await _get(
      '/logistics/parcels',
      query: {'page': page, 'search': ?search, if (problems) 'problems': 1},
    ),
    ParcelRow.fromJson,
  );

  Future<ParcelDetail> parcel(int id) async => ParcelDetail.fromJson(
    asJson((await _get('/logistics/parcels/$id'))['data']),
  );

  Future<List<int>> exceptionPhoto(int id) =>
      _bytes('/logistics/parcels/$id/exception-photo');

  Future<String> overrideParcel(
    int id, {
    required String status,
    required String reason,
  }) => _message(
    '/logistics/parcels/$id/override',
    data: {'status': status, 'reason': reason},
    fallback: 'Status changed.',
  );

  /// `lost` or `damaged`; damaged needs a camera photo.
  Future<String> markException(
    int id, {
    required String type,
    required String reason,
    PickedPhoto? photo,
    ProgressCallback? onSendProgress,
  }) => _message(
    '/logistics/parcels/$id/exception',
    data: FormData.fromMap({
      'type': type,
      'reason': reason,
      'photo': ?photo?.toMultipart(),
    }),
    fallback: 'Parcel updated.',
    onSendProgress: onSendProgress,
  );

  Future<String> rescheduleParcel(int id, int riderId) => _message(
    '/logistics/parcels/$id/reschedule',
    data: {'rider_id': riderId},
    fallback: 'Rescheduled.',
  );

  // Riders ----------------------------------------------------------------------------------------------------------

  Future<({List<CourierRider> riders, CourierRiderSummary summary})> riders({
    String? status,
    String? search,
  }) async {
    final body = await _get(
      '/logistics/riders',
      query: {'status': ?status, 'search': ?search},
    );
    return (
      riders: asJsonList(body['data']).map(CourierRider.fromJson).toList(),
      summary: CourierRiderSummary.fromJson(asJson(body['summary'])),
    );
  }

  Future<CourierRider> rider(int id) async => CourierRider.fromJson(
    asJson((await _get('/logistics/riders/$id'))['data']),
  );

  /// `license` or `or-cr`.
  Future<List<int>> riderDocument(int id, String doc) =>
      _bytes('/logistics/riders/$id/documents/$doc');

  Future<String> addRider(
    Map<String, Object?> fields, {
    required PickedPhoto license,
    required PickedPhoto orCr,
    ProgressCallback? onSendProgress,
  }) => _message(
    '/logistics/riders',
    data: FormData.fromMap({
      ...fields,
      'drivers_license_image': license.toMultipart(),
      'or_cr_image': orCr.toMultipart(),
    }),
    fallback: 'Rider added.',
    onSendProgress: onSendProgress,
  );

  Future<String> approveRider(int id) =>
      _message('/logistics/riders/$id/approve', fallback: 'Rider approved.');

  Future<String> rejectRider(int id, String reason) => _message(
    '/logistics/riders/$id/reject',
    data: {'reason': reason},
    fallback: 'Rider rejected.',
  );

  Future<String> suspendRider(int id, String reason) => _message(
    '/logistics/riders/$id/suspend',
    data: {'reason': reason},
    fallback: 'Rider suspended.',
  );

  Future<String> reactivateRider(int id) => _message(
    '/logistics/riders/$id/reactivate',
    fallback: 'Rider reactivated.',
  );

  Future<String> resendActivation(int id) => _message(
    '/logistics/riders/$id/resend-activation',
    fallback: 'A new activation email was sent.',
  );

  // COD -------------------------------------------------------------------------------------------------------------

  Future<CodDay> cod({String? date}) async => CodDay.fromJson(
    asJson((await _get('/logistics/cod', query: {'date': ?date}))['data']),
  );

  Future<String> confirmRemittance(int id) => _message(
    '/logistics/cod/remittances/$id/confirm',
    fallback: 'Remittance confirmed.',
  );

  // Chat (D8) -----------------------------------------------------------------------------------------------------

  Future<List<HubThreadRow>> chatHubs() async =>
      asJsonList((await _get('/logistics/chat/hubs'))['data'])
          .map(HubThreadRow.fromJson)
          .toList();

  Future<int> unreadMessages() async =>
      asInt(asJson((await _get('/logistics/chat/unread'))['data'])['unread']);

  /// Finds or starts the thread with one hub.
  Future<int> openHubThread(int hubId) async => asInt(
    asJson((await _send('/logistics/chat/hubs/$hubId/thread'))['data'])['id'],
  );

  Future<ChatMessages> threadMessages(int id, {int? afterId}) async =>
      ChatMessages.fromJson(
        await _get(
          '/logistics/chat/threads/$id/messages',
          query: {'after_id': ?afterId},
        ),
      );

  Future<ChatMessage> sendToHub(int id, String body) async =>
      ChatMessage.fromJson(
        asJson(
          (await _send(
            '/logistics/chat/threads/$id/messages',
            data: {'body': body},
          ))['data'],
        ),
      );

  Future<void> markThreadRead(int id) =>
      _send('/logistics/chat/threads/$id/read');
}
