import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

enum _Tab {
  out('Out for delivery'),
  failed('Failed');

  const _Tab(this.label);

  final String label;
}

/// Deliveries (D5): parcels on the road right now, and failed deliveries waiting for a decision.
class HubDeliveriesScreen extends ConsumerStatefulWidget {
  const HubDeliveriesScreen({super.key, this.showFailed = false});

  final bool showFailed;

  @override
  ConsumerState<HubDeliveriesScreen> createState() =>
      _HubDeliveriesScreenState();
}

class _HubDeliveriesScreenState extends ConsumerState<HubDeliveriesScreen> {
  late _Tab _tab = widget.showFailed ? _Tab.failed : _Tab.out;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Deliveries')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RiderTabs<_Tab>(
            values: _Tab.values,
            selected: _tab,
            labelOf: (tab) => tab.label,
            selectedColor: LogisticsLook.hubAction,
            onSelected: (tab) => setState(() => _tab = tab),
          ),
          Expanded(
            child: _tab == _Tab.out ? const _OutList() : const _FailedList(),
          ),
        ],
      ),
    );
  }
}

class _OutList extends ConsumerStatefulWidget {
  const _OutList();

  @override
  ConsumerState<_OutList> createState() => _OutListState();
}

class _OutListState extends ConsumerState<_OutList> {
  final _view = GlobalKey<LoadViewState<OutDeliveries>>();
  String? _search;
  int? _riderId;

  static String _duration(int minutes) =>
      minutes < 60 ? '$minutes min' : '${minutes ~/ 60} h ${minutes % 60} min';

