import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../buyer/widgets/buyer_widgets.dart';
import '../data/seller_api.dart';
import '../data/seller_models.dart';
import '../seller_routes.dart';

final _statsProvider =
    FutureProvider.autoDispose<(SellerStats, List<SellerAttention>)>((
      ref,
    ) async {
      final api = ref.watch(sellerApiProvider);
      return (await api.stats(), await api.attention());
    });

/// The Seller Centre's home: today's sales against yesterday's, the orders to pack, the money in escrow and ready to
/// pay out, and what needs the shop's attention (new orders, low stock, listings Loved-IT did not approve).
class SellerHomeScreen extends ConsumerWidget {
  const SellerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(_statsProvider);
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Seller Centre'),
            if (user?.shopName != null)
              Text(
                user!.shopName!,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.stone600,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      ),
      body: data.when(
        loading: () => const SkeletonList(count: 4),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(_statsProvider),
        ),
        data: (value) {
          final (stats, attention) = value;
          return RefreshIndicator(
            onRefresh: () => ref.refresh(_statsProvider.future),
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.lg,
                AppSpace.xl + dockInset(context) + 72,
              ),
              children: [
                _Sales(stats: stats),
                const SizedBox(height: AppSpace.md),
                Row(
                  children: [
                    Expanded(
                      child: _Tile(
                        icon: LucideIcons.packageOpen,
                        value: '${stats.ordersToPack}',
                        label: 'To pack and ship',
                        onTap: () =>
                            context.go('${SellerPaths.orders}?tab=to_ship'),
                      ),
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: _Tile(
                        icon: LucideIcons.triangleAlert,
                        value: '${stats.lowStockCount}',
                        label: 'Low on stock',
                        warn: stats.lowStockCount > 0,
                        onTap: () => context.go(SellerPaths.products),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                BlockCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: _Money(
                          label: 'Ready to pay out',
                          amount: stats.available,
                        ),
                      ),
                      Container(
                        width: 1,
                        height: 40,
                        color: AppColors.stone200,
                      ),
                      const SizedBox(width: AppSpace.md),
                      Expanded(
                        child: _Money(
                          label: 'In escrow',
                          amount: stats.pending,
                        ),
                      ),
                    ],
                  ),
                ),
                if (attention.isNotEmpty) ...[
                  const SizedBox(height: AppSpace.lg),
                  const BlockTitle('Needs your attention'),
                  const SizedBox(height: AppSpace.sm),
                  BlockCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (final (i, a) in attention.indexed) ...[
                          if (i > 0) const Divider(height: 1),
                          ListTile(
                            leading: Icon(switch (a.type) {
                              'new_order' => LucideIcons.receipt,
                              'low_stock' => LucideIcons.packageMinus,
                              _ => LucideIcons.circleAlert,
                            }, color: AppColors.stone700),
                            title: Text(
                              a.label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                            subtitle: Text(a.sub),
                            trailing: const Icon(
                              LucideIcons.chevronRight,
                              size: 18,
                            ),
                            onTap: () => context.go(
                              a.type == 'new_order'
                                  ? '${SellerPaths.orders}?tab=new'
                                  : SellerPaths.products,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Sales extends StatelessWidget {
  const _Sales({required this.stats});

  final SellerStats stats;

  @override
  Widget build(BuildContext context) {
    final diff = stats.todaySales - stats.yesterdaySales;
    return Container(
      padding: const EdgeInsets.all(AppSpace.xl),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Today's sales",
            style: TextStyle(fontSize: 14, color: Color(0xFFD6D3D1)),
          ),
          const SizedBox(height: 2),
          Text(
            formatPeso(stats.todaySales),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: AppColors.white,
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            stats.yesterdaySales == 0 && stats.todaySales == 0
                ? 'No sales yesterday either.'
                : '${diff >= 0 ? '+' : '−'}${formatPeso(diff.abs())} against yesterday (${formatPeso(stats.yesterdaySales)})',
            style: const TextStyle(fontSize: 13, color: Color(0xFFD6D3D1)),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.value,
    required this.label,
    required this.onTap,
    this.warn = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final VoidCallback onTap;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icon,
                size: 20,
                color: warn ? StatusTone.amber.foreground : AppColors.stone700,
              ),
              const SizedBox(height: AppSpace.sm),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink,
                ),
              ),
              Text(
                label,
                style: const TextStyle(fontSize: 13, color: AppColors.stone600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Money extends StatelessWidget {
  const _Money({required this.label, required this.amount});

  final String label;
  final double amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppColors.stone600),
        ),
        const SizedBox(height: 2),
        Text(
          formatPeso(amount),
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.ink,
          ),
        ),
      ],
    );
  }
}
