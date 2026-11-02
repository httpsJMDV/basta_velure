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
import 'courier_kit.dart';

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
                    padding: EdgeInsets.only(
                      bottom: AppSpace.lg + dockInset(context),
                    ),
                    children: [
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
                              value: '${count(_HubTab.approved)}',
                              label: 'Active',
                            ),
                            HubSummaryItem(
                              value: '${count(_HubTab.pending)}',
                              label: 'To review',
                              color: count(_HubTab.pending) > 0
                                  ? StatusTone.amber.foreground
                                  : AppColors.gray900,
                            ),
                            HubSummaryItem(
                              value:
                                  '${hubs.fold<int>(0, (sum, hub) => sum + hub.activeRiders)}',
                              label: 'Active riders',
                            ),
                            HubSummaryItem(
                              value:
                                  '${hubs.fold<int>(0, (sum, hub) => sum + hub.activeParcels)}',
                              label: 'Active parcels',
                            ),
                          ],
                        ),
                      ),
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
    final status = StatusWords.hub(hub.status);
    final working = hub.status == 'APPROVED';
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: kMotion,
          color: selected ? AppColors.gray100 : Colors.transparent,
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RiderIconTile(
                icon: LucideIcons.warehouse,
                size: 46,
                color: status.$2.foreground,
                background: status.$2.background,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      hub.name,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.25,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray900,
                      ),
                    ),
                    if (hub.place.isNotEmpty)
                      Text(hub.place, style: HubText.small),
                    if (!working && hub.rejectionReason != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          hub.rejectionReason!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: HubText.small,
                        ),
                      ),
                    const SizedBox(height: AppSpace.sm),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ToneChip(status),
                        if (working) ...[
                          HubMetaChip(
                            icon: LucideIcons.bike,
                            label:
                                '${hub.activeRiders} rider${hub.activeRiders == 1 ? '' : 's'}',
                          ),
                          HubMetaChip(
                            icon: LucideIcons.package,
                            label:
                                '${hub.activeParcels} active parcel${hub.activeParcels == 1 ? '' : 's'}',
                          ),
                        ] else if (hub.applicantName != null)
                          HubMetaChip(
                            icon: LucideIcons.user,
                            label: hub.applicantName!,
                          ),
                        HubMetaChip(
                          icon: LucideIcons.mapPin,
                          label:
                              '${hub.coverageCount} barangay${hub.coverageCount == 1 ? '' : 's'}',
                        ),
                        if (hub.status == 'PENDING' && hub.submittedAt != null)
                          HubMetaChip(
                            icon: LucideIcons.clock,
                            label: 'Applied ${Fmt.waited(hub.submittedAt)} ago',
                            tone: waitedLong(hub.submittedAt)
                                ? StatusTone.amber
                                : null,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
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
  CourierHubReport? _report;
  CourierPayee? _pay;

  CourierApi get _api => ref.read(courierApiProvider);

  @override
  void initState() {
    super.initState();
    _loadExtras();
  }

  /// How the hub has been doing and what it is owed. The hub's own page doesn't need either, so a failure stays quiet.
  Future<void> _loadExtras() async {
    try {
      final report = await _api.reports();
      if (mounted) setState(() => _report = report.hub(widget.hubId));
    } catch (_) {}
    try {
      final payouts = await _api.payouts();
      if (mounted) setState(() => _pay = payouts.hub(widget.hubId));
    } catch (_) {}
  }

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
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.lg,
                AppSpace.lg,
                AppSpace.lg +
                    (const [
                          'PENDING',
                          'APPROVED',
                          'SUSPENDED',
                        ].contains(hub.status)
                        ? 0
                        : dockInset(context)),
              ),
              children: [
                RiderCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CourierCardHeader(
                        icon: LucideIcons.warehouse,
                        title: hub.name,
                        subtitle: hub.address,
                        below: ToneChip(StatusWords.hub(hub.status)),
                      ),
                      const SizedBox(height: AppSpace.md),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          HubMetaChip(
                            icon: LucideIcons.mapPin,
                            label:
                                '${hub.coverage.length} barangay${hub.coverage.length == 1 ? '' : 's'}',
                          ),
                          HubMetaChip(
                            icon: LucideIcons.fileText,
                            label:
                                '${[hub.hasPermit, hub.hasId, hub.hasIdBack].where((on) => on).length} of 3 documents',
                          ),
                          if (hub.submittedAt != null)
                            HubMetaChip(
                              icon: LucideIcons.clock,
                              label: 'Applied ${Fmt.date(hub.submittedAt)}',
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (hub.rejectionReason != null &&
                    hub.status != 'APPROVED') ...[
                  const SizedBox(height: AppSpace.md),
                  MessageBanner(message: 'Reason: ${hub.rejectionReason}'),
                ],
                if (_report != null) ...[
                  const SizedBox(height: AppSpace.lg),
                  const HubSection(
                    title: 'Last 30 days',
                    note: 'What this hub did for your network.',
                  ),
                  _HubReportCard(report: _report!),
                ],
                if (_pay != null) ...[
                  const SizedBox(height: AppSpace.lg),
                  const HubSection(title: 'What you owe this hub'),
                  CourierPay(
                    amount: formatPeso(_pay!.unpaid),
                    count: _pay!.unpaidCount,
                    lastPaid: _pay!.lastPaidAt == null
                        ? 'Not yet'
                        : Fmt.date(_pay!.lastPaidAt),
                    gcash: [?_pay!.gcashName, ?_pay!.gcashNumber].join(' · '),
                  ),
                ],
                const SizedBox(height: AppSpace.lg),
                const HubSection(title: 'Owner'),
                RiderCard(
                  child: Column(
                    children: [
                      HubFact(
                        icon: LucideIcons.user,
                        label: 'Name',
                        value: hub.applicantName,
                      ),
                      HubFact(
                        icon: LucideIcons.mail,
                        label: 'Email',
                        value: hub.applicantEmail,
                      ),
                      HubFact(
                        icon: LucideIcons.phone,
                        label: 'Mobile',
                        value: hub.applicantPhone,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                const HubSection(
                  title: 'Documents',
                  note: 'Private. Shown here only, never saved to this phone.',
                ),
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
                HubSection(
                  title: 'Barangays covered (${hub.coverage.length})',
                  note: 'Where this hub delivers.',
                ),
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

class _HubReportCard extends StatelessWidget {
  const _HubReportCard({required this.report});

  final CourierHubReport report;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row([
            HubSummaryItem(
              value: courierRate(report.successRate),
              label: 'Delivery success',
            ),
            HubSummaryItem(
              value: courierRate(report.onTimeRate),
              label: 'On time',
            ),
          ]),
          const SizedBox(height: AppSpace.sm),
          CourierMeter(value: report.successRate ?? 0, color: kDeliveredGreen),
          const Divider(height: AppSpace.xl),
          _row([
            HubSummaryItem(value: '${report.received}', label: 'Received'),
            HubSummaryItem(value: '${report.sorted}', label: 'Sorted'),
            HubSummaryItem(value: '${report.dispatched}', label: 'Sent out'),
          ]),
          const SizedBox(height: AppSpace.md),
          _row([
            HubSummaryItem(value: '${report.delivered}', label: 'Delivered'),
            HubSummaryItem(
              value: '${report.failedAttempts}',
              label: 'Failed tries',
              color: report.failedAttempts > 0
                  ? StatusTone.rose.foreground
                  : AppColors.gray900,
            ),
            HubSummaryItem(value: '${report.returned}', label: 'Returned'),
          ]),
          const Divider(height: AppSpace.xl),
          _row([
            HubSummaryItem(
              value: courierHours(report.avgDwellHours),
              label: 'Average time at the hub',
            ),
            HubSummaryItem(
              value: courierHours(report.avgDeliveryHours),
              label: 'Average time to deliver',
            ),
          ]),
        ],
      ),
    );
  }

  static Widget _row(List<HubSummaryItem> items) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (var i = 0; i < items.length; i++) ...[
        if (i > 0) const SizedBox(width: AppSpace.md),
        Expanded(child: items[i]),
      ],
    ],
  );
}
