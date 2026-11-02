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
import 'buyer_theme.dart';

/// A short message at the bottom of the screen ("Added to cart"). Errors use the rose tone.
void showSnack(BuildContext context, String message, {bool error = false}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger
    ?..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error ? StatusTone.rose.foreground : AppColors.ink,
      ),
    );
}

/// What a product page needs to continue a card's picture: the shared picture's tag, and the picture to show straight
/// away while the rest of the page loads.
class ProductHero {
  const ProductHero(this.tag, this.imageUrl);

  final String tag;
  final String? imageUrl;
}

/// The product card of the website's `ProductCard.tsx`: a square photo with soft corners, the name on 2 lines, the
/// price in red with the old price struck through, rating and sold count, and a sale or flash tag in the corner. The
/// photo flies into the product page. [heroScope] keeps two lists on one screen from sharing a picture.
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.product,
    this.heroScope = 'list',
  });

  final ProductSummary product;
  final String heroScope;

  @override
  Widget build(BuildContext context) {
    final discount = Fmt.discountPercent(product.price, product.originalPrice);
    final sold = Fmt.sold(product.unitsSold);
    final blocked = product.soldOut || product.onVacation;
    final tag = 'product-$heroScope-${product.id}';

    void open() => context.push(
      BuyerPaths.product(product.id),
      extra: ProductHero(tag, product.thumbnailUrl),
    );
    return Semantics(
      button: true,
      label: '${product.name}, ${formatPeso(product.price)}',
      onTap: open,
      excludeSemantics: true,
      child: PressScale(
        onTap: open,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: ClipRRect(
                borderRadius: BuyerRadius.buttonAll,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Hero(tag: tag, child: NetImage(product.thumbnailUrl)),
                    if (product.flashSale != null && !blocked)
                      const Positioned(
                        top: AppSpace.sm,
                        left: AppSpace.sm,
                        child: _CornerTag(
                          label: 'Flash sale',
                          icon: LucideIcons.zap,
                        ),
                      )
                    else if (discount > 0 && !blocked)
                      Positioned(
                        top: AppSpace.sm,
                        left: AppSpace.sm,
                        child: _CornerTag(label: '-$discount%'),
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
            ),
            Expanded(
              // The grid fixes the card's height, so very large text stops growing here instead of being cut off.
              child: MediaQuery.withClampedTextScaling(
                maxScaleFactor: 1.1,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(2, 10, 2, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13.5,
                          height: 1.3,
                          color: AppColors.stone800,
                        ),
                      ),
                      const Spacer(),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          PesoText(
                            product.price,
                            style: BuyerText.price.copyWith(fontSize: 16),
                          ),
                          if (discount > 0) ...[
                            const SizedBox(width: 6),
                            Flexible(
                              child: PesoText(
                                product.originalPrice,
                                struck: true,
                                style: const TextStyle(fontSize: 11.5),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          if (product.avgRating != null &&
                              product.reviewCount > 0) ...[
                            const Icon(
                              Icons.star_rounded,
                              size: 14,
                              color: Color(0xFFF59E0B),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              product.avgRating!.toStringAsFixed(1),
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: AppColors.stone700,
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Expanded(
                            child: Text(
                              sold ?? 'New',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11.5,
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
            ),
          ],
        ),
      ),
    );
  }
}

class _CornerTag extends StatelessWidget {
  const _CornerTag({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.brandRed,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: AppColors.white),
            const SizedBox(width: 3),
          ],
          Text(
            label,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Two product cards per row, the grid every product list uses.
const productGridAspectRatio = 0.62;

/// The width and height of a sideways row of product cards.
const productRowCardWidth = 156.0;
const productRowHeight = productRowCardWidth / productGridAspectRatio + 8;

/// Placeholders for a sideways row while it loads.
class RowSkeleton extends StatelessWidget {
  const RowSkeleton({super.key, required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
        itemCount: 5,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, _) =>
            SkeletonBox(width: width, height: height, radius: 16),
      ),
    );
  }
}

/// A category's picture in the same order as the website's `CategoryArt.tsx`: the admin's uploaded photo, then the
/// built-in photo for its slug, then the best seller's photo, then an icon.
class CategoryArt extends StatelessWidget {
  const CategoryArt({
    super.key,
    required this.category,
    this.size = 64,
    this.height,
    this.radius = 16,
  });

  final Category category;

  /// The width, and the height too unless [height] is given.
  final double size;
  final double? height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final tall = height ?? size;
    final uploaded = category.photoUrl;
    if (uploaded != null) {
      return NetImage(uploaded, width: size, height: tall, radius: radius);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        'assets/categories/${category.slug}.jpg',
        width: size,
        height: tall,
        fit: BoxFit.cover,
        cacheWidth: (size * 3).round(),
        errorBuilder: (_, _, _) => NetImage(
          category.imageUrl,
          width: size,
          height: tall,
          icon: LucideIcons.layoutGrid,
        ),
      ),
    );
  }
}

/// 1 to 5 stars, read out as "4 of 5 stars".
class Stars extends StatelessWidget {
  const Stars({super.key, required this.rating, this.size = 15});

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
              Icons.star_rounded,
              size: size,
              color: i <= rating.round()
                  ? const Color(0xFFF59E0B)
                  : AppColors.stone200,
            ),
        ],
      ),
    );
  }
}

