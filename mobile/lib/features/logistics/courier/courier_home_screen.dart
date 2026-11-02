import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'courier_kit.dart';

const _awaitingColor = Color(0xFFFCD34D);

/// The courier team's Home (D7): the company's numbers on the portal's dark header, what needs attention, the work to
/// open, and how the network and its money are doing.
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

  Future<void> _openChats() async {
    await _open(LogisticsPaths.courierChats);
    if (mounted) {
      await ref.read(courierUnreadProvider.notifier).refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        body: LoadView<CourierDashboard>(
          key: _view,
          load: ref.read(courierApiProvider).dashboard,
          refreshEvery: const Duration(seconds: 30),
          builder: (context, dashboard) => _content(dashboard),
        ),
      ),
    );
  }

  Widget _content(CourierDashboard dashboard) {
    final company = ref.watch(currentUserProvider)?.logisticsCompany;
    final unread = ref.watch(courierUnreadProvider).value ?? 0;
    final alerts = _alerts(dashboard, unread);
    return ListView(
      padding: EdgeInsets.only(bottom: AppSpace.lg + dockInset(context)),
      children: [
        CourierHero(
          eyebrow: 'Courier network',
          title: company?.name ?? 'Courier',
          subtitle:
              '${dashboard.hubsActive} active hubs · ${dashboard.ridersOnline} of ${dashboard.ridersActive} riders Online',
          logoText: _initials(company?.name),
          middle: _ParcelsNow(dashboard: dashboard),
          figures: [
            HeroFigure(
              'Awaiting pickup',
              dashboard.awaitingPickup,
              color: _awaitingColor,
              icon: LucideIcons.packageOpen,
            ),
            HeroFigure(
              'At your hubs',
              dashboard.atHubs,
              icon: LucideIcons.warehouse,
            ),
            HeroFigure(
              'Out for delivery',
              dashboard.outForDelivery,
              color: AppColors.heroEmerald,
              icon: LucideIcons.truck,
            ),
            HeroFigure(
              'Failed deliveries',
              dashboard.failed,
              color: dashboard.failed > 0 ? AppColors.heroRed : AppColors.white,
              icon: LucideIcons.triangleAlert,
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
              const HubSection(title: 'Needs attention'),
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
                for (var i = 0; i < alerts.length; i++) ...[
                  if (i > 0) const SizedBox(height: AppSpace.sm),
                  alerts[i],
                ],
              const SizedBox(height: AppSpace.xl),
              const HubSection(title: 'Your work'),
              StatGrid(
                children: [
                  CourierWorkTile(
                    icon: LucideIcons.navigation,
                    title: 'Dispatch pickups',
                    subtitle: 'Unassigned and offered pickups',
                    onTap: () => _open(LogisticsPaths.courierDispatch),
                  ),
                  CourierWorkTile(
                    icon: LucideIcons.scanLine,
                    title: 'Hub scanning',
                    subtitle: 'Inbound, sort, outbound',
                    onTap: () => _open(LogisticsPaths.courierScan),
                  ),
                  CourierWorkTile(
                    icon: LucideIcons.coins,
                    title: 'COD',
                    subtitle: 'Collections and remittances',
                    onTap: () => _open(LogisticsPaths.courierCod),
                  ),
                  CourierWorkTile(
                    icon: LucideIcons.messageCircle,
                    title: 'Messages',
                    subtitle: 'Your hubs',
                    badge: unread,
                    onTap: _openChats,
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.xl),
              const HubSection(
                title: 'Your network',
                note: 'Who is working for you right now.',
              ),
              _Network(
                dashboard: dashboard,
                onHubs: () => context.go(LogisticsPaths.courierHubs),
                onRiders: () => context.go(LogisticsPaths.courierRiders),
              ),
              const SizedBox(height: AppSpace.xl),
              _CourierInsights(
                dashboard: dashboard,
                onOpenHub: (id) => _open(LogisticsPaths.courierHub(id)),
                onAllHubs: () => context.go(LogisticsPaths.courierHubs),
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
          onTap: _openChats,
        ),
    ];
  }
}

/// How the moving parcels split up, on the dark header. The colours are the same as the figures under it, so those read
/// as the legend.
class _ParcelsNow extends StatelessWidget {
  const _ParcelsNow({required this.dashboard});

  final CourierDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final total = dashboard.parcelsNow;
    final parts = [
      (dashboard.awaitingPickup, _awaitingColor),
      (dashboard.atHubs, AppColors.white),
      (dashboard.outForDelivery, AppColors.heroEmerald),
      (dashboard.failed, AppColors.heroRed),
    ].where((part) => part.$1 > 0).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              '$total',
              style: const TextStyle(
                fontSize: 34,
                height: 1.1,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.6,
                color: AppColors.white,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            Expanded(
              child: Text(
                total == 1
                    ? 'parcel moving right now'
                    : 'parcels moving right now',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.white.withValues(alpha: 0.75),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.sm),
        ExcludeSemantics(
          child: SizedBox(
            height: 8,
            child: parts.isEmpty
                ? DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const SizedBox.expand(),
                  )
                : Row(
                    children: [
                      for (var i = 0; i < parts.length; i++) ...[
                        if (i > 0) const SizedBox(width: 3),
                        Expanded(
                          flex: parts[i].$1,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: parts[i].$2,
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
          ),
        ),
      ],
    );
  }
}

/// The hubs and the riders side by side.
class _Network extends StatelessWidget {
  const _Network({
    required this.dashboard,
    required this.onHubs,
    required this.onRiders,
  });

  final CourierDashboard dashboard;
  final VoidCallback onHubs;
  final VoidCallback onRiders;

  @override
  Widget build(BuildContext context) {
    final riders = dashboard.ridersActive;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _NetworkCard(
              icon: LucideIcons.warehouse,
              figure: '${dashboard.hubsActive}',
              label: dashboard.hubsActive == 1 ? 'active hub' : 'active hubs',
              onTap: onHubs,
              chips: [
                HubMetaChip(
                  icon: LucideIcons.fileClock,
                  label: '${dashboard.hubApplications} to review',
                  tone: dashboard.hubApplications > 0 ? StatusTone.amber : null,
                ),
                if (dashboard.hubsSuspended > 0)
                  HubMetaChip(
                    icon: LucideIcons.ban,
                    label: '${dashboard.hubsSuspended} suspended',
                    tone: StatusTone.rose,
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: _NetworkCard(
              icon: LucideIcons.bike,
              figure: '${dashboard.ridersOnline}/$riders',
              label: 'riders Online',
              onTap: onRiders,
              meter: riders == 0 ? 0 : dashboard.ridersOnline / riders,
              chips: [
                HubMetaChip(
                  icon: LucideIcons.userCheck,
                  label: '${dashboard.ridersInReview} in review',
                  tone: dashboard.ridersInReview > 0 ? StatusTone.amber : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NetworkCard extends StatelessWidget {
  const _NetworkCard({
    required this.icon,
    required this.figure,
    required this.label,
    required this.onTap,
    required this.chips,
    this.meter,
  });

  final IconData icon;
  final String figure;
  final String label;
  final VoidCallback onTap;
  final List<Widget> chips;
  final double? meter;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: AppColors.gray600),
              const SizedBox(height: AppSpace.sm),
              Text(figure, style: HubText.figure),
              Text(label, style: HubText.small),
              if (meter != null) ...[
                const SizedBox(height: AppSpace.sm),
                CourierMeter(value: meter!, color: kDeliveredGreen),
              ],
              const SizedBox(height: AppSpace.sm),
              Wrap(spacing: 6, runSpacing: 6, children: chips),
            ],
          ),
        ),
      ),
    );
  }
}

/// The company's reports and money, each loaded on its own. Home's own numbers are already on screen, so any of these
/// that can't load just doesn't show, and comes back with the next minute's try.
class _CourierInsights extends ConsumerStatefulWidget {
  const _CourierInsights({
    required this.dashboard,
    required this.onOpenHub,
    required this.onAllHubs,
  });

  final CourierDashboard dashboard;
  final ValueChanged<int> onOpenHub;
  final VoidCallback onAllHubs;

  @override
  ConsumerState<_CourierInsights> createState() => _CourierInsightsState();
}

class _CourierInsightsState extends ConsumerState<_CourierInsights> {
  CourierReport? _report;
  CourierPayouts? _payouts;
  CourierSettlementTotals? _settlements;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(courierApiProvider);
    await Future.wait([
      _quiet(api.reports, (value) => _report = value),
      _quiet(api.payouts, (value) => _payouts = value),
      _quiet(api.settlementTotals, (value) => _settlements = value),
    ]);
  }

  Future<void> _quiet<T>(
    Future<T> Function() load,
    void Function(T value) keep,
  ) async {
    try {
      final value = await load();
      if (mounted) setState(() => keep(value));
    } catch (_) {
      // See the class comment.
    }
  }

  @override
  Widget build(BuildContext context) {
    final report = _report;
    final period = widget.dashboard.period;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        HubSection(
          title: 'Last 30 days',
          note: period?.from == null
              ? null
              : '${Fmt.date(period!.from)} to ${Fmt.date(period.to)}',
        ),
        _PeriodCard(dashboard: widget.dashboard, report: report),
        if (report != null && report.hubs.isNotEmpty) ...[
          const SizedBox(height: AppSpace.xl),
          const HubSection(
            title: 'Your hubs at a glance',
            note: 'Most deliveries first, over the same 30 days.',
          ),
          _HubGlance(
            report: report,
            onOpenHub: widget.onOpenHub,
            onAllHubs: widget.onAllHubs,
          ),
        ],
        if (_settlements != null || _payouts != null) ...[
          const SizedBox(height: AppSpace.xl),
          const HubSection(
            title: 'Money still open',
            note: 'Paying and settling stay on the website.',
          ),
          _MoneyCard(settlements: _settlements, payouts: _payouts),
        ],
      ],
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.dashboard, this.report});

  final CourierDashboard dashboard;
  final CourierReport? report;

  @override
  Widget build(BuildContext context) {
    final period = dashboard.period;
    final rates = report;
    final top = period == null
        ? 0
        : [
            period.shipments,
            period.pickedUp,
            period.delivered,
          ].reduce((a, b) => a > b ? a : b);
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (rates != null) ...[
            _Figures(
              items: [
                HubSummaryItem(
                  value: courierRate(rates.successRate),
                  label: 'Delivery success',
                ),
                HubSummaryItem(
                  value: courierRate(rates.onTimeRate),
                  label: 'On time, within ${rates.slaHours} hours',
                ),
              ],
            ),
            const Divider(height: AppSpace.xl),
          ],
          if (period != null) ...[
            _FlowRow(label: 'Shipments', value: period.shipments, top: top),
            _FlowRow(label: 'Picked up', value: period.pickedUp, top: top),
            _FlowRow(
              label: 'Delivered',
              value: period.delivered,
              top: top,
              color: kDeliveredGreen,
            ),
            const Divider(height: AppSpace.xl),
            _Figures(
              items: [
                HubSummaryItem(
                  value: '${period.failed}',
                  label: 'Failed tries',
                  color: period.failed > 0
                      ? StatusTone.rose.foreground
                      : AppColors.gray900,
                ),
                HubSummaryItem(value: '${period.returned}', label: 'Returned'),
                HubSummaryItem(
                  value: formatPeso(period.codCollected),
                  label: 'COD collected',
                ),
              ],
            ),
          ] else
            _Figures(
              items: [
                HubSummaryItem(
                  value: '${dashboard.delivered30Days}',
                  label: 'Delivered',
                ),
                HubSummaryItem(
                  value: '${dashboard.returned30Days}',
                  label: 'Returned',
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// A few figures in a row, inside a card that already has its own frame.
class _Figures extends StatelessWidget {
  const _Figures({required this.items});

  final List<HubSummaryItem> items;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0)
              const VerticalDivider(
                width: AppSpace.lg,
                color: AppColors.gray200,
              ),
            Expanded(child: items[i]),
          ],
        ],
      ),
    );
  }
}

class _FlowRow extends StatelessWidget {
  const _FlowRow({
    required this.label,
    required this.value,
    required this.top,
    this.color = AppColors.gray900,
  });

  final String label;
  final int value;
  final int top;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(label, style: HubText.small)),
              Text(
                '$value',
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray900,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          CourierMeter(
            value: top == 0 ? 0 : value / top,
            color: color,
            label: '$label: $value',
          ),
        ],
      ),
    );
  }
}

