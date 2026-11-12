import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/session/session.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import 'account_actions.dart';
import 'auth_layout.dart';

/// Admins run Loved-IT from the website's admin console; the app has nothing for them. A hub or courier account whose
/// application is still in review lands here too: it does deliveries only (no shop), and its status is on the website.
class WebOnlyScreen extends ConsumerWidget {
  const WebOnlyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user != null && !user.isAdmin) {
      final courier = user.logisticsCompany != null;
      final what = courier ? 'courier company' : 'hub';
      return AuthLayout(
        title: 'Your $what application is in review',
        subtitle: courier
            ? 'Loved-IT checks your company documents and emails you the decision.'
            : 'Your courier company checks your permit, ID and area and emails you the decision.',
        children: [
          const MessageBanner(
            message: 'Hub, courier and rider accounts handle deliveries only and cannot shop. Use a separate buyer account to buy.',
            tone: StatusTone.amber,
            icon: LucideIcons.clock,
          ),
          const SizedBox(height: AppSpace.xl),
          OutlinedButton.icon(
            onPressed: () => openWebsite(courier ? '/register/courier' : '/register/hub'),
            icon: const Icon(LucideIcons.externalLink, size: 18),
            label: const Text('See the status on loved-it.shop'),
          ),
          const SizedBox(height: AppSpace.sm),
          const SignOutButton.compact(),
        ],
      );
    }
    return AuthLayout(
      title: 'Use a computer for the admin console',
      subtitle: 'Use loved-it.shop on a computer for the admin console.',
      children: [
        const MessageBanner(
          message: 'The app is for buyers, riders and logistics teams. Admin work stays on the website.',
          tone: StatusTone.blue,
          icon: LucideIcons.monitor,
        ),
        const SizedBox(height: AppSpace.xl),
        OutlinedButton.icon(
          onPressed: () => openWebsite('/admin'),
          icon: const Icon(LucideIcons.externalLink, size: 18),
          label: const Text('Open loved-it.shop'),
        ),
        const SizedBox(height: AppSpace.sm),
        const SignOutButton.compact(),
      ],
    );
  }
}
