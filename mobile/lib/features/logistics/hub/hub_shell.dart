import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../logistics_paths.dart';

/// The hub staff's frame: Home, Sorting, a big round Scan button in the middle, Dispatch and More. Scan opens from
/// anywhere with one tap and stays open for many scans in a row.
class HubShell extends StatelessWidget {
  const HubShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  void _go(int branch) =>
      shell.goBranch(branch, initialLocation: branch == shell.currentIndex);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      body: shell,
      bottomNavigationBar: Material(
        color: AppColors.white,
        elevation: 8,
        child: SafeArea(
          top: false,
          child: MediaQuery.withClampedTextScaling(
            maxScaleFactor: 1.2,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
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
                const _ScanButton(),
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
    final color = selected ? AppColors.gray900 : AppColors.gray600;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 24, color: color),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 12,
                    color: color,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
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
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.xs),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Semantics(
              button: true,
              label: 'Scan parcels',
              excludeSemantics: true,
              child: Material(
                color: AppColors.gray900,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => context.push(LogisticsPaths.hubScan),
                  child: const SizedBox.square(
                    dimension: 56,
                    child: Icon(
                      LucideIcons.scanLine,
                      color: AppColors.white,
                      size: 26,
                    ),
                  ),
                ),
              ),
            ),
            const Text(
              'Scan',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.gray900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
