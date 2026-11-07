import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../auth/account_actions.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../buyer/widgets/buyer_widgets.dart';

/// The shop's account: who is signed in, the office work that stays on the website (adding products, promotions,
/// vouchers, earnings and payouts, reports, chat with buyers, shop profile), switching back to shopping, signing out.
class SellerMoreScreen extends ConsumerWidget {
  const SellerMoreScreen({super.key});

  static const _web = [
    (LucideIcons.messageCircle, 'Messages with buyers', '/seller/messages'),
    (
      LucideIcons.badgePercent,
      'Promotions and flash sales',
      '/seller/promotions',
    ),
    (LucideIcons.ticket, 'Vouchers', '/seller/vouchers'),
    (LucideIcons.wallet, 'Earnings and payouts', '/seller/earnings'),
    (LucideIcons.star, 'Reviews', '/seller/reviews'),
    (LucideIcons.chartColumn, 'Reports', '/seller/reports'),
    (LucideIcons.store, 'Shop profile', '/seller/shop-profile'),
    (LucideIcons.qrCode, 'GCash and payments', '/seller/payments'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Shop')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.sm,
          AppSpace.lg,
          AppSpace.xl + dockInset(context) + 72,
        ),
        children: [
          BlockCard(
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.brandRed,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(LucideIcons.store, color: AppColors.white),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.shopName ?? 'Your shop',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        user?.email ?? '',
                        style: const TextStyle(
                          color: AppColors.stone600,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const BlockTitle('On the website'),
          const SizedBox(height: AppSpace.sm),
          BlockCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (i, (icon, title, path)) in _web.indexed) ...[
                  if (i > 0) const Divider(height: 1),
                  ListTile(
                    leading: Icon(icon, color: AppColors.stone700),
                    title: Text(title),
                    trailing: const Icon(
                      LucideIcons.externalLink,
                      size: 16,
                      color: AppColors.stone400,
                    ),
                    onTap: () => openWebsite(path),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const HomeSwitchList(),
          const SizedBox(height: AppSpace.md),
          const SignOutButton(),
        ],
      ),
    );
  }
}
