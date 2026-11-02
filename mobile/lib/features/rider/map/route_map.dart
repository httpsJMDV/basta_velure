import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import '../data/rider_models.dart';
import '../location/location_beacon.dart';
import '../rider_paths.dart';
import '../widgets/rider_widgets.dart';
import 'road_track.dart';
import 'route_map_services.dart';
import 'vehicle_marker.dart';

/// One place the rider has to go, numbered as on the Deliveries or Pickups list.
class RouteStop {
  const RouteStop({
    required this.number,
    required this.title,
    required this.place,
    this.phone,
    this.codAmount,
    this.note,
  });

  final int number;
  final String title;
  final RiderPlace place;
  final String? phone;
  final double? codAmount;

  /// A short line about what happens here: "3 parcels to collect".
  final String? note;
}

/// The stops' places and the road between them, found one by one so the pins appear as they come.
class RouteMapData extends ChangeNotifier {
  RouteMapData(this._services, this.stops) {
    _load();
  }

  final RouteMapServices _services;
  final List<RouteStop> stops;
  final Map<int, LocatedPlace> located = {};
  RoutePath? path;
  bool _disposed = false;

  /// True once every address has been looked up.
  bool searched = false;

  /// Where the rider was when the road was first asked for, so it starts from them and not from the first stop.
  LatLng? _start;

  List<LatLng> get _pointsInOrder => [
    for (final stop in stops)
      if (located[stop.number] != null) located[stop.number]!.point,
  ];

  Future<void> _load() async {
    for (final stop in stops) {
      final place = await _services.locate(stop.place);
      if (_disposed) return;
      if (place != null) {
        located[stop.number] = place;
        notifyListeners();
      }
    }
    searched = true;
    notifyListeners();
    await _loadRoad();
  }

  Future<void> _loadRoad() async {
    final points = [?_start, ..._pointsInOrder];
    if (points.length < 2) return;
    final found = await _services.route(points);
    if (_disposed || found == null || found.points.isEmpty) return;
    path = found;
    notifyListeners();
  }

  /// The rider's first known position. Later ones only move their dot, so a moving rider doesn't keep asking for roads.
  void startFrom(LatLng point) {
    if (_start != null) return;
    _start = point;
    if (searched) _loadRoad();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  /// "8.2 km · about 24 min", or null until the road is known.
  String? get distanceLine {
    final road = path;
    if (road == null) return null;
    final km = road.meters / 1000;
    final minutes = (road.seconds / 60).ceil();
    final time = minutes >= 60
        ? '${minutes ~/ 60} h ${minutes % 60} min'
        : '$minutes min';
    return '${km.toStringAsFixed(km < 10 ? 1 : 0)} km · about $time';
  }
}

/// The map itself: tiles, the road, numbered pins and the rider's vehicle driving along it.
class RouteMap extends ConsumerStatefulWidget {
  const RouteMap({
    super.key,
    required this.data,
    this.interactive = false,
    this.selectedNumber,
    this.onSelect,
    this.onStopReached,
    this.onPreviewChanged,
    this.padding = const EdgeInsets.all(48),
    this.controller,
  });

  final RouteMapData data;
  final bool interactive;
  final int? selectedNumber;
  final ValueChanged<int>? onSelect;

  /// The route preview has just reached this stop.
  final ValueChanged<int>? onStopReached;
  final ValueChanged<bool>? onPreviewChanged;

  /// Room around the pins when the map fits them all, so nothing sits under a card.
  final EdgeInsets padding;
  final RouteMapHandle? controller;

  @override
  ConsumerState<RouteMap> createState() => _RouteMapState();
}

/// Lets the screen around the map move it.
class RouteMapHandle {
  _RouteMapState? _state;

