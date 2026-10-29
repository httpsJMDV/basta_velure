import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';

/// My orders (B9), in the website's tabs with how many are in each.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key, this.initialTab});

  final String? initialTab;

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen>
    with SingleTickerProviderStateMixin {
  late final _tabs = TabController(
    length: OrderTab.values.length,
    vsync: this,
    initialIndex: OrderTab.values
        .indexWhere((tab) => tab.key == widget.initialTab)
        .clamp(0, 99),
  );
  Map<String, int> _counts = const {};

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(
        title: const Text('My orders'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            for (final tab in OrderTab.values)
              Tab(
                text: (_counts[tab.key] ?? 0) > 0
                    ? '${tab.label} (${_counts[tab.key]})'
                    : tab.label,
              ),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          for (final tab in OrderTab.values)
            PagedList<Order>(
              key: PageStorageKey(tab.key),
              load: (page) =>
                  ref.read(buyerApiProvider).orders(tab, page: page),
              onLoaded: (page) {
                final counts = page.meta['counts'];
                if (counts is Map && mounted) {
                  setState(
                    () => _counts = counts.map(
                      (k, v) => MapEntry('$k', (v as num?)?.toInt() ?? 0),
                    ),
                  );
                }
              },
              itemBuilder: (_, order) => OrderCard(order: order),
              empty: EmptyState(
                icon: LucideIcons.package,
                title: 'No orders here',
                message: tab == OrderTab.toPay
                    ? 'Orders waiting for payment show here.'
                    : 'Your orders show here once you place one.',
                actionLabel: 'Start shopping',
                onAction: () => context.go(BuyerPaths.home),
              ),
            ),
        ],
      ),
    );
  }
}

/// An order in a list: the shop, the status in the website's words and colours, the first items and the total.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final first = order.items.firstOrNull;
    final more = order.items.length - 1;
    return Material(
      color: AppColors.white,
      borderRadius: AppRadius.cardAll,
      child: InkWell(
        borderRadius: AppRadius.cardAll,
        onTap: () => context.push(BuyerPaths.order(order.id)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    LucideIcons.store,
                    size: 16,
                    color: AppColors.stone600,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      order.shopName ?? 'Shop',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  StatusChip(
                    label: order.status.label,
                    tone: order.status.tone,
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.md),
              if (first != null)
                Row(
                  children: [
                    NetImage(first.imageUrl, width: 60, height: 60, radius: 8),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            first.productName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            [
                              if (first.variantLabel != null)
                                first.variantLabel!,
                              '×${first.quantity}',
                              if (more > 0) '+$more more',
                            ].join(' · '),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: AppSpace.md),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${order.orderNumber} · ${Fmt.date(order.createdAt)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone500,
                      ),
                    ),
                  ),
                  const Text('Total ', style: TextStyle(fontSize: 13)),
                  PesoText(
                    order.total,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.brandRed,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
