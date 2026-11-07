import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../buyer/widgets/buyer_widgets.dart';
import '../data/seller_api.dart';
import '../data/seller_models.dart';

/// The shop's products: search, see what is low on stock, and change stock, price or whether it shows in the shop.
/// Adding a product and editing its photos or details stay on the website.
class SellerProductsScreen extends ConsumerStatefulWidget {
  const SellerProductsScreen({super.key});

  @override
  ConsumerState<SellerProductsScreen> createState() =>
      _SellerProductsScreenState();
}

class _SellerProductsScreenState extends ConsumerState<SellerProductsScreen> {
  List<SellerProduct>? _all;
  ApiFailure? _failure;
  String _search = '';
  bool _lowOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final products = await ref.read(sellerApiProvider).products();
      if (mounted) {
        setState(() {
          _all = products;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  void _replace(SellerProduct product) => setState(
    () => _all = [
      for (final p in _all ?? const <SellerProduct>[])
        p.id == product.id ? product : p,
    ],
  );

  Future<void> _edit(SellerProduct product) async {
    final changed = await showModalBottomSheet<SellerProduct>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _EditSheet(product: product),
    );
    if (changed != null && mounted) _replace(changed);
  }

  Future<void> _toggle(SellerProduct product) async {
    try {
      final message = await ref
          .read(sellerApiProvider)
          .setProductStatus(product.id, product.isLive ? 'archived' : 'active');
      if (!mounted) return;
      showSnack(context, message);
      await _load();
    } on ApiFailure catch (failure) {
      if (mounted) showSnack(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = _all;
    final term = _search.toLowerCase();
    final shown = (all ?? const <SellerProduct>[])
        .where((p) => term.isEmpty || p.name.toLowerCase().contains(term))
        .where((p) => !_lowOnly || p.variants.any((v) => v.lowStock))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Products'),
        actions: [
          IconButton(
            tooltip: 'Add a product on the website',
            icon: const Icon(LucideIcons.plus),
            onPressed: () => openWebsite('/seller/products/new'),
          ),
        ],
      ),
      body: all == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 4))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.sm,
                  AppSpace.lg,
                  AppSpace.xl + dockInset(context) + 72,
                ),
                children: [
                  TextField(
                    onChanged: (v) => setState(() => _search = v.trim()),
                    decoration: const InputDecoration(
                      hintText: 'Search your products',
                      prefixIcon: Icon(LucideIcons.search, size: 18),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: FilterChip(
                      selected: _lowOnly,
                      onSelected: (v) => setState(() => _lowOnly = v),
                      label: Text(
                        'Low on stock (${all.where((p) => p.variants.any((v) => v.lowStock)).length})',
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  if (shown.isEmpty)
                    const EmptyState(
                      icon: LucideIcons.package,
                      title: 'No products here',
                      message: 'Add products on the website.',
                    )
                  else
                    for (final p in shown) ...[
                      _ProductCard(
                        product: p,
                        onEdit: () => _edit(p),
                        onToggle: () => _toggle(p),
                      ),
                      const SizedBox(height: AppSpace.md),
                    ],
                ],
              ),
            ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.onEdit,
    required this.onToggle,
  });

  final SellerProduct product;
  final VoidCallback onEdit;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final low = product.variants.where((v) => v.lowStock).length;
    final canToggle =
        product.status == 'active' || product.status == 'archived';
    return BlockCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              NetImage(product.thumbnailUrl, width: 64, height: 64, radius: 12),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if (product.priceMin != null)
                          product.priceMax != null &&
                                  product.priceMax != product.priceMin
                              ? '${formatPeso(product.priceMin)} – ${formatPeso(product.priceMax)}'
                              : formatPeso(product.priceMin),
                        '${product.totalStock} in stock',
                        '${product.unitsSold} sold',
                      ].join(' · '),
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone600,
                      ),
                    ),
                    const SizedBox(height: AppSpace.xs),
                    Wrap(
                      spacing: AppSpace.xs,
                      runSpacing: AppSpace.xs,
                      children: [
                        StatusChip(
                          label: product.statusLabel,
                          tone: switch (product.status) {
                            'active' => StatusTone.emerald,
                            'rejected' => StatusTone.rose,
                            'pending_review' => StatusTone.amber,
                            _ => StatusTone.gray,
                          },
                        ),
                        if (low > 0)
                          StatusChip(
                            label: '$low low on stock',
                            tone: StatusTone.amber,
                          ),
                      ],
                    ),
                    if (product.rejectionReason != null &&
                        product.status == 'rejected')
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          product.rejectionReason!,
                          style: TextStyle(
                            fontSize: 12,
                            color: StatusTone.rose.foreground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (canToggle)
                Switch(
                  value: product.isLive,
                  onChanged: (_) => onToggle(),
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Stock and price of each option, saved one at a time.
class _EditSheet extends ConsumerStatefulWidget {
  const _EditSheet({required this.product});

  final SellerProduct product;

  @override
  ConsumerState<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends ConsumerState<_EditSheet> {
  late SellerProduct _product = widget.product;
  late final _stock = {
    for (final v in widget.product.variants)
      v.id: TextEditingController(text: '${v.stock}'),
  };
  late final _price = {
    for (final v in widget.product.variants)
      v.id: TextEditingController(text: v.price.toStringAsFixed(2)),
  };
  int? _saving;
  String? _error;

  @override
  void dispose() {
    for (final c in [..._stock.values, ..._price.values]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save(SellerVariant v) async {
    final stock = int.tryParse(_stock[v.id]!.text.trim());
    final price = double.tryParse(_price[v.id]!.text.trim());
    if (stock == null || stock < 0 || price == null || price <= 0) {
      setState(
        () => _error = 'Enter a whole number for stock and a price above ₱0.',
      );
      return;
    }
    setState(() {
      _saving = v.id;
      _error = null;
    });
    final api = ref.read(sellerApiProvider);
    try {
      var product = _product;
      if (stock != v.stock) {
        product = await api.setStock(product.id, v.id, stock);
      }
      if (price != v.price) {
        product = await api.setPrice(product.id, v.id, price);
      }
      if (!mounted) return;
      setState(() => _product = product);
      showSnack(
        context,
        'Saved ${v.label == 'Default' ? product.name : v.label}.',
      );
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_product);
      },
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpace.lg,
          0,
          AppSpace.lg,
          AppSpace.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _product.name,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: AppSpace.xs),
            const Text(
              'Change the stock or price of each option.',
              style: TextStyle(color: AppColors.stone600),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpace.sm),
              MessageBanner(message: _error!),
            ],
            const SizedBox(height: AppSpace.md),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final v in _product.variants)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpace.md),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            flex: 3,
                            child: Text(
                              v.label,
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: v.lowStock
                                    ? StatusTone.amber.foreground
                                    : AppColors.ink,
                              ),
                            ),
                          ),
                          Expanded(
                            flex: 2,
                            child: TextField(
                              controller: _stock[v.id],
                              keyboardType: TextInputType.number,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                              ],
                              decoration: const InputDecoration(
                                labelText: 'Stock',
                                isDense: true,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpace.sm),
                          Expanded(
                            flex: 3,
                            child: TextField(
                              controller: _price[v.id],
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              decoration: const InputDecoration(
                                labelText: 'Price (₱)',
                                isDense: true,
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Save',
                            onPressed: _saving == null ? () => _save(v) : null,
                            icon: _saving == v.id
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(LucideIcons.check),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: () =>
                  openWebsite('/seller/products/${_product.id}/edit'),
              icon: const Icon(LucideIcons.externalLink, size: 18),
              label: const Text('Edit photos and details on the website'),
            ),
          ],
        ),
      ),
    );
  }
}
