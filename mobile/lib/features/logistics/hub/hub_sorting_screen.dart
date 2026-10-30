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
  final _view = GlobalKey<LoadViewState<List<SortingGroup>>>();
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
      backgroundColor: AppColors.gray50,
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
              child: LoadView<List<SortingGroup>>(
                key: _view,
                load: () =>
                    api.sortingGroups(search: _search, sort: _order.name),
                refreshEvery: const Duration(seconds: 30),
                builder: (context, groups) => groups.isEmpty
                    ? _empty(
                        icon: LucideIcons.layers,
                        title: _search == null
                            ? 'Nothing to sort'
                            : 'No barangay matches',
                        message: 'Parcels show here after you receive them.',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(AppSpace.lg),
                        itemCount: groups.length,
                        separatorBuilder: (_, _) =>
                            const SizedBox(height: AppSpace.sm),
                        itemBuilder: (context, index) => _GroupCard(
                          group: groups[index],
                          selected:
                              groups[index].barangayCode ==
                              _selected?.barangayCode,
                          onTap: () => _open(groups[index]),
                        ),
                      ),
              ),
            ),
          ],
        ),
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
    return RiderCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        minTileHeight: 72,
        selected: selected,
        selectedTileColor: AppColors.gray100,
        onTap: onTap,
        title: Text(
          group.barangayName,
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
                if (group.city.isNotEmpty) group.city,
                'Waiting ${Fmt.waited(group.oldestAt)}',
                '${group.ridersCovering} rider${group.ridersCovering == 1 ? '' : 's'} cover it',
              ].join(' · '),
            ),
            if (!group.inCoverage)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.xs),
                child: StatusChip(
                  label: 'Outside your coverage',
                  tone: StatusTone.amber,
                ),
              ),
          ],
        ),
        trailing: Text(
          '${group.parcelCount}',
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

/// One group on its own screen, on a phone.
class HubSortingGroupScreen extends StatelessWidget {
  const HubSortingGroupScreen({super.key, required this.group});

  final SortingGroup group;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
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
            itemCount: parcels.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
            itemBuilder: (context, index) {
              final parcel = parcels[index];
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