class _HubGlance extends StatelessWidget {
  const _HubGlance({
    required this.report,
    required this.onOpenHub,
    required this.onAllHubs,
  });

  static const _shown = 5;

  final CourierReport report;
  final ValueChanged<int> onOpenHub;
  final VoidCallback onAllHubs;

  @override
  Widget build(BuildContext context) {
    final hubs = [...report.hubs]
      ..sort((a, b) => b.delivered.compareTo(a.delivered));
    return RiderCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (index, hub) in hubs.take(_shown).indexed) ...[
            if (index > 0) const Divider(height: 1),
            InkWell(
              onTap: () => onOpenHub(hub.hubId),
              child: Padding(
                padding: const EdgeInsets.all(AppSpace.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            hub.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.gray900,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpace.sm),
                        Flexible(
                          child: Text(
                            hub.successRate == null
                                ? 'Nothing to measure yet'
                                : '${courierRate(hub.successRate)} success',
                            textAlign: TextAlign.end,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.gray900,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    CourierMeter(
                      value: hub.successRate ?? 0,
                      color: kDeliveredGreen,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      [
                        '${hub.delivered} delivered',
                        '${hub.failedAttempts} failed tries',
                        if (hub.avgDwellHours != null)
                          '${courierHours(hub.avgDwellHours)} at the hub',
                      ].join(' · '),
                      style: HubText.small,
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (hubs.length > _shown) ...[
            const Divider(height: 1),
            TextButton(
              onPressed: onAllHubs,
              child: Text('See all ${hubs.length} hubs'),
            ),
          ],
        ],
      ),
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({this.settlements, this.payouts});

  final CourierSettlementTotals? settlements;
  final CourierPayouts? payouts;

  @override
  Widget build(BuildContext context) {
    final totals = settlements;
    final owed = payouts;
    final waiting = owed == null
        ? const <CourierPayee>[]
        : ([...owed.ridersOwed, ...owed.hubsOwed]
            ..sort((a, b) => b.unpaid.compareTo(a.unpaid)));
    return RiderCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (totals != null)
            Padding(
              padding: const EdgeInsets.all(AppSpace.md),
              child: _Figures(
                items: [
                  HubSummaryItem(
                    value: formatPeso(totals.toReceive),
                    label: 'Shops owe you',
                    color: kDeliveredGreen,
                  ),
                  HubSummaryItem(
                    value: formatPeso(totals.toPay),
                    label: 'You owe shops',
                  ),
                ],
              ),
            ),
          if (owed != null) ...[
            if (totals != null) const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(AppSpace.md),
              child: _Figures(
                items: [
                  HubSummaryItem(
                    value: '${owed.ridersOwed.length}',
                    label: 'Riders waiting for pay',
                  ),
                  HubSummaryItem(
                    value: '${owed.hubsOwed.length}',
                    label: 'Hubs waiting for pay',
                  ),
                ],
              ),
            ),
            for (final payee in waiting.take(4)) ...[
              const Divider(height: 1),
              _PayeeRow(payee: payee),
            ],
          ],
          const Divider(height: 1),
          const WebsiteTile(
            icon: LucideIcons.banknote,
            title: 'Open pay on the website',
            path: LogisticsPaths.webCourierMoney,
          ),
        ],
      ),
    );
  }
}

class _PayeeRow extends StatelessWidget {
  const _PayeeRow({required this.payee});

  final CourierPayee payee;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: AppSpace.sm,
      ),
      child: Row(
        children: [
          HubAvatar(name: payee.name, size: 36),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payee.name,
                  style: const TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.gray900,
                  ),
                ),
                Text(
                  [
                    ?payee.hubName,
                    '${payee.unpaidCount} unpaid',
                    if (payee.lastPaidAt != null)
                      'last paid ${Fmt.date(payee.lastPaidAt)}',
                  ].join(' · '),
                  style: HubText.small,
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Text(
            formatPeso(payee.unpaid),
            style: const TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: AppColors.gray900,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
