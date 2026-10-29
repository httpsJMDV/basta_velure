import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime.dart';
import '../../../core/session/session.dart';
import 'buyer_api.dart';

/// Unread chats for the Messages tab, and unread notifications for the bell. Like the website, each checks every
/// 30 seconds and also refreshes the moment a live event arrives; without a live connection the timer still works.
/// They stop when no buyer screen shows them (the rider and logistics homes don't).
final unreadMessagesProvider =
    AsyncNotifierProvider.autoDispose<UnreadCount, int>(
      () => UnreadCount(UnreadSource.messages),
    );

final unreadNotificationsProvider =
    AsyncNotifierProvider.autoDispose<UnreadCount, int>(
      () => UnreadCount(UnreadSource.notifications),
    );

/// What an [UnreadCount] counts.
enum UnreadSource { messages, notifications }

class UnreadCount extends AsyncNotifier<int> {
  UnreadCount(this._source);

  final UnreadSource _source;

  @override
  Future<int> build() async {
    if (ref.watch(currentUserProvider) == null) return 0;

    final timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
    final realtime = ref.watch(realtimeProvider);
    final live = switch (_source) {
      UnreadSource.messages => realtime?.conversationUpdates(),
      UnreadSource.notifications => realtime?.notifications(),
    }?.listen((_) => refresh(), onError: (_) {});
    ref.onDispose(() {
      timer.cancel();
      live?.cancel();
    });
    return _fetch();
  }

  Future<int> _fetch() {
    final api = ref.read(buyerApiProvider);
    return switch (_source) {
      UnreadSource.messages => api.unreadMessages(),
      UnreadSource.notifications => api.unreadNotifications(),
    };
  }

  /// Keeps the last count when a check fails (no internet), so the badge doesn't flicker away.
  Future<void> refresh() async {
    try {
      state = AsyncData(await _fetch());
    } catch (_) {}
  }
}
