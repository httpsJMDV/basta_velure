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
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../rider_paths.dart';
import '../widgets/rider_app_bar.dart';
import '../widgets/rider_widgets.dart';

/// Home (C2): the big Online / Offline switch, today's jobs and earnings, and anything waiting (returns to the
/// seller, cash to hand over). Job offers come over every screen (the shell).
class RiderHomeScreen extends ConsumerStatefulWidget {
  const RiderHomeScreen({super.key});

  @override
  ConsumerState<RiderHomeScreen> createState() => _RiderHomeScreenState();
}

class _HomeData {
  const _HomeData({
    required this.pickups,
    required this.deliveries,
    required this.today,
    required this.returns,
    required this.cod,
  });

  final PickupCounts pickups;
  final DeliveryList deliveries;
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
          today: results[2] as EarningsSummary,
          returns: results[3] as List<ReturnJob>,
          cod: results[4] as CodSummary,
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
    final user = ref.watch(currentUserProvider);
    final status = ref.watch(riderStatusProvider);
    final data = _data;

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: RiderAppBar(
        title: 'Courier Station',
        subtitle: user == null ? null : 'Hi, ${user.firstName}',
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            _OnlineSwitch(status: status),
            const SizedBox(height: AppSpace.lg),
            if (data == null && _failure != null)
              SizedBox(
                height: 320,
                child: ErrorRetry(failure: _failure!, onRetry: _load),
              )
            else if (data == null)
              const SizedBox(height: 360, child: SkeletonList(count: 3))
            else ...[
              _TodayCard(data: data, status: status.value),
              const SizedBox(height: AppSpace.lg),
              ..._waiting(data),
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
              Icon(LucideIcons.circleCheck, color: Color(0xFF047857)),
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
      const SizedBox(height: AppSpace.lg),
      OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: () => context.push(RiderPaths.cod).then((_) => _load()),
        icon: const Icon(LucideIcons.banknote, size: 20),
        label: const Text('Cash on delivery'),
      ),
    ];
  }
}

/// The big switch. Green when Online.
class _OnlineSwitch extends ConsumerStatefulWidget {
  const _OnlineSwitch({required this.status});

  final AsyncValue<RiderWorkState> status;

  @override
  ConsumerState<_OnlineSwitch> createState() => _OnlineSwitchState();
}

class _OnlineSwitchState extends ConsumerState<_OnlineSwitch> {
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
          : const Skeleton(child: SkeletonBox(height: 120, radius: 16));
    }

    if (state.status == 'SUSPENDED') {
      return const MessageBanner(
        message:
            'Your rider account is suspended, so you cannot go Online. Your courier company can tell you why and '
            'reactivate you.',
      );
    }

    final online = state.online;
    final green = const Color(0xFF047857);
    return Semantics(
      toggled: online,
      label: online ? 'You are Online' : 'You are Offline',
      child: Material(
        color: online ? green : AppColors.white,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: _busy ? null : () => _toggle(!online),
          child: Container(
            padding: const EdgeInsets.all(AppSpace.xl),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: online ? green : const Color(0xFFE5E7EB),
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        online ? 'Online' : 'Offline',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: online ? AppColors.white : AppColors.gray900,
                        ),
                      ),
                      const SizedBox(height: AppSpace.xs),
                      Text(
                        online
                            ? "You get jobs while you're Online."
                            : 'Go Online to get new jobs.',
                        style: TextStyle(
                          fontSize: 16,
                          color: online ? AppColors.white : AppColors.gray600,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_busy)
                  SizedBox.square(
                    dimension: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 3,
                      color: online ? AppColors.white : AppColors.brandRed,
                    ),
                  )
                else
                  Transform.scale(
                    scale: 1.4,
                    child: Switch(
                      value: online,
                      onChanged: _toggle,
                      activeThumbColor: green,
                      activeTrackColor: AppColors.white,
                      inactiveThumbColor: AppColors.white,
                      inactiveTrackColor: AppColors.gray600,
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

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.data, this.status});

  final _HomeData data;
  final RiderWorkState? status;

  @override
  Widget build(BuildContext context) {
    final jobs = status;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Today', style: RiderText.label),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Expanded(
                child: _Figure(
                  value: formatPeso(data.today.totalEarned),
                  label: 'Earned today',
                ),
              ),
              Expanded(
                child: _Figure(
                  value: '${data.today.count}',
                  label: 'Paid jobs today',
                ),
              ),
            ],
          ),
          const Divider(height: AppSpace.xl),
          Row(
            children: [
              Expanded(
                child: _Figure(
                  value: jobs == null
                      ? '—'
                      : '${jobs.activeJobs} of ${jobs.maxActiveJobs}',
                  label: 'Job slots used',
                ),
              ),
              Expanded(
                child: _Figure(
                  value: '${data.pickups.mine + data.pickups.pickedUp}',
                  label: 'Pickups open',
                ),
              ),
              Expanded(
                child: _Figure(
                  value:
                      '${data.deliveries.assignedCount + data.deliveries.outForDeliveryCount}',
                  label: 'Deliveries open',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: AppColors.gray900,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 14, color: AppColors.gray600),
        ),
      ],
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
    return Material(
      color: tone.background,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: tone.border),
          ),
          child: Row(
            children: [
              Icon(icon, color: tone.foreground, size: 24),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray900,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.gray600,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(LucideIcons.chevronRight, color: tone.foreground),
            ],
          ),
        ),
      ),
    );
  }
}
