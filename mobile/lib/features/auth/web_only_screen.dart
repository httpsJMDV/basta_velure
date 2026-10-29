import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import 'account_actions.dart';
import 'auth_layout.dart';

/// Admins run Loved-IT from the website's admin console; the app has nothing for them.
class WebOnlyScreen extends ConsumerWidget {
  const WebOnlyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
        const SignOutButton(),
      ],
    );
  }
}
