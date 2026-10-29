import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/catalog.dart';

/// A short message at the bottom of the screen ("Added to cart"). Errors use the rose tone.
void showSnack(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error
            ? StatusTone.rose.foreground
            : AppColors.stone900,
      ),
    );
}

/// The product card of the website's `ProductCard.tsx`: square photo, the name on 2 lines, the price in red with
/// the old price struck through, the sale percentage, rating and sold count, and a flash tag in the corner.
class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final ProductSummary product;

  @override
  Widget build(BuildContext context) {
    final discount = Fmt.discountPercent(product.price, product.originalPrice);
    final sold = Fmt.sold(product.unitsSold);
    final blocked = product.soldOut || product.onVacation;

    return Semantics(
      button: true,
      label: '${product.name}, ${formatPeso(product.price)}',
      excludeSemantics: true,
      child: Material(
        color: AppColors.white,
        borderRadius: AppRadius.cardAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(BuyerPaths.product(product.id)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    NetImage(product.thumbnailUrl),
                    if (product.flashSale != null && !blocked)
                      const Positioned(
                        top: AppSpace.sm,
                        left: AppSpace.sm,
                        child: _CornerTag(
                          label: 'Flash sale',
                          icon: LucideIcons.zap,
                        ),
                      ),
                    if (blocked)
                      Container(
                        color: AppColors.white.withValues(alpha: 0.6),
                        alignment: Alignment.center,
                        child: StatusChip(
                          label: product.onVacation ? 'Shop away' : 'Sold out',
                          tone: StatusTone.gray,
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.3,
                          color: AppColors.stone800,
                        ),
                      ),
                      const Spacer(),
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 6,
                        children: [
                          PesoText(
                            product.price,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.brandRed,
                            ),
                          ),
                          if (discount > 0)
                            Text(
                              '-$discount%',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.brandRed,
                              ),
                            ),
                        ],
                      ),
                      if (discount > 0)
                        PesoText(
                          product.originalPrice,
                          struck: true,
                          style: const TextStyle(fontSize: 11),
                        ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (product.avgRating != null &&
                              product.reviewCount > 0) ...[
                            const Icon(
                              LucideIcons.star,
                              size: 12,
                              color: Color(0xFFF59E0B),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              product.avgRating!.toStringAsFixed(1),
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.stone600,
                              ),
                            ),
                            const SizedBox(width: AppSpace.sm),
                          ],
                          Expanded(
                            child: Text(
                              sold ?? 'New',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.stone500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CornerTag extends StatelessWidget {
  const _CornerTag({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brandRed,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: AppColors.white),
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Two product cards per row, the grid every product list uses.
const productGridAspectRatio = 0.58;

/// A category's picture in the same order as the website's `CategoryArt.tsx`: the admin's uploaded photo, then the
/// built-in photo for its slug, then the best seller's photo, then an icon.
class CategoryArt extends StatelessWidget {
  const CategoryArt({super.key, required this.category, this.size = 64});

  final Category category;
  final double size;

  @override
  Widget build(BuildContext context) {
    final uploaded = category.photoUrl;
    if (uploaded != null) {
      return NetImage(uploaded, width: size, height: size, radius: 12);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.asset(
        'assets/categories/${category.slug}.jpg',
        width: size,
        height: size,
        fit: BoxFit.cover,
        cacheWidth: (size * 3).round(),
        errorBuilder: (_, _, _) => NetImage(
          category.imageUrl,
          width: size,
          height: size,
          icon: LucideIcons.layoutGrid,
        ),
      ),
    );
  }
}

/// 1 to 5 stars, read out as "4 of 5 stars".
class Stars extends StatelessWidget {
  const Stars({super.key, required this.rating, this.size = 14});

  final num rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${rating.round()} of 5 stars',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 1; i <= 5; i++)
            Icon(
              LucideIcons.star,
              size: size,
              color: i <= rating.round()
                  ? const Color(0xFFF59E0B)
                  : AppColors.stone300,
            ),
        ],
      ),
    );
  }
}

/// A section title with an optional "See all" on the right.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel = 'See all',
    this.onAction,
    this.icon,
  });

  final String title;
  final String actionLabel;
  final VoidCallback? onAction;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.xl,
        AppSpace.sm,
        AppSpace.sm,
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppColors.brandRed),
            const SizedBox(width: AppSpace.sm),
          ],
          Expanded(
            child: Text(title, style: Theme.of(context).textTheme.titleMedium),
          ),
          if (onAction != null)
            TextButton(onPressed: onAction, child: Text(actionLabel)),
        ],
      ),
    );
  }
}

