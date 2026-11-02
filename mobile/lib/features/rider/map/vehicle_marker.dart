import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// The vehicles a rider can register (`Rider::VEHICLE_TYPES` on the server).
enum RiderVehicle {
  motorcycle,
  tricycle,
  car,
  van;

  static RiderVehicle from(String? name) =>
      switch (name?.trim().toLowerCase()) {
        'tricycle' => tricycle,
        'car' => car,
        'van' => van,
        _ => motorcycle,
      };
}

/// The rider on the map: their own vehicle seen from above, nose first the way they are going, as delivery apps draw it.
class VehicleMarker extends StatelessWidget {
  const VehicleMarker({
    super.key,
    required this.vehicle,
    required this.heading,
    this.pulse,
    this.size = 60,
  });

  final RiderVehicle vehicle;

  /// Degrees from north.
  final double heading;

  /// 0 to 1 through one ring around the vehicle, or null for no ring.
  final double? pulse;
  final double size;

  @override
  Widget build(BuildContext context) {
    final ring = pulse;
    return Semantics(
      container: true,
      label: 'Your position',
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          if (ring != null)
            Container(
              width: size * (0.5 + 0.75 * ring),
              height: size * (0.5 + 0.75 * ring),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.brandRed.withValues(alpha: 0.26 * (1 - ring)),
              ),
            ),
          Transform.rotate(
            angle: heading * math.pi / 180,
            child: CustomPaint(
              size: Size.square(size),
              painter: VehiclePainter(vehicle),
            ),
          ),
        ],
      ),
    );
  }
}

/// Draws on a 64 by 64 grid, pointing up. Every shape gets a white edge first, so the vehicle stands out like a sticker
/// on a busy map at any size.
class VehiclePainter extends CustomPainter {
  const VehiclePainter(this.vehicle);

  final RiderVehicle vehicle;

