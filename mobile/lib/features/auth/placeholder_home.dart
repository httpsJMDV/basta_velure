import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';
import 'account_actions.dart';

/// A home screen whose part is not built yet. Parts B, C and D each replace theirs; delete this file when the last
/// one is gone.
class PlaceholderHome extends ConsumerWidget {
  const PlaceholderHome({
    super.key,
    required this.title,
    required this.icon,
    required this.message,
    this.notice,
  });

  final String title;
  final IconData icon;
  final String message;

  /// A note on top, for example the seller's "your shop is run from the website".
  final Widget? notice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            Text(
              'Hi, ${user?.firstName ?? 'there'}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: AppSpace.lg),
            if (notice != null) ...[
              notice!,
              const SizedBox(height: AppSpace.lg),
            ],
            Card(
              child: SizedBox(
                height: 260,
                child: EmptyState(
                  icon: icon,
                  title: 'Coming in the next part',
                  message: message,
                ),
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            const HomeSwitchList(),
            const SizedBox(height: AppSpace.sm),
            const Align(
              alignment: Alignment.centerLeft,
              child: SignOutButton(),
            ),
          ],
        ),
      ),
    );
  }
}
