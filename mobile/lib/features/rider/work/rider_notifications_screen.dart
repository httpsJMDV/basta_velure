import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/data/account.dart';
import '../../buyer/data/badges.dart';
import '../../buyer/data/buyer_api.dart';
import '../widgets/rider_widgets.dart';

/// The rider's notifications: new jobs, hub messages, payouts. The same `/notifications` endpoints as the shop (Part
/// B's calls); tapping one marks it read. The jobs themselves are on the Pickups and Deliveries tabs.
class RiderNotificationsScreen extends ConsumerStatefulWidget {
  const RiderNotificationsScreen({super.key});

  @override
  ConsumerState<RiderNotificationsScreen> createState() =>
      _RiderNotificationsScreenState();
}

class _RiderNotificationsScreenState
    extends ConsumerState<RiderNotificationsScreen> {
  final _list = GlobalKey<PagedListState<AppNotification>>();
  final _read = <String>{};

  Future<void> _markRead(AppNotification notification) async {
    if (notification.read || _read.contains(notification.id)) return;
    setState(() => _read.add(notification.id));
    try {
      await ref.read(buyerApiProvider).markNotificationRead(notification.id);
      await ref.read(unreadNotificationsProvider.notifier).refresh();
    } catch (_) {}
  }

  Future<void> _readAll() async {
    final ok = await runRiderAction(context, () async {
      await ref.read(buyerApiProvider).markAllNotificationsRead();
      return '';
    });
    if (!ok) return;
    await ref.read(unreadNotificationsProvider.notifier).refresh();
    await _list.currentState?.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    final api = ref.read(buyerApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(onPressed: _readAll, child: const Text('Mark all read')),
        ],
      ),
      body: PagedList<AppNotification>(
        key: _list,
        load: (page) => api.notifications(page: page),
        spacing: AppSpace.sm,
        empty: const EmptyState(
          icon: LucideIcons.bell,
          title: 'No notifications',
          message: 'New jobs, hub messages and payouts show here.',
        ),
        itemBuilder: (context, n) {
          final unreadNow = !n.read && !_read.contains(n.id);
          return RiderCard(
            padding: EdgeInsets.zero,
            muted: !unreadNow,
            child: ListTile(
              minTileHeight: 64,
              onTap: () => _markRead(n),
              leading: Icon(
                LucideIcons.bell,
                color: unreadNow ? AppColors.brandRed : AppColors.gray600,
              ),
              title: Text(
                n.title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: unreadNow ? FontWeight.w800 : FontWeight.w600,
                  color: AppColors.gray900,
                ),
              ),
              subtitle: Text('${n.body}\n${Fmt.dateTime(n.createdAt)}'),
              isThreeLine: true,
            ),
          );
        },
      ),
    );
  }
}
