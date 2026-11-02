import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/session/session.dart';
import '../data/rider_api.dart';

/// Where location sharing stands (C6).
enum BeaconState {
  /// Nothing to collect or carry: nothing is asked or sent.
  idle,

  /// Parcels to carry, and the app has not been allowed to use location yet.
  needsPermission,

  /// Waiting for the first position.
  starting,

  /// The phone has not given a position for a while (usually indoors). It keeps trying other sources.
  weakSignal,

  /// Positions are being sent.
  sharing,

  /// Location was refused for good: only the phone's Settings can turn it on.
  denied,

  /// The phone's location (GPS) is off.
  serviceOff,
}

/// One position of this rider, for their own map.
class RiderFix {
  const RiderFix({
    required this.latitude,
    required this.longitude,
    this.heading,
    this.accuracy,
  });

  final double latitude;
  final double longitude;

  /// Degrees from north, or null when standing still.
  final double? heading;
  final double? accuracy;
}

class RiderFixNotifier extends Notifier<RiderFix?> {
  @override
  RiderFix? build() => null;

  void set(RiderFix? fix) => state = fix;
}

final riderFixProvider = NotifierProvider<RiderFixNotifier, RiderFix?>(
  RiderFixNotifier.new,
);

/// The live location the buyer, the seller and the hub see on Track package. Like the website's
/// `useRiderLocationBeacon`: it asks the server every 30 seconds (and on every live notice) whether this rider has a
/// parcel to collect or carry, and only then watches the phone's position and sends the latest point every 5
/// seconds. With an empty list nothing is sent and the location service stops.
///
/// While sharing, Android shows a "Sharing your location" notification (a foreground service), so the position keeps
/// going while the rider is in Maps or the phone is locked during a trip. It stops as soon as the list is empty.
///
/// A phone can stay silent when asked for a precise position, for example indoors, or with Google Location Accuracy
/// turned off. So it starts from the last place the phone knows, asks once for a rough position, and if nothing comes
/// it moves on to the next source in [settingsFor] and tells the rider, instead of showing "Finding" forever.
final locationBeaconProvider =
    NotifierProvider.autoDispose<LocationBeacon, BeaconState>(
      LocationBeacon.new,
    );

class LocationBeacon extends Notifier<BeaconState> {
  static const sendEvery = Duration(seconds: 5);
  static const checkEvery = Duration(seconds: 30);

  /// How long one source gets to give its first position.
  static const firstFixWait = Duration(seconds: 20);

  /// How long without a new position before the rider is told and another source is tried.
  static const fixLostAfter = Duration(seconds: 45);

  /// A rough source that works is kept this long before trying for a precise one again.
  static const retryPreciseEvery = Duration(minutes: 2);

  /// A position the phone remembers is still worth showing up to this old.
  static const lastKnownUpTo = Duration(minutes: 10);

  int _attempt = 0;
  Timer? _watchdog;
  DateTime? _lastFix;
  DateTime? _listeningSince;
  bool _required = false;
  int _activeParcels = 0;
  StreamSubscription<Position>? _positions;
  DateTime? _lastSent;
  bool _sending = false;
  bool _checking = false;

  /// Parcels the rider is collecting or carrying, for the bar.
  int get activeParcels => _activeParcels;

  @override
  BeaconState build() {
    ref.watch(currentUserProvider.select((user) => user?.id));
    final timer = Timer.periodic(checkEvery, (_) => refresh());
    final live = ref
        .watch(realtimeProvider)
        ?.notifications()
        .listen((_) => refresh(), onError: (_) {});
    ref.onDispose(() {
      timer.cancel();
      live?.cancel();
      _stop();
    });
    Future.microtask(refresh);
    return BeaconState.idle;
  }

  /// Asks the server whether sharing is needed now. Call it after anything that adds or ends a job.
  Future<void> refresh() async {
    if (_checking) return;
    _checking = true;
    try {
      final status = await ref.read(riderApiProvider).locationStatus();
      if (!ref.mounted) return;
      _required = status.required;
      _activeParcels = status.activeParcels;
      await _apply();
    } catch (_) {
      // Keep the last answer: a network blip must not stop or start sharing.
    } finally {
      _checking = false;
    }
  }

  /// After the rider allowed location or turned GPS on.
  Future<void> retry() => _apply();

  Future<void> _apply() async {
    if (!_required) {
      _stop();
      _set(BeaconState.idle);
      return;
    }
    if (_positions != null) return;

    if (!await Geolocator.isLocationServiceEnabled()) {
      _set(BeaconState.serviceOff);
      return;
    }
    switch (await Geolocator.checkPermission()) {
      case LocationPermission.denied:
        _set(BeaconState.needsPermission);
        return;
      case LocationPermission.deniedForever:
        _set(BeaconState.denied);
        return;
      case LocationPermission.whileInUse:
      case LocationPermission.always:
      case LocationPermission.unableToDetermine:
        break;
    }
    if (!ref.mounted || !_required || _positions != null) return;

    _set(BeaconState.starting);
    _attempt = 0;
    await _listen();
    unawaited(_seed());
  }