/// The quantity box of B4 and B6: minus, digits only, plus. Typing more than [max] sets it to [max], like the
/// website's quantity box.
class QuantityStepper extends StatefulWidget {
  const QuantityStepper({
    super.key,
    required this.value,
    required this.max,
    required this.onChanged,
    this.enabled = true,
  });

  final int value;
  final int max;
  final ValueChanged<int> onChanged;
  final bool enabled;

  @override
  State<QuantityStepper> createState() => _QuantityStepperState();
}

class _QuantityStepperState extends State<QuantityStepper> {
  late final _controller = TextEditingController(text: '${widget.value}');
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) _commit(_controller.text);
    });
  }

  @override
  void didUpdateWidget(QuantityStepper oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_focus.hasFocus && _controller.text != '${widget.value}') {
      _controller.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _commit(String text) {
    final next = Rules.clampQuantity(
      text,
      max: widget.max < 1 ? 1 : widget.max,
    );
    _controller.text = '$next';
    if (next != widget.value) widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final canLower = widget.enabled && widget.value > 1;
    final canRaise = widget.enabled && widget.value < widget.max;
    return Container(
      height: 40,
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.stone300),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'Fewer',
            visualDensity: VisualDensity.compact,
            icon: const Icon(LucideIcons.minus, size: 16),
            onPressed: canLower
                ? () => widget.onChanged(widget.value - 1)
                : null,
          ),
          SizedBox(
            width: 40,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              enabled: widget.enabled,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [Only.digits, Only.max(5)],
              style: const TextStyle(fontWeight: FontWeight.w600),
              decoration: const InputDecoration(
                isDense: true,
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
              onSubmitted: _commit,
            ),
          ),
          IconButton(
            tooltip: 'More',
            visualDensity: VisualDensity.compact,
            icon: const Icon(LucideIcons.plus, size: 16),
            onPressed: canRaise
                ? () => widget.onChanged(widget.value + 1)
                : null,
          ),
        ],
      ),
    );
  }
}

/// A round shop logo with the first letter when there is none.
class ShopAvatar extends StatelessWidget {
  const ShopAvatar({super.key, required this.name, this.url, this.size = 44});

  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: url == null
            ? Container(
                color: AppColors.brandRedTint,
                alignment: Alignment.center,
                child: Text(
                  name.isEmpty ? '?' : name.characters.first.toUpperCase(),
                  style: TextStyle(
                    color: AppColors.brandRed,
                    fontWeight: FontWeight.w700,
                    fontSize: size * 0.4,
                  ),
                ),
              )
            : NetImage(url, width: size, height: size, icon: LucideIcons.store),
      ),
    );
  }
}

/// A white card with the page's side margin, for the blocks of detail screens.
class BlockCard extends StatelessWidget {
  const BlockCard({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    // A Material (not a coloured box) so a list row inside still shows its tap ripple.
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: Material(
        color: AppColors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.cardAll,
          side: const BorderSide(color: AppColors.stone200),
        ),
        child: SizedBox(
          width: double.infinity,
          child: Padding(
            padding: padding ?? const EdgeInsets.all(AppSpace.lg),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// A label on the left and a value on the right, for totals and order details.
class InfoRow extends StatelessWidget {
  const InfoRow(
    this.label,
    this.value, {
    super.key,
    this.strong = false,
    this.valueColor,
  });

  final String label;
  final String value;
  final bool strong;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: strong ? 16 : 14,
      fontWeight: strong ? FontWeight.w700 : FontWeight.w400,
      color: AppColors.stone800,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: style.copyWith(color: AppColors.stone600),
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Flexible(
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: style.copyWith(color: valueColor ?? style.color),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Copies text and says so, for order and tracking numbers.
Future<void> copyText(BuildContext context, String text, String what) async {
  await Clipboard.setData(ClipboardData(text: text));
  if (context.mounted) showSnack(context, '$what copied.');
}
