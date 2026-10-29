import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/catalog.dart';
import '../widgets/buyer_widgets.dart';

enum OptionAction { addToCart, buyNow }

class OptionChoice {
  const OptionChoice(this.option, this.quantity);

  final ProductOption option;
  final int quantity;
}

/// Picks the variant and quantity before Add to cart or Buy now. A combination with no stock can't be picked, and
/// the quantity can't go above the stock or what is left of the buyer's purchase limit.
Future<OptionChoice?> showOptionSheet(
  BuildContext context, {
  required ProductDetail product,
  required OptionAction action,
}) {
  return showModalBottomSheet<OptionChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _OptionSheet(product: product, action: action),
  );
}

class _OptionSheet extends StatefulWidget {
  const _OptionSheet({required this.product, required this.action});

  final ProductDetail product;
  final OptionAction action;

  @override
  State<_OptionSheet> createState() => _OptionSheetState();
}

class _OptionSheetState extends State<_OptionSheet> {
  /// The chosen value of each variation type, by its index.
  final _picked = <int, String>{};

  /// For a product without variation types: the chosen variant.
  ProductOption? _plainChoice;
  int _quantity = 1;

  ProductDetail get product => widget.product;
  List<String> get types => product.variationTypes;

  @override
  void initState() {
    super.initState();
    final inStock = product.options.where((option) => option.stock > 0);
    if (product.options.length == 1 || (types.isEmpty && inStock.length == 1)) {
      _plainChoice = inStock.isNotEmpty ? inStock.first : product.options.first;
      if (types.isNotEmpty) {
        for (
          var i = 0;
          i < types.length && i < _plainChoice!.parts.length;
          i++
        ) {
          _picked[i] = _plainChoice!.parts[i];
        }
      }
    }
  }

  ProductOption? get _selected {
    if (types.isEmpty) return _plainChoice;
    if (_picked.length < types.length) return null;
    for (final option in product.options) {
      var matches = option.parts.length >= types.length;
      for (var i = 0; matches && i < types.length; i++) {
        matches = option.parts[i] == _picked[i];
      }
      if (matches) return option;
    }
    return null;
  }

  List<String> _valuesOf(int typeIndex) {
    final seen = <String>[];
    for (final option in product.options) {
      if (option.parts.length > typeIndex &&
          !seen.contains(option.parts[typeIndex])) {
        seen.add(option.parts[typeIndex]);
      }
    }
    return seen;
  }

  /// Whether picking [value] for type [typeIndex] still leaves a combination in stock with the other picks.
  bool _available(int typeIndex, String value) {
    return product.options.any((option) {
      if (option.stock <= 0 || option.parts.length <= typeIndex) return false;
      if (option.parts[typeIndex] != value) return false;
      for (final entry in _picked.entries) {
        if (entry.key == typeIndex) continue;
        if (option.parts.length > entry.key &&
            option.parts[entry.key] != entry.value) {
          return false;
        }
      }
      return true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final max = selected == null ? 0 : product.maxFor(selected);
    final limitReached = selected != null && selected.stock > 0 && max <= 0;
    final quantity = _quantity.clamp(1, max < 1 ? 1 : max);
    final price = selected?.price ?? product.price;
    final image = product.images.isEmpty ? null : product.images.first;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom + AppSpace.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                NetImage(image, width: 88, height: 88, radius: 10),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      PesoText(
                        price,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brandRed,
                        ),
                      ),
                      if (selected?.originalPrice != null &&
                          selected!.originalPrice! > selected.price)
                        PesoText(selected.originalPrice, struck: true),
                      const SizedBox(height: 2),
                      Text(
                        selected == null
                            ? 'Choose ${types.isEmpty ? 'an option' : types.join(' and ')}'
                            : selected.stock > 0
                            ? '${selected.stock} in stock'
                            : 'Sold out',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.stone600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.lg),
            if (types.isNotEmpty)
              for (var i = 0; i < types.length; i++) ...[
                Text(
                  types[i],
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpace.sm),
                Wrap(
                  spacing: AppSpace.sm,
                  runSpacing: AppSpace.sm,
                  children: [
                    for (final value in _valuesOf(i))
                      ChoiceChip(
                        label: Text(value),
                        selected: _picked[i] == value,
                        onSelected: _available(i, value)
                            ? (on) => setState(() {
                                if (on) {
                                  _picked[i] = value;
                                } else {
                                  _picked.remove(i);
                                }
                              })
                            : null,
                      ),
                  ],
                ),
                const SizedBox(height: AppSpace.lg),
              ]
            else if (product.options.length > 1) ...[
              const Text(
                'Option',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppSpace.sm),
              Wrap(
                spacing: AppSpace.sm,
                runSpacing: AppSpace.sm,
                children: [
                  for (final option in product.options)
                    ChoiceChip(
                      label: Text(option.label),
                      selected: _plainChoice?.variantId == option.variantId,
                      onSelected: option.stock > 0
                          ? (on) => setState(
                              () => _plainChoice = on ? option : null,
                            )
                          : null,
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.lg),
            ],
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Quantity',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                QuantityStepper(
                  value: quantity,
                  max: max < 1 ? 1 : max,
                  enabled: selected != null && max > 0,
                  onChanged: (value) => setState(() => _quantity = value),
                ),
              ],
            ),
            if (product.purchaseLimit != null) ...[
              const SizedBox(height: AppSpace.sm),
              Text(
                'Limit ${product.purchaseLimit} per buyer'
                '${product.purchasedByYou > 0 ? ' · you already bought ${product.purchasedByYou}' : ''}.',
                style: const TextStyle(fontSize: 12, color: AppColors.stone500),
              ),
            ],
            if (limitReached) ...[
              const SizedBox(height: AppSpace.md),
              const MessageBanner(
                message: "You've reached this product's purchase limit.",
                tone: StatusTone.amber,
              ),
            ],
            const SizedBox(height: AppSpace.xl),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: selected == null || max <= 0
                  ? null
                  : () =>
                        Navigator.of(context)
                            .pop(OptionChoice(selected, quantity)),
              child: Text(
                widget.action == OptionAction.buyNow
                    ? 'Buy now'
                    : 'Add to cart',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
