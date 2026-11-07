import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/home_route.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';

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
      appBar: AppBar(title: const Text('Account')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_orderCountsProvider);
          ref.invalidate(idVerificationProvider);
          await ref.read(sessionProvider.notifier).refreshUser();
        },
        child: ListView(
          padding: EdgeInsets.only(bottom: AppSpace.xl + dockInset(context)),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.xs,
                AppSpace.lg,
                AppSpace.lg,
              ),
              child: PressScale(
                scale: 0.985,
                onTap: () => context.push(BuyerPaths.profile),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 32,
                      backgroundColor: AppColors.brandRedTint,
                      child: user?.avatarUrl == null
                          ? Text(
                              (user?.firstName.isNotEmpty ?? false)
                                  ? user!.firstName[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontFamily: 'NotoSerif',
                                fontSize: 26,
                                color: AppColors.brandRed,
                                fontWeight: FontWeight.w700,
                              ),
                            )
                          : ClipOval(
                              child: NetImage(
                                user!.avatarUrl,
                                width: 64,
                                height: 64,
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
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: BuyerText.screenTitle.copyWith(fontSize: 21),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.email ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13.5,
                              color: AppColors.stone500,
                            ),
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
                child: PressScale(
                  scale: 0.985,
                  onTap: () => ref
                      .read(sessionProvider.notifier)
                      .switchHome(AppHome.seller),
                  child: const MessageBanner(
                    message: 'Run your shop from here: tap to open the Seller Centre.',
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
                child: PressScale(
                  scale: 0.985,
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
            BlockCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.lg,
                      AppSpace.sm,
                      AppSpace.xs,
                      0,
                    ),
                    child: Row(
                      children: [
                        const Expanded(child: BlockTitle('My orders')),
                        TextButton(
                          onPressed: () => context.push(BuyerPaths.orders),
                          style: TextButton.styleFrom(
                            minimumSize: const Size(0, 40),
                          ),
                          child: const Text('See all'),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.sm,
                      AppSpace.xs,
                      AppSpace.sm,
                      AppSpace.md,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
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
                ],
              ),
            ),
            _Group(
              rows: const [
                _Link(LucideIcons.star, 'Reviews', BuyerPaths.reviews),
                _Link(LucideIcons.heart, 'Wishlist', BuyerPaths.wishlist),
                _Link(
                  LucideIcons.store,
                  'Shops I follow',
                  BuyerPaths.following,
                ),
                _Link(LucideIcons.ticket, 'My vouchers', BuyerPaths.vouchers),
                _Link(LucideIcons.mapPin, 'My addresses', BuyerPaths.addresses),
              ],
            ),
            _Group(
              rows: const [
                _Link(LucideIcons.userRound, 'Profile', BuyerPaths.profile),
                _Link(
                  LucideIcons.idCard,
                  'ID verification',
                  BuyerPaths.idVerification,
                ),
                _Link(LucideIcons.lock, 'Change password', BuyerPaths.password),
                _Link(LucideIcons.mail, 'Change email', BuyerPaths.email),
                _Link(
                  LucideIcons.phone,
                  'Change mobile number',
                  BuyerPaths.phone,
                ),
              ],
            ),
            _Group(
              rows: const [
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
            const Padding(padding: AppSpace.page, child: HomeSwitchList()),
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.lg,
                0,
              ),
              child: SignOutButton(),
            ),
          ],
        ),
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
    final waiting = (count ?? 0) > 0;
    return Expanded(
      child: PressScale(
        scale: 0.94,
        onTap: () => context.push(BuyerPaths.ordersTab(tab.key)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
          child: Column(
            children: [
              Badge(
                isLabelVisible: waiting,
                backgroundColor: AppColors.brandRed,
                offset: const Offset(4, -4),
                label: Text('${count ?? 0}'),
                child: Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: waiting
                        ? AppColors.brandRedTint
                        : AppColors.stone100,
                    borderRadius: BorderRadius.circular(BuyerRadius.field),
                  ),
                  child: Icon(
                    icon,
                    size: 21,
                    color: waiting ? AppColors.brandRed : AppColors.stone700,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                tab.label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11.5,
                  height: 1.2,
                  color: AppColors.stone700,
                ),
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
    return MenuRow(icon: icon, title: label, onTap: () => context.push(path));
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.rows});

  final List<_Link> rows;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const MenuDivider(),
            rows[i],
          ],
        ],
      ),
    );
  }
}
