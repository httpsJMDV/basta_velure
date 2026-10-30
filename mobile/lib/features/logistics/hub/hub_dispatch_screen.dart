import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_sorting_screen.dart';

/// Dispatch (D4): sorted parcels, one batch per barangay, each given to a rider who covers it. Parcels already given to
/// a rider wait in "Waiting for riders to collect".
class HubDispatchScreen extends ConsumerStatefulWidget {
  const HubDispatchScreen({super.key});

  @override
  ConsumerState<HubDispatchScreen> createState() => _HubDispatchScreenState();
}

class _HubDispatchScreenState extends ConsumerState<HubDispatchScreen> {
  final _view = GlobalKey<LoadViewState<_DispatchData>>();
  HubListOrder _order = HubListOrder.waiting;
  String? _search;
  DispatchBatch? _selected;

  Future<void> _reload() async => _view.currentState?.reload();

  Future<void> _open(DispatchBatch batch) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = batch);
      return;
    }
    await context.push(
      LogisticsPaths.hubBatch(batch.barangayCode),
      extra: batch,
    );
    if (mounted) await _reload();
  }

  Future<_DispatchData> _load() async {
    final api = ref.read(hubApiProvider);
    final results = await Future.wait<Object>([
      api.dispatchBatches(search: _search, sort: _order.name),
      api.awaitingPickup(),
    ]);
    return _DispatchData(
      batches: results[0] as List<DispatchBatch>,
      awaiting: results[1] as List<AwaitingRider>,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Dispatch')),
      body: ListDetailLayout(
        placeholder: 'Choose a barangay to give its parcels to a rider.',
        detail: _selected == null
            ? null
            : _BatchBody(
                key: ValueKey(_selected!.barangayCode),
                batch: _selected!,
                onAssigned: () {
                  setState(() => _selected = null);
                  _reload();
                },
              ),
        list: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LogisticsSearchBox(
              hint: 'Search barangay or city',
              onChanged: (value) {
                _search = value;
                _reload();
              },
            ),
            RiderTabs<HubListOrder>(
              values: HubListOrder.values,
              selected: _order,
              labelOf: (order) => order.label,
              selectedColor: LogisticsLook.hubAction,
              onSelected: (order) {
                setState(() => _order = order);
                _reload();
              },
            ),
            Expanded(
              child: LoadView<_DispatchData>(
                key: _view,
                load: _load,
                refreshEvery: const Duration(seconds: 30),
                builder: (context, data) => ListView(
                  padding: const EdgeInsets.all(AppSpace.lg),
                  children: [
                    if (data.waitingCount > 0) ...[
                      AlertRow(
                        icon: LucideIcons.packageCheck,
                        tone: StatusTone.amber,
                        title: 'Waiting for riders to collect',
                        detail:
                            '${data.waitingCount} parcel${data.waitingCount == 1 ? '' : 's'} with ${data.awaiting.length} rider${data.awaiting.length == 1 ? '' : 's'}',
                        onTap: () async {
                          await context.push(LogisticsPaths.hubAwaiting);
                          if (mounted) await _reload();
                        },
                      ),
                      const SizedBox(height: AppSpace.md),
                    ],
                    if (data.batches.isEmpty)
                      SizedBox(
                        height: 300,
                        child: EmptyState(
                          icon: LucideIcons.send,
                          title: _search == null
                              ? 'Nothing to dispatch'
                              : 'No barangay matches',
                          message: 'Parcels show here after you sort them.',
                        ),
                      ),
                    for (final batch in data.batches) ...[
                      _BatchCard(
                        batch: batch,
                        selected: batch.barangayCode == _selected?.barangayCode,
                        onTap: () => _open(batch),
                      ),
                      const SizedBox(height: AppSpace.sm),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DispatchData {
  const _DispatchData({required this.batches, required this.awaiting});

  final List<DispatchBatch> batches;
  final List<AwaitingRider> awaiting;

  int get waitingCount =>
      awaiting.fold(0, (sum, rider) => sum + rider.parcels.length);
}

class _BatchCard extends StatelessWidget {
  const _BatchCard({
    required this.batch,
    required this.onTap,
    this.selected = false,
  });

  final DispatchBatch batch;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        minTileHeight: 72,
        selected: selected,
        selectedTileColor: AppColors.gray100,
        onTap: onTap,
        title: Text(
          batch.barangayName,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                if (batch.city.isNotEmpty) batch.city,
                'Waiting ${Fmt.waited(batch.oldestAt)}',
              ].join(' · '),
            ),
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.xs),
              child: batch.eligibleRiders > 0
                  ? StatusChip(
                      label:
                          '${batch.eligibleRiders} rider${batch.eligibleRiders == 1 ? '' : 's'} available',
                      tone: StatusTone.gray,
                    )
                  : const StatusChip(
                      label: 'No rider covers it',
                      tone: StatusTone.rose,
                    ),
            ),
          ],
        ),
        trailing: Text(
          '${batch.parcelCount}',
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: AppColors.gray900,
          ),
        ),
      ),
    );
  }
}

/// One batch on its own screen, on a phone.
class HubBatchScreen extends StatelessWidget {
  const HubBatchScreen({super.key, required this.batch});

  final DispatchBatch batch;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: Text(batch.barangayName)),
      body: _BatchBody(
        batch: batch,
        onAssigned: () => Navigator.of(context).pop(),
      ),
    );
  }
}

class _BatchBody extends ConsumerStatefulWidget {
  const _BatchBody({super.key, required this.batch, required this.onAssigned});

  final DispatchBatch batch;
  final VoidCallback onAssigned;

  @override
  ConsumerState<_BatchBody> createState() => _BatchBodyState();
}

