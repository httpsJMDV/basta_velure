import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// How the sorting and dispatch lists are ordered (`waiting` or `count` on the server).
enum HubListOrder {
  waiting('Waiting longest'),
  count('Most parcels');

  const HubListOrder(this.label);

  final String label;
}

/// Sorting (D3): parcels at the hub, one group per destination barangay, by name. A tablet shows the group next to
/// the list.
class HubSortingScreen extends ConsumerStatefulWidget {
  const HubSortingScreen({super.key});

  @override
  ConsumerState<HubSortingScreen> createState() => _HubSortingScreenState();
}

class _HubSortingScreenState extends ConsumerState<HubSortingScreen> {
  final _view = GlobalKey<LoadViewState<_SortingData>>();
  HubListOrder _order = HubListOrder.waiting;
  String? _search;
  SortingGroup? _selected;

  Future<void> _reload() async => _view.currentState?.reload();

  Future<void> _open(SortingGroup group) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = group);
      return;
    }
    await context.push(
      LogisticsPaths.hubSortingGroup(group.barangayCode),
      extra: group,
    );
    if (mounted) await _reload();
  }

  Future<void> _scan() async {
    await context.push(LogisticsPaths.hubScanSort);
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sorting'),
        actions: [
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: AppColors.gray900),
            onPressed: _scan,
            icon: const Icon(LucideIcons.scanLine, size: 18),
            label: const Text('Scan to sort'),
          ),
        ],
      ),
      body: ListDetailLayout(
        placeholder: 'Choose a barangay to see its parcels.',
        detail: _selected == null
            ? null
            : _SortingGroupBody(
                key: ValueKey(_selected!.barangayCode),
                group: _selected!,
                onSorted: () {
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
              child: LoadView<_SortingData>(
                key: _view,
                load: () async {
                  final results = await Future.wait<Object>([
                    api.sortingGroups(search: _search, sort: _order.name),
                    // Sorting still works if this one fails: the section just stays away.
                    api.transfers().catchError(
                      (Object _) => const HubTransfers(),
                    ),
                  ]);
                  return _SortingData(
                    groups: results[0] as List<SortingGroup>,
                    transfers: results[1] as HubTransfers,
                  );
                },
                refreshEvery: const Duration(seconds: 30),
                builder: (context, data) {
                  final groups = data.groups;
                  final transfers = data.transfers;
                  if (groups.isEmpty &&
                      transfers.groups.isEmpty &&
                      transfers.onTheWayHere == 0) {
                    return _empty(
                      icon: LucideIcons.layers,
                      title: _search == null
                          ? 'Nothing to sort'
                          : 'No barangay matches',
                      message: 'Parcels show here after you receive them.',
                    );
                  }
                  final parcels = groups.fold<int>(
                    0,
                    (sum, group) => sum + group.parcelCount,
                  );
                  final noRider = groups
                      .where((group) => group.ridersCovering == 0)
                      .length;
                  DateTime? oldest;
                  for (final group in groups) {
                    final at = group.oldestAt;
                    if (at != null && (oldest == null || at.isBefore(oldest))) {
                      oldest = at;
                    }
                  }
                  return ListView(
                    padding: EdgeInsets.fromLTRB(
                      AppSpace.lg,
                      AppSpace.md,
                      AppSpace.lg,
                      AppSpace.lg + dockInset(context),
                    ),
                    children: [
                      if (groups.isNotEmpty) ...[
                        HubSummaryStrip(
                          items: [
                            HubSummaryItem(value: '$parcels', label: 'To sort'),
                            HubSummaryItem(
                              value: '${groups.length}',
                              label: groups.length == 1
                                  ? 'Barangay'
                                  : 'Barangays',
                            ),
                            HubSummaryItem(
                              value: Fmt.waited(oldest),
                              label: 'Longest wait',
                            ),
                            HubSummaryItem(
                              value: '$noRider',
                              label: 'No rider',
                              color: noRider > 0
                                  ? StatusTone.rose.foreground
                                  : AppColors.gray900,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpace.md),
                      ],
                      if (transfers.onTheWayHere > 0) ...[
                        AlertRow(
                          icon: LucideIcons.truck,
                          tone: StatusTone.blue,
                          title: 'On the way from other hubs',
                          onTap: () => context.push(LogisticsPaths.hubIntake),
                          detail:
                              '${transfers.onTheWayHere} parcel${transfers.onTheWayHere == 1 ? '' : 's'}. Scan them in under Parcel intake when they arrive.',
                        ),
                        const SizedBox(height: AppSpace.md),
                      ],
                      if (transfers.groups.isNotEmpty) ...[
                        const HubSection(
                          title: 'For other hubs',
                          note: 'Another hub of your courier delivers to these barangays.',
                        ),
                        for (final group in transfers.groups) ...[
                          _TransferCard(group: group, onSent: _reload),
                          const SizedBox(height: AppSpace.sm),
                        ],
                        const SizedBox(height: AppSpace.md),
                      ],
                      if (groups.isNotEmpty && transfers.groups.isNotEmpty)
                        const HubSection(title: 'To sort here'),
                      for (final group in groups) ...[
                        _GroupCard(
                          group: group,
                          selected:
                              group.barangayCode == _selected?.barangayCode,
                          onTap: () => _open(group),
                        ),
                        const SizedBox(height: AppSpace.sm),
                      ],
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SortingData {
  const _SortingData({required this.groups, required this.transfers});

  final List<SortingGroup> groups;
  final HubTransfers transfers;
}

/// Parcels whose barangay another hub covers: this hub sends them on, and that hub sorts them.
class _TransferCard extends ConsumerStatefulWidget {
  const _TransferCard({required this.group, required this.onSent});

  final HubTransferGroup group;
  final Future<void> Function() onSent;

  @override
  ConsumerState<_TransferCard> createState() => _TransferCardState();
}

class _TransferCardState extends ConsumerState<_TransferCard> {
  bool _sending = false;

  Future<void> _send() async {
    final group = widget.group;
    final api = ref.read(hubApiProvider);
    setState(() => _sending = true);
    List<HubTruckDriver> drivers;
    try {
      drivers = await api.truckDrivers();
    } catch (_) {
      drivers = const [];
    }
    if (!mounted) return;
    setState(() => _sending = false);

    int? driverId;
    if (drivers.isNotEmpty) {
      driverId = await _pickDriver(drivers, group);
      if (driverId == null || !mounted) return;
    } else {
      final confirmed = await confirmAction(
        context,
        title: 'Send to ${group.hubName}?',
        message:
            '${group.parcelCount} parcel${group.parcelCount == 1 ? '' : 's'} will leave this hub. '
            '${group.hubName} scans them in when they arrive.',
        confirmLabel: 'Send',
      );
      if (!confirmed || !mounted) return;
    }
    setState(() => _sending = true);
    try {
      final message = await api.sendTransfer(
        group.trackingNumbers,
        driverId: driverId,
      );
      if (!mounted) return;
      showRiderMessage(context, message);
      await widget.onSent();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// The truck driver taking this hub's parcels. A driver on another trip can't be picked.
  Future<int?> _pickDriver(
    List<HubTruckDriver> drivers,
    HubTransferGroup group,
  ) {
    int? picked = drivers.where((d) => !d.busy).firstOrNull?.id;
    final word =
        '${group.parcelCount} parcel${group.parcelCount == 1 ? '' : 's'}';
    return showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              0,
              AppSpace.lg,
              AppSpace.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Load on a truck to ${group.hubName}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.gray900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '$word. Choose the driver taking them. ${group.hubName} scans them in when the truck arrives.',
                  style: HubText.small,
                ),
                const SizedBox(height: AppSpace.md),
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final d in drivers)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          enabled: !d.busy,
                          onTap: d.busy
                              ? null
                              : () => setSheet(() => picked = d.id),
                          leading: Icon(
                            picked == d.id
                                ? LucideIcons.circleCheck
                                : LucideIcons.circle,
                            color: picked == d.id
                                ? AppColors.gray900
                                : AppColors.stone400,
                          ),
                          title: Text(d.name),
                          subtitle: Text(
                            [
                              [d.vehicleType, ?d.plateNumber].join(' '),
                              if (d.busy)
                                'On a trip to ${d.onTripTo ?? 'another hub'}',
                            ].join(' · '),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.md),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: LogisticsLook.hubAction,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: picked == null
                      ? null
                      : () => Navigator.of(sheet).pop(picked),
                  child: Text(
                    picked == null ? 'Every driver is on a trip' : 'Send $word',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    return RiderCard(
      padding: const EdgeInsets.all(AppSpace.md),
      child: Row(
        children: [
          const RiderIconTile(
            icon: LucideIcons.truck,
            color: AppColors.gray900,
            background: AppColors.gray100,
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  group.hubName,
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.25,
                    fontWeight: FontWeight.w700,
                    color: AppColors.gray900,
                  ),
                ),
                Text(
                  [
                    if (group.city.isNotEmpty) group.city,
                    '${group.parcelCount} parcel${group.parcelCount == 1 ? '' : 's'}',
                    'Waiting ${Fmt.waited(group.oldestAt)}',
                  ].join(' · '),
                  style: HubText.small,
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: LogisticsLook.hubAction,
              minimumSize: const Size(72, 44),
            ),
            onPressed: _sending ? null : _send,
            child: Text(_sending ? 'Sending…' : 'Send'),
          ),
        ],
      ),
    );
  }
}

Widget _empty({
  required IconData icon,
  required String title,
  required String message,
}) => ListView(
  children: [
    SizedBox(
      height: 360,
      child: EmptyState(icon: icon, title: title, message: message),
    ),
  ],
);

class _GroupCard extends StatelessWidget {
  const _GroupCard({
    required this.group,
    required this.onTap,
    this.selected = false,
  });

  final SortingGroup group;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final riders = group.ridersCovering;
    return HubWorkCard(
      count: group.parcelCount,
      title: group.barangayName,
      subtitle: group.city,
      selected: selected,
      onTap: onTap,
      chips: [
        HubMetaChip(
          icon: LucideIcons.clock,
          label: 'Waiting ${Fmt.waited(group.oldestAt)}',
          tone: waitedLong(group.oldestAt) ? StatusTone.amber : null,
        ),
        HubMetaChip(
          icon: LucideIcons.bike,
          label: riders == 0
              ? 'No rider covers it'
              : '$riders rider${riders == 1 ? '' : 's'} cover it',
          tone: riders == 0 ? StatusTone.rose : null,
        ),
        if (!group.inCoverage)
          const HubMetaChip(
            icon: LucideIcons.mapPinOff,
            label: 'Outside your coverage',
            tone: StatusTone.amber,
          ),
      ],
    );
  }
}

/// One group on its own screen, on a phone.
class HubSortingGroupScreen extends StatelessWidget {
  const HubSortingGroupScreen({super.key, required this.group});

  final SortingGroup group;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(group.barangayName)),
      body: _SortingGroupBody(
        group: group,
        onSorted: () => Navigator.of(context).pop(),
      ),
    );
  }
}

class _SortingGroupBody extends ConsumerStatefulWidget {
  const _SortingGroupBody({
    super.key,
    required this.group,
    required this.onSorted,
  });

  final SortingGroup group;
  final VoidCallback onSorted;

  @override
  ConsumerState<_SortingGroupBody> createState() => _SortingGroupBodyState();
}

class _SortingGroupBodyState extends ConsumerState<_SortingGroupBody> {
  final _picked = <String>{};
  List<WaitingParcel>? _parcels;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failure = null);
    try {
      final parcels = await loadWaiting(
        (page) => ref
            .read(hubApiProvider)
            .sortingParcels(widget.group.barangayCode, page),
      );
      if (!mounted) return;
      setState(() {
        _parcels = parcels;
        _picked
          ..clear()
          ..addAll(parcels.map((p) => p.trackingNumber));
      });
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _sort() async {
    final count = _picked.length;
    final confirmed = await confirmAction(
      context,
      title: 'Sort $count parcel${count == 1 ? '' : 's'}?',
      message:
          'They move on to Dispatch for ${widget.group.barangayName}. Sorting can\'t be undone.',
      confirmLabel: 'Sort',
    );
    if (!confirmed || !mounted) return;
    try {
      final result = await ref.read(hubApiProvider).sort(_picked.toList());
      if (!mounted) return;
      showRiderMessage(context, result.message);
      widget.onSorted();
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
    if (parcels == null) {
      return _failure != null
          ? ErrorRetry(failure: _failure!, onRetry: _load)
          : const SkeletonList(count: 4);
    }
    if (parcels.isEmpty) {
      return const EmptyState(
        icon: LucideIcons.layers,
        title: 'Nothing left to sort here',
        message: 'Someone may have sorted these already.',
      );
    }
    return Column(
      children: [
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(AppSpace.lg),
            itemCount: parcels.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
            itemBuilder: (context, index) {
              if (index == 0) {
                final group = widget.group;
                final riders = group.ridersCovering;
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpace.xs),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      HubSummaryStrip(
                        items: [
                          HubSummaryItem(
                            value: '${_picked.length} of ${parcels.length}',
                            label: 'Chosen',
                          ),
                          HubSummaryItem(
                            value: Fmt.waited(group.oldestAt),
                            label: 'Longest wait',
                          ),
                          HubSummaryItem(
                            value: '$riders',
                            label: riders == 1
                                ? 'Rider covers it'
                                : 'Riders cover it',
                            color: riders == 0
                                ? StatusTone.rose.foreground
                                : AppColors.gray900,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpace.md),
                      HubHint(
                        text:
                            'Sorted parcels move to Dispatch, ready for a rider going to ${group.barangayName}.',
                      ),
                    ],
                  ),
                );
              }
              final parcel = parcels[index - 1];
              return ParcelRowCard(
                trackingNumber: parcel.trackingNumber,
                lines: [
                  ?parcel.orderNumber,
                  'Received ${Fmt.dayTime(parcel.since)}',
                ],
                selected: _picked.contains(parcel.trackingNumber),
                onSelected: (on) => setState(
                  () => on
                      ? _picked.add(parcel.trackingNumber)
                      : _picked.remove(parcel.trackingNumber),
                ),
              );
            },
          ),
        ),
        BottomActions(
          children: [
            SubmitButton(
              label:
                  'Sort ${_picked.length} parcel${_picked.length == 1 ? '' : 's'}',
              busyLabel: 'Sorting…',
              color: LogisticsLook.hubAction,
              onPressed: _picked.isEmpty ? null : _sort,
            ),
          ],
        ),
      ],
    );
  }
}

/// Up to 200 parcels of a group or batch, the most the server takes at once.
Future<List<WaitingParcel>> loadWaiting(
  Future<ApiPage<WaitingParcel>> Function(int page) loadPage,
) async {
  final parcels = <WaitingParcel>[];
  var page = 1;
  while (true) {
    final next = await loadPage(page);
    parcels.addAll(next.items);
    if (!next.hasMore || next.items.isEmpty || parcels.length >= 200) break;
    page++;
  }
  return parcels.take(200).toList();
}
