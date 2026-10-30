import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/addresses/psgc.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

enum _HubTab {
  pending('Applications', 'PENDING'),
  approved('Active hubs', 'APPROVED'),
  suspended('Suspended', 'SUSPENDED'),
  rejected('Rejected', 'REJECTED'),
  all('All', null);

  const _HubTab(this.label, this.status);

  final String label;
  final String? status;
}

/// Hubs in the company's network (D7). Applications come first, like the website. A tablet shows the hub next to the
/// list.
class CourierHubsScreen extends ConsumerStatefulWidget {
  const CourierHubsScreen({super.key});

  @override
  ConsumerState<CourierHubsScreen> createState() => _CourierHubsScreenState();
}

class _CourierHubsScreenState extends ConsumerState<CourierHubsScreen> {
  final _view = GlobalKey<LoadViewState<List<NetworkHub>>>();
  _HubTab _tab = _HubTab.pending;
  String? _search;
  int? _selected;

  Future<void> _reload() async => _view.currentState?.reload();

  Future<void> _open(NetworkHub hub) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = hub.id);
      return;
    }
    await context.push(LogisticsPaths.courierHub(hub.id));
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(courierApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Hubs')),
      body: ListDetailLayout(
        placeholder: 'Choose a hub to see its details.',
        detail: _selected == null
            ? null
            : _HubBody(
                key: ValueKey(_selected),
                hubId: _selected!,
                onChanged: _reload,
              ),
        list: Column(
          children: [
            LogisticsSearchBox(
              hint: 'Search hub, city or province',
              onChanged: (value) {
                _search = value;
                _reload();
              },
            ),
            Expanded(
              child: LoadView<List<NetworkHub>>(
                key: _view,
                load: () => api.hubs(search: _search),
                builder: (context, hubs) {
                  int count(_HubTab tab) => tab.status == null
                      ? hubs.length
                      : hubs.where((h) => h.status == tab.status).length;
                  final shown = _tab.status == null
                      ? hubs
                      : hubs.where((h) => h.status == _tab.status).toList();
                  return ListView(
                    padding: const EdgeInsets.only(bottom: AppSpace.lg),
                    children: [
                      RiderTabs<_HubTab>(
                        values: _HubTab.values,
                        selected: _tab,
                        labelOf: (tab) => tab.label,
                        countOf: count,
                        onSelected: (tab) => setState(() => _tab = tab),
                      ),
                      if (shown.isEmpty)
                        SizedBox(
                          height: 320,
                          child: EmptyState(
                            icon: LucideIcons.warehouse,
                            title: _tab == _HubTab.pending
                                ? 'No applications waiting'
                                : 'No hubs here yet',
                            message: _tab == _HubTab.pending
                                ? 'Hubs that choose your company when they apply show up here.'
                                : 'Try another status.',
                          ),
                        ),
                      for (final hub in shown)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpace.lg,
                            AppSpace.sm,
                            AppSpace.lg,
                            0,
                          ),
                          child: _HubRow(
                            hub: hub,
                            selected: hub.id == _selected,
                            onTap: () => _open(hub),
                          ),
                        ),
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

class _HubRow extends StatelessWidget {
  const _HubRow({
    required this.hub,
    required this.onTap,
    this.selected = false,
  });

  final NetworkHub hub;
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
          hub.name,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        subtitle: Text(
          [
            if (hub.place.isNotEmpty) hub.place,
            if (hub.status == 'APPROVED')
              '${hub.activeRiders} rider${hub.activeRiders == 1 ? '' : 's'} · ${hub.activeParcels} active parcel${hub.activeParcels == 1 ? '' : 's'}'
            else
              ?hub.applicantName,
          ].join(' · '),
        ),
        trailing: ToneChip(StatusWords.hub(hub.status)),
      ),
    );
  }
}

/// One hub on its own screen, on a phone.
class CourierHubScreen extends StatelessWidget {
  const CourierHubScreen({super.key, required this.hubId});

  final int hubId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Hub')),
      body: _HubBody(hubId: hubId),
    );
  }
}

/// A hub application with its documents, and approve, reject, suspend or reactivate at the bottom.
class _HubBody extends ConsumerStatefulWidget {
  const _HubBody({super.key, required this.hubId, this.onChanged});

  final int hubId;
  final Future<void> Function()? onChanged;

  @override
  ConsumerState<_HubBody> createState() => _HubBodyState();
}

class _HubBodyState extends ConsumerState<_HubBody> {
  final _view = GlobalKey<LoadViewState<NetworkHubDetail>>();
  Map<String, String> _names = const {};

  CourierApi get _api => ref.read(courierApiProvider);

  Future<NetworkHubDetail> _load() async {
    final hub = await _api.hub(widget.hubId);
    _lookUpNames(hub.coverage);
    return hub;
  }

  Future<void> _lookUpNames(List<String> codes) async {
    final names = await ref.read(psgcProvider).barangayNames(codes);
    if (mounted) setState(() => _names = names);
  }

  Future<void> _changed() async {
    await _view.currentState?.reload();
    await widget.onChanged?.call();
  }

  Future<void> _approve(NetworkHubDetail hub) async {
    final confirmed = await confirmAction(
      context,
      title: 'Approve ${hub.name}?',
      message: 'The hub joins your network and its owner is emailed.',
      confirmLabel: 'Approve',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(context, () => _api.approveHub(hub.id));
    if (ok) await _changed();
  }

  Future<void> _reactivate(NetworkHubDetail hub) async {
    final confirmed = await confirmAction(
      context,
      title: 'Reactivate ${hub.name}?',
      message: 'The hub can work again.',
      confirmLabel: 'Reactivate',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(context, () => _api.reactivateHub(hub.id));
    if (ok) await _changed();
  }

  Future<void> _withReason(NetworkHubDetail hub, {required bool reject}) async {
    final message = await showReasonSheet(
      context,
      title: reject
          ? 'Why is this hub not approved?'
          : 'Why are you suspending this hub?',
      message: 'The hub owner sees this reason.',
      fieldLabel: 'Reason',
      submitLabel: reject ? 'Reject hub' : 'Suspend hub',
      confirmTitle: reject ? 'Reject ${hub.name}?' : 'Suspend ${hub.name}?',
      confirmMessage: reject
          ? 'The owner is emailed your reason and can apply again.'
          : 'The hub stops working until you reactivate it.',
      onSubmit: (reason) => reject
          ? _api.rejectHub(hub.id, reason)
          : _api.suspendHub(hub.id, reason),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<NetworkHubDetail>(
      key: _view,
      load: _load,
      builder: (context, hub) => Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpace.lg),
              children: [
                RiderCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(hub.name, style: RiderText.name),
                          ),
                          ToneChip(StatusWords.hub(hub.status)),
                        ],
                      ),
                      const Divider(height: AppSpace.xl),
                      FactRow('Address', hub.address),
                      FactRow('Owner', hub.applicantName),
                      FactRow('Owner\'s email', hub.applicantEmail),
                      FactRow('Owner\'s mobile', hub.applicantPhone),
                      FactRow('Applied', Fmt.date(hub.submittedAt)),
                    ],
                  ),
                ),
                if (hub.rejectionReason != null &&
                    hub.status != 'APPROVED') ...[
                  const SizedBox(height: AppSpace.md),
                  MessageBanner(message: 'Reason: ${hub.rejectionReason}'),
                ],
                const SizedBox(height: AppSpace.lg),
                const RiderSectionTitle('Documents'),
                if (!hub.hasPermit && !hub.hasId && !hub.hasIdBack)
                  const RiderCard(
                    child: Text('No documents on file.', style: RiderText.body),
                  )
                else
                  LinkList(
                    children: [
                      if (hub.hasPermit)
                        PrivateDocumentTile(
                          label: 'DTI permit',
                          load: () => _api.hubDocument(hub.id, 'permit'),
                        ),
                      if (hub.hasId)
                        PrivateDocumentTile(
                          label: hub.governmentIdType ?? "Owner's ID",
                          load: () => _api.hubDocument(hub.id, 'id'),
                        ),
                      if (hub.hasIdBack)
                        PrivateDocumentTile(
                          label: "Owner's ID (back)",
                          load: () => _api.hubDocument(hub.id, 'id-back'),
                        ),
                    ],
                  ),
                const SizedBox(height: AppSpace.lg),
                RiderSectionTitle('Barangays covered (${hub.coverage.length})'),
                RiderCard(
                  child: hub.coverage.isEmpty
                      ? const Text('None yet.', style: RiderText.body)
                      : Wrap(
                          spacing: AppSpace.xs,
                          runSpacing: AppSpace.xs,
                          children: [
                            for (final code in hub.coverage)
                              StatusChip(
                                label: _names[code] ?? code,
                                tone: StatusTone.blue,
                              ),
                          ],
                        ),
                ),
              ],
            ),
          ),
          if (hub.status == 'PENDING')
            BottomActions(
              children: [
                QuietButton(
                  label: 'Reject',
                  danger: true,
                  onPressed: () => _withReason(hub, reject: true),
                ),
                SubmitButton(
                  label: 'Approve',
                  busyLabel: 'Approving…',
                  onPressed: () => _approve(hub),
                ),
              ],
            )
          else if (hub.status == 'APPROVED')
            BottomActions(
              children: [
                QuietButton(
                  label: 'Suspend hub',
                  danger: true,
                  onPressed: () => _withReason(hub, reject: false),
                ),
              ],
            )
          else if (hub.status == 'SUSPENDED')
            BottomActions(
              children: [
                SubmitButton(
                  label: 'Reactivate hub',
                  busyLabel: 'Reactivating…',
                  onPressed: () => _reactivate(hub),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
