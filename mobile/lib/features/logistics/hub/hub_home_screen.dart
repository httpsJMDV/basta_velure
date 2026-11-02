import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';

import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// The hub's Home (D1): today's figures, parcels moving through the hub, what needs attention, then how the hub has been
/// doing. The working part re-reads itself every 15 seconds, like the website's hub dashboard, and every number and
/// alert opens the screen that works on it.
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
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.xs,
        AppSpace.lg,
        AppSpace.lg + dockInset(context),
      ),
      children: [
        _TodayPanel(home: home, onOpen: _open),
        const SizedBox(height: AppSpace.md),
        _ParcelFlow(
          steps: [
            _FlowStep(
              label: 'Expected',
              value: home.expected,
              icon: LucideIcons.packagePlus,
              onTap: () => _open(LogisticsPaths.hubIntake),
            ),
            _FlowStep(
              label: 'To sort',
              value: metrics.toSort,
              icon: LucideIcons.layers,
              onTap: () => context.go(LogisticsPaths.hubSorting),
            ),
            _FlowStep(
              label: 'To dispatch',
              value: home.toDispatch,
              icon: LucideIcons.send,
              onTap: () => context.go(LogisticsPaths.hubDispatch),
            ),
            _FlowStep(
              label: 'Out for delivery',
              value: metrics.outForDelivery,
              icon: LucideIcons.truck,
              onTap: () => _open(LogisticsPaths.hubDeliveries),
            ),
          ],
        ),
        const SizedBox(height: AppSpace.xl),
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
          for (final alert in alerts) ...[
            alert,
            const SizedBox(height: AppSpace.sm),
          ],
        const SizedBox(height: AppSpace.lg),
        const _HubInsights(),
      ],
    );
  }

  List<Widget> _alerts(HubHome home) {
    final failed = home.metrics.failedDeliveries;
    final riders = home.pendingRiders;
    final unread = home.unreadMessages;
    final toSend = home.transfers.groups.fold<int>(
      0,
      (sum, group) => sum + group.parcelCount,
    );
    final coming = home.transfers.onTheWayHere;
    final waiting = home.waitingForRiders;
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
      if (toSend > 0)
        AlertRow(
          icon: LucideIcons.truck,
          tone: StatusTone.amber,
          title: '$toSend parcel${toSend == 1 ? '' : 's'} for other hubs',
          detail: 'Send them on from the Sorting tab',
          onTap: () => context.go(LogisticsPaths.hubSorting),
        ),
      if (coming > 0)
        AlertRow(
          icon: LucideIcons.packagePlus,
          tone: StatusTone.blue,
          title: '$coming parcel${coming == 1 ? '' : 's'} from other hubs',
          detail: 'On the way here. Scan them in when they arrive',
          onTap: () => _open(LogisticsPaths.hubIntake),
        ),
      if (waiting > 0)
        AlertRow(
          icon: LucideIcons.packageCheck,
          tone: StatusTone.blue,
          title: '$waiting parcel${waiting == 1 ? '' : 's'} waiting for riders',
          detail: 'Assigned, and still at the hub to be collected',
          onTap: () => _open(LogisticsPaths.hubAwaiting),
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

/// The dark panel at the top: which hub, what day it is, and what has happened today.
class _TodayPanel extends StatelessWidget {
  const _TodayPanel({required this.home, required this.onOpen});

  final HubHome home;
  final Future<void> Function(String path) onOpen;

  @override
  Widget build(BuildContext context) {
    final metrics = home.metrics;
    final onHand = metrics.toSort + home.toDispatch;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(AppSpace.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            Fmt.date(DateTime.now()),
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            metrics.hubName,
            style: BuyerText.screenTitle.copyWith(color: AppColors.white),
          ),
          if (metrics.place.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              metrics.place,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.35,
                color: AppColors.white.withValues(alpha: 0.72),
              ),
            ),
          ],
          const SizedBox(height: AppSpace.lg),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _PanelFigure(
                    value: metrics.receivedToday,
                    label: 'Received today',
                    onTap: () =>
                        onOpen('${LogisticsPaths.hubIntake}?tab=received'),
                  ),
                ),
                VerticalDivider(
                  width: AppSpace.xl,
                  color: AppColors.white.withValues(alpha: 0.16),
                ),
                Expanded(
                  child: _PanelFigure(
                    value: onHand,
                    label: 'At the hub now',
                    onTap: () => context.go(LogisticsPaths.hubSorting),
                  ),
                ),
                VerticalDivider(
                  width: AppSpace.xl,
                  color: AppColors.white.withValues(alpha: 0.16),
                ),
                Expanded(
                  child: _PanelFigure(
                    value: metrics.activeRiders,
                    label: 'Riders with areas',
                    onTap: () => onOpen(LogisticsPaths.hubRiders),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PanelFigure extends StatelessWidget {
  const _PanelFigure({
    required this.value,
    required this.label,
    required this.onTap,
  });

  final int value;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$value',
            style: HubText.figure.copyWith(color: AppColors.white),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              height: 1.25,
              color: AppColors.white.withValues(alpha: 0.72),
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowStep {
  const _FlowStep({
    required this.label,
    required this.value,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final int value;
  final IconData icon;
  final VoidCallback onTap;
}

/// The hub's work as one line: a parcel moves left to right, so a pile-up shows where the hub is behind.
class _ParcelFlow extends StatelessWidget {
  const _ParcelFlow({required this.steps});

  final List<_FlowStep> steps;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.sm,
        vertical: AppSpace.md,
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < steps.length; i++)
              Expanded(
                child: _FlowColumn(
                  step: steps[i],
                  first: i == 0,
                  last: i == steps.length - 1,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FlowColumn extends StatelessWidget {
  const _FlowColumn({
    required this.step,
    required this.first,
    required this.last,
  });

  final _FlowStep step;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final busy = step.value > 0;
    return InkWell(
      onTap: step.onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Column(
          children: [
            SizedBox(
              height: 36,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // The line between the steps, stopping at the first and last.
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 2,
                          color: first ? Colors.transparent : AppColors.gray200,
                        ),
                      ),
                      Expanded(
                        child: Container(
                          height: 2,
                          color: last ? Colors.transparent : AppColors.gray200,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: busy ? AppColors.gray900 : AppColors.gray100,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      step.icon,
                      size: 17,
                      color: busy ? AppColors.white : AppColors.gray600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.sm),
            Text(
              '${step.value}',
              style: HubText.figure.copyWith(
                fontSize: 22,
                color: busy ? AppColors.gray900 : AppColors.gray600,
              ),
            ),
            const SizedBox(height: 1),
            Text(
              step.label,
              textAlign: TextAlign.center,
              style: HubText.small.copyWith(fontSize: 12, height: 1.2),
            ),
          ],
        ),
      ),
    );
  }
}

/// How the hub has been doing, and what it has earned. A slower read than the live numbers above, once a minute, and it
/// keeps quiet if it can't load: the work above doesn't depend on it.
class _HubInsights extends ConsumerStatefulWidget {
  const _HubInsights();

  @override
  ConsumerState<_HubInsights> createState() => _HubInsightsState();
}

class _HubInsightsState extends ConsumerState<_HubInsights> {
  HubWeek? _week;
  HubEarningsSummary? _earnings;
  HubProfile? _profile;
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
    final api = ref.read(hubApiProvider);
    await Future.wait<void>([
      api.week().then((value) {
        if (mounted) setState(() => _week = value);
      }, onError: (Object _) {}),
      api.earnings().then((value) {
        if (mounted) setState(() => _earnings = value);
      }, onError: (Object _) {}),
      api.profile().then((value) {
        if (mounted) setState(() => _profile = value);
      }, onError: (Object _) {}),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final week = _week;
    final earnings = _earnings;
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (week != null) ...[
          const HubSection(title: 'Last 7 days'),
          _WeekCard(week: week),
          const SizedBox(height: AppSpace.lg),
        ],
        if (earnings != null) ...[
          const HubSection(
            title: 'Your share',
            note: 'What the hub earns from each delivered parcel.',
          ),
          _ShareCard(earnings: earnings),
          const SizedBox(height: AppSpace.lg),
        ],
        if (profile != null) ...[
          const HubSection(title: 'About your hub'),
          RiderCard(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.lg,
              vertical: AppSpace.sm,
            ),
            child: Column(
              children: [
                HubFact(
                  icon: LucideIcons.mapPinned,
                  label: 'Coverage',
                  value:
                      '${profile.coverageCount} barangay${profile.coverageCount == 1 ? '' : 's'}',
                ),
                if (profile.courierName != null)
                  HubFact(
                    icon: LucideIcons.building2,
                    label: 'Courier company',
                    value: profile.courierName,
                  ),
                if (profile.courierPhone != null)
                  HubFact(
                    icon: LucideIcons.phone,
                    label: 'Courier contact',
                    value: profile.courierPhone,
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.week});

  final HubWeek week;

  static String _percent(double? rate) =>
      rate == null ? '—' : '${(rate * 100).round()}%';

  static String _hours(double? hours) {
    if (hours == null) return '—';
    if (hours < 1) return '${(hours * 60).round()} min';
    return '${hours.toStringAsFixed(hours < 10 ? 1 : 0)} h';
  }

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _DayBars(days: week.days),
          const SizedBox(height: AppSpace.lg),
          Row(
            children: [
              Expanded(
                child: HubSummaryItem(
                  value: '${week.received}',
                  label: 'Received',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: '${week.delivered}',
                  label: 'Delivered',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: '${week.failedAttempts}',
                  label: 'Failed tries',
                ),
              ),
            ],
          ),
          const Divider(height: AppSpace.xl, color: AppColors.gray200),
          Row(
            children: [
              Expanded(
                child: HubSummaryItem(
                  value: _percent(week.successRate),
                  label: 'Success rate',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: _percent(week.onTimeRate),
                  label: 'On time',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: _hours(week.avgDwellHours),
                  label: 'Time at hub',
                ),
              ),
            ],
          ),
          if (week.slaHours != null) ...[
            const SizedBox(height: AppSpace.md),
            HubHint(
              text:
                  'On time means delivered within ${week.slaHours} hours of reaching the hub.',
            ),
          ],
        ],
      ),
    );
  }
}

/// Delivered per day, as bars. The day with the most is full height.
class _DayBars extends StatelessWidget {
  const _DayBars({required this.days});

  final List<HubDay> days;

  @override
  Widget build(BuildContext context) {
    final top = days.fold<int>(
      0,
      (most, day) => day.delivered > most ? day.delivered : most,
    );
    final total = days.fold<int>(0, (sum, day) => sum + day.delivered);
    final calm = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      label: '$total parcels delivered in the last ${days.length} days',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Delivered per day', style: HubText.small),
          const SizedBox(height: AppSpace.sm),
          // Its height comes from what is in it, so large text never overflows it.
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final day in days)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          day.delivered == 0 ? '' : '${day.delivered}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.gray900,
                          ),
                        ),
                        const SizedBox(height: 3),
                        AnimatedContainer(
                          duration: calm ? Duration.zero : kMotion,
                          height: top == 0 ? 3 : 3 + 50 * (day.delivered / top),
                          decoration: BoxDecoration(
                            color: day.delivered == 0
                                ? AppColors.gray200
                                : AppColors.gray900,
                            borderRadius: BorderRadius.circular(5),
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          day.weekdayLetter,
                          style: HubText.small.copyWith(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ShareCard extends StatelessWidget {
  const _ShareCard({required this.earnings});

  final HubEarningsSummary earnings;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            formatPeso(earnings.todayTotal),
            style: HubText.figure.copyWith(fontSize: 30),
          ),
          Text(
            'Today · ${earnings.todayCount} deliver${earnings.todayCount == 1 ? 'y' : 'ies'}',
            style: HubText.small,
          ),
          const Divider(height: AppSpace.xl, color: AppColors.gray200),
          Row(
            children: [
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(earnings.weekTotal),
                  label: 'This week',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(earnings.monthTotal),
                  label: 'This month',
                ),
              ),
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(earnings.unpaidTotal),
                  label: 'Not paid yet',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
