import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session/home_route.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';

/// "Switch to Rider" and the like, for an account with more than one home (a buyer who is also a rider). Shows
/// nothing for an account with one home. Put it on each part's Account screen.
class HomeSwitchList extends ConsumerWidget {
  const HomeSwitchList({super.key});

  static IconData iconFor(AppHome home) => switch (home) {
    AppHome.buyer => LucideIcons.shoppingBag,
    AppHome.rider => LucideIcons.bike,
    AppHome.logistics => LucideIcons.warehouse,
    AppHome.webOnly => LucideIcons.monitor,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    if (session is! SignedIn) return const SizedBox.shrink();
    final others = session.homes.where((home) => home != session.home).toList();
    if (others.isEmpty) return const SizedBox.shrink();

    return Card(
      child: Column(
        children: [
          for (final home in others)
            ListTile(
              minTileHeight: 56,
              leading: Icon(iconFor(home), color: AppColors.stone700),
              title: Text('Switch to ${home.label}'),
              trailing: const Icon(
                LucideIcons.arrowLeftRight,
                size: 18,
                color: AppColors.stone400,
              ),
              onTap: () => ref.read(sessionProvider.notifier).switchHome(home),
            ),
        ],
      ),
    );
  }
}

/// Sign out, after asking. Works with no internet: the phone forgets the sign-in either way.
///
/// The full-width row closes each part's Account screen, in the same card as [HomeSwitchList], and names the account
/// it signs out of. [SignOutButton.compact] is the plain link for the sign-in and setup screens.
class SignOutButton extends ConsumerWidget {
  const SignOutButton({super.key}) : compact = false;

  const SignOutButton.compact({super.key}) : compact = true;

  final bool compact;

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out?',
      message: 'You will need your email or username and password to sign in again.',
      confirmLabel: 'Sign out',
    );
    if (confirmed) await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (compact) {
      return TextButton.icon(
        style: TextButton.styleFrom(foregroundColor: AppColors.stone700),
        icon: const Icon(LucideIcons.logOut, size: 18),
        label: const Text('Sign out'),
        onPressed: () => _signOut(context, ref),
      );
    }

    final session = ref.watch(sessionProvider);
    final email = session is SignedIn ? session.user.email : null;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        minTileHeight: 56,
        leading: const Icon(LucideIcons.logOut, color: AppColors.brandRed),
        title: const Text(
          'Sign out',
          style: TextStyle(
            color: AppColors.brandRed,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: email == null
            ? null
            : Text(
                'Signed in as $email',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.stone500,
                  fontSize: 13,
                ),
              ),
        onTap: () => _signOut(context, ref),
      ),
    );
  }
}
