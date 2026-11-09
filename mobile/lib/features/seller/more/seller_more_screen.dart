import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../auth/account_actions.dart';
import '../../settings/notification_sound_screen.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../buyer/widgets/buyer_widgets.dart';
import '../data/seller_api.dart';

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
          const SizedBox(height: AppSpace.md),
          const _VacationCard(),
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
          const BlockTitle('On this phone'),
          const SizedBox(height: AppSpace.sm),
          const BlockCard(
            padding: EdgeInsets.zero,
            child: NotificationSoundTile(),
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

/// Vacation mode: while on, buyers still see the shop and its products but cannot add them to the cart or order, and
/// the shop page says it is away. Orders already placed still need to be shipped.
class _VacationCard extends ConsumerStatefulWidget {
  const _VacationCard();

  @override
  ConsumerState<_VacationCard> createState() => _VacationCardState();
}

class _VacationCardState extends ConsumerState<_VacationCard> {
  bool? _on;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    ref
        .read(sellerApiProvider)
        .onVacation()
        .then((on) {
          if (mounted) setState(() => _on = on);
        })
        .catchError((Object _) {});
  }

  Future<void> _set(bool on) async {
    setState(() => _busy = true);
    try {
      final now = await ref.read(sellerApiProvider).setVacation(on);
      if (!mounted) return;
      setState(() => _on = now);
      showSnack(
        context,
        now
            ? 'Vacation mode is on. Buyers cannot order until you turn it off.'
            : 'Your shop is open again.',
      );
    } on ApiFailure catch (failure) {
      if (mounted) showSnack(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final on = _on;
    return BlockCard(
      padding: EdgeInsets.zero,
      child: SwitchListTile(
        value: on ?? false,
        onChanged: on == null || _busy ? null : _set,
        secondary: Icon(
          LucideIcons.palmtree,
          color: on == true ? StatusTone.amber.foreground : AppColors.stone700,
        ),
        title: const Text(
          'Vacation mode',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          on == true
              ? 'On: buyers can look but not order. Ship the orders you already have.'
              : 'Off: your shop takes orders. Turn it on when you are away.',
        ),
      ),
    );
  }
}
