import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/session/home_route.dart';
import 'core/session/session.dart';
import 'core/sound/notification_sound.dart';
import 'features/buyer/data/badges.dart';
import 'features/logistics/data/logistics_state.dart';
import 'features/rider/data/rider_state.dart';

/// Plays the chosen notification sound (Account › Notification sound) when something new arrives while the app is
/// open: a notification, for every account, and a chat message for the home that is open (shop, Seller Centre, rider,
/// hub or courier). It follows the same counts the badges show, so a count that only goes down (something was read)
/// is quiet, and so is the first count after signing in. There are no push notifications yet, so a closed app makes
/// no sound.
class NotificationSoundWatcher extends ConsumerWidget {
  const NotificationSoundWatcher({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Read the saved sound now, so the first one to play is already the chosen one.
    ref.watch(notificationSoundProvider);
    final session = ref.watch(sessionProvider);
    if (session is! SignedIn || session.home == AppHome.webOnly) return child;

    void rose(int? before, int? after) {
      if (before == null || after == null || after <= before) return;
      ref.read(soundPlayerProvider).play(ref.read(notificationSoundProvider));
    }

    ref.listen(
      unreadNotificationsProvider,
      (prev, next) => rose(prev?.value, next.value),
    );
    switch (session.home) {
      case AppHome.buyer || AppHome.seller:
        ref.listen(
          unreadMessagesProvider,
          (prev, next) => rose(prev?.value, next.value),
        );
      case AppHome.rider:
        ref.listen(
          riderChatUnreadProvider,
          (prev, next) => rose(prev?.value?.total, next.value?.total),
        );
      case AppHome.logistics:
        if (session.user.sortingCenter?.isApproved ?? false) {
          ref.listen(
            hubUnreadProvider,
            (prev, next) => rose(prev?.value, next.value),
          );
        }
        if (session.user.logisticsCompany != null) {
          ref.listen(
            courierUnreadProvider,
            (prev, next) => rose(prev?.value, next.value),
          );
        }
      case AppHome.webOnly:
        break;
    }
    return child;
  }
}
