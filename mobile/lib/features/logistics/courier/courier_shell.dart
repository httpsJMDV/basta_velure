import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';

/// The courier team's frame: Home, Hubs, Parcels, Riders and More.
class CourierShell extends StatelessWidget {
  const CourierShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (index) =>
            shell.goBranch(index, initialLocation: index == shell.currentIndex),
        destinations: const [
          NavigationDestination(icon: Icon(LucideIcons.house), label: 'Home'),
          NavigationDestination(
            icon: Icon(LucideIcons.warehouse),
            label: 'Hubs',
          ),
          NavigationDestination(
            icon: Icon(LucideIcons.package),
            label: 'Parcels',
          ),
          NavigationDestination(icon: Icon(LucideIcons.bike), label: 'Riders'),
          NavigationDestination(icon: Icon(LucideIcons.menu), label: 'More'),
        ],
      ),
    );
  }
}
