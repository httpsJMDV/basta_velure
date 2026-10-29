import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/badges.dart';
import '../data/buyer_api.dart';
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
          if (unread > 0)
            TextButton(onPressed: _readAll, child: const Text('Mark all read')),
        ],
      ),
      body: PagedList<AppNotification>(
        key: _list,
        spacing: 0,
        padding: EdgeInsets.zero,
        load: (page) => ref.read(buyerApiProvider).notifications(page: page),
        itemBuilder: (_, notification) {
          final read = notification.read || _readHere.contains(notification.id);
          return ListTile(
            minTileHeight: 72,
            tileColor: read
                ? null
                : AppColors.brandRedTint.withValues(alpha: 0.5),
            onTap: () => _open(notification),
            leading: Icon(
              _iconFor(notification.kind),
              color: read ? AppColors.stone500 : AppColors.brandRed,
            ),
            title: Text(
              notification.title,
              style: TextStyle(
                fontWeight: read ? FontWeight.w500 : FontWeight.w700,
              ),
            ),
            subtitle: Text(
              notification.body,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Text(
              Fmt.shortWhen(notification.createdAt),
              style: const TextStyle(fontSize: 12, color: AppColors.stone500),
            ),
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
