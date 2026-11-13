import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import 'buyer_widgets.dart';

final availableVouchersProvider = FutureProvider.autoDispose<List<Voucher>>((
  ref,
) async {
  ref.watch(currentUserProvider);
  return (await ref.watch(buyerApiProvider).discoverVouchers()).items;
}, retry: (_, _) => null);

final saleProductsProvider = FutureProvider.autoDispose<List<ProductSummary>>(
  (ref) async =>
      (await ref
              .watch(buyerApiProvider)
              .products(onSale: true, perPage: 8, sort: 'newest'))
          .items,
  retry: (_, _) => null,
);

/// Existing offers are visible on Home, rather than only behind a shortcut.
class BuyerVoucherSection extends ConsumerWidget {
  const BuyerVoucherSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(availableVouchersProvider);
    void open() => context.push(BuyerPaths.vouchers);
    return Column(
      children: [
        SectionHeader(title: 'Vouchers for you', onAction: open),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
          child: offers.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, _) => TextButton(
              onPressed: () => ref.invalidate(availableVouchersProvider),
              child: const Text('Could not load vouchers. Try again'),
            ),
            data: (items) => items.isEmpty
                ? const Text(
                    'No vouchers available right now. New shop and Loved-IT offers will appear here.',
                    style: TextStyle(fontSize: 12, color: AppColors.stone600),
                  )
                : Column(
                    children: [
                      for (final voucher in items.take(2))
                        Card(
                          color: const Color(0xFFFFF8EC),
                          margin: const EdgeInsets.only(bottom: AppSpace.sm),
                          child: ListTile(
                            onTap: open,
                            title: Text(
                              voucher.label,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: Text(
                              '${voucher.shopName ?? 'Loved-IT'} · Min. spend ${formatPeso(voucher.minSpend)}',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                          ),
                        ),
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

class BuyerSaleSection extends ConsumerWidget {
  const BuyerSaleSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sales = ref.watch(saleProductsProvider);
    return Column(
      children: [
        SectionHeader(
          title: 'On sale now',
          onAction: () => context.push(
            BuyerPaths.searchFor(onSale: true, title: 'On sale'),
          ),
        ),
        sales.when(
          loading: () =>
              const SizedBox(height: 4, child: LinearProgressIndicator()),
          error: (_, _) => TextButton(
            onPressed: () => ref.invalidate(saleProductsProvider),
            child: const Text('Could not load promotions. Try again'),
          ),
          data: (items) => items.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(horizontal: AppSpace.lg),
                  child: Text(
                    'No sale products right now. Check back for new promotions.',
                    style: TextStyle(fontSize: 12, color: AppColors.stone600),
                  ),
                )
              : SizedBox(
                  height: productRowHeight,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.lg,
                    ),
                    itemCount: items.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(width: AppSpace.md),
                    itemBuilder: (_, index) => SizedBox(
                      width: productRowCardWidth,
                      child: ProductCard(
                        product: items[index],
                        heroScope: 'home-sale',
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}
