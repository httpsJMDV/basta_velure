import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../rider_paths.dart';
import '../widgets/rider_app_bar.dart';
import '../widgets/rider_widgets.dart';

/// Earnings (C7): a big total for the period, then each paid pickup and delivery. History lists every delivered,
/// failed and returned parcel. Amounts are the server's; the courier company pays by GCash.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  bool _history = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: const RiderAppBar(title: 'Earnings'),
      body: Column(
        children: [
          RiderTabs<bool>(
            values: const [false, true],
            selected: _history,
            labelOf: (history) => history ? 'History' : 'Earnings',
            onSelected: (history) => setState(() => _history = history),
          ),
          Expanded(
            child: _history ? const _HistoryTab() : const _EarningsTab(),
          ),
        ],
      ),
    );
  }
}

class _EarningsTab extends ConsumerStatefulWidget {
  const _EarningsTab();

  @override
  ConsumerState<_EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends ConsumerState<_EarningsTab> {
  EarningsPeriod _period = EarningsPeriod.week;
  EarningsSummary? _summary;
  ApiFailure? _failure;

  /// The COD cash the rider holds, for the card above the earnings (as the guide describes).
  String? _codHeld;

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  Future<void> _loadCod() async {
    try {
      final cod = await ref.read(riderApiProvider).cod();
      if (mounted) setState(() => _codHeld = cod.outstanding);
    } catch (_) {}
  }

  Future<void> _loadSummary() async {
    final period = _period;
    _loadCod();
    try {
      final summary = await ref.read(riderApiProvider).earningsSummary(period);
      if (mounted && period == _period) {
        setState(() {
          _summary = summary;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted && period == _period) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  void _select(EarningsPeriod period) {
    setState(() {
      _period = period;
      _summary = null;
      _failure = null;
    });
    _loadSummary();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(riderApiProvider);
    return PagedList<EarnedJob>(
      key: ValueKey(_period),
      load: (page) => api.earnedJobs(_period, page),
      onRefresh: _loadSummary,
      spacing: AppSpace.sm,
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.lg,
      ),
      header: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              RiderTabs<EarningsPeriod>(
                values: EarningsPeriod.values,
                selected: _period,
                labelOf: (p) => p.label,
                onSelected: _select,
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpace.lg),
                child: _SummaryCard(
                  summary: _summary,
                  failure: _failure,
                  onRetry: _loadSummary,
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  0,
                  AppSpace.lg,
                  AppSpace.lg,
                ),
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  onPressed: () async {
                    await context.push(RiderPaths.cod);
                    if (mounted) await _loadCod();
                  },
                  icon: const Icon(LucideIcons.banknote, size: 20),
                  label: Text(
                    _codHeld == null
                        ? 'Cash on delivery'
                        : 'Cash on delivery: ${formatPeso(_codHeld)} to hand over',
                  ),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: AppSpace.lg),
                child: RiderSectionTitle('Paid jobs'),
              ),
            ],
          ),
        ),
      ],
      empty: const EmptyState(
        icon: LucideIcons.wallet,
        title: 'No paid jobs in this period',
        message: 'You earn when the hub receives a parcel you picked up, and when you deliver one.',
      ),
      itemBuilder: (context, job) => RiderCard(
        child: Row(
          children: [
            Icon(
              job.isPickup ? LucideIcons.packageOpen : LucideIcons.packageCheck,
              color: job.isPickup ? AppColors.gray600 : kDeliveredGreen,
            ),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    job.isPickup ? 'Pickup' : 'Delivery',
                    style: RiderText.body.copyWith(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    job.trackingNumber,
                    style: RiderText.mono.copyWith(fontSize: 13),
                  ),
                  Text(
                    [
                      if (job.area.isNotEmpty) job.area,
                      Fmt.dateTime(job.earnedAt),
                    ].join(' · '),
                    style: RiderText.label,
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatPeso(job.fee),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  job.paidAt == null ? 'Unpaid' : 'Paid',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: job.paidAt == null
                        ? StatusTone.amber.foreground
                        : kDeliveredGreen,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.summary,
    required this.failure,
    required this.onRetry,
  });

  final EarningsSummary? summary;
  final ApiFailure? failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = summary;
    if (s == null) {
      return failure != null
          ? RiderCard(
              child: Row(
                children: [
                  Expanded(
                    child: Text(failure!.message, style: RiderText.body),
                  ),
                  TextButton(
                    onPressed: onRetry,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            )
          : const Skeleton(child: SkeletonBox(height: 150, radius: 16));
    }
    return Container(
      padding: const EdgeInsets.all(AppSpace.xl),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            s.startDate == s.endDate
                ? _day(s.startDate)
                : '${_day(s.startDate)} to ${_day(s.endDate)}',
            style: const TextStyle(
              color: Color(0xFFD1D5DB),
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            formatPeso(s.totalEarned),
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 36,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            '${s.count} paid job${s.count == 1 ? '' : 's'} · before: ${formatPeso(s.previousTotal)}',
            style: const TextStyle(color: AppColors.white, fontSize: 15),
          ),
          const Divider(color: Color(0xFF374151), height: AppSpace.xl),
          Row(
            children: [
              Expanded(
                child: _Small(
                  label: 'All time',
                  value: formatPeso(s.lifetimeTotal),
                ),
              ),
              if (s.unpaidTotal != null)
                Expanded(
                  child: _Small(
                    label: 'Not paid yet',
                    value: formatPeso(s.unpaidTotal),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// `2026-10-27` → "Oct 27, 2026" (a Manila calendar date, shown as it is).
  static String _day(String ymd) {
    final date = DateTime.tryParse(ymd);
    return date == null
        ? ymd
        : Fmt.date(DateTime.utc(date.year, date.month, date.day));
  }
}

class _Small extends StatelessWidget {
  const _Small({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFFD1D5DB), fontSize: 13),
        ),
        Text(
          value,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _HistoryTab extends ConsumerStatefulWidget {
  const _HistoryTab();

  @override
  ConsumerState<_HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends ConsumerState<_HistoryTab> {
  HistoryFilter _filter = HistoryFilter.all;

  @override
  Widget build(BuildContext context) {
    final api = ref.read(riderApiProvider);
    return Column(
      children: [
        RiderTabs<HistoryFilter>(
          values: HistoryFilter.values,
          selected: _filter,
          labelOf: (f) => f.label,
          onSelected: (f) => setState(() => _filter = f),
        ),
        Expanded(
          child: PagedList<HistoryEntry>(
            key: ValueKey(_filter),
            load: (page) => api.history(_filter, page),
            spacing: AppSpace.sm,
            empty: const EmptyState(
              icon: LucideIcons.history,
              title: 'Nothing here yet',
              message:
                  'Parcels you deliver, return or could not deliver show here.',
            ),
            itemBuilder: (context, entry) {
              final (label, tone) = switch (entry.outcome) {
                'delivered' => ('Delivered', StatusTone.emerald),
                'failed' => ('Failed', StatusTone.rose),
                'returned' => ('Returned', StatusTone.gray),
                _ => (entry.outcome, StatusTone.gray),
              };
              return RiderCard(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(entry.trackingNumber, style: RiderText.mono),
                          if (entry.area.isNotEmpty)
                            Text(entry.area, style: RiderText.body),
                          Text(
                            Fmt.dateTime(entry.occurredAt),
                            style: RiderText.label,
                          ),
                          if (entry.failureReason != null)
                            Text(
                              entry.failureReason!,
                              style: TextStyle(
                                fontSize: 15,
                                color: StatusTone.rose.foreground,
                              ),
                            ),
                          if (entry.codCollected != null)
                            Text(
                              'COD ${formatPeso(entry.codCollected)} collected',
                              style: RiderText.label,
                            ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        StatusChip(label: label, tone: tone),
                        if (entry.fee != null) ...[
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            formatPeso(entry.fee),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
