import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../rider_paths.dart';
import '../widgets/rider_app_bar.dart';
import '../widgets/rider_widgets.dart';

/// Home (C2): the status panel with the Online / Offline switch and today's earnings, the rider's jobs, and anything
/// waiting (returns to the seller, cash to hand over). Job offers come over every screen (the shell).
class RiderHomeScreen extends ConsumerStatefulWidget {
  const RiderHomeScreen({super.key});

  @override
  ConsumerState<RiderHomeScreen> createState() => _RiderHomeScreenState();
}

class _HomeData {
  const _HomeData({
    required this.pickups,
    required this.deliveries,
    required this.onTheRoad,
    required this.today,
    required this.returns,
    required this.cod,
  });

  final PickupCounts pickups;
  final DeliveryList deliveries;
  final DeliveryList onTheRoad;
  final EarningsSummary today;
  final List<ReturnJob> returns;
  final CodSummary cod;
}

class _RiderHomeScreenState extends ConsumerState<RiderHomeScreen> {
  _HomeData? _data;
  ApiFailure? _failure;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(riderApiProvider);
    try {
      final results = await Future.wait<Object>([
        api.pickups(PickupView.mine),
        api.deliveries(DeliveryView.assigned),
        api.deliveries(DeliveryView.outForDelivery),
        api.earningsSummary(EarningsPeriod.day),
        api.returns(),
        api.cod(),
      ]);
      if (!mounted) return;
      setState(() {
        _failure = null;
        _data = _HomeData(
          pickups: (results[0] as PickupList).counts,
          deliveries: results[1] as DeliveryList,
          onTheRoad: results[2] as DeliveryList,
          today: results[3] as EarningsSummary,
          returns: results[4] as List<ReturnJob>,
          cod: results[5] as CodSummary,
        );
      });
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _refresh() async {
    await Future.wait([
      _load(),
      ref.read(riderStatusProvider.notifier).refresh(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final rider = ref.watch(currentUserProvider)?.rider;
    final status = ref.watch(riderStatusProvider);
    final data = _data;

    return Scaffold(
      appBar: RiderAppBar(
        title: 'Courier Station',
        subtitle: rider?.companyName ?? rider?.hubName,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.xs,
            AppSpace.lg,
            AppSpace.lg + dockInset(context),
          ),
          children: [
            _StatusPanel(status: status, today: data?.today),
            const SizedBox(height: AppSpace.md),
            if (data == null && _failure != null)
              SizedBox(
                height: 320,
                child: ErrorRetry(failure: _failure!, onRetry: _load),
              )
            else if (data == null)
              const SizedBox(height: 360, child: SkeletonList(count: 3))
            else ...[
              _Jobs(data: data, status: status.value),
              if (_nextStop(data) case final next?) ...[
                const SizedBox(height: AppSpace.md),
                _NextStop(stop: next),
              ],
              const SizedBox(height: AppSpace.xl),
              ..._waiting(data),
              const SizedBox(height: AppSpace.xl),
              const _GuideLink(),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _waiting(_HomeData data) {
    final outstanding = asDouble(data.cod.outstanding);
    final items = <Widget>[
      if (data.returns.isNotEmpty)
        _WaitingTile(
          icon: LucideIcons.undo2,
          tone: StatusTone.rose,
          title:
              '${data.returns.length} parcel${data.returns.length == 1 ? '' : 's'} to return to the seller',
          subtitle:
              'Bring ${data.returns.length == 1 ? 'it' : 'them'} back to the shop.',
          onTap: () => context.push(RiderPaths.returns).then((_) => _load()),
        ),
      if (outstanding > 0)
        _WaitingTile(
          icon: LucideIcons.banknote,
          tone: StatusTone.amber,
          title: 'Cash to hand over: ${formatPeso(data.cod.outstanding)}',
          subtitle: 'Cash on delivery you collected for your courier company.',
          onTap: () => context.push(RiderPaths.cod).then((_) => _load()),
        ),
      if (data.deliveries.assignedCount > 0)
        _WaitingTile(
          icon: LucideIcons.warehouse,
          tone: StatusTone.blue,
          title:
              '${data.deliveries.assignedCount} parcel${data.deliveries.assignedCount == 1 ? '' : 's'} to collect at the hub',
          subtitle:
              data.deliveries.hub?.name ??
              'Scan them at the hub to start delivering.',
          onTap: () => context.go(RiderPaths.deliveries),
        ),
    ];
    return [
      const RiderSectionTitle('Waiting for you'),
      if (items.isEmpty)
        const RiderCard(
          child: Row(
            children: [
              RiderIconTile(
                icon: LucideIcons.circleCheck,
                color: kDeliveredGreen,
                background: Color(0xFFECFDF5),
              ),
              SizedBox(width: AppSpace.md),
              Expanded(
                child: Text(
                  'Nothing waiting. New jobs come to you while you are Online.',
                  style: RiderText.body,
                ),
              ),
            ],
          ),
        )
      else
        for (final item in items) ...[
          item,
          const SizedBox(height: AppSpace.sm),
        ],
      const SizedBox(height: AppSpace.md),
      RiderCard(
        padding: EdgeInsets.zero,
        child: InkWell(
          onTap: () => context.push(RiderPaths.cod).then((_) => _load()),
          child: const Padding(
            padding: EdgeInsets.all(AppSpace.md),
            child: Row(
              children: [
                RiderIconTile(icon: LucideIcons.banknote),
                SizedBox(width: AppSpace.md),
                Expanded(
                  child: Text(
                    'Cash on delivery',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                Icon(LucideIcons.chevronRight, color: AppColors.stone500),
              ],
            ),
          ),
        ),
      ),
    ];
  }
}

/// The first thing a rider reads: dark while Offline and green while Online, with the switch and what they earned today.
class _StatusPanel extends ConsumerStatefulWidget {
  const _StatusPanel({required this.status, required this.today});

  final AsyncValue<RiderWorkState> status;
  final EarningsSummary? today;

  @override
  ConsumerState<_StatusPanel> createState() => _StatusPanelState();
}

class _StatusPanelState extends ConsumerState<_StatusPanel> {
  bool _busy = false;

  Future<void> _toggle(bool online) async {
    if (_busy) return;
    if (!online) {
      final confirmed = await confirmAction(
        context,
        title: 'Go Offline?',
        message: 'No new jobs will come. You can still finish the jobs you already have.',
        confirmLabel: 'Go Offline',
      );
      if (!confirmed || !mounted) return;
    }
    setState(() => _busy = true);
    await runRiderAction(
      context,
      () => ref.read(riderStatusProvider.notifier).setOnline(online),
    );
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.status.value;
    if (state == null) {
      return widget.status.hasError
          ? RiderCard(
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      "Couldn't check if you are Online.",
                      style: RiderText.body,
                    ),
                  ),
                  TextButton(
                    onPressed: () =>
                        ref.read(riderStatusProvider.notifier).refresh(),
                    child: const Text('Try again'),
                  ),
                ],
              ),
            )
          : const Skeleton(child: SkeletonBox(height: 196, radius: 24));
    }

    if (state.status == 'SUSPENDED') {
      return const MessageBanner(
        message:
            'Your rider account is suspended, so you cannot go Online. Your courier company can tell you why and '
            'reactivate you.',
      );
    }

    final online = state.online;
    final today = widget.today;
    const faint = Color(0xFFE7E5E4);
    return AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : Motion.slow,
      curve: Motion.settle,
      decoration: BoxDecoration(
        color: online ? kDeliveredGreen : AppColors.ink,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              toggled: online,
              label: online ? 'You are Online' : 'You are Offline',
              child: InkWell(
                onTap: _busy ? null : () => _toggle(!online),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpace.xl,
                    AppSpace.xl,
                    AppSpace.xl,
                    AppSpace.lg,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                _LiveDot(online: online),
                                const SizedBox(width: AppSpace.sm),
                                Flexible(
                                  child: Text(
                                    online ? 'Online' : 'Offline',
                                    style: const TextStyle(
                                      fontSize: 30,
                                      height: 1.1,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: -0.5,
                                      color: AppColors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              online
                                  ? "You get jobs while you're Online."
                                  : 'Go Online to get new jobs.',
                              style: const TextStyle(
                                fontSize: 15,
                                color: faint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpace.sm),
                      if (_busy)
                        const SizedBox.square(
                          dimension: 28,
                          child: CircularProgressIndicator(
                            strokeWidth: 3,
                            color: AppColors.white,
                          ),
                        )
                      else
                        Transform.scale(
                          scale: 1.3,
                          child: Switch(
                            value: online,
                            onChanged: _toggle,
                            thumbColor: WidgetStatePropertyAll(
                              online ? kDeliveredGreen : AppColors.ink,
                            ),
                            trackColor: const WidgetStatePropertyAll(
                              AppColors.white,
                            ),
                            trackOutlineColor: const WidgetStatePropertyAll(
                              Colors.transparent,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            Container(
              height: 1,
              margin: const EdgeInsets.symmetric(horizontal: AppSpace.xl),
              color: AppColors.white.withValues(alpha: 0.16),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.xl,
                AppSpace.lg,
                AppSpace.xl,
                AppSpace.xl,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: _PanelFigure(
                      value: today == null
                          ? '—'
                          : formatPeso(today.totalEarned),
                      label: 'Earned today',
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: _PanelFigure(
                      value: today == null ? '—' : '${today.count}',
                      label: 'Paid jobs today',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A soft pulse while Online, so the panel reads as live from arm's length. Still for anyone who asked for less motion.
class _LiveDot extends StatefulWidget {
  const _LiveDot({required this.online});

  final bool online;

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(_LiveDot oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    if (widget.online && !MediaQuery.disableAnimationsOf(context)) {
      if (!_pulse.isAnimating) _pulse.repeat();
    } else {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.online ? AppColors.white : AppColors.stone400;
    return SizedBox.square(
      dimension: 18,
      child: Stack(
        alignment: Alignment.center,
        children: [
          if (widget.online)
            AnimatedBuilder(
              animation: _pulse,
              builder: (context, _) => Container(
                width: 8 + 10 * _pulse.value,
                height: 8 + 10 * _pulse.value,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color.withValues(alpha: 0.4 * (1 - _pulse.value)),
                ),
              ),
            ),
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(shape: BoxShape.circle, color: color),
          ),
        ],
      ),
    );
  }
}

class _PanelFigure extends StatelessWidget {
  const _PanelFigure({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 24,
            height: 1.15,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
            color: AppColors.white,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(fontSize: 13.5, color: Color(0xFFE7E5E4)),
        ),
      ],
    );
  }
}

DeliveryStop? _nextStop(_HomeData data) {
  for (final group in data.onTheRoad.groups) {
    if (group.stops.isNotEmpty) return group.stops.first;
  }
  return null;
}

/// Where to go now, with the cash to have ready. Opens Deliveries.
class _NextStop extends StatelessWidget {
  const _NextStop({required this.stop});

  final DeliveryStop stop;

  @override
  Widget build(BuildContext context) {
    final area = [
      stop.address.barangay,
      stop.address.city,
    ].whereType<String>().join(', ');
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.go(RiderPaths.deliveries),
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Row(
            children: [
              const RiderIconTile(
                icon: LucideIcons.navigation,
                color: AppColors.brandRed,
                background: AppColors.brandRedTint,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Next stop', style: RiderText.label),
                    Text(
                      stop.recipientName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: RiderText.name,
                    ),
                    Text(
                      [
                        if (area.isNotEmpty) area,
                        if (stop.isCod)
                          'Collect ${formatPeso(stop.codAmount)}'
                        else
                          'Paid',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.stone600,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                LucideIcons.chevronRight,
                size: 20,
                color: AppColors.stone500,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GuideLink extends StatelessWidget {
  const _GuideLink();

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push(RiderPaths.guide),
        child: const Padding(
          padding: EdgeInsets.all(AppSpace.lg),
          child: Row(
            children: [
              RiderIconTile(icon: LucideIcons.bookOpen),
              SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('How it works', style: RiderText.name),
                    Text(
                      'Your pay, each step of the job, and staying safe',
                      style: RiderText.label,
                    ),
                  ],
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 20,
                color: AppColors.stone500,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The rider's slots and open jobs. Pickups and deliveries open their tabs.
class _Jobs extends StatelessWidget {
  const _Jobs({required this.data, this.status});

  final _HomeData data;
  final RiderWorkState? status;

  @override
  Widget build(BuildContext context) {
    final jobs = status;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _JobTile(
              value: jobs == null
                  ? '—'
                  : '${jobs.activeJobs} of ${jobs.maxActiveJobs}',
              label: 'Job slots used',
              footer: jobs == null
                  ? null
                  : _SlotBar(used: jobs.activeJobs, total: jobs.maxActiveJobs),
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: _JobTile(
              value: '${data.pickups.mine + data.pickups.pickedUp}',
              label: 'Pickups open',
              onTap: () => context.go(RiderPaths.pickups),
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: _JobTile(
              value:
                  '${data.deliveries.assignedCount + data.deliveries.outForDeliveryCount}',
              label: 'Deliveries open',
              onTap: () => context.go(RiderPaths.deliveries),
            ),
          ),
        ],
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({
    required this.value,
    required this.label,
    this.onTap,
    this.footer,
  });

  final String value;
  final String label;
  final VoidCallback? onTap;
  final Widget? footer;

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
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: const TextStyle(
                    fontSize: 24,
                    height: 1.15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.25,
                  color: AppColors.stone600,
                ),
              ),
              if (footer != null) ...[
                const SizedBox(height: AppSpace.sm),
                footer!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotBar extends StatelessWidget {
  const _SlotBar({required this.used, required this.total});

  final int used;
  final int total;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Row(
        children: [
          for (var i = 0; i < total; i++) ...[
            if (i > 0) const SizedBox(width: 3),
            Expanded(
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: i < used ? AppColors.brandRed : AppColors.stone200,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WaitingTile extends StatelessWidget {
  const _WaitingTile({
    required this.icon,
    required this.tone,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final StatusTone tone;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            children: [
              RiderIconTile(
                icon: icon,
                color: tone.foreground,
                background: tone.background,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.35,
                        color: AppColors.stone600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.xs),
              const Icon(LucideIcons.chevronRight, color: AppColors.stone500),
            ],
          ),
        ),
      ),
    );
  }
}