class _BatchBodyState extends ConsumerState<_BatchBody> {
  final _picked = <String>{};
  List<WaitingParcel>? _parcels;
  List<EligibleRider>? _riders;
  EligibleRider? _rider;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failure = null);
    final api = ref.read(hubApiProvider);
    final code = widget.batch.barangayCode;
    try {
      final results = await Future.wait<Object>([
        loadWaiting((page) => api.batchParcels(code, page)),
        api.batchRiders(code),
      ]);
      if (!mounted) return;
      final parcels = results[0] as List<WaitingParcel>;
      final riders = results[1] as List<EligibleRider>;
      setState(() {
        _parcels = parcels;
        _riders = riders;
        _picked
          ..clear()
          ..addAll(parcels.map((p) => p.trackingNumber));
        _rider = riders.length == 1 ? riders.first : null;
      });
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _assign() async {
    final rider = _rider!;
    final count = _picked.length;
    final confirmed = await confirmAction(
      context,
      title: 'Give $count parcel${count == 1 ? '' : 's'} to ${rider.name}?',
      message:
          'The rider collects them at the hub. Assigning can\'t be undone.',
      confirmLabel: 'Assign',
    );
    if (!confirmed || !mounted) return;
    try {
      final message = await ref
          .read(hubApiProvider)
          .assign(riderId: rider.id, trackingNumbers: _picked.toList());
      if (!mounted) return;
      showRiderMessage(context, message);
      widget.onAssigned();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      final itemProblem = failure.fieldErrors.values.firstOrNull;
      showRiderMessage(context, itemProblem ?? failure.message, error: true);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final parcels = _parcels;
    final riders = _riders;
    if (parcels == null || riders == null) {
      return _failure != null
          ? ErrorRetry(failure: _failure!, onRetry: _load)
          : const SkeletonList(count: 4);
    }
    if (parcels.isEmpty) {
      return const EmptyState(
        icon: LucideIcons.send,
        title: 'Nothing left to dispatch here',
        message: 'Someone may have assigned these already.',
      );
    }
    final canAssign = _rider != null && _picked.isNotEmpty;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              const RiderSectionTitle('Rider'),
              if (riders.isEmpty)
                const MessageBanner(
                  tone: StatusTone.amber,
                  message: 'No rider covers this barangay yet. Set a rider\'s areas in Riders.',
                )
              else
                RiderCard(
                  padding: EdgeInsets.zero,
                  child: RadioGroup<int>(
                    groupValue: _rider?.id,
                    onChanged: (id) => setState(
                      () => _rider = riders.firstWhere((r) => r.id == id),
                    ),
                    child: Column(
                      children: [
                        for (final rider in riders)
                          RadioListTile<int>(
                            value: rider.id,
                            title: Text(
                              rider.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: Text(
                              [
                                ?rider.vehicleType,
                                ?rider.plateNumber,
                                '${rider.currentLoad} parcel${rider.currentLoad == 1 ? '' : 's'} now',
                                if (rider.areaLabels.isNotEmpty)
                                  rider.areaLabels.join(', '),
                              ].join(' · '),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: AppSpace.lg),
              RiderSectionTitle('Parcels (${parcels.length})'),
              for (final parcel in parcels) ...[
                ParcelRowCard(
                  trackingNumber: parcel.trackingNumber,
                  lines: [
                    ?parcel.orderNumber,
                    'Sorted ${Fmt.dayTime(parcel.since)}',
                  ],
                  selected: _picked.contains(parcel.trackingNumber),
                  onSelected: (on) => setState(
                    () => on
                        ? _picked.add(parcel.trackingNumber)
                        : _picked.remove(parcel.trackingNumber),
                  ),
                ),
                const SizedBox(height: AppSpace.sm),
              ],
            ],
          ),
        ),
        BottomActions(
          children: [
            SubmitButton(
              label: _rider == null
                  ? 'Choose a rider'
                  : 'Assign ${_picked.length} to ${_rider!.name}',
              busyLabel: 'Assigning…',
              color: LogisticsLook.hubAction,
              onPressed: canAssign ? _assign : null,
            ),
          ],
        ),
      ],
    );
  }
}

/// Parcels already given to a rider and waiting at the hub (`GET /hub/dispatch/awaiting-pickup`). The rider ticks them
/// off by scanning each waybill or typing its number; the website can also show a QR code per parcel.
class HubAwaitingScreen extends ConsumerWidget {
  const HubAwaitingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Waiting for riders to collect')),
      body: LoadView<List<AwaitingRider>>(
        load: ref.read(hubApiProvider).awaitingPickup,
        refreshEvery: const Duration(seconds: 15),
        builder: (context, riders) => riders.isEmpty
            ? ListView(
                children: const [
                  SizedBox(
                    height: 360,
                    child: EmptyState(
                      icon: LucideIcons.packageCheck,
                      title: 'Nothing is waiting',
                      message: 'Parcels you give to a rider wait here until they collect them.',
                    ),
                  ),
                ],
              )
            : ListView(
                padding: const EdgeInsets.all(AppSpace.lg),
                children: [
                  for (final rider in riders) ...[
                    RiderSectionTitle(
                      '${rider.riderName} (${rider.parcels.length})',
                    ),
                    for (final parcel in rider.parcels) ...[
                      ParcelRowCard(
                        trackingNumber: parcel.trackingNumber,
                        status: StatusWords.parcel('ASSIGNED_TO_RIDER'),
                        lines: [
                          [?parcel.barangay, ?parcel.recipientName].join(' · '),
                          'Assigned ${Fmt.dayTime(parcel.assignedAt)}',
                        ],
                      ),
                      const SizedBox(height: AppSpace.sm),
                    ],
                    const SizedBox(height: AppSpace.md),
                  ],
                ],
              ),
      ),
    );
  }
}
