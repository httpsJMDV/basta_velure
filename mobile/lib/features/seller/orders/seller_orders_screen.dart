import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../buyer/widgets/buyer_widgets.dart';
import '../data/seller_api.dart';
import '../data/seller_models.dart';
import '../seller_routes.dart';

/// The shop's orders by tab, the same tabs as the website: New, To ship, Shipping, Returns, Completed, Cancelled.
class SellerOrdersScreen extends ConsumerStatefulWidget {
  const SellerOrdersScreen({super.key, this.initialTab});

  final String? initialTab;

  @override
  ConsumerState<SellerOrdersScreen> createState() => _SellerOrdersScreenState();
}

class _SellerOrdersScreenState extends ConsumerState<SellerOrdersScreen> {
  late SellerOrderTab _tab = SellerOrderTab.values.firstWhere(
    (t) => t.key == widget.initialTab,
    orElse: () => SellerOrderTab.toShip,
  );
  Map<String, int> _counts = const {};
  int _reload = 0;

  @override
  void didUpdateWidget(SellerOrdersScreen old) {
    super.didUpdateWidget(old);
    final next = SellerOrderTab.values
        .where((t) => t.key == widget.initialTab)
        .firstOrNull;
    if (next != null && next != _tab) setState(() => _tab = next);
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(sellerApiProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
              children: [
                for (final t in SellerOrderTab.values)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: ChoiceChip(
                      selected: t == _tab,
                      showCheckmark: false,
                      selectedColor: AppColors.ink,
                      label: Text(
                        (_counts[t.key] ?? 0) > 0
                            ? '${t.label} ${_counts[t.key]}'
                            : t.label,
                        style: TextStyle(
                          color: t == _tab ? AppColors.white : AppColors.ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onSelected: (_) => setState(() => _tab = t),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: PagedList<SellerOrder>(
              key: ValueKey('${_tab.key}-$_reload'),
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.lg,
                AppSpace.xl + dockInset(context) + 72,
              ),
              spacing: AppSpace.md,
              onRefresh: () async => setState(() => _reload++),
              load: (page) async {
                final (orders, counts) = await api.orders(_tab, page: page);
                if (mounted && page == 1) setState(() => _counts = counts);
                return orders;
              },
              itemBuilder: (context, order) => _OrderCard(
                order: order,
                onTap: () async {
                  await context.push(SellerPaths.order(order.id));
                  if (mounted) setState(() => _reload++);
                },
              ),
              empty: EmptyState(
                icon: LucideIcons.receipt,
                title: 'No ${_tab.label.toLowerCase()} orders',
                message: _tab == SellerOrderTab.newOrders
                    ? 'New orders show here the moment a buyer checks out.'
                    : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});

  final SellerOrder order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final first = order.items.firstOrNull;
    final more = order.items.length - 1;
    return BlockCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              NetImage(first?.imageUrl, width: 64, height: 64, radius: 12),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            order.orderNumber,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color: AppColors.stone600,
                            ),
                          ),
                        ),
                        StatusChip(
                          label: order.statusLabel,
                          tone: switch (order.status) {
                            'PLACED' => StatusTone.amber,
                            'DISPUTED' || 'DELIVERY_FAILED' => StatusTone.rose,
                            'COMPLETED' || 'DELIVERED' => StatusTone.emerald,
                            'CANCELLED' || 'RETURNED' => StatusTone.gray,
                            _ => StatusTone.blue,
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${first?.name ?? 'Order'}${more > 0 ? ' and $more more' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    Text(
                      '${order.buyerName} · ${order.paymentMethod.toUpperCase()} · ${Fmt.shortWhen(order.createdAt)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone600,
                      ),
                    ),
                    if (order.pickupSlotLabel != null &&
                        order.status == 'READY_FOR_PICKUP')
                      Text(
                        'Pickup: ${order.pickupSlotLabel}',
                        style: TextStyle(
                          fontSize: 12,
                          color: StatusTone.blue.foreground,
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      formatPeso(order.total),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
