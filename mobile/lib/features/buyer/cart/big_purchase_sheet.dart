import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/cart.dart';

/// "This is a big purchase", right after the add that made the cart one: what checkout will ask for (the agreement)
/// and how to pay (no cash on delivery above the limit). The same words and order as the website's dialog. Returns
/// true when the buyer chose View cart.
Future<bool> showBigPurchaseSheet(
  BuildContext context,
  BigPurchaseNotice notice,
) async {
  HapticFeedback.mediumImpact();
  final viewCart = await showModalBottomSheet<bool>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => BigPurchaseSheet(notice: notice),
  );
  return viewCart ?? false;
}

class BigPurchaseSheet extends StatelessWidget {
  const BigPurchaseSheet({super.key, required this.notice});

  final BigPurchaseNotice notice;

  @override
  Widget build(BuildContext context) {
    final icons = [
      if (notice.agreement) LucideIcons.fileSignature,
      if (notice.noCod) LucideIcons.banknote,
      LucideIcons.rotateCcw,
    ];
    final amber = StatusTone.amber;
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        AppSpace.xl,
        0,
        AppSpace.xl,
        AppSpace.lg + MediaQuery.paddingOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(LucideIcons.badgeCheck, size: 22, color: amber.foreground),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  notice.title,
                  style: const TextStyle(
                    fontFamily: 'NotoSerif',
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
                    color: AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.lg,
              vertical: AppSpace.md,
            ),
            decoration: BoxDecoration(
              color: amber.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: amber.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  'Cart total',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: amber.foreground,
                  ),
                ),
                const Spacer(),
                Text(
                  formatPeso(notice.cartTotal),
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    fontFeatures: [FontFeature.tabularFigures()],
                    color: AppColors.stone900,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),
          for (var i = 0; i < notice.points.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: const BoxDecoration(
                      color: AppColors.stone100,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      i < icons.length ? icons[i] : LucideIcons.rotateCcw,
                      size: 15,
                      color: AppColors.stone600,
                    ),
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Text(
                      notice.points[i],
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.45,
                        color: AppColors.stone700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                  ),
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Keep shopping'),
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    backgroundColor: AppColors.brandRed,
                  ),
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('View cart'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
