import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

/// The courier team's Home (D7): the company's numbers on the portal's dark header, then what needs attention.
class CourierHomeScreen extends ConsumerStatefulWidget {
  const CourierHomeScreen({super.key});

  @override
  ConsumerState<CourierHomeScreen> createState() => _CourierHomeScreenState();
}

class _CourierHomeScreenState extends ConsumerState<CourierHomeScreen> {
  final _view = GlobalKey<LoadViewState<CourierDashboard>>();

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        body: SafeArea(
          top: false,
          child: LoadView<CourierDashboard>(
            key: _view,
            load: ref.read(courierApiProvider).dashboard,
            refreshEvery: const Duration(seconds: 30),
            builder: (context, dashboard) => _content(dashboard),
          ),
        ),
      ),
    );
  }

  Widget _content(CourierDashboard dashboard) {
    final company = ref.watch(currentUserProvider)?.logisticsCompany;
    final unread = ref.watch(courierUnreadProvider).value ?? 0;
    final alerts = _alerts(dashboard, unread);
    return ListView(
      padding: EdgeInsets.zero,
      children: [
        CourierHero(
          eyebrow: 'Courier network',
          title: company?.name ?? 'Courier',
          subtitle:
              '${dashboard.hubsActive} active hubs · ${dashboard.ridersOnline} of ${dashboard.ridersActive} riders Online',
          logoText: _initials(company?.name),
          figures: [
            HeroFigure('Awaiting pickup', dashboard.awaitingPickup),
            HeroFigure('At your hubs', dashboard.atHubs),
            HeroFigure(
              'Out for delivery',
              dashboard.outForDelivery,
              color: AppColors.heroEmerald,
            ),
            HeroFigure(
              'Failed deliveries',
              dashboard.failed,
              color: dashboard.failed > 0 ? AppColors.heroRed : AppColors.white,
            ),
          ],
          onFigureTap: (index) => switch (index) {
            0 => _open(LogisticsPaths.courierDispatch),
            1 => _open(LogisticsPaths.courierScan),
            3 => _open(LogisticsPaths.courierProblems),
            _ => context.go(LogisticsPaths.courierParcels),
          },
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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
              const SizedBox(height: AppSpace.lg),
              const RiderSectionTitle('Shortcuts'),
              LinkList(
                children: [
                  LinkTile(
                    icon: LucideIcons.navigation,
                    title: 'Dispatch pickups',
                    subtitle: 'Unassigned and offered pickups',
                    onTap: () => _open(LogisticsPaths.courierDispatch),
                  ),
                  LinkTile(
                    icon: LucideIcons.scanLine,
                    title: 'Hub scanning',
                    subtitle: 'Inbound, sort, outbound',
                    onTap: () => _open(LogisticsPaths.courierScan),
                  ),
                  LinkTile(
                    icon: LucideIcons.coins,
                    title: 'COD',
                    subtitle: 'Collections and remittances',
                    onTap: () => _open(LogisticsPaths.courierCod),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _initials(String? name) {
    final words = (name ?? '').trim().split(RegExp(r'\s+'));
    return words
        .where((word) => word.isNotEmpty)
        .take(2)
        .map((word) => word[0].toUpperCase())
        .join();
  }

  List<Widget> _alerts(CourierDashboard dashboard, int unread) {
    final applications = dashboard.hubApplications;
    final failed = dashboard.failed;
    final riders = dashboard.ridersInReview;
    return [
      if (applications > 0)
        AlertRow(
          icon: LucideIcons.warehouse,
          tone: StatusTone.amber,
          title: '$applications hub application${applications == 1 ? '' : 's'}',
          detail: 'Waiting for your review',
          onTap: () => context.go(LogisticsPaths.courierHubs),
        ),
      if (failed > 0)
        AlertRow(
          icon: LucideIcons.triangleAlert,
          tone: StatusTone.rose,
          title: '$failed failed deliver${failed == 1 ? 'y' : 'ies'}',
          detail: 'Waiting for the hub',
          onTap: () => _open(LogisticsPaths.courierProblems),
        ),
      if (riders > 0)
        AlertRow(
          icon: LucideIcons.userCheck,
          tone: StatusTone.amber,
          title: '$riders rider${riders == 1 ? '' : 's'} in review',
          detail: 'Applications and riders to verify',
          onTap: () => context.go(LogisticsPaths.courierRiders),
        ),
      if (unread > 0)
        AlertRow(
          icon: LucideIcons.messageSquare,
          tone: StatusTone.blue,
          title: '$unread unread message${unread == 1 ? '' : 's'}',
          detail: 'From your hubs',
          onTap: () async {
            await _open(LogisticsPaths.courierChats);
            if (mounted) {
              await ref.read(courierUnreadProvider.notifier).refresh();
            }
          },
        ),
    ];
  }
}
