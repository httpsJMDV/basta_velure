import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../buyer/data/badges.dart';
import '../data/rider_state.dart';
import '../rider_paths.dart';

/// The top bar of the five tabs: the title, then the chat and notification icons at the top right with their unread
/// counts. Main actions never live up here (riders use one hand); these two are only shortcuts.
class RiderAppBar extends ConsumerWidget implements PreferredSizeWidget {
  const RiderAppBar({
    super.key,
    required this.title,
    this.subtitle,
    this.bottom,
  });

  final String title;
  final String? subtitle;
  final PreferredSizeWidget? bottom;

  @override
  Size get preferredSize =>
      Size.fromHeight(kToolbarHeight + (bottom?.preferredSize.height ?? 0));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(riderChatUnreadProvider).value?.total ?? 0;
    final notices = ref.watch(unreadNotificationsProvider).value ?? 0;
    return AppBar(
      backgroundColor: AppColors.white,
      bottom: bottom,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title),
          if (subtitle != null)
            Text(
              subtitle!,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.gray600,
              ),
            ),
        ],
      ),
      actions: [
        _BadgedIcon(
          icon: LucideIcons.messageCircle,
          count: chats,
          label: 'Messages',
          onPressed: () => context.push(RiderPaths.chats),
        ),
        _BadgedIcon(
          icon: LucideIcons.bell,
          count: notices,
          label: 'Notifications',
          onPressed: () => context.push(RiderPaths.notifications),
        ),
        const SizedBox(width: 4),
      ],
    );
  }
}

class _BadgedIcon extends StatelessWidget {
  const _BadgedIcon({
    required this.icon,
    required this.count,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final int count;
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: count > 0 ? '$label, $count unread' : label,
      onPressed: onPressed,
      icon: Badge(
        isLabelVisible: count > 0,
        backgroundColor: AppColors.brandRed,
        label: Text(count > 99 ? '99+' : '$count'),
        child: Icon(icon, color: AppColors.gray900),
      ),
    );
  }
}
