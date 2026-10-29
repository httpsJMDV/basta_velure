import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';

final _orderCountsProvider = FutureProvider.autoDispose<Map<String, int>>((
  ref,
) {
  ref.watch(currentUserProvider.select((user) => user?.id));
  return ref.watch(buyerApiProvider).orderCounts();
});

/// The Account tab (B13): orders by tab, ID check, saved things, profile and security, help, and sign out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final counts = ref.watch(_orderCountsProvider).value ?? const {};
    final idCheck = ref.watch(idVerificationProvider).value;

    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Account')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_orderCountsProvider);
          ref.invalidate(idVerificationProvider);
          await ref.read(sessionProvider.notifier).refreshUser();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppSpace.xl),
          children: [
            InkWell(
              onTap: () => context.push(BuyerPaths.profile),
              child: Padding(
                padding: const EdgeInsets.all(AppSpace.lg),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: AppColors.brandRedTint,
                      child: user?.avatarUrl == null
                          ? Text(
                              (user?.firstName.isNotEmpty ?? false)
                                  ? user!.firstName[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontSize: 22,
                                color: AppColors.brandRed,
                                fontWeight: FontWeight.w700,
                              ),
                            )
                          : ClipOval(
                              child: NetImage(
                                user!.avatarUrl,
                                width: 60,
                                height: 60,
                              ),
                            ),
                    ),
                    const SizedBox(width: AppSpace.lg),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.fullName ?? '',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            user?.email ?? '',
                            style: const TextStyle(color: AppColors.stone500),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      LucideIcons.chevronRight,
                      size: 18,
                      color: AppColors.stone400,
                    ),
                  ],
                ),
              ),
            ),
            if (user?.isSeller ?? false)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  0,
                  AppSpace.lg,
                  AppSpace.md,
                ),
                child: InkWell(
                  onTap: () => openWebsite('/seller'),
                  child: const MessageBanner(
                    message: 'Your shop is run from the website. Tap to open the Seller Centre.',
                    tone: StatusTone.blue,
                    icon: LucideIcons.store,
                  ),
                ),
              ),
            if (idCheck != null && !idCheck.canOrder)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  0,
                  AppSpace.lg,
                  AppSpace.md,
                ),
                child: InkWell(
                  onTap: () => context.push(BuyerPaths.idVerification),
                  child: MessageBanner(
                    message: switch (idCheck.status) {
                      'pending' => 'Your ID is being checked. You can order once it is approved.',
                      'rejected' =>
                        'Your ID was not approved. Tap to send it again.',
                      _ => 'Verify your government ID to place orders. Tap to start.',
                    },
                    tone: StatusTone.amber,
                    icon: LucideIcons.idCard,
                  ),
                ),
              ),
            _Section(
              title: 'My orders',
              trailing: TextButton(
                onPressed: () => context.push(BuyerPaths.orders),
                child: const Text('See all'),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.sm,
                  0,
                  AppSpace.sm,
                  AppSpace.md,
                ),
                child: Row(
                  children: [
                    _OrderShortcut(
                      tab: OrderTab.toPay,
                      icon: LucideIcons.wallet,
                      count: counts['to_pay'],
                    ),
                    _OrderShortcut(
                      tab: OrderTab.toShip,
                      icon: LucideIcons.package,
                      count: counts['to_ship'],
                    ),
                    _OrderShortcut(
                      tab: OrderTab.toReceive,
                      icon: LucideIcons.truck,
                      count: counts['to_receive'],
                    ),
                    _OrderShortcut(
                      tab: OrderTab.completed,
                      icon: LucideIcons.circleCheck,
                      count: null,
                    ),
                    _OrderShortcut(
                      tab: OrderTab.returns,
                      icon: LucideIcons.undo2,
                      count: counts['return_refund'],
                    ),
                  ],
                ),
              ),
            ),
            _Section(
              child: Column(
                children: [
                  _Link(LucideIcons.star, 'Reviews', BuyerPaths.reviews),
                  _Link(LucideIcons.heart, 'Wishlist', BuyerPaths.wishlist),
                  _Link(
                    LucideIcons.store,
                    'Shops I follow',
                    BuyerPaths.following,
                  ),
                  _Link(LucideIcons.ticket, 'My vouchers', BuyerPaths.vouchers),
                  _Link(
                    LucideIcons.mapPin,
                    'My addresses',
                    BuyerPaths.addresses,
                  ),
                ],
              ),
            ),
            _Section(
              child: Column(
                children: [
                  _Link(LucideIcons.userRound, 'Profile', BuyerPaths.profile),
                  _Link(
                    LucideIcons.idCard,
                    'ID verification',
                    BuyerPaths.idVerification,
                  ),
                  _Link(
                    LucideIcons.lock,
                    'Change password',
                    BuyerPaths.password,
                  ),
                  _Link(LucideIcons.mail, 'Change email', BuyerPaths.email),
                  _Link(
                    LucideIcons.phone,
                    'Change mobile number',
                    BuyerPaths.phone,
                  ),
                ],
              ),
            ),
            _Section(
              child: Column(
                children: [
                  _Link(
                    LucideIcons.bell,
                    'Notifications',
                    BuyerPaths.notifications,
                  ),
                  _Link(
                    LucideIcons.messageSquare,
                    'Send feedback',
                    BuyerPaths.feedback,
                  ),
                  _Link(LucideIcons.fileText, 'Policies', BuyerPaths.policies),
                ],
              ),
            ),
            const Padding(padding: AppSpace.page, child: HomeSwitchList()),
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.sm,
                AppSpace.sm,
                AppSpace.lg,
                0,
              ),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SignOutButton(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.child, this.title, this.trailing});

  final Widget child;
  final String? title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: AppRadius.cardAll,
        border: Border.all(color: AppColors.stone200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.xs,
                0,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title!,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          child,
        ],
      ),
    );
  }
}

class _OrderShortcut extends StatelessWidget {
  const _OrderShortcut({
    required this.tab,
    required this.icon,
    required this.count,
  });

  final OrderTab tab;
  final IconData icon;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => context.push(BuyerPaths.ordersTab(tab.key)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
          child: Column(
            children: [
              Badge(
                isLabelVisible: (count ?? 0) > 0,
                backgroundColor: AppColors.brandRed,
                label: Text('${count ?? 0}'),
                child: Icon(icon, color: AppColors.stone700),
              ),
              const SizedBox(height: 6),
              Text(
                tab.label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Link extends StatelessWidget {
  const _Link(this.icon, this.label, this.path);

  final IconData icon;
  final String label;
  final String path;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 52,
      leading: Icon(icon, size: 20, color: AppColors.stone700),
      title: Text(label),
      trailing: const Icon(
        LucideIcons.chevronRight,
        size: 18,
        color: AppColors.stone400,
      ),
      onTap: () => context.push(path),
    );
  }
}
