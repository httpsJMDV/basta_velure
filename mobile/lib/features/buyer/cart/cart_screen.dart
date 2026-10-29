import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/cart.dart';
import '../data/checkout.dart';
import '../widgets/buyer_widgets.dart';

/// The Cart tab (B6). The cart lives on the server, so it is the same as on the website; every change answers with
/// the whole cart and its totals. The app never adds prices up itself.
class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  /// Lines with a change on its way, so a second tap waits for the first.
  final _busy = <int>{};

  CartController get _cart => ref.read(cartProvider.notifier);

  Future<void> _run(int key, Future<void> Function() change) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    try {
      await change();
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  Future<void> _remove(CartLine line) async {
    final confirmed = await confirmAction(
      context,
      title: 'Remove this item?',
      message: '${line.name} will be taken out of your cart.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (confirmed) await _run(line.id, () => _cart.remove(line.id));
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final view = cart.value;

    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(
        title: Text(
          view == null || view.lines == 0 ? 'Cart' : 'Cart (${view.lines})',
        ),
      ),
      body: switch (cart) {
        AsyncValue(:final value?) => _body(value),
        AsyncError(:final error) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(cartProvider),
        ),
        _ => const SkeletonList(count: 4),
      },
      bottomNavigationBar: view == null || view.stores.isEmpty
          ? null
          : _CheckoutBar(
              view: view,
              busy: _busy.contains(-1),
              onSelectAll: (on) => _run(-1, () => _cart.selectAll(on)),
            ),
    );
  }

  Widget _body(CartView view) {
    if (view.stores.isEmpty) {
      return RefreshIndicator(
        onRefresh: _cart.refresh,
        child: ListView(
          children: [
            SizedBox(
              height: 420,
              child: EmptyState(
                icon: LucideIcons.shoppingCart,
                title: 'Your cart is empty',
                message: 'Find something you love and add it here.',
                actionLabel: 'Start shopping',
                onAction: () => context.go(BuyerPaths.home),
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _cart.refresh,
      child: ListView(
        padding: const EdgeInsets.only(top: AppSpace.md, bottom: AppSpace.xl),
        children: [
          for (final store in view.stores) _storeCard(store),
          if (view.lines >= 100)
            const Padding(
              padding: AppSpace.page,
              child: MessageBanner(
                message: 'Your cart is full (100 items). Remove something to add more.',
                tone: StatusTone.amber,
              ),
            ),
        ],
      ),
    );
  }

  Widget _storeCard(CartStore store) {
    final storeKey = -1000 - store.seller.id;
    return BlockCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          InkWell(
            onTap: () => context.push(BuyerPaths.shop(store.seller.shopKey)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.xs,
                AppSpace.xs,
                AppSpace.md,
                AppSpace.xs,
              ),
              child: Row(
                children: [
                  Checkbox(
                    value: store.allSelected,
                    onChanged:
                        _busy.contains(storeKey) ||
                            store.lines.every((line) => line.blocked)
                        ? null
                        : (on) => _run(
                            storeKey,
                            () => _cart.selectAll(
                              on ?? false,
                              sellerId: store.seller.id,
                            ),
                          ),
                  ),
                  const Icon(
                    LucideIcons.store,
                    size: 18,
                    color: AppColors.stone700,
                  ),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Text(
                      store.seller.shopName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (store.seller.onVacation)
                    const StatusChip(
                      label: 'On vacation',
                      tone: StatusTone.amber,
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
          const Divider(height: 1),
          for (final line in store.lines) _lineTile(line),
          if (store.promoDiscount > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                0,
                AppSpace.lg,
                AppSpace.md,
              ),
              child: InfoRow(
                'Shop promotion',
                '-${formatPeso(store.promoDiscount)}',
                valueColor: AppColors.brandRed,
              ),
            ),
        ],
      ),
    );
  }

  Widget _lineTile(CartLine line) {
    final busy = _busy.contains(line.id);
    return Opacity(
      opacity: line.blocked ? 0.6 : 1,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.xs,
          AppSpace.md,
          AppSpace.md,
          AppSpace.md,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Checkbox(
              value: line.selected && !line.blocked,
              onChanged: line.blocked || busy
                  ? null
                  : (on) => _run(
                      line.id,
                      () => _cart.setSelected(line.id, on ?? false),
                    ),
            ),
            GestureDetector(
              onTap: () => context.push(BuyerPaths.product(line.productId)),
              child: NetImage(line.imageUrl, width: 76, height: 76, radius: 10),
            ),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(line.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (line.variantLabel != null)
                    Text(
                      line.variantLabel!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone500,
                      ),
                    ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      PesoText(
                        line.unitPrice,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.brandRed,
                        ),
                      ),
                      if (line.regularPrice > line.unitPrice) ...[
                        const SizedBox(width: 6),
                        PesoText(
                          line.regularPrice,
                          struck: true,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ],
                  ),
                  if (line.message != null || line.priceChanged != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      line.message ??
                          (line.priceChanged == 'up'
                              ? 'The price went up since you added it.'
                              : 'The price went down since you added it.'),
                      style: TextStyle(
                        fontSize: 12,
                        color: line.blocked || line.priceChanged == 'up'
                            ? StatusTone.rose.foreground
                            : StatusTone.emerald.foreground,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      if (!line.blocked)
                        QuantityStepper(
                          value: line.quantity,
                          max: line.maxQuantity < 1 ? 1 : line.maxQuantity,
                          enabled: !busy,
                          onChanged: (quantity) => _run(
                            line.id,
                            () => _cart.setQuantity(line.id, quantity),
                          ),
                        ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Remove ${line.name}',
                        onPressed: busy ? null : () => _remove(line),
                        icon: const Icon(
                          LucideIcons.trash2,
                          size: 20,
                          color: AppColors.stone500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  const _CheckoutBar({
    required this.view,
    required this.busy,
    required this.onSelectAll,
  });

  final CartView view;
  final bool busy;
  final ValueChanged<bool> onSelectAll;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        boxShadow: AppShadow.soft,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.xs,
        AppSpace.sm,
        AppSpace.lg,
        AppSpace.sm,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Checkbox(
              value: view.allSelected,
              onChanged: busy ? null : (on) => onSelectAll(on ?? false),
            ),
            const Text('All'),
            const Spacer(),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text(
                  'Total',
                  style: TextStyle(fontSize: 12, color: AppColors.stone500),
                ),
                PesoText(
                  view.total,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brandRed,
                  ),
                ),
              ],
            ),
            const SizedBox(width: AppSpace.md),
            FilledButton(
              onPressed: view.selectedLines == 0
                  ? null
                  : () => context.push(
                      BuyerPaths.checkout,
                      extra: const CheckoutRequest.cart(),
                    ),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size(120, 52),
              ),
              child: Text(
                view.selectedLines == 0
                    ? 'Check out'
                    : 'Check out (${view.selectedUnits})',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
