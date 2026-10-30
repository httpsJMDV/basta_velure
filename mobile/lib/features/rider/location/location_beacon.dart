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

  /// Positions are being sent.
  sharing,

  /// Location was refused for good: only the phone's Settings can turn it on.
  denied,

  /// The phone's location (GPS) is off.
  serviceOff,
}

/// The live location the buyer, the seller and the hub see on Track package. Like the website's
/// `useRiderLocationBeacon`: it asks the server every 30 seconds (and on every live notice) whether this rider has a
/// parcel to collect or carry, and only then watches the phone's position and sends the latest point every 5
/// seconds. With an empty list nothing is sent and the location service stops.
///
/// While sharing, Android shows a "Sharing your location" notification (a foreground service), so the position keeps
/// going while the rider is in Maps or the phone is locked during a trip. It stops as soon as the list is empty.
final locationBeaconProvider =
    NotifierProvider.autoDispose<LocationBeacon, BeaconState>(
      LocationBeacon.new,
    );

class LocationBeacon extends Notifier<BeaconState> {
  static const sendEvery = Duration(seconds: 5);
  static const checkEvery = Duration(seconds: 30);

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
    _positions =
        Geolocator.getPositionStream(
          locationSettings: AndroidSettings(
            accuracy: LocationAccuracy.high,
            intervalDuration: sendEvery,
            foregroundNotificationConfig: const ForegroundNotificationConfig(
              notificationTitle: 'Sharing your location',
              notificationText:
                  'Loved-IT shares where you are while you carry parcels.',
              notificationChannelName: 'Location while working',
              enableWakeLock: true,
              setOngoing: true,
            ),
          ),
        ).listen(
          _send,
          onError: (Object error) {
            _stop();
            _set(
              error is LocationServiceDisabledException
                  ? BeaconState.serviceOff
                  : error is PermissionDeniedException
                  ? BeaconState.denied
                  : BeaconState.needsPermission,
            );
          },
        );
  }

  Future<void> _send(Position position) async {
    _set(BeaconState.sharing);
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
    _positions?.cancel();
    _positions = null;
    _lastSent = null;
  }

  void _set(BeaconState next) {
    if (ref.mounted && state != next) state = next;
  }
}
