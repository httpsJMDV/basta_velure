import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/badges.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';

/// The bell (B12). Tapping a notification marks it read and opens its order or chat. There are no phone push
/// notifications yet: the backend has no FCM support.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final _list = GlobalKey<PagedListState<AppNotification>>();

  /// Read on this screen, so the dot goes away without reloading the list.
  final _readHere = <String>{};

  Future<void> _open(AppNotification notification) async {
    if (!notification.read && !_readHere.contains(notification.id)) {
      setState(() => _readHere.add(notification.id));
      ref
          .read(buyerApiProvider)
          .markNotificationRead(notification.id)
          .then(
            (_) => ref.read(unreadNotificationsProvider.notifier).refresh(),
            onError: (_) {},
          );
    }
    if (notification.orderId != null) {
      context.push(BuyerPaths.order(notification.orderId!));
    } else if (notification.conversationId != null) {
      context.push(BuyerPaths.chat(notification.conversationId!));
    }
  }

  Future<void> _readAll() async {
    try {
      await ref.read(buyerApiProvider).markAllNotificationsRead();
      await ref.read(unreadNotificationsProvider.notifier).refresh();
      await _list.currentState?.refresh();
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          AnimatedSwitcher(
            duration: Motion.medium,
            child: unread > 0
                ? TextButton(
                    onPressed: _readAll,
                    style: TextButton.styleFrom(
                      textStyle: const TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: const Text('Mark all read'),
                  )
                : const SizedBox.shrink(),
          ),
          const SizedBox(width: AppSpace.xs),
        ],
      ),
      body: PagedList<AppNotification>(
        key: _list,
        spacing: AppSpace.sm,
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.xs,
          AppSpace.lg,
          AppSpace.lg,
        ),
        load: (page) => ref.read(buyerApiProvider).notifications(page: page),
        itemBuilder: (_, notification) {
          final read = notification.read || _readHere.contains(notification.id);
          return _NotificationCard(
            notification: notification,
            read: read,
            icon: _iconFor(notification.kind),
            onTap: () => _open(notification),
          );
        },
        empty: const EmptyState(
          icon: LucideIcons.bell,
          title: 'No notifications',
          message: 'Order updates and replies show here.',
        ),
      ),
    );
  }

  static IconData _iconFor(String kind) {
    if (kind.startsWith('order')) return LucideIcons.package;
    if (kind.contains('message') || kind.contains('chat')) {
      return LucideIcons.messageCircle;
    }
    if (kind.contains('return') || kind.contains('dispute')) {
      return LucideIcons.undo2;
    }
    if (kind.contains('voucher')) return LucideIcons.ticket;
    return LucideIcons.bell;
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.read,
    required this.icon,
    required this.onTap,
  });

  final AppNotification notification;
  final bool read;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label:
          '${read ? '' : 'Unread: '}${notification.title}. ${notification.body}',
      onTap: onTap,
      excludeSemantics: true,
      child: PressScale(
        scale: 0.985,
        onTap: onTap,
        child: AnimatedContainer(
          duration: Motion.medium,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: read ? Colors.transparent : AppColors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: read ? null : BuyerShadow.card,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedContainer(
                duration: Motion.medium,
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: read ? AppColors.stone100 : AppColors.brandRedTint,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  icon,
                  size: 20,
                  color: read ? AppColors.stone500 : AppColors.brandRed,
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: TextStyle(
                              fontSize: 14.5,
                              height: 1.25,
                              fontWeight: read
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                              color: AppColors.stone900,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.sm),
                        Text(
                          Fmt.shortWhen(notification.createdAt),
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.stone500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      notification.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: AppColors.stone600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
