import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';

/// A suspended account, or a rider who has not activated yet. Already signed out; the server's words say what to do.
class AccountBlockedScreen extends ConsumerWidget {
  const AccountBlockedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final blocked = session is AccountBlocked ? session : null;
    final suspended = blocked?.kind == FailureKind.accountSuspended;

    return AuthLayout(
      title: suspended ? 'Account suspended' : 'Activate your rider account',
      children: [
        MessageBanner(
          message: blocked?.message ?? ApiMessages.sessionEnded,
          tone: suspended ? StatusTone.rose : StatusTone.amber,
          icon: suspended ? LucideIcons.userX : LucideIcons.mailCheck,
        ),
        const SizedBox(height: AppSpace.xl),
        OutlinedButton(
          onPressed: ref.read(sessionProvider.notifier).useAnotherAccount,
          child: const Text('Back to sign in'),
        ),
      ],
    );
  }
}
