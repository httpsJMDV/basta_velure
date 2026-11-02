import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import '../../../core/validation/rules.dart';
import 'courier_kit.dart';
import 'courier_parcels_screen.dart';

enum _RiderFilter {
  all('All'),
  applications('Applications'),
  verify('To verify'),
  active('Active'),
  activation('Pending activation'),
  suspended('Suspended');

  const _RiderFilter(this.label);

  final String label;

  bool matches(CourierRider r) => switch (this) {
    _RiderFilter.all => true,
    _RiderFilter.applications => r.status == 'PENDING' && r.applicant,
    _RiderFilter.verify =>
      (r.status == 'PENDING' && !r.applicant) || r.needsReverification,
    _RiderFilter.active => r.status == 'ACTIVE',
    _RiderFilter.activation => r.status == 'PENDING_ACTIVATION',
    _RiderFilter.suspended => r.status == 'SUSPENDED',
  };

  int count(CourierRiderSummary s) => switch (this) {
    _RiderFilter.all => s.total,
    _RiderFilter.applications => s.applications,
    _RiderFilter.verify => s.toVerify,
    _RiderFilter.active => s.active,
    _RiderFilter.activation => s.pendingActivation,
    _RiderFilter.suspended => s.suspended,
  };
}

/// The company's riders (D7): who is Online, their jobs, and who is waiting for a decision.
class CourierRidersScreen extends ConsumerStatefulWidget {
  const CourierRidersScreen({super.key});

  @override
  ConsumerState<CourierRidersScreen> createState() =>
      _CourierRidersScreenState();
}

class _CourierRidersScreenState extends ConsumerState<CourierRidersScreen> {
  final _view =
      GlobalKey<
        LoadViewState<
          ({List<CourierRider> riders, CourierRiderSummary summary})
        >
      >();
  _RiderFilter _filter = _RiderFilter.all;
  String? _search;
  int? _selected;

  Future<void> _reload() async => _view.currentState?.reload();