  void showAll() => _state?._fitAll();
  void showStop(int number) => _state?._flyToStop(number);
  void showRider() => _state?._flyToRider();
  void startPreview() => _state?._startPreview();
  void stopPreview() => _state?._stopPreview();
  bool get previewing => _state?._previewing ?? false;
}

/// OpenStreetMap's colours, a little quieter, so the red road and the vehicle are what you see first.
const _softColors = ColorFilter.matrix([
  0.7218,
  0.2799,
  0.0282,
  0,
  0,
  0.0832,
  0.9186,
  0.0282,
  0,
  0,
  0.0832,
  0.2799,
  0.6668,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
]);

Widget _softTile(BuildContext context, Widget tile, TileImage image) =>
    ColorFiltered(colorFilter: _softColors, child: tile);

class _RouteMapState extends ConsumerState<RouteMap>
    with TickerProviderStateMixin {
  final _map = MapController();

  /// Glides the vehicle from where it is shown to its newest position.
  late final AnimationController _riderMove = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..addListener(_riderTick);
  late final AnimationController _roadDraw = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  );
  late final AnimationController _camera = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 750),
  );

  /// A ring around the vehicle, and a light running along the road ahead. On the big map only.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
  );
  late final AnimationController _flow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  /// Drives the vehicle along the whole road, with the camera following.
  late final AnimationController _preview = AnimationController(vsync: this)
    ..addListener(_previewTick)
    ..addStatusListener((status) {
      if (status == AnimationStatus.completed) _stopPreview();
    });

  RoadTrack? _track;
  Map<int, double> _stopAt = const {};
  final Set<int> _reached = {};
  bool _previewing = false;

  // Where the vehicle is drawn right now.
  LatLng? _riderPoint;
  double _riderBearing = 0;
  double? _progress;

  // Where it is gliding from and to: along the road when it can, in a straight line when it can't.
  double? _glideFromMeters;
  double? _glideToMeters;
  LatLng? _glideFromPoint;
  LatLng? _glideToPoint;
  double? _phoneHeading;
  LatLng? _lastFix;
  DateTime? _lastFixAt;

  bool _mapReady = false;
  bool _fittedOnce = false;
  RoutePath? _drawnPath;
  VoidCallback? _cameraListener;

  /// Manila: only until the first stop or position is known.
  static const _fallbackCenter = LatLng(14.5995, 120.9842);

  /// A position this close to the road counts as on it. GPS wanders about this much in town.
  static const _onRoadWithin = 40.0;

  bool get _calm => MediaQuery.disableAnimationsOf(context);

  @override
  void initState() {
    super.initState();
    widget.controller?._state = this;
    widget.data.addListener(_dataChanged);
  }

  @override
  void didUpdateWidget(RouteMap old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller?._state = null;
      widget.controller?._state = this;
    }
    if (old.data != widget.data) {
      old.data.removeListener(_dataChanged);
      widget.data.addListener(_dataChanged);
      _dataChanged();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.interactive && !_calm) {
      if (!_pulse.isAnimating) _pulse.repeat();
      if (!_flow.isAnimating) _flow.repeat();
    } else {
      _pulse.stop();
      _flow.stop();
    }
  }

  @override
  void dispose() {
    widget.controller?._state = null;
    widget.data.removeListener(_dataChanged);
    _riderMove.dispose();
    _roadDraw.dispose();
    _camera.dispose();
    _pulse.dispose();
    _flow.dispose();
    _preview.dispose();
    _map.dispose();
    super.dispose();
  }

  void _dataChanged() {
    if (!mounted) return;
    final road = widget.data.path;
    if (road != null && !identical(road, _drawnPath)) {
      _drawnPath = road;
      final track = RoadTrack(road.points);
      _track = track;
      _stopAt = {
        for (final entry in widget.data.located.entries)
          entry.key: track.project(entry.value.point).meters,
      };
      final rider = _riderPoint;
      if (rider != null) {
        final snap = track.project(rider);
        _progress = snap.offRoad <= _onRoadWithin ? snap.meters : null;
      }
      if (_calm) {
        _roadDraw.value = 1;
      } else {
        _roadDraw.forward(from: 0);
      }
    }
    if (_mapReady && (!_fittedOnce || widget.data.searched)) {
      _fitAll(once: true);
    }
    setState(() {});
  }

  /// A new position from the phone. They come about every 5 seconds, so the glide lasts as long as the last gap: the
  /// vehicle reaches this point just as the next one arrives, and never looks parked between them.
  void _riderMoved(RiderFix? fix) {
    if (fix == null) return;
    final next = LatLng(fix.latitude, fix.longitude);
    if (_lastFix == next) return;
    final firstFix = _lastFix == null;
    final now = DateTime.now();
    final gap = _lastFixAt == null
        ? 1400
        : now.difference(_lastFixAt!).inMilliseconds.clamp(900, 6500);
    _lastFix = next;
    _lastFixAt = now;
    _phoneHeading = fix.heading;
    widget.data.startFrom(next);

    final track = _track;
    final snap = track?.project(next);
    final onRoad = snap != null && snap.offRoad <= _onRoadWithin;
    final from = _progress;
    if (onRoad &&
        from != null &&
        snap.meters >= from - 5 &&
        snap.meters - from < 1500) {
      _glideFromMeters = from;
      _glideToMeters = snap.meters;
      _glideFromPoint = null;
      _glideToPoint = null;
    } else {
      _glideFromMeters = null;
      _glideToMeters = onRoad ? snap.meters : null;
      _glideFromPoint = _riderPoint ?? next;
      _glideToPoint = onRoad ? track!.pointAt(snap.meters) : next;
    }
    if (_riderPoint == null) {
      _riderPoint = _glideToPoint ?? next;
      _riderBearing = fix.heading ?? 0;
      _progress = onRoad ? snap.meters : null;
    }

    if (_calm) {
      _riderMove.value = 1;
      _riderTick();
    } else {
      _riderMove
        ..duration = Duration(milliseconds: gap)
        ..forward(from: 0);
    }
    // A rider who just appeared may be outside what the map shows, so it makes room for them.
    if (_mapReady && firstFix) _fitAll();
  }

  void _riderTick() {
    if (_previewing) return;
    final t = _riderMove.value;
    final track = _track;
    final fromMeters = _glideFromMeters;
    final toMeters = _glideToMeters;
    double? target;
    if (track != null && fromMeters != null && toMeters != null) {
      final meters = fromMeters + (toMeters - fromMeters) * t;
      _riderPoint = track.pointAt(meters);
      _progress = meters;
      target = track.bearingAt(meters);
    } else {
      final from = _glideFromPoint;
      final to = _glideToPoint;
      if (from == null || to == null) return;
      _riderPoint = LatLng(
        from.latitude + (to.latitude - from.latitude) * t,
        from.longitude + (to.longitude - from.longitude) * t,
      );
      if (t >= 1) _progress = toMeters;
      // Off the road, trust the phone's compass. Failing that, the direction it actually moved.
      const measure = Distance(roundResult: false);
      target =
          _phoneHeading ??
          (measure.distance(from, to) > 3 ? measure.bearing(from, to) : null);
    }
    if (target != null) _turnTowards(target, 0.14);
  }

  /// Turns a little each frame, the short way round, so the vehicle steers instead of snapping.
  void _turnTowards(double target, double amount) {
    final turn = ((target - _riderBearing + 540) % 360) - 180;
    _riderBearing = (_riderBearing + turn * amount) % 360;
  }

  void _startPreview() {
    final track = _track;
    if (track == null || _previewing || !_mapReady || _calm) return;
    _previewing = true;
    _reached.clear();
    _riderPoint ??= track.pointAt(0);
    _riderBearing = track.bearingAt(0);
    widget.onPreviewChanged?.call(true);
    _fly(track.pointAt(0), 16);
    final seconds = (track.length / 1000 * 1.5).clamp(7.0, 20.0);
    _preview
      ..duration = Duration(milliseconds: (seconds * 1000).round())
      ..forward(from: 0);
    setState(() {});
  }

  double get _previewMeters {
    final track = _track;
    if (track == null) return 0;
    // A short wait while the camera flies to the start, and an easy start and stop.
    const curve = Interval(0.06, 0.98, curve: Curves.easeInOutSine);
    return curve.transform(_preview.value) * track.length;
  }

  void _previewTick() {
    final track = _track;
    if (!_previewing || track == null) return;
    final meters = _previewMeters;
    _riderPoint = track.pointAt(meters);
    _turnTowards(track.bearingAt(meters), 0.2);
    if (!_camera.isAnimating) _map.move(_riderPoint!, _map.camera.zoom);
    for (final entry in _stopAt.entries) {
      if (meters >= entry.value && _reached.add(entry.key)) {
        widget.onStopReached?.call(entry.key);
      }
    }
  }

  void _stopPreview() {
    if (!_previewing) return;
    _previewing = false;
    _preview.stop();
    final track = _track;
    // Back to where the rider really is.
    final fix = _lastFix;
    if (fix != null) {
      final snap = track?.project(fix);
      final onRoad = snap != null && snap.offRoad <= _onRoadWithin;
      _progress = onRoad ? snap.meters : null;
      _riderPoint = onRoad ? track!.pointAt(snap.meters) : fix;
    } else {
      _riderPoint = null;
    }
    widget.onPreviewChanged?.call(false);
    _fitAll();
    if (mounted) setState(() {});
  }

  List<LatLng> get _allPoints => [
    for (final place in widget.data.located.values) place.point,
    ?_lastFix,
  ];

  void _fitAll({bool once = false}) {
    if (!_mapReady || _previewing) return;
    if (once && _fittedOnce && !widget.data.searched) return;
    final points = _allPoints;
    if (points.isEmpty) return;
    if (once && _fittedOnce && _camera.isAnimating) return;
    final fit = CameraFit.coordinates(
      coordinates: points,
      padding: widget.padding,
      maxZoom: 16,
    ).fit(_map.camera);
    _fly(fit.center, fit.zoom, jump: !_fittedOnce);
    _fittedOnce = true;
  }

  void _flyToStop(int number) {
    final place = widget.data.located[number];
    if (place != null && !_previewing) {
      _fly(place.point, math.max(_map.camera.zoom, 15));
    }
  }

  void _flyToRider() {
    final rider = _riderPoint;
    if (rider != null) {
      if (_previewing) _stopPreview();
      _fly(_lastFix ?? rider, math.max(_map.camera.zoom, 16));
    }
  }

  /// A smooth flight, not a jump: the centre and zoom ease together.
  void _fly(LatLng center, double zoom, {bool jump = false}) {
    if (!_mapReady) return;
    final listener = _cameraListener;
    if (listener != null) _camera.removeListener(listener);
    if (jump || _calm) {
      _camera.stop();
      _map.move(center, zoom);
      return;
    }
    final start = _map.camera;
    final curve = CurvedAnimation(
      parent: _camera,
      curve: Curves.easeInOutCubic,
    );
    void move() {
      final t = curve.value;
      _map.move(
        LatLng(
          start.center.latitude + (center.latitude - start.center.latitude) * t,
          start.center.longitude +
              (center.longitude - start.center.longitude) * t,
        ),
        start.zoom + (zoom - start.zoom) * t,
      );
    }

    _cameraListener = move;
    _camera
      ..addListener(move)
      ..forward(from: 0);
  }

  /// How far along the road the vehicle has got, for greying out what is behind it.
  double get _passed => _previewing ? _previewMeters : (_progress ?? 0);

  Widget _road(RoadTrack track) => AnimatedBuilder(
    animation: Listenable.merge([_roadDraw, _riderMove, _preview]),
    builder: (_, _) {
      final drawnTo = track.length * _roadDraw.value;
      final passed = math.min(_passed, drawnTo);
      final behind = track.slice(0, passed);
      final ahead = track.slice(passed, drawnTo);
      return PolylineLayer(
        polylines: [
          if (behind.length >= 2)
            Polyline(
              points: behind,
              strokeWidth: 5,
              color: AppColors.stone400,
              borderStrokeWidth: 2,
              borderColor: AppColors.white,
            ),
          if (ahead.length >= 2)
            Polyline(
              points: ahead,
              strokeWidth: 6,
              color: AppColors.brandRed,
              borderStrokeWidth: 2.5,
              borderColor: AppColors.white,
            ),
        ],
      );
    },
  );

  /// A short light that runs along the road ahead, up to the next stop, to show which way the trip goes.
  Widget _flowLight(RoadTrack track) => AnimatedBuilder(
    animation: _flow,
    builder: (_, _) {
      if (_previewing || _roadDraw.value < 1) return const SizedBox.shrink();
      final passed = _passed;
      final stopsAhead = _stopAt.values.where((at) => at > passed + 20);
      final end = stopsAhead.isEmpty
          ? track.length
          : stopsAhead.reduce(math.min);
      final span = end - passed;
      if (span <= 20) return const SizedBox.shrink();
      final head = passed + span * Curves.easeInOut.transform(_flow.value);
      final points = track.slice(
        math.max(passed, head - math.max(span * 0.14, 24)),
        head,
      );
      if (points.length < 2) return const SizedBox.shrink();
      return PolylineLayer(
        polylines: [
          Polyline(
            points: points,
            strokeWidth: 2.5,
            color: AppColors.white.withValues(alpha: 0.9),
          ),
        ],
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    ref.listen(riderFixProvider, (_, fix) {
      _riderMoved(fix);
      setState(() {});
    });
    if (_lastFix == null) {
      final fix = ref.read(riderFixProvider);
      if (fix != null) _riderMoved(fix);
    }
    final tiles = ref.watch(riderMapTilesProvider);
    final vehicle = RiderVehicle.from(
      ref.watch(currentUserProvider.select((user) => user?.rider?.vehicleType)),
    );
    final data = widget.data;
    final track = _track;

    return FlutterMap(
      mapController: _map,
      options: MapOptions(
        initialCenter: _lastFix ?? _fallbackCenter,
        initialZoom: 13,
        minZoom: 5,
        maxZoom: 19,
        backgroundColor: const Color(0xFFF3EFE9),
        interactionOptions: InteractionOptions(
          flags: widget.interactive
              ? InteractiveFlag.all & ~InteractiveFlag.rotate
              : InteractiveFlag.none,
        ),
        onMapReady: () {
          _mapReady = true;
          _fitAll(once: true);
        },
        // Touching the map during a preview hands it back to the rider.
        onPointerDown: (_, _) => _stopPreview(),
      ),
      children: [
        if (tiles != null)
          TileLayer(
            urlTemplate: tiles,
            // On a sharp screen, a set of tiles one zoom closer at half the size: small crisp street names.
            retinaMode: RetinaMode.isHighDensity(context),
            maxNativeZoom: 19,
            userAgentPackageName: 'shop.lovedit.loved_it',
            tileBuilder: _softTile,
          ),
        if (track != null) _road(track),
        if (track != null && widget.interactive) _flowLight(track),
        MarkerLayer(
          markers: [
            for (final stop in data.stops)
              if (data.located[stop.number] != null)
                Marker(
                  point: data.located[stop.number]!.point,
                  width: 46,
                  height: 56,
                  alignment: Alignment.topCenter,
                  child: _StopPin(
                    number: stop.number,
                    selected: stop.number == widget.selectedNumber,
                    delay: stop.number,
                    onTap: widget.onSelect == null
                        ? null
                        : () => widget.onSelect!(stop.number),
                  ),
                ),
          ],
        ),
        if (_riderPoint != null || _previewing)
          AnimatedBuilder(
            animation: Listenable.merge([_riderMove, _pulse, _preview]),
            builder: (_, _) {
              final point = _riderPoint;
              if (point == null) return const SizedBox.shrink();
              return MarkerLayer(
                markers: [
                  Marker(
                    point: point,
                    width: 96,
                    height: 96,
                    child: VehicleMarker(
                      vehicle: vehicle,
                      heading: _riderBearing,
                      pulse: widget.interactive && !_previewing
                          ? _pulse.value
                          : null,
                      size: widget.interactive ? 60 : 44,
                    ),
                  ),
                ],
              );
            },
          ),
      ],
    );
  }
}

/// The credit OpenStreetMap asks for: readable at all times, on its own patch of white, and linked to their licence.
class MapCredit extends StatelessWidget {
  const MapCredit({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      link: true,
      label: 'Map data from OpenStreetMap contributors',
      onTap: _open,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: _open,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.white.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(4),
          ),
          child: const Text(
            '© OpenStreetMap contributors',
            style: TextStyle(fontSize: 10, color: AppColors.stone700),
          ),
        ),
      ),
    );
  }

  void _open() => launchUrl(
    Uri.parse('https://www.openstreetmap.org/copyright'),
    mode: LaunchMode.externalApplication,
  );
}

