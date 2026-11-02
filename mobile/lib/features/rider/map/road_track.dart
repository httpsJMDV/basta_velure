import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// A road as a line you can walk along by distance, so the vehicle on the map follows its curves instead of cutting
/// across them. Distances are in meters from the start of the road.
class RoadTrack {
  RoadTrack(List<LatLng> points)
    : points = List.unmodifiable(points),
      _at = _measure(points);

  static const _distance = Distance(roundResult: false);

  final List<LatLng> points;
  final List<double> _at;

  double get length => _at.isEmpty ? 0 : _at.last;

  static List<double> _measure(List<LatLng> points) {
    final at = <double>[];
    var total = 0.0;
    for (var i = 0; i < points.length; i++) {
      if (i > 0) total += _distance.distance(points[i - 1], points[i]);
      at.add(total);
    }
    return at;
  }

  /// The piece of road [meters] falls on.
  int _segmentAt(double meters) {
    var low = 0;
    var high = points.length - 2;
    while (low < high) {
      final middle = (low + high + 1) ~/ 2;
      if (_at[middle] <= meters) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  LatLng pointAt(double meters) {
    if (points.length < 2 || meters <= 0) return points.first;
    if (meters >= length) return points.last;
    final i = _segmentAt(meters);
    final span = _at[i + 1] - _at[i];
    final t = span <= 0 ? 0.0 : (meters - _at[i]) / span;
    final a = points[i];
    final b = points[i + 1];
    return LatLng(
      a.latitude + (b.latitude - a.latitude) * t,
      a.longitude + (b.longitude - a.longitude) * t,
    );
  }

  /// Which way the road runs here, in degrees from north. Looks a little ahead, so a tiny kink doesn't twitch the vehicle.
  double bearingAt(double meters) {
    if (points.length < 2) return 0;
    final from = pointAt(meters);
    final to = pointAt(math.min(meters + 12, length));
    if (from == to) {
      final i = _segmentAt(math.max(0, meters - 1));
      return _distance.bearing(points[i], points[i + 1]) % 360;
    }
    return _distance.bearing(from, to) % 360;
  }

  /// The road between two distances.
  List<LatLng> slice(double from, double to) {
    if (points.length < 2 || to <= from) return const [];
    final start = from.clamp(0.0, length);
    final end = to.clamp(0.0, length);
    if (end <= start) return const [];
    return [
      pointAt(start),
      for (var i = 0; i < points.length; i++)
        if (_at[i] > start && _at[i] < end) points[i],
      pointAt(end),
    ];
  }

  /// The nearest place on the road to [point]: how far along it is, and how far off the road the point is.
  ({double meters, double offRoad}) project(LatLng point) {
    if (points.length < 2) {
      return (
        meters: 0,
        offRoad: points.isEmpty
            ? double.infinity
            : _distance.distance(points.first, point),
      );
    }
    // Over a few kilometers the earth is flat enough for this, and it runs on every position.
    final metersPerLat = 110540.0;
    final metersPerLng =
        111320.0 * math.cos(point.latitude * math.pi / 180).abs();
    var best = double.infinity;
    var bestMeters = 0.0;
    for (var i = 0; i < points.length - 1; i++) {
      final ax = (points[i].longitude - point.longitude) * metersPerLng;
      final ay = (points[i].latitude - point.latitude) * metersPerLat;
      final bx = (points[i + 1].longitude - point.longitude) * metersPerLng;
      final by = (points[i + 1].latitude - point.latitude) * metersPerLat;
      final dx = bx - ax;
      final dy = by - ay;
      final lengthSquared = dx * dx + dy * dy;
      final t = lengthSquared == 0
          ? 0.0
          : (-(ax * dx + ay * dy) / lengthSquared).clamp(0.0, 1.0);
      final x = ax + dx * t;
      final y = ay + dy * t;
      final away = x * x + y * y;
      if (away < best) {
        best = away;
        bestMeters = _at[i] + (_at[i + 1] - _at[i]) * t;
      }
    }
    return (meters: bestMeters, offRoad: math.sqrt(best));
  }
}
