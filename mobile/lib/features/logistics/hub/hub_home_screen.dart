import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

/// The hub's Home (D1): four numbers on top, then what needs attention. Re-reads itself every 15 seconds, like the
/// website's hub dashboard. Each number and alert opens the screen that works on it.
class HubHomeScreen extends ConsumerStatefulWidget {
  const HubHomeScreen({super.key});

  @override
  ConsumerState<HubHomeScreen> createState() => _HubHomeScreenState();
}

class _HubHomeScreenState extends ConsumerState<HubHomeScreen> {
  final _view = GlobalKey<LoadViewState<HubHome>>();

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Hub overview')),
      body: LoadView<HubHome>(
        key: _view,
        load: ref.read(hubApiProvider).home,
        refreshEvery: const Duration(seconds: 15),
        builder: (context, home) => _content(home),
      ),
    );
  }

  Widget _content(HubHome home) {
    final metrics = home.metrics;
    final alerts = _alerts(home);
    return ListView(
      padding: const EdgeInsets.all(AppSpace.lg),
      children: [
        Text(metrics.hubName, style: RiderText.name),
        if (metrics.place.isNotEmpty)
          Text(
            metrics.place,
            style: const TextStyle(fontSize: 14, color: AppColors.gray600),
          ),
        const SizedBox(height: AppSpace.md),
        StatGrid(
          children: [
            HubStat(
              icon: LucideIcons.packagePlus,
              label: 'Expected',
              value: home.expected,
              tone: StatusTone.amber,
              onTap: () => _open(LogisticsPaths.hubIntake),
            ),
            HubStat(
              icon: LucideIcons.arrowDownToLine,
              label: 'Received today',
              value: metrics.receivedToday,
              tone: StatusTone.emerald,
              onTap: () => _open('${LogisticsPaths.hubIntake}?tab=received'),
            ),
            HubStat(
              icon: LucideIcons.layers,
              label: 'To sort',
              value: metrics.toSort,
              tone: StatusTone.amber,
              onTap: () => context.go(LogisticsPaths.hubSorting),
            ),
            HubStat(
              icon: LucideIcons.truck,
              label: 'Out for delivery',
              value: metrics.outForDelivery,
              tone: StatusTone.blue,
              onTap: () => _open(LogisticsPaths.hubDeliveries),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.xl),
        const RiderSectionTitle('Needs attention'),
        if (alerts.isEmpty)
          const RiderCard(
            child: Row(
              children: [
                Icon(LucideIcons.circleCheck, color: kDeliveredGreen),
                SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    'Nothing needs you right now.',
                    style: RiderText.body,
                  ),
                ),
              ],
            ),
          )
        else
          for (final alert in alerts) ...[
            alert,
            const SizedBox(height: AppSpace.sm),
          ],
      ],
    );
  }

  List<Widget> _alerts(HubHome home) {
    final failed = home.metrics.failedDeliveries;
    final riders = home.pendingRiders;
    final unread = home.unreadMessages;
    return [
      if (failed > 0)
        AlertRow(
          icon: LucideIcons.triangleAlert,
          tone: StatusTone.rose,
          title: '$failed failed deliver${failed == 1 ? 'y' : 'ies'}',
          detail: 'Reschedule with a rider or return to the seller',
          onTap: () => _open('${LogisticsPaths.hubDeliveries}?tab=failed'),
        ),
      if (riders > 0)
        AlertRow(
          icon: LucideIcons.userCheck,
          tone: StatusTone.amber,
          title: '$riders rider application${riders == 1 ? '' : 's'}',
          detail: 'Review the documents and approve or decline',
          onTap: () => _open(LogisticsPaths.hubRiders),
        ),
      if (unread > 0)
        AlertRow(
          icon: LucideIcons.messageSquare,
          tone: StatusTone.blue,
          title: '$unread unread message${unread == 1 ? '' : 's'}',
          detail: 'From your riders and your courier',
          onTap: () => _open(LogisticsPaths.hubChats),
        ),
    ];
  }
}
