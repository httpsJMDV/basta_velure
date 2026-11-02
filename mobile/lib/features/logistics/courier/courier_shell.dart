import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../buyer/widgets/buyer_theme.dart';

/// The courier team's frame: Home, Hubs, Parcels, Riders and More, on a floating dark dock like the rest of the app.
/// Every label stays visible, and the page you are on carries the portal's red.
class CourierShell extends StatelessWidget {
  const CourierShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _go(int branch) {
    if (branch != shell.currentIndex) HapticFeedback.selectionClick();
    shell.goBranch(branch, initialLocation: branch == shell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    const items = [
      (LucideIcons.house, 'Home'),
      (LucideIcons.warehouse, 'Hubs'),
      (LucideIcons.package, 'Parcels'),
      (LucideIcons.bike, 'Riders'),
      (LucideIcons.menu, 'More'),
    ];
    return Scaffold(
      extendBody: true,
      body: shell,
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: AppSpace.sm),
        child: MediaQuery.withClampedTextScaling(
          maxScaleFactor: 1.2,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
            child: Container(
              height: 68,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.xs),
              decoration: BoxDecoration(
                color: AppColors.gray900,
                borderRadius: BorderRadius.circular(24),
                boxShadow: BuyerShadow.floating,
              ),
              child: Row(
                children: [
                  for (var i = 0; i < items.length; i++)
                    _DockItem(
                      icon: items[i].$1,
                      label: items[i].$2,
                      selected: shell.currentIndex == i,
                      onTap: () => _go(i),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DockItem extends StatelessWidget {
  const _DockItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final calm = MediaQuery.disableAnimationsOf(context);
    final color = selected
        ? AppColors.white
        : AppColors.white.withValues(alpha: 0.62);
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        onTap: onTap,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: calm ? Duration.zero : kMotion,
                curve: Curves.easeOutCubic,
                width: selected ? 46 : 34,
                height: 28,
                decoration: BoxDecoration(
                  color: selected ? AppColors.brandRed : Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, size: 20, color: color),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                style: TextStyle(
                  fontSize: 11.5,
                  color: color,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
