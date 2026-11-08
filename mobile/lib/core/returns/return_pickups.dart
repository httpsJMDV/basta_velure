import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_failure.dart';
import '../api/json.dart';
import '../media/photo_picker.dart';

/// A rider collecting a returned item from the buyer and taking it back to the shop (docs/api/return-pickups.md).
/// The buyer and the shop see the progress; the rider and the hub also get the addresses and phones.
class ReturnPickup {
  const ReturnPickup({
    required this.id,
    required this.code,
    required this.status,
    required this.statusLabel,
    required this.attempts,
    required this.maxAttempts,
    this.lastFailure,
    this.riderName,
    this.collectedAt,
    this.cancelReason,
    this.orderNumber,
    this.buyerName,
    this.buyerPhone,
    this.buyerAddress,
    this.buyerBarangay,
    this.shopName,
    this.shopPhone,
    this.shopAddress,
    this.assignedRider,
    this.throughHubs = false,
    this.collectHub,
    this.shopHub,
    this.currentHub,
    this.inTransit = false,
    this.readyForShopRider = false,
    this.shopRider,
    this.myStep,
  });

  final int id;
  final String code;

  /// `requested`, `assigned`, `collected`, `at_hub` (travelling back through the hubs), `out_to_shop`,
  /// `delivered`, `received` or `cancelled`.
  final String status;
  final String statusLabel;
  final int attempts;
  final int maxAttempts;
  final String? lastFailure;
  final String? riderName;
  final DateTime? collectedAt;
  final String? cancelReason;

  // Rider and hub views only.
  final String? orderNumber;
  final String? buyerName;
  final String? buyerPhone;
  final String? buyerAddress;
  final String? buyerBarangay;
  final String? shopName;
  final String? shopPhone;
  final String? shopAddress;
  final String? assignedRider;

  /// Far from the shop: the rider drops it at [collectHub] and it travels back to [shopHub] through the hubs.
  final bool throughHubs;
  final String? collectHub;
  final String? shopHub;

  /// While it travels back: the hub that has it (or that it is on its way to, when [inTransit]).
  final String? currentHub;
  final bool inTransit;

  /// At the hub near the shop: a rider of that hub can take it to the shop.
  final bool readyForShopRider;
  final String? shopRider;

  /// Rider view: `collect`, `drop_at_hub` or `deliver_to_shop` (null when this rider has nothing to do).
  final String? myStep;

  bool get isOpen => const ['requested', 'assigned', 'collected', 'at_hub', 'out_to_shop'].contains(status);

  /// The last leg, from the hub near the shop to the shop.
  bool get isShopLeg => readyForShopRider || status == 'out_to_shop';

  /// How far along: 0 booked, 1 rider assigned, 2 collected (or on its way back), 3 back with the shop.
  int get step => switch (status) {
    'assigned' => 1,
    'collected' || 'at_hub' || 'out_to_shop' => 2,
    'delivered' || 'received' => 3,
    _ => 0,
  };

  static ReturnPickup? fromJson(Object? value) {
    if (value is! Map) return null;
    final json = asJson(value);
    final buyer = asJson(json['buyer']);
    final shop = asJson(json['shop']);
    final rider = asJson(json['rider']);
    String? hubName(Object? value) => asString(asJson(value)['name']);
    return ReturnPickup(
      id: asInt(json['id']),
      code: asString(json['code']) ?? '',
      status: asString(json['status']) ?? '',
      statusLabel: asString(json['status_label']) ?? '',
      attempts: asInt(json['attempts']),
      maxAttempts: asInt(json['max_attempts'], 3),
      lastFailure: asString(json['last_failure']),
      riderName: asString(json['rider_name']),
      collectedAt: asDate(json['collected_at']),
      cancelReason: asString(json['cancel_reason']),
      orderNumber: asString(json['order_number']),
      buyerName: asString(buyer['name']),
      buyerPhone: asString(buyer['phone']),
      buyerAddress: asString(buyer['full_address']),
      buyerBarangay: asString(buyer['barangay']),
      shopName: asString(shop['shop_name']),
      shopPhone: asString(shop['phone']),
      shopAddress: asString(shop['full_address']),
      assignedRider: asString(rider['name']),
      throughHubs: json['through_hubs'] == true,
      collectHub: hubName(json['collect_hub']),
      shopHub: hubName(json['shop_hub']),
      currentHub: hubName(json['current_hub']),
      inTransit: json['in_transit'] == true,
      readyForShopRider: json['ready_for_shop_rider'] == true,
      shopRider: asString(asJson(json['shop_rider'])['name']),
      myStep: asString(json['my_step']),
    );
  }
}

/// A rider a hub can give a return pickup to.
typedef PickupRider = ({int id, String name, bool online});

final returnPickupApiProvider = Provider<ReturnPickupApi>(
  (ref) => ReturnPickupApi(ref.watch(dioProvider)),
);

class ReturnPickupApi {
  ReturnPickupApi(this._dio);

  final Dio _dio;

  Future<Json> _call(String method, String path, {Object? data}) async {
    try {
      return asJson(
        (await _dio.request<Object?>(
          path,
          data: data,
          options: Options(method: method),
        )).data,
      );
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// `rider` or `hub`: the pickups, and for the hub the riders it can choose.
  Future<(List<ReturnPickup>, List<PickupRider>)> list(String scope) async {
    final body = await _call('GET', '/$scope/return-pickups');
    return (
      asJsonList(body['data'])
          .map(ReturnPickup.fromJson)
          .whereType<ReturnPickup>()
          .toList(),
      [
        for (final r in asJsonList(asJson(body['meta'])['riders']))
          (
            id: asInt(r['id']),
            name: asString(r['name']) ?? 'Rider',
            online: asBool(r['online']),
          ),
      ],
    );
  }

  Future<String> assign(int id, int riderId) async =>
      asString(
        (await _call(
          'POST',
          '/hub/return-pickups/$id/assign',
          data: {'rider_id': riderId},
        ))['message'],
      ) ??
      'Rider assigned.';

  Future<String> collected(int id, PickedPhoto photo) async =>
      asString(
        (await _call(
          'POST',
          '/rider/return-pickups/$id/collected',
          data: FormData.fromMap({
            'photo': MultipartFile.fromBytes(photo.bytes, filename: 'item.jpg'),
          }),
        ))['message'],
      ) ??
      'Collected.';

  Future<String> failed(int id, String reason) async =>
      asString(
        (await _call(
          'POST',
          '/rider/return-pickups/$id/failed',
          data: {'reason': reason},
        ))['message'],
      ) ??
      'Saved.';

  /// Far from the shop: the collecting rider leaves the item at their hub, which sends it back through the hubs.
  Future<String> dropped(int id) async =>
      asString(
        (await _call('POST', '/rider/return-pickups/$id/dropped'))['message'],
      ) ??
      'Dropped at the hub.';

  Future<String> delivered(int id) async =>
      asString(
        (await _call('POST', '/rider/return-pickups/$id/delivered'))['message'],
      ) ??
      'Handed to the shop.';
}
