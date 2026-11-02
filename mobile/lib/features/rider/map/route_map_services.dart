import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/env.dart';
import '../data/rider_models.dart';

/// Where a stop's address is on the map. [exact] is false when only its barangay or city was found.
class LocatedPlace {
  const LocatedPlace(this.point, {required this.exact});

  final LatLng point;
  final bool exact;
}

/// The road between the stops.
class RoutePath {
  const RoutePath({
    required this.points,
    required this.meters,
    required this.seconds,
  });

  final List<LatLng> points;
  final double meters;
  final double seconds;
}

/// The address and road lookups. The same free services as the website (`frontend/src/utils/mapServices.ts`):
/// Nominatim for addresses, which allows one request a second, and the OSRM router. Both get their own client, so the
/// rider's sign-in token never goes to them, and only the address is sent: never the recipient's name or phone.
abstract class RouteMapServices {
  const RouteMapServices();

  Future<LocatedPlace?> locate(RiderPlace place);
  Future<RoutePath?> route(List<LatLng> points);
}

/// For tests and for when a lookup is not wanted: nothing found, so the map shows no pins.
class NoRouteMapServices extends RouteMapServices {
  const NoRouteMapServices();

  @override
  Future<LocatedPlace?> locate(RiderPlace place) async => null;

  @override
  Future<RoutePath?> route(List<LatLng> points) async => null;
}

class OpenRouteMapServices extends RouteMapServices {
  OpenRouteMapServices({Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              connectTimeout: const Duration(seconds: 8),
              receiveTimeout: const Duration(seconds: 12),
              headers: const {
                'User-Agent': 'LovedIT-Rider/1.0 (+https://loved-it.shop)',
              },
            ),
          );

  static const _gap = Duration(milliseconds: 1100);

  /// OSRM's public server turns down longer lists of stops.
  static const maxRoutePoints = 25;

  final Dio _dio;
  final Map<String, LocatedPlace?> _places = {};
  final Map<String, RoutePath?> _routes = {};
  Future<void> _queue = Future<void>.value();

  /// One Nominatim request at a time, with a gap between them.
  Future<T> _paced<T>(Future<T> Function() task) {
    final run = _queue.then((_) => task());
    _queue = run.then<void>(
      (_) => Future<void>.delayed(_gap),
      onError: (Object _) => Future<void>.delayed(_gap),
    );
    return run;
  }

  /// Street addresses are often missing from the map in the Philippines, so it falls back to the barangay, then the city.
  @override
  Future<LocatedPlace?> locate(RiderPlace place) async {
    final key = place.fullAddress;
    if (_places.containsKey(key)) return _places[key];

    final area = [
      place.city,
      place.province,
    ].whereType<String>().where((part) => part.isNotEmpty).toList();
    final tries = <(String, bool)>[
      if (place.street != null && place.barangay != null)
        ([place.street!, place.barangay!, ...area].join(', '), true),
      if (place.barangay != null)
        ([place.barangay!, ...area].join(', '), false),
      if (area.isNotEmpty) (area.join(', '), false),
      if (place.street == null && place.barangay == null && area.isEmpty)
        (place.fullAddress, true),
    ];

    for (final (query, exact) in tries) {
      final point = await _paced(() => _search(query));
      if (point != null) {
        return _places[key] = LocatedPlace(point, exact: exact);
      }
    }
    return _places[key] = null;
  }

  Future<LatLng?> _search(String query) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        'https://nominatim.openstreetmap.org/search',
        queryParameters: {
          'q': query,
          'countrycodes': 'ph',
          'format': 'jsonv2',
          'limit': 1,
        },
      );
      final found = response.data;
      if (found == null || found.isEmpty) return null;
      final first = found.first as Map<String, dynamic>;
      final latitude = double.tryParse('${first['lat']}');
      final longitude = double.tryParse('${first['lon']}');
      if (latitude == null || longitude == null) return null;
      return LatLng(latitude, longitude);
    } on DioException {
      return null;
    }
  }

  @override
  Future<RoutePath?> route(List<LatLng> points) async {
    if (points.length < 2) return null;
    final limited = points.take(maxRoutePoints).toList();
    final coordinates = limited
        .map((p) => '${p.longitude},${p.latitude}')
        .join(';');
    if (_routes.containsKey(coordinates)) return _routes[coordinates];
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        'https://router.project-osrm.org/route/v1/driving/$coordinates',
        queryParameters: {'overview': 'full', 'geometries': 'geojson'},
      );
      final routes = response.data?['routes'];
      if (routes is! List || routes.isEmpty) return _routes[coordinates] = null;
      final best = routes.first as Map<String, dynamic>;
      final line =
          (best['geometry'] as Map<String, dynamic>)['coordinates']
              as List<dynamic>;
      return _routes[coordinates] = RoutePath(
        points: [
          for (final pair in line)
            LatLng(
              ((pair as List<dynamic>)[1] as num).toDouble(),
              (pair[0] as num).toDouble(),
            ),
        ],
        meters: (best['distance'] as num).toDouble(),
        seconds: (best['duration'] as num).toDouble(),
      );
    } on DioException {
      // Not remembered: the road service may be back on the next look.
      return null;
    }
  }
}

final routeMapServicesProvider = Provider<RouteMapServices>(
  (ref) => OpenRouteMapServices(),
);

/// The address of the map's picture tiles, or null to draw the map without them.
final riderMapTilesProvider = Provider<String?>((ref) => Env.mapTileUrl);