  Future<void> _open(CourierRider rider) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = rider.id);
      return;
    }
    await context.push(LogisticsPaths.courierRider(rider.id));
    if (mounted) await _reload();
  }

  Future<void> _add() async {
    await context.push(LogisticsPaths.courierAddRider);
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(courierApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Riders')),
      // The dock floats over the page, and a button placed by this inner page doesn't know about it.
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: dockInset(context)),
        child: FloatingActionButton.extended(
          backgroundColor: LogisticsLook.courierAction,
          foregroundColor: AppColors.white,
          onPressed: _add,
          icon: const Icon(LucideIcons.userPlus),
          label: const Text('Add rider'),
        ),
      ),
      body: ListDetailLayout(
        placeholder: 'Choose a rider to see their details.',
        detail: _selected == null
            ? null
            : _RiderBody(
                key: ValueKey(_selected),
                riderId: _selected!,
                onChanged: _reload,
              ),
        list: Column(
          children: [
            LogisticsSearchBox(
              hint: 'Search name, email, plate or license',
              onChanged: (value) {
                _search = value;
                _reload();
              },
            ),
            Expanded(
              child:
                  LoadView<
                    ({List<CourierRider> riders, CourierRiderSummary summary})
                  >(
                    key: _view,
                    load: () => api.riders(search: _search),
                    refreshEvery: const Duration(seconds: 30),
                    builder: (context, data) {
                      final shown = data.riders.where(_filter.matches).toList();
                      return ListView(
                        // Room for the Add rider button, above the dock.
                        padding: EdgeInsets.only(
                          bottom: 88 + dockInset(context),
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
                                  value: '${data.summary.online}',
                                  label: 'Online',
                                  color: kDeliveredGreen,
                                ),
                                HubSummaryItem(
                                  value: '${data.summary.active}',
                                  label: 'Active',
                                ),
                                HubSummaryItem(
                                  value:
                                      '${data.summary.toVerify + data.summary.applications}',
                                  label: 'To review',
                                  color:
                                      data.summary.toVerify +
                                              data.summary.applications >
                                          0
                                      ? StatusTone.amber.foreground
                                      : AppColors.gray900,
                                ),
                                HubSummaryItem(
                                  value: '${data.summary.suspended}',
                                  label: 'Suspended',
                                ),
                              ],
                            ),
                          ),
                          RiderTabs<_RiderFilter>(
                            values: _RiderFilter.values,
                            selected: _filter,
                            labelOf: (filter) => filter.label,
                            countOf: (filter) => filter.count(data.summary),
                            onSelected: (filter) =>
                                setState(() => _filter = filter),
                          ),
                          if (shown.isEmpty)
                            SizedBox(
                              height: 300,
                              child: EmptyState(
                                icon: LucideIcons.bike,
                                title: _search == null
                                    ? 'No riders here yet'
                                    : 'No rider matches',
                                message: 'Add a rider, or share your apply link from the website.',
                              ),
                            ),
                          for (final rider in shown)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(
                                AppSpace.lg,
                                AppSpace.sm,
                                AppSpace.lg,
                                0,
                              ),
                              child: _RiderRow(
                                rider: rider,
                                maxJobs: data.summary.maxActiveJobs,
                                selected: rider.id == _selected,
                                onTap: () => _open(rider),
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

class _RiderRow extends StatelessWidget {
  const _RiderRow({
    required this.rider,
    required this.maxJobs,
    required this.onTap,
    this.selected = false,
  });

  final CourierRider rider;
  final int maxJobs;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final vehicle = [?rider.vehicleType, ?rider.plateNumber].join(' ');
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
              CourierPersonAvatar(name: rider.name, online: rider.online),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      rider.name,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.25,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray900,
                      ),
                    ),
                    if (rider.status == 'ACTIVE') ...[
                      Text(
                        '${rider.online ? 'Online' : 'Offline'} · ${rider.activeJobs}/$maxJobs jobs · ${rider.deliveredToday} delivered today',
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.35,
                          fontWeight: FontWeight.w600,
                          color: rider.online
                              ? StatusTone.emerald.foreground
                              : AppColors.gray600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      CourierMeter(
                        value: maxJobs == 0 ? 0 : rider.activeJobs / maxJobs,
                        label: '${rider.activeJobs} of $maxJobs jobs',
                      ),
                    ],
                    const SizedBox(height: AppSpace.sm),
                    // Chips wrap: "Waiting for verification" is too long to sit beside a name on a small phone.
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ToneChip(StatusWords.courierRider(rider.status)),
                        if (rider.needsReverification)
                          const HubMetaChip(
                            icon: LucideIcons.fileWarning,
                            label: 'Changed documents to check',
                            tone: StatusTone.amber,
                          ),
                        if (vehicle.isNotEmpty)
                          HubMetaChip(
                            icon: hubVehicleIcon(rider.vehicleType),
                            label: vehicle,
                          ),
                        if (rider.hubName != null)
                          HubMetaChip(
                            icon: LucideIcons.warehouse,
                            label: rider.hubName!,
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

/// One rider on their own screen, on a phone.
class CourierRiderScreen extends StatelessWidget {
  const CourierRiderScreen({super.key, required this.riderId});

  final int riderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Rider')),
      body: _RiderBody(riderId: riderId),
    );
  }
}

/// The rider's facts, documents and audit trail, with the decisions at the bottom. Every action is written to the
/// audit log on the server, and each one asks first here.
class _RiderBody extends ConsumerStatefulWidget {
  const _RiderBody({super.key, required this.riderId, this.onChanged});

  final int riderId;
  final Future<void> Function()? onChanged;

  @override
  ConsumerState<_RiderBody> createState() => _RiderBodyState();
}

class _RiderBodyState extends ConsumerState<_RiderBody> {
  final _view = GlobalKey<LoadViewState<CourierRider>>();
  CourierPayee? _pay;

  CourierApi get _api => ref.read(courierApiProvider);

  @override
  void initState() {
    super.initState();
    _loadPay();
  }

  /// What the rider is owed. Their own page doesn't need it, so a failure stays quiet.
  Future<void> _loadPay() async {
    try {
      final payouts = await _api.payouts();
      if (mounted) setState(() => _pay = payouts.rider(widget.riderId));
    } catch (_) {}
  }

  /// A warning once the license is close to its date. It is a date with no time, so it counts whole days.
  (String, StatusTone)? _licenseWarning(String? expiry) {
    final date = DateTime.tryParse(expiry ?? '');
    if (date == null) return null;
    final days = date.difference(Rules.manilaToday()).inDays;
    if (days < 0) return ('Expired', StatusTone.rose);
    if (days <= 30) {
      return ('Expires in $days day${days == 1 ? '' : 's'}', StatusTone.amber);
    }
    return null;
  }

  Future<void> _changed() async {
    await _view.currentState?.reload();
    await widget.onChanged?.call();
  }

  Future<void> _act({
    required String title,
    required String message,
    required String confirmLabel,
    required Future<String> Function() action,
  }) async {
    final confirmed = await confirmAction(
      context,
      title: title,
      message: message,
      confirmLabel: confirmLabel,
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(context, action);
    if (ok) await _changed();
  }

  Future<void> _withReason(CourierRider rider, {required bool reject}) async {
    final message = await showReasonSheet(
      context,
      title: reject ? 'Reject ${rider.name}' : 'Suspend ${rider.name}',
      message: reject ? 'They are told your reason.' : 'They go Offline and can\'t go Online. Pickups not yet picked up return to the Unassigned queue.',
      fieldLabel: 'Reason',
      submitLabel: reject ? 'Reject' : 'Suspend',
      confirmTitle: reject ? 'Reject ${rider.name}?' : 'Suspend ${rider.name}?',
      confirmMessage: 'This is written to the audit log.',
      onSubmit: (reason) => reject
          ? _api.rejectRider(rider.id, reason)
          : _api.suspendRider(rider.id, reason),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  List<Widget> _actions(CourierRider rider) => [
    if (rider.canDecide) ...[
      QuietButton(
        label: 'Reject',
        danger: true,
        onPressed: () => _withReason(rider, reject: true),
      ),
      SubmitButton(
        label: rider.applicant ? 'Approve' : 'Verify',
        busyLabel: 'Saving…',
        onPressed: () => _act(
          title: 'Approve ${rider.name}?',
          message: rider.applicant
              ? 'We email them a link to set a password.'
              : 'They can go Online.',
          confirmLabel: 'Approve',
          action: () => _api.approveRider(rider.id),
        ),
      ),
    ],
    if (rider.canSuspend)
      QuietButton(
        label: 'Suspend',
        danger: true,
        onPressed: () => _withReason(rider, reject: false),
      ),
    if (rider.isSuspended)
      SubmitButton(
        label: 'Reactivate',
        busyLabel: 'Reactivating…',
        onPressed: () => _act(
          title: 'Reactivate ${rider.name}?',
          message: 'They can go Online again.',
          confirmLabel: 'Reactivate',
          action: () => _api.reactivateRider(rider.id),
        ),
      ),
    if (rider.canResendActivation)
      SubmitButton(
        label: 'Resend activation email',
        busyLabel: 'Sending…',
        onPressed: () => _act(
          title: 'Send a new activation link?',
          message: 'The previous link stops working.',
          confirmLabel: 'Send',
          action: () => _api.resendActivation(rider.id),
        ),
      ),
  ];

  Widget _riderHeader(CourierRider rider) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CourierPersonAvatar(
                name: rider.name,
                online: rider.online,
                size: 56,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(rider.name, style: RiderText.name),
                    if (rider.applicant)
                      const Text('Applied online', style: RiderText.label),
                    const SizedBox(height: AppSpace.xs),
                    ToneChip(StatusWords.courierRider(rider.status)),
                  ],
                ),
              ),
            ],
          ),
          if (rider.status == 'ACTIVE') ...[
            const Divider(height: AppSpace.xl),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: HubSummaryItem(
                    value: rider.online ? 'Online' : 'Offline',
                    label: rider.lastSeenAt == null
                        ? 'Right now'
                        : 'Seen ${Fmt.waited(rider.lastSeenAt)} ago',
                    color: rider.online ? kDeliveredGreen : AppColors.gray600,
                  ),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: HubSummaryItem(
                    value: '${rider.activeJobs}',
                    label: rider.activeJobs == 1 ? 'Job now' : 'Jobs now',
                  ),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: HubSummaryItem(
                    value: '${rider.deliveredToday}',
                    label: 'Delivered today',
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _riderFacts(CourierRider rider) {
    final warning = _licenseWarning(rider.licenseExpiry);
    final pay = _pay;
    return [
      const SizedBox(height: AppSpace.lg),
      const HubSection(title: 'Contact'),
      RiderCard(
        child: Column(
          children: [
            HubFact(icon: LucideIcons.mail, label: 'Email', value: rider.email),
            HubFact(
              icon: LucideIcons.phone,
              label: 'Mobile',
              value: rider.phone,
            ),
            HubFact(
              icon: LucideIcons.warehouse,
              label: 'Hub',
              value: rider.hubName,
            ),
          ],
        ),
      ),
      const SizedBox(height: AppSpace.lg),
      const HubSection(title: 'Vehicle and license'),
      RiderCard(
        child: Column(
          children: [
            HubFact(
              icon: hubVehicleIcon(rider.vehicleType),
              label: 'Vehicle',
              value: [?rider.vehicleType, ?rider.plateNumber].join(' · '),
            ),
            HubFact(
              icon: LucideIcons.idCard,
              label: 'License',
              value: [
                ?rider.licenseNumber,
                if (rider.licenseExpiry != null)
                  'expires ${rider.licenseExpiry}',
              ].join(' · '),
              trailing: warning == null ? null : ToneChip(warning),
            ),
            if (rider.status == 'PENDING_ACTIVATION')
              HubFact(
                icon: LucideIcons.mailCheck,
                label: 'Activation link works until',
                value: Fmt.dateTime(rider.activationExpiresAt),
              ),
          ],
        ),
      ),
      if (pay != null) ...[
        const SizedBox(height: AppSpace.lg),
        const HubSection(title: 'What you owe this rider'),
        CourierPay(
          amount: formatPeso(pay.unpaid),
          count: pay.unpaidCount,
          lastPaid: pay.lastPaidAt == null
              ? 'Not yet'
              : Fmt.date(pay.lastPaidAt),
          gcash: [?pay.gcashName, ?pay.gcashNumber].join(' · '),
        ),
      ],
      if (rider.appliedAt != null ||
          rider.joinedAt != null ||
          rider.activatedAt != null ||
          rider.suspendedAt != null) ...[
        const SizedBox(height: AppSpace.lg),
        const HubSection(title: 'With your company'),
        RiderCard(
          child: Column(
            children: [
              if (rider.appliedAt != null)
                HubFact(
                  icon: LucideIcons.fileClock,
                  label: 'Applied',
                  value: Fmt.date(rider.appliedAt),
                ),
              if (rider.joinedAt != null)
                HubFact(
                  icon: LucideIcons.userPlus,
                  label: 'Added',
                  value: Fmt.date(rider.joinedAt),
                ),
              if (rider.activatedAt != null)
                HubFact(
                  icon: LucideIcons.badgeCheck,
                  label: 'Activated',
                  value: Fmt.date(rider.activatedAt),
                ),
              if (rider.suspendedAt != null)
                HubFact(
                  icon: LucideIcons.ban,
                  label: 'Suspended on',
                  value: Fmt.date(rider.suspendedAt),
                ),
            ],
          ),
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<CourierRider>(
      key: _view,
      load: () => _api.rider(widget.riderId),
      builder: (context, rider) {
        final actions = _actions(rider);
        return Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.lg,
                  AppSpace.lg,
                  AppSpace.lg + (actions.isEmpty ? dockInset(context) : 0),
                ),
                children: [
                  _riderHeader(rider),
                  if (rider.suspensionReason != null) ...[
                    const SizedBox(height: AppSpace.md),
                    MessageBanner(
                      message: 'Suspended: ${rider.suspensionReason}',
                    ),
                  ],
                  if (rider.rejectionReason != null &&
                      rider.status == 'DISAPPROVED') ...[
                    const SizedBox(height: AppSpace.md),
                    MessageBanner(
                      message: 'Not approved: ${rider.rejectionReason}',
                    ),
                  ],
                  ..._riderFacts(rider),
                  const SizedBox(height: AppSpace.lg),
                  const HubSection(
                    title: 'Documents',
                    note:
                        'Private. Shown here only, never saved to this phone.',
                  ),
                  if (rider.documents.isEmpty)
                    const RiderCard(
                      child: Text(
                        'No documents on file.',
                        style: RiderText.body,
                      ),
                    )
                  else
                    LinkList(
                      children: [
                        for (final doc in rider.documents)
                          PrivateDocumentTile(
                            label: doc.label,
                            load: () => _api.riderDocument(rider.id, doc.key),
                          ),
                      ],
                    ),
                  const SizedBox(height: AppSpace.lg),
                  const HubSection(
                    title: 'Audit trail',
                    note: 'Every decision about this rider. It can\'t be changed.',
                  ),
                  AuditCard(entries: rider.audit, emptyText: 'Nothing yet.'),
                ],
              ),
            ),
            if (actions.isNotEmpty) BottomActions(children: actions),
          ],
        );
      },
    );
  }
}
