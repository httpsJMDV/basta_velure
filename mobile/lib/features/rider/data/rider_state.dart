import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/session/session.dart';
import 'rider_api.dart';
import 'rider_models.dart';

/// Online or Offline, and how many job slots are used. The Home switch changes it; job screens refresh it after an
/// accept or a delivery. Checks every 30 seconds and on every live notice.
final riderStatusProvider =
    AsyncNotifierProvider.autoDispose<RiderStatusController, RiderWorkState>(
      RiderStatusController.new,
    );

class RiderStatusController extends AsyncNotifier<RiderWorkState> {
  @override
  Future<RiderWorkState> build() async {
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
    return ref.read(riderApiProvider).status();
  }

  /// Keeps the last state when a check fails, so the switch doesn't flicker.
  Future<void> refresh() async {
    try {
      state = AsyncData(await ref.read(riderApiProvider).status());
    } catch (_) {}
  }

  /// `POST /rider/availability`. Returns the server's message; throws [ApiFailure] (expired license, suspended).
  Future<String> setOnline(bool online) async {
    final (message, next) = await ref.read(riderApiProvider).setOnline(online);
    // The offers list watches this state: it starts checking when Online and empties when Offline.
    state = AsyncData(next);
    return message;
  }
}

/// The job offers open for this rider. Checked every 5 seconds while Online (and on every live notice), so a new
/// offer shows within seconds on any tab. Expired offers drop off by themselves.
final riderOffersProvider =
    NotifierProvider.autoDispose<RiderOffersController, List<RiderOffer>>(
      RiderOffersController.new,
    );

class RiderOffersController extends Notifier<List<RiderOffer>> {
  /// Offers the rider answered (or that timed out): not shown again even if a slow poll still lists them.
  final _answered = <int>{};
  bool _loading = false;

  @override
  List<RiderOffer> build() {
    final online = ref.watch(
      riderStatusProvider.select((s) => s.value?.online ?? false),
    );
    if (!online) return const [];

    final poll = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
    final tick = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _dropExpired(),
    );
    final live = ref
        .watch(realtimeProvider)
        ?.notifications()
        .listen((_) => refresh(), onError: (_) {});
    ref.onDispose(() {
      poll.cancel();
      tick.cancel();
      live?.cancel();
    });
    Future.microtask(refresh);
    return const [];
  }

  Future<void> refresh() async {
    if (_loading) return;
    _loading = true;
    try {
      final (offers, _) = await ref.read(riderApiProvider).offers();
      if (!ref.mounted) return;
      state = offers.where((o) => !_answered.contains(o.id)).toList();
    } catch (_) {
      // Keep what is shown; the next check tries again.
    } finally {
      _loading = false;
    }
  }

  void _dropExpired() {
    final now = DateTime.now();
    if (state.any((o) => o.leftAt(now) == Duration.zero)) {
      for (final o in state.where((o) => o.leftAt(now) == Duration.zero)) {
        _answered.add(o.id);
      }
      state = state.where((o) => o.leftAt(now) > Duration.zero).toList();
    }
  }

  /// Accept or decline. Returns the server's message; throws [ApiFailure] (offer gone, 3 jobs already, Offline).
  Future<String> answer(RiderOffer offer, {required bool accept}) async {
    final api = ref.read(riderApiProvider);
    try {
      final message = accept
          ? await api.acceptOffer(offer.id)
          : await api.declineOffer(offer.id);
      if (ref.mounted) _remove(offer);
      return message;
    } on ApiFailure catch (failure) {
      // Expired or taken: it can't be answered again. A network error keeps it, so the rider can try again.
      if (ref.mounted && !failure.canRetry) _remove(offer);
      rethrow;
    } finally {
      if (ref.mounted) {
        unawaited(ref.read(riderStatusProvider.notifier).refresh());
      }
    }
  }

  void _remove(RiderOffer offer) {
    _answered.add(offer.id);
    state = state.where((o) => o.id != offer.id).toList();
  }
}

/// Unread delivery chats: the total for the chat icon, and per parcel and counterpart for the stop cards.
final riderChatUnreadProvider =
    AsyncNotifierProvider.autoDispose<
      RiderChatUnreadController,
      ({int total, Map<String, int> byThreadKey})
    >(RiderChatUnreadController.new);

class RiderChatUnreadController
    extends AsyncNotifier<({int total, Map<String, int> byThreadKey})> {
  @override
  Future<({int total, Map<String, int> byThreadKey})> build() async {
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
    return ref.read(riderApiProvider).chatUnread();
  }

  Future<void> refresh() async {
    try {
      state = AsyncData(await ref.read(riderApiProvider).chatUnread());
    } catch (_) {}
  }
}
