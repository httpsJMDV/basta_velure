import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';

/// The app opened with a saved sign-in but couldn't reach the server. The sign-in is kept; Try again checks it again.
class OfflineScreen extends ConsumerWidget {
  const OfflineScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    final message = session is SessionUnreachable
        ? session.message
        : ApiMessages.unreachable;
    final controller = ref.read(sessionProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ErrorRetry(
                failure: ApiFailure(FailureKind.network, message),
                onRetry: controller.restore,
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpace.lg),
              child: TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.stone600,
                ),
                onPressed: controller.signOut,
                child: const Text('Sign out'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
