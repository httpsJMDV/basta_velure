import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/session/session.dart';
import '../auth/placeholder_home.dart';

/// The logistics home for hub staff (`sorting_center` approved) and the courier company team (`logistics_company`
/// approved). Part D (liam.md) replaces this with the logistics app.
class LogisticsHomeScreen extends ConsumerWidget {
  const LogisticsHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final courierTeam = user?.logisticsCompany?.isApproved ?? false;
    return PlaceholderHome(
      title: courierTeam
          ? (user?.logisticsCompany?.name ?? 'Courier')
          : (user?.sortingCenter?.hubName ?? 'Hub'),
      icon: LucideIcons.warehouse,
      message:
          'Scanning, sorting, dispatch and rider approvals come in Part D.',
    );
  }
}