  static const _ink = Color(0xFF1E1B18);
  static const _tire = Color(0xFF2A2623);
  static const _glass = Color(0xFF2F3E4E);
  static const _lamp = Color(0xFFFFE08A);
  static const _tail = Color(0xFF7F1D1D);
  static const _paint = AppColors.brandRed;
  static const _paintDark = Color(0xFF99001A);
  static const _paintLight = Color(0xFFDB2A3F);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64);
    switch (vehicle) {
      case RiderVehicle.motorcycle:
        _bike(canvas, 32);
      case RiderVehicle.tricycle:
        _tricycle(canvas);
      case RiderVehicle.car:
        _car(canvas);
      case RiderVehicle.van:
        _van(canvas);
    }
  }

  RRect _box(double l, double t, double r, double b, double radius) =>
      RRect.fromLTRBR(l, t, r, b, Radius.circular(radius));

  void _shadow(Canvas canvas, RRect shape) {
    canvas.drawRRect(
      shape.shift(const Offset(0, 1.5)),
      Paint()
        ..color = const Color(0x40000000)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5),
    );
  }

  void _edge(Canvas canvas, List<RRect> shapes) {
    final edge = Paint()
      ..color = AppColors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    for (final shape in shapes) {
      canvas.drawRRect(shape, edge);
    }
  }

  void _fill(Canvas canvas, RRect shape, Color color) =>
      canvas.drawRRect(shape, Paint()..color = color);

  /// A motorcycle with its delivery box, centered on [x].
  void _bike(Canvas canvas, double x) {
    final frontWheel = _box(x - 2.6, 6, x + 2.6, 19, 2.6);
    final body = _box(x - 6, 15, x + 6, 44, 6);
    final box = _box(x - 9.5, 41, x + 9.5, 58, 3.5);
    final bars = _box(x - 11, 19, x + 11, 21.5, 1.2);

    _shadow(canvas, body);
    _shadow(canvas, box);
    _edge(canvas, [frontWheel, body, box, bars]);

    _fill(canvas, frontWheel, _tire);
    _fill(canvas, body, _paint);
    _fill(canvas, _box(x - 3.5, 18, x + 3.5, 27, 3), _paintLight);
    _fill(canvas, bars, _ink);
    canvas.drawCircle(Offset(x, 16), 2, Paint()..color = _lamp);
    // The rider: shoulders and helmet.
    _fill(canvas, _box(x - 8.5, 28, x + 8.5, 36, 4), _ink);
    canvas.drawCircle(Offset(x, 31), 5.6, Paint()..color = AppColors.white);
    canvas.drawArc(
      Rect.fromCircle(center: Offset(x, 31), radius: 3.8),
      math.pi * 1.2,
      math.pi * 0.6,
      false,
      Paint()
        ..color = _glass
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round,
    );
    // The box, with the shop's colour band across it.
    _fill(canvas, box, _paintDark);
    _fill(canvas, _box(x - 9.5, 47.5, x + 9.5, 51.5, 0), AppColors.white);
  }

  /// A motorcycle with a covered sidecar on its right, the Philippine way.
  void _tricycle(Canvas canvas) {
    final sidecar = _box(32, 15, 56, 54, 7);
    final wheel = _box(54.5, 30, 59, 42, 2);
    final frontWheel = _box(16.4, 6, 21.6, 19, 2.6);
    final body = _box(13, 15, 25, 50, 6);
    final bars = _box(8, 19, 30, 21.5, 1.2);
    final rearWheel = _box(16.4, 46, 21.6, 58, 2.6);

    _shadow(canvas, sidecar);
    _shadow(canvas, body);
    _edge(canvas, [sidecar, wheel, frontWheel, body, bars, rearWheel]);

    _fill(canvas, wheel, _tire);
    // The arm that holds the sidecar to the bike.
    _fill(canvas, _box(24, 30, 33, 34, 1), _ink);
    _fill(canvas, _box(24, 42, 33, 46, 1), _ink);
    _fill(canvas, sidecar, _paint);
    _fill(canvas, _box(35, 19, 53, 25, 2.5), _glass);
    _fill(canvas, _box(35, 28, 53, 50, 4), _paintLight);
    _fill(canvas, _box(35, 37, 53, 41, 0), AppColors.white);

    _fill(canvas, frontWheel, _tire);
    _fill(canvas, rearWheel, _tire);
    _fill(canvas, body, _paintDark);
    _fill(canvas, bars, _ink);
    canvas.drawCircle(const Offset(19, 16), 2, Paint()..color = _lamp);
    _fill(canvas, _box(10.5, 28, 27.5, 36, 4), _ink);
    canvas.drawCircle(
      const Offset(19, 31),
      5.6,
      Paint()..color = AppColors.white,
    );
    canvas.drawArc(
      Rect.fromCircle(center: const Offset(19, 31), radius: 3.8),
      math.pi * 1.2,
      math.pi * 0.6,
      false,
      Paint()
        ..color = _glass
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round,
    );
  }

  void _car(Canvas canvas) {
    final body = _box(17, 5, 47, 59, 10);
    final mirrors = [_box(12.5, 22, 18, 26, 1.5), _box(46, 22, 51.5, 26, 1.5)];

    _shadow(canvas, body);
    _edge(canvas, [body, ...mirrors]);

    for (final mirror in mirrors) {
      _fill(canvas, mirror, _paintDark);
    }
    _fill(canvas, body, _paint);
    // Hood line, then the glass around the roof.
    _fill(canvas, _box(20.5, 8, 43.5, 17, 5), _paintLight);
    _fill(canvas, _box(20.5, 19.5, 43.5, 47.5, 6), _glass);
    _fill(canvas, _box(22, 26, 42, 42.5, 3.5), _paint);
    _fill(canvas, _box(24, 28, 40, 33, 2), _paintLight);
    // Lamps.
    _fill(canvas, _box(20, 5.5, 26, 8.5, 1.5), _lamp);
    _fill(canvas, _box(38, 5.5, 44, 8.5, 1.5), _lamp);
    _fill(canvas, _box(20, 55.5, 26, 58.5, 1.5), _tail);
    _fill(canvas, _box(38, 55.5, 44, 58.5, 1.5), _tail);
  }

  void _van(Canvas canvas) {
    final body = _box(15, 3, 49, 61, 7);
    final mirrors = [_box(10.5, 15, 16, 19, 1.5), _box(48, 15, 53.5, 19, 1.5)];

    _shadow(canvas, body);
    _edge(canvas, [body, ...mirrors]);

    for (final mirror in mirrors) {
      _fill(canvas, mirror, _ink);
    }
    _fill(canvas, body, _paint);
    // Short hood, wide windshield, then a long cargo roof with its ribs.
    _fill(canvas, _box(18.5, 5.5, 45.5, 11.5, 3.5), _paintLight);
    _fill(canvas, _box(18.5, 13, 45.5, 21, 2.5), _glass);
    _fill(canvas, _box(18.5, 23.5, 45.5, 57.5, 3), _paintLight);
    final rib = Paint()
      ..color = _paintDark
      ..strokeWidth = 1.2;
    for (final y in [31.0, 38.5, 46.0, 53.0]) {
      canvas.drawLine(Offset(21, y), Offset(43, y), rib);
    }
    _fill(canvas, _box(18, 3.5, 25, 6, 1.2), _lamp);
    _fill(canvas, _box(39, 3.5, 46, 6, 1.2), _lamp);
    _fill(canvas, _box(18, 58, 25, 60.5, 1.2), _tail);
    _fill(canvas, _box(39, 58, 46, 60.5, 1.2), _tail);
  }

  @override
  bool shouldRepaint(VehiclePainter old) => old.vehicle != vehicle;
}