/// A section title in the serif, with an optional "See all" on the right.
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
        AppSpace.xxl,
        AppSpace.xs,
        AppSpace.md,
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppColors.brandRed),
            const SizedBox(width: AppSpace.sm),
          ],
          Expanded(child: Text(title, style: BuyerText.section)),
          if (onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                minimumSize: const Size(kMinTap, 36),
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
                textStyle: const TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
              child: Text(actionLabel),
            ),
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

  void _step(int by) {
    HapticFeedback.selectionClick();
    widget.onChanged(widget.value + by);
  }

  @override
  Widget build(BuildContext context) {
    final canLower = widget.enabled && widget.value > 1;
    final canRaise = widget.enabled && widget.value < widget.max;
    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.stone100,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepButton(
            tooltip: 'Fewer',
            icon: LucideIcons.minus,
            onPressed: canLower ? () => _step(-1) : null,
          ),
          SizedBox(
            width: 38,
            child: TextField(
              controller: _controller,
              focusNode: _focus,
              enabled: widget.enabled,
              textAlign: TextAlign.center,
              keyboardType: TextInputType.number,
              inputFormatters: [Only.digits, Only.max(5)],
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
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
          _StepButton(
            tooltip: 'More',
            icon: LucideIcons.plus,
            onPressed: canRaise ? () => _step(1) : null,
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: onPressed == null ? Colors.transparent : AppColors.white,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: SizedBox.square(
            dimension: 34,
            child: Icon(
              icon,
              size: 15,
              color: onPressed == null
                  ? AppColors.stone400
                  : AppColors.stone800,
            ),
          ),
        ),
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
                    fontFamily: 'NotoSerif',
                    color: AppColors.brandRed,
                    fontWeight: FontWeight.w700,
                    fontSize: size * 0.42,
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
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BuyerRadius.cardAll,
          boxShadow: BuyerShadow.card,
        ),
        child: Material(
          color: AppColors.white,
          clipBehavior: Clip.antiAlias,
          borderRadius: BuyerRadius.cardAll,
          child: SizedBox(
            width: double.infinity,
            child: Padding(
              padding: padding ?? const EdgeInsets.all(AppSpace.lg),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

/// A bold heading inside a [BlockCard].
class BlockTitle extends StatelessWidget {
  const BlockTitle(this.text, {super.key, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: AppColors.brandRed),
          const SizedBox(width: AppSpace.sm),
        ],
        Expanded(
          child: Text(text, style: BuyerText.section.copyWith(fontSize: 17)),
        ),
      ],
    );
  }
}

/// A row in a menu card: a soft icon tile, the words, a small arrow.
class MenuRow extends StatelessWidget {
  const MenuRow({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
    this.iconColor = AppColors.stone700,
    this.iconBackground = AppColors.stone100,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final Color iconColor;
  final Color iconBackground;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 60),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: AppSpace.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 19, color: iconColor),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w500,
                        color: AppColors.stone900,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 1),
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          fontSize: 12.5,
                          height: 1.35,
                          color: AppColors.stone500,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              trailing ??
                  const Icon(
                    LucideIcons.chevronRight,
                    size: 18,
                    color: AppColors.stone400,
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A hairline between [MenuRow]s, starting after the icon.
class MenuDivider extends StatelessWidget {
  const MenuDivider({super.key});

  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, indent: 64, endIndent: 14);
}

/// A round white button floating over a photo.
class FloatingRoundButton extends StatelessWidget {
  const FloatingRoundButton({
    super.key,
    required this.tooltip,
    required this.onPressed,
    required this.child,
  });

  final String tooltip;
  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: PressScale(
        scale: 0.9,
        onTap: onPressed,
        child: Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.white,
            shape: BoxShape.circle,
            boxShadow: BuyerShadow.card,
          ),
          child: child,
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
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: style.copyWith(color: AppColors.stone500),
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Flexible(
            flex: 2,
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