/// A numbered pin that drops in with a small bounce. The chosen one is larger and red.
class _StopPin extends StatelessWidget {
  const _StopPin({
    required this.number,
    required this.selected,
    required this.delay,
    this.onTap,
  });

  final int number;
  final bool selected;
  final int delay;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final calm = MediaQuery.disableAnimationsOf(context);
    final color = selected ? AppColors.brandRed : AppColors.ink;
    return Semantics(
      button: onTap != null,
      label: 'Stop $number',
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: calm ? 1 : 0, end: 1),
          duration: calm
              ? Duration.zero
              : Duration(milliseconds: 520 + math.min(delay, 8) * 50),
          curve: Curves.elasticOut,
          builder: (_, value, child) => Transform.scale(
            scale: value.clamp(0.0, 1.25),
            alignment: Alignment.bottomCenter,
            child: child,
          ),
          child: AnimatedScale(
            scale: selected ? 1.18 : 1,
            duration: calm ? Duration.zero : const Duration(milliseconds: 220),
            curve: Curves.easeOutBack,
            alignment: Alignment.bottomCenter,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.white, width: 2.5),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x40000000),
                        blurRadius: 8,
                        offset: Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Text(
                    '$number',
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      height: 1,
                    ),
                  ),
                ),
                CustomPaint(size: const Size(12, 8), painter: _PinTip(color)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PinTip extends CustomPainter {
  const _PinTip(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final tip = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(tip, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_PinTip old) => old.color != color;
}

/// A live picture of the route at the top of a list. Tap it for the full map.
class RouteMapCard extends ConsumerStatefulWidget {
  const RouteMapCard({super.key, required this.stops, this.title});

  final List<RouteStop> stops;
  final String? title;

  @override
  ConsumerState<RouteMapCard> createState() => _RouteMapCardState();
}

class _RouteMapCardState extends ConsumerState<RouteMapCard> {
  late RouteMapData _data = _newData();
  String _key = '';

  RouteMapData _newData() {
    _key = _keyOf(widget.stops);
    return RouteMapData(ref.read(routeMapServicesProvider), widget.stops);
  }

  static String _keyOf(List<RouteStop> stops) =>
      stops.map((s) => '${s.number}:${s.place.fullAddress}').join('|');

  @override
  void didUpdateWidget(RouteMapCard old) {
    super.didUpdateWidget(old);
    // The list refreshes every 30 seconds. Only a real change to the stops looks them up again.
    if (_keyOf(widget.stops) != _key) {
      _data.dispose();
      _data = _newData();
    }
  }

  @override
  void dispose() {
    _data.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = widget.stops.length;
    return Semantics(
      button: true,
      label: 'Open the route map',
      onTap: _open,
      child: RiderCard(
        padding: EdgeInsets.zero,
        child: InkWell(
          onTap: _open,
          borderRadius: BorderRadius.circular(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(20),
                ),
                child: SizedBox(
                  height: 168,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      IgnorePointer(
                        child: RouteMap(
                          data: _data,
                          padding: const EdgeInsets.fromLTRB(40, 56, 40, 24),
                        ),
                      ),
                      const Positioned(right: 6, bottom: 6, child: MapCredit()),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.md,
                  AppSpace.md,
                  AppSpace.md,
                ),
                child: AnimatedBuilder(
                  animation: _data,
                  builder: (_, _) => Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title ??
                                  '$count stop${count == 1 ? '' : 's'} on your route',
                              style: RiderText.name,
                            ),
                            if (_data.distanceLine != null)
                              Text(_data.distanceLine!, style: RiderText.label),
                          ],
                        ),
                      ),
                      const Text(
                        'Open map',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.brandRed,
                        ),
                      ),
                      const Icon(
                        LucideIcons.chevronRight,
                        size: 18,
                        color: AppColors.brandRed,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _open() => context.push(RiderPaths.routeMap, extra: widget.stops);
}
