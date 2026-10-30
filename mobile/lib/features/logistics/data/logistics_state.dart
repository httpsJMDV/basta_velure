import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime.dart';
import '../../../core/session/session.dart';
import 'logistics_api.dart';

/// The hub's unread messages, riders and courier together, for the Messages badge. Checks every 30 seconds like the
/// website, and the moment a live notice arrives.
final hubUnreadProvider = AsyncNotifierProvider.autoDispose<HubUnread, int>(
  HubUnread.new,
);

class HubUnread extends AsyncNotifier<int> {
  @override
  Future<int> build() async {
    ref.watch(currentUserProvider.select((user) => user?.id));
    final timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    final live = ref
        .watch(realtimeProvider)
        ?.notifications()
        .listen((_) => refresh(), onError: (_) {});
    ref.onDispose(() {
      timer.cancel();
      live?.cancel();
    });
    return ref.read(hubApiProvider).unreadMessages();
  }

  /// Keeps the last count when a check fails (no internet), so the badge doesn't flicker away.
  Future<void> refresh() async {
    try {
      state = AsyncData(await ref.read(hubApiProvider).unreadMessages());
    } catch (_) {}
  }
}

/// The courier team's unread messages from its hubs.
final courierUnreadProvider =
    AsyncNotifierProvider.autoDispose<CourierUnread, int>(CourierUnread.new);

class CourierUnread extends AsyncNotifier<int> {
  @override
  Future<int> build() async {
    ref.watch(currentUserProvider.select((user) => user?.id));
    final timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    final live = ref
        .watch(realtimeProvider)
        ?.notifications()
        .listen((_) => refresh(), onError: (_) {});
    ref.onDispose(() {
      timer.cancel();
      live?.cancel();
    });
    return ref.read(courierApiProvider).unreadMessages();
  }

  Future<void> refresh() async {
    try {
      state = AsyncData(await ref.read(courierApiProvider).unreadMessages());
    } catch (_) {}
  }
}
