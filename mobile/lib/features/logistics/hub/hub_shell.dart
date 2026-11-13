import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/home_back_guard.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../logistics_paths.dart';

/// The hub staff's frame: Home, Sorting, a big round Scan button in the middle, Dispatch and More, on a floating dock
/// like the rest of the app. Scan opens from anywhere with one tap and stays open for many scans in a row.
class HubShell extends StatelessWidget {
  const HubShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _go(int branch) {
    if (branch != shell.currentIndex) HapticFeedback.selectionClick();
    shell.goBranch(branch, initialLocation: branch == shell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    return HomeBackGuard(
      shell: shell,
      child: Scaffold(
        extendBody: true,
        body: shell,
        bottomNavigationBar: SafeArea(
          top: false,
          minimum: const EdgeInsets.only(bottom: AppSpace.sm),
          child: MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.2,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
              child: Stack(
                alignment: Alignment.bottomCenter,
                children: [
                  // Room for the Scan button to rise above the dock and still take taps.
                  const SizedBox(height: 84, width: double.infinity),
                  Container(
                    height: 66,
                    decoration: BoxDecoration(
                      color: AppColors.gray900,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: BuyerShadow.floating,
                    ),
                    child: Row(
                      children: [
                        _BarItem(
                          icon: LucideIcons.house,
                          label: 'Home',
                          selected: shell.currentIndex == 0,
                          onTap: () => _go(0),
                        ),
                        _BarItem(
                          icon: LucideIcons.layers,
                          label: 'Sorting',
                          selected: shell.currentIndex == 1,
                          onTap: () => _go(1),
                        ),
                        const Expanded(child: _ScanLabel()),
                        _BarItem(
                          icon: LucideIcons.send,
                          label: 'Dispatch',
                          selected: shell.currentIndex == 2,
                          onTap: () => _go(2),
                        ),
                        _BarItem(
                          icon: LucideIcons.menu,
                          label: 'More',
                          selected: shell.currentIndex == 3,
                          onTap: () => _go(3),
                        ),
                      ],
                    ),
                  ),
                  const Positioned(top: 0, child: _ScanButton()),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BarItem extends StatelessWidget {
  const _BarItem({
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
              Icon(icon, size: 22, color: color),
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

/// The word under the round button. The button itself already says "Scan parcels" to a screen reader.
class _ScanLabel extends StatelessWidget {
  const _ScanLabel();

  @override
  Widget build(BuildContext context) {
    return const ExcludeSemantics(
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text(
            'Scan',
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: AppColors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _ScanButton extends StatelessWidget {
  const _ScanButton();

  @override
  Widget build(BuildContext context) {
    void openScan() {
      HapticFeedback.mediumImpact();
      context.push(LogisticsPaths.hubScan);
    }

    return Semantics(
      button: true,
      label: 'Scan parcels',
      excludeSemantics: true,
      onTap: openScan,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.gray900, width: 4),
        ),
        child: Material(
          color: AppColors.white,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: openScan,
            child: const SizedBox.square(
              dimension: 52,
              child: Icon(
                LucideIcons.scanLine,
                color: AppColors.gray900,
                size: 25,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