  /// Which source to ask on each try. Phones differ in which one answers, so it goes round all of them.
  @visibleForTesting
  static AndroidSettings settingsFor(int attempt) {
    final (accuracy, forceLocationManager) = switch (attempt % 4) {
      // Google's location service: the quickest when it is on.
      0 => (LocationAccuracy.high, false),
      // Android's own, from Wi-Fi and cell towers: works indoors.
      1 => (LocationAccuracy.low, true),
      // Android's own, from GPS: for phones with Google's service off.
      2 => (LocationAccuracy.high, true),
      _ => (LocationAccuracy.low, false),
    };
    return AndroidSettings(
      accuracy: accuracy,
      forceLocationManager: forceLocationManager,
      intervalDuration: sendEvery,
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationTitle: 'Sharing your location',
        notificationText:
            'Loved-IT shares where you are while you carry parcels.',
        notificationChannelName: 'Location while working',
        enableWakeLock: true,
        setOngoing: true,
      ),
    );
  }

  Future<void> _listen() async {
    await _positions?.cancel();
    if (!ref.mounted || !_required) return;
    _listeningSince = DateTime.now();
    _positions =
        Geolocator.getPositionStream(locationSettings: settingsFor(_attempt))
            .listen(
              _onPosition,
              onError: (Object error) {
                if (error is LocationServiceDisabledException) {
                  _stop();
                  _set(BeaconState.serviceOff);
                } else if (error is PermissionDeniedException) {
                  _stop();
                  _set(BeaconState.denied);
                } else {
                  // Not a problem the rider can fix from a settings screen: try the next source.
                  unawaited(_noFix());
                }
              },
            );
    _armWatchdog(firstFixWait);
  }

  /// Something to show straight away, while the stream warms up.
  Future<void> _seed() async {
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null &&
          _lastFix == null &&
          DateTime.now().difference(last.timestamp) < lastKnownUpTo) {
        _onPosition(last);
      }
      final now = await Geolocator.getCurrentPosition(
        locationSettings: AndroidSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: const Duration(seconds: 15),
        ),
      );
      if (_positions != null) _onPosition(now);
    } catch (_) {
      // The stream and the watchdog are still running.
    }
  }

  void _armWatchdog(Duration wait) {
    _watchdog?.cancel();
    _watchdog = Timer(wait, () => unawaited(_noFix()));
  }

  Future<void> _noFix() async {
    if (!ref.mounted || _positions == null) return;
    final last = _lastFix;
    if (last == null || DateTime.now().difference(last) >= fixLostAfter) {
      _set(BeaconState.weakSignal);
    }
    _attempt++;
    await _listen();
    unawaited(_seed());
  }

  void _onPosition(Position position) {
    if (!ref.mounted || _positions == null) return;
    final now = DateTime.now();
    _lastFix = now;
    _set(BeaconState.sharing);
    ref
        .read(riderFixProvider.notifier)
        .set(
          RiderFix(
            latitude: position.latitude,
            longitude: position.longitude,
            heading: headingOf(position),
            accuracy: position.accuracy.isFinite ? position.accuracy : null,
          ),
        );
    final since = _listeningSince;
    if (_attempt % 4 != 0 &&
        since != null &&
        now.difference(since) >= retryPreciseEvery) {
      _attempt = 0;
      unawaited(_listen());
    } else {
      _armWatchdog(fixLostAfter);
    }
    unawaited(_send(position));
  }

  Future<void> _send(Position position) async {
    final now = DateTime.now();
    if (_sending ||
        (_lastSent != null && now.difference(_lastSent!) < sendEvery)) {
      return;
    }
    _sending = true;
    _lastSent = now;
    try {
      await ref
          .read(riderApiProvider)
          .sendLocation(
            latitude: position.latitude,
            longitude: position.longitude,
            heading: headingOf(position),
            accuracy: position.accuracy.isFinite ? position.accuracy : null,
          );
    } on ApiFailure catch (failure) {
      // 409: nothing left to carry. Anything else: the next position tries again.
      _lastSent = null;
      if (failure.kind == FailureKind.conflict) unawaited(refresh());
      if (kDebugMode) debugPrint('Location not sent: ${failure.kind}');
    } finally {
      _sending = false;
    }
  }

  /// A heading the server accepts (0 to 360), or null when the phone doesn't know it (standing still).
  @visibleForTesting
  static double? headingOf(Position position) {
    final heading = position.heading;
    if (!heading.isFinite || heading < 0 || position.speed < 0.5) return null;
    return heading % 360;
  }

  void _stop() {
    _watchdog?.cancel();
    _watchdog = null;
    _positions?.cancel();
    _positions = null;
    _lastSent = null;
    _lastFix = null;
    _listeningSince = null;
  }

  void _set(BeaconState next) {
    if (ref.mounted && state != next) state = next;
  }
}