  static String _elapsed(int? minutes) =>
      minutes == null ? '' : '${_duration(minutes)} on the road';

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    return Column(
      children: [
        LogisticsSearchBox(
          hint: 'Search tracking number, barangay or rider',
          onChanged: (value) {
            _search = value;
            _view.currentState?.reload();
          },
        ),
        Expanded(
          child: LoadView<OutDeliveries>(
            key: _view,
            load: () => api.outForDelivery(search: _search, riderId: _riderId),
            refreshEvery: const Duration(seconds: 15),
            builder: (context, data) => ListView(
              padding: const EdgeInsets.only(bottom: AppSpace.lg),
              children: [
                if (data.parcels.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.lg,
                      AppSpace.md,
                      AppSpace.lg,
                      0,
                    ),
                    child: HubSummaryStrip(
                      items: [
                        HubSummaryItem(
                          value:
                              '${data.parcels.length}${data.truncated ? '+' : ''}',
                          label: 'On the road',
                        ),
                        HubSummaryItem(
                          value: '${data.riders.length}',
                          label: data.riders.length == 1
                              ? 'Rider out'
                              : 'Riders out',
                        ),
                        HubSummaryItem(
                          value: _duration(
                            data.parcels.fold<int>(
                              0,
                              (most, parcel) =>
                                  (parcel.elapsedMinutes ?? 0) > most
                                  ? parcel.elapsedMinutes!
                                  : most,
                            ),
                          ),
                          label: 'Longest out',
                        ),
                      ],
                    ),
                  ),
                if (data.riders.isNotEmpty)
                  RiderTabs<int?>(
                    values: [null, ...data.riders.map((r) => r.riderId)],
                    selected: _riderId,
                    labelOf: (id) => id == null
                        ? 'All riders'
                        : data.riders.firstWhere((r) => r.riderId == id).name,
                    countOf: (id) => id == null
                        ? null
                        : data.riders.firstWhere((r) => r.riderId == id).count,
                    selectedColor: LogisticsLook.hubAction,
                    onSelected: (id) {
                      setState(() => _riderId = id);
                      _view.currentState?.reload();
                    },
                  ),
                if (data.parcels.isEmpty)
                  SizedBox(
                    height: 320,
                    child: EmptyState(
                      icon: LucideIcons.truck,
                      title: _search == null && _riderId == null
                          ? 'Nothing is out for delivery'
                          : 'No parcel matches',
                      message: 'Parcels show here once a rider collects them.',
                    ),
                  ),
                for (final parcel in data.parcels)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.lg,
                      AppSpace.sm,
                      AppSpace.lg,
                      0,
                    ),
                    child: ParcelRowCard(
                      trackingNumber: parcel.trackingNumber,
                      status: StatusWords.parcel('OUT_FOR_DELIVERY'),
                      lines: [
                        [
                          parcel.barangayName,
                          if (parcel.city.isNotEmpty) parcel.city,
                        ].join(', '),
                        [?parcel.riderName, ?parcel.riderPlate].join(' · '),
                        if (parcel.recipientName != null)
                          'To ${parcel.recipientName}',
                        _elapsed(parcel.elapsedMinutes),
                      ],
                    ),
                  ),
                if (data.truncated)
                  const Padding(
                    padding: EdgeInsets.all(AppSpace.lg),
                    child: MessageBanner(
                      tone: StatusTone.blue,
                      message:
                          'Showing the first 500. Search to find the others.',
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _FailedList extends ConsumerStatefulWidget {
  const _FailedList();

  @override
  ConsumerState<_FailedList> createState() => _FailedListState();
}

class _FailedListState extends ConsumerState<_FailedList> {
  final _list = GlobalKey<PagedListState<FailedDelivery>>();
  String? _search;
  String? _reason;
  List<FailureOption> _reasons = const [];
  int? _total;

  Future<void> _refresh() async => _list.currentState?.refresh();

  Future<void> _reschedule(FailedDelivery parcel) async {
    final api = ref.read(hubApiProvider);
    final rider = await showRiderPicker(
      context,
      title: 'Reschedule delivery',
      message:
          'Attempt ${parcel.attempts + 1} of ${parcel.maxAttempts}. The rider collects it at the hub again.',
      emptyMessage:
          'No rider covers ${parcel.barangayName}. Set a rider\'s areas in Riders.',
      load: () async => [
        for (final rider in await api.batchRiders(parcel.barangayCode))
          PickableRider(
            id: rider.id,
            name: rider.name,
            detail: [
              ?rider.plateNumber,
              '${rider.currentLoad} parcel${rider.currentLoad == 1 ? '' : 's'} now',
            ].join(' · '),
          ),
      ],
    );
    if (rider == null || !mounted) return;
    final confirmed = await confirmAction(
      context,
      title: 'Reschedule with ${rider.name}?',
      message: 'The parcel goes back to ${rider.name} for another try.',
      confirmLabel: 'Reschedule',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(
      context,
      () => api.reschedule(parcel.trackingNumber, rider.id),
    );
    if (ok) await _refresh();
  }

  Future<void> _return(FailedDelivery parcel) async {
    final message = await showReasonSheet(
      context,
      title: 'Return to seller',
      message: 'This parcel goes back to the shop and the seller is told. It can\'t be delivered after this.',
      fieldLabel: 'Note (optional)',
      submitLabel: 'Return to seller',
      confirmTitle: 'Send it back to the shop?',
      confirmMessage:
          '${parcel.trackingNumber} will be returned to the seller. This can\'t be undone.',
      validator: (value) =>
          Rules.words(value, 'The note', min: 5, max: 500, required: false),
      maxLength: 500,
      serverField: 'note',
      onSubmit: (note) => ref
          .read(hubApiProvider)
          .returnToSeller(
            parcel.trackingNumber,
            note: note.isEmpty ? null : note,
          ),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LogisticsSearchBox(
          hint: 'Search tracking number, barangay or rider',
          onChanged: (value) {
            _search = value;
            _refresh();
          },
        ),
        if (_reasons.isNotEmpty)
          RiderTabs<String?>(
            values: [null, ..._reasons.map((r) => r.code)],
            selected: _reason,
            labelOf: (code) => code == null
                ? 'All reasons'
                : _reasons.firstWhere((r) => r.code == code).label,
            selectedColor: LogisticsLook.hubAction,
            onSelected: (code) {
              setState(() => _reason = code);
              _refresh();
            },
          ),
        if (_total != null && _total! > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.md,
              AppSpace.lg,
              0,
            ),
            child: HubHint(
              icon: LucideIcons.triangleAlert,
              text:
                  '$_total parcel${_total == 1 ? '' : 's'} need${_total == 1 ? 's' : ''} a decision: try again with a rider, or send back to the shop.',
            ),
          ),
        Expanded(
          child: PagedList<FailedDelivery>(
            key: _list,
            load: (page) =>
                api.failedDeliveries(page, search: _search, reason: _reason),
            onLoaded: (page) {
              if (_total != page.total) setState(() => _total = page.total);
              final reasons = (page.meta['reasons'] as List? ?? const [])
                  .whereType<Map>()
                  .map(
                    (r) => FailureOption.fromJson(Map<String, dynamic>.from(r)),
                  )
                  .toList();
              if (_reasons.isEmpty && reasons.isNotEmpty) {
                setState(() => _reasons = reasons);
              }
            },
            spacing: AppSpace.sm,
            empty: EmptyState(
              icon: LucideIcons.circleCheck,
              title: _search == null && _reason == null
                  ? 'No failed deliveries'
                  : 'No parcel matches',
              message: 'When a rider can\'t deliver a parcel, it shows up here for you to reschedule or return.',
            ),
            itemBuilder: (context, parcel) => _FailedCard(
              parcel: parcel,
              onReschedule: () => unawaited(_reschedule(parcel)),
              onReturn: () => unawaited(_return(parcel)),
            ),
          ),
        ),
      ],
    );
  }
}

class _FailedCard extends StatelessWidget {
  const _FailedCard({
    required this.parcel,
    required this.onReschedule,
    required this.onReturn,
  });

  final FailedDelivery parcel;
  final VoidCallback onReschedule;
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose.foreground;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(parcel.trackingNumber, style: RiderText.mono),
              StatusChip(
                label: 'Attempt ${parcel.attempts} of ${parcel.maxAttempts}',
                tone: StatusTone.rose,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          // How many tries are used and left, at a glance.
          ExcludeSemantics(
            child: Row(
              children: [
                for (var i = 0; i < parcel.maxAttempts; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: Container(
                      height: 5,
                      decoration: BoxDecoration(
                        color: i < parcel.attempts ? rose : AppColors.gray200,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpace.md),
            decoration: BoxDecoration(
              color: StatusTone.rose.background,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  parcel.reason ?? 'Delivery failed',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: rose,
                  ),
                ),
                if (parcel.note != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    parcel.note!,
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.35,
                      color: AppColors.gray900,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          HubFact(
            icon: LucideIcons.mapPin,
            label: 'Going to',
            value: [
              parcel.barangayName,
              if (parcel.city.isNotEmpty) parcel.city,
            ].join(', '),
          ),
          if (parcel.recipientName != null)
            HubFact(
              icon: LucideIcons.userRound,
              label: 'Recipient',
              value: parcel.recipientName,
            ),
          if (parcel.riderName != null)
            HubFact(
              icon: LucideIcons.bike,
              label: 'Rider',
              value: parcel.riderName,
            ),
          if (parcel.failedAt != null)
            HubFact(
              icon: LucideIcons.clock,
              label: 'Failed',
              value: Fmt.dateTime(parcel.failedAt),
            ),
          if (!parcel.canReschedule)
            const Padding(
              padding: EdgeInsets.only(top: AppSpace.sm),
              child: MessageBanner(
                tone: StatusTone.amber,
                message:
                    'All attempts are used. It can only go back to the seller.',
              ),
            ),
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    foregroundColor: rose,
                    side: BorderSide(color: rose),
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.sm,
                    ),
                  ),
                  onPressed: onReturn,
                  child: const Text('Return to seller'),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    backgroundColor: AppColors.gray900,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpace.sm,
                    ),
                  ),
                  onPressed: parcel.canReschedule ? onReschedule : null,
                  child: const Text('Reschedule'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
