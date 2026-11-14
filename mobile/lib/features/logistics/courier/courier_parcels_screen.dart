import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'courier_kit.dart';

enum _ParcelTab {
  all('All parcels'),
  problems('Problems');

  const _ParcelTab(this.label);

  final String label;
}

/// Any parcel in the company's network (D7), by tracking number, order number or ID, or buyer name. "Problems" lists
/// failed, returning, returned, lost and damaged ones. A tablet shows the parcel next to the list.
class CourierParcelsScreen extends ConsumerStatefulWidget {
  const CourierParcelsScreen({super.key, this.problems = false});

  final bool problems;

  @override
  ConsumerState<CourierParcelsScreen> createState() =>
      _CourierParcelsScreenState();
}

class _CourierParcelsScreenState extends ConsumerState<CourierParcelsScreen> {
  final _list = GlobalKey<PagedListState<ParcelRow>>();
  late _ParcelTab _tab = widget.problems ? _ParcelTab.problems : _ParcelTab.all;
  String? _search;
  int? _selected;
  CourierDashboard? _now;

  @override
  void initState() {
    super.initState();
    _loadNow();
  }

  Future<void> _refresh() async {
    _loadNow();
    await _list.currentState?.refresh();
  }

  /// Where the network's parcels are right now, above the list. The list doesn't need it, so a failure stays quiet.
  Future<void> _loadNow() async {
    try {
      final now = await ref.read(courierApiProvider).dashboard();
      if (mounted) setState(() => _now = now);
    } catch (_) {}
  }

  Future<void> _open(ParcelRow parcel) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = parcel.id);
      return;
    }
    await context.push(LogisticsPaths.courierParcel(parcel.id));
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(courierApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Parcels')),
      body: ListDetailLayout(
        placeholder: 'Choose a parcel to see its timeline.',
        detail: _selected == null
            ? null
            : _ParcelBody(
                key: ValueKey(_selected),
                parcelId: _selected!,
                onChanged: _refresh,
              ),
        list: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LogisticsSearchBox(
              hint: 'Tracking, order number or ID, buyer name',
              onChanged: (value) {
                _search = value;
                _refresh();
              },
            ),
            RiderTabs<_ParcelTab>(
              values: _ParcelTab.values,
              selected: _tab,
              labelOf: (tab) => tab.label,
              onSelected: (tab) {
                setState(() => _tab = tab);
                _refresh();
              },
            ),
            Expanded(
              child: PagedList<ParcelRow>(
                key: _list,
                load: (page) => api.parcels(
                  page,
                  search: _search,
                  problems: _tab == _ParcelTab.problems,
                ),
                spacing: AppSpace.sm,
                padding: EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.sm,
                  AppSpace.lg,
                  AppSpace.lg + dockInset(context),
                ),
                header: [
                  if (_now != null)
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.lg,
                        AppSpace.sm,
                        AppSpace.lg,
                        0,
                      ),
                      sliver: SliverToBoxAdapter(
                        child: HubSummaryStrip(
                          items: [
                            HubSummaryItem(
                              value: '${_now!.awaitingPickup}',
                              label: 'Awaiting',
                            ),
                            HubSummaryItem(
                              value: '${_now!.atHubs}',
                              label: 'At hubs',
                            ),
                            HubSummaryItem(
                              value: '${_now!.outForDelivery}',
                              label: 'Out now',
                              color: kDeliveredGreen,
                            ),
                            HubSummaryItem(
                              value: '${_now!.failed}',
                              label: 'Failed',
                              color: _now!.failed > 0
                                  ? StatusTone.rose.foreground
                                  : AppColors.gray900,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
                empty: EmptyState(
                  icon: LucideIcons.package,
                  title: _search != null
                      ? 'No parcel matches'
                      : _tab == _ParcelTab.problems
                      ? 'No problem parcels'
                      : 'No parcels yet',
                  message: _tab == _ParcelTab.problems
                      ? 'Nothing failed or returned.'
                      : 'Parcels appear once buyers choose your courier.',
                ),
                itemBuilder: (context, parcel) => _ParcelRow(
                  parcel: parcel,
                  selected: parcel.id == _selected,
                  onTap: () => _open(parcel),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ParcelRow extends StatelessWidget {
  const _ParcelRow({
    required this.parcel,
    required this.onTap,
    this.selected = false,
  });

  final ParcelRow parcel;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final status = StatusWords.parcel(parcel.status);
    final where = [?parcel.barangay, ?parcel.hubName].join(' · ');
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
                icon: courierParcelIcon(parcel.status),
                size: 44,
                color: status.$2.foreground,
                background: status.$2.background,
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // The chip drops under the number when it doesn't fit beside it.
                    Wrap(
                      spacing: AppSpace.sm,
                      runSpacing: AppSpace.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(parcel.trackingNumber, style: RiderText.mono),
                        ToneChip(status),
                      ],
                    ),
                    const SizedBox(height: AppSpace.xs),
                    if (where.isNotEmpty) Text(where, style: HubText.small),
                    Text(
                      [
                        if (parcel.codAmount != null)
                          'COD ${formatPeso(parcel.codAmount)}'
                        else
                          'Prepaid',
                        if (parcel.attempts > 0)
                          '${parcel.attempts} attempt${parcel.attempts == 1 ? '' : 's'}',
                      ].join(' · '),
                      style: HubText.small.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppColors.gray900,
                      ),
                    ),
                    if (parcel.orderNumber != null ||
                        parcel.updatedAt != null) ...[
                      const SizedBox(height: AppSpace.sm),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          if (parcel.orderNumber != null)
                            HubMetaChip(
                              icon: LucideIcons.receipt,
                              label: parcel.orderNumber!,
                            ),
                          if (parcel.updatedAt != null)
                            HubMetaChip(
                              icon: LucideIcons.clock,
                              label:
                                  'Updated ${Fmt.waited(parcel.updatedAt)} ago',
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.xs),
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(
                  LucideIcons.chevronRight,
                  size: 18,
                  color: AppColors.gray600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One parcel on its own screen, on a phone.
class CourierParcelScreen extends StatelessWidget {
  const CourierParcelScreen({super.key, required this.parcelId});

  final int parcelId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Parcel')),
      body: _ParcelBody(parcelId: parcelId),
    );
  }
}

/// Who has the parcel, every failed attempt, the timeline and the read-only audit trail, with the fixes at the bottom:
/// reschedule, override to its next step, Lost or Damaged.
class _ParcelBody extends ConsumerStatefulWidget {
  const _ParcelBody({super.key, required this.parcelId, this.onChanged});

  final int parcelId;
  final Future<void> Function()? onChanged;

  @override
  ConsumerState<_ParcelBody> createState() => _ParcelBodyState();
}

class _ParcelBodyState extends ConsumerState<_ParcelBody> {
  final _view = GlobalKey<LoadViewState<ParcelDetail>>();

  CourierApi get _api => ref.read(courierApiProvider);

  Future<void> _changed() async {
    await _view.currentState?.reload();
    await widget.onChanged?.call();
  }

  Future<void> _reschedule(ParcelDetail parcel) async {
    final rider = await showRiderPicker(
      context,
      title:
          'Reschedule: attempt ${parcel.attempts + 1} of ${parcel.maxAttempts}',
      message:
          'Last try: ${parcel.failures.lastOrNull?.reason ?? '—'}. A refusal or a failed last attempt goes back to the seller instead.',
      load: () => _pickableRiders(_api, parcelId: parcel.id),
    );
    if (rider == null || !mounted) return;
    final confirmed = await confirmAction(
      context,
      title: 'Reschedule with ${rider.name}?',
      message: 'The parcel goes to ${rider.name} for another attempt.',
      confirmLabel: 'Reschedule',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(
      context,
      () => _api.rescheduleParcel(parcel.id, rider.id),
    );
    if (ok) await _changed();
  }

  Future<void> _override(ParcelDetail parcel) async {
    final target = await showModalBottomSheet<OverrideTarget>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                0,
                AppSpace.lg,
                AppSpace.sm,
              ),
              child: Text(
                'Override the status',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpace.lg),
              child: Text(
                'For when the normal flow broke, for example the rider\'s app was offline. It moves the parcel to its next step only.',
                style: RiderText.body,
              ),
            ),
            for (final target in parcel.overrideTargets)
              ListTile(
                minTileHeight: 56,
                leading: const Icon(LucideIcons.arrowRight),
                title: Text(target.label),
                onTap: () => Navigator.of(context).pop(target),
              ),
          ],
        ),
      ),
    );
    if (target == null || !mounted) return;
    final message = await showReasonSheet(
      context,
      title: 'Set to ${target.label}',
      message: 'The reason is kept in the audit log.',
      fieldLabel: 'Reason',
      submitLabel: 'Set status',
      confirmTitle: 'Set this parcel to ${target.label}?',
      confirmMessage:
          'This changes ${parcel.trackingNumber} and is written to the audit log.',
      onSubmit: (reason) =>
          _api.overrideParcel(parcel.id, status: target.value, reason: reason),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  Future<void> _exception(ParcelDetail parcel, {required bool damaged}) async {
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ExceptionSheet(
        parcel: parcel,
        damaged: damaged,
        onSubmit: (reason, photo, onProgress) => _api.markException(
          parcel.id,
          type: damaged ? 'damaged' : 'lost',
          reason: reason,
          photo: photo,
          onSendProgress: onProgress,
        ),
      ),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<ParcelDetail>(
      key: _view,
      load: () => _api.parcel(widget.parcelId),
      builder: (context, parcel) => Column(
        children: [
          Expanded(child: _details(parcel)),
          if (parcel.canReschedule ||
              parcel.overrideTargets.isNotEmpty ||
              parcel.canMarkException)
            BottomActions(
              children: [
                if (parcel.canReschedule)
                  SheetButton(
                    label: 'Reschedule',
                    onPressed: () => _reschedule(parcel),
                  ),
                if (parcel.overrideTargets.isNotEmpty)
                  QuietButton(
                    label: 'Override status',
                    onPressed: () => _override(parcel),
                  ),
                if (parcel.canMarkException) ...[
                  QuietButton(
                    label: 'Mark damaged',
                    onPressed: () => _exception(parcel, damaged: true),
                  ),
                  QuietButton(
                    label: 'Mark lost',
                    danger: true,
                    onPressed: () => _exception(parcel, damaged: false),
                  ),
                ],
              ],
            ),
        ],
      ),
    );
  }

  Widget _details(ParcelDetail parcel) {
    final status = StatusWords.parcel(parcel.status);
    final tries = parcel.maxAttempts == 0
        ? 0.0
        : parcel.attempts / parcel.maxAttempts;
    final hasActions =
        parcel.canReschedule ||
        parcel.overrideTargets.isNotEmpty ||
        parcel.canMarkException;
    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.lg,
        AppSpace.lg,
        AppSpace.lg + (hasActions ? 0 : dockInset(context)),
      ),
      children: [
        RiderCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RiderIconTile(
                    icon: courierParcelIcon(parcel.status),
                    size: 46,
                    color: status.$2.foreground,
                    background: status.$2.background,
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TrackingNumberText(parcel.trackingNumber),
                        const SizedBox(height: AppSpace.xs),
                        StatusChip(label: parcel.statusLabel, tone: status.$2),
                        if (parcel.orderNumber != null) ...[
                          const SizedBox(height: AppSpace.xs),
                          Text(
                            'Order ${parcel.orderNumber}',
                            style: RiderText.label,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: AppSpace.xl),
              Row(
                children: [
                  const Expanded(
                    child: Text('Delivery attempts', style: HubText.small),
                  ),
                  Text(
                    '${parcel.attempts} of ${parcel.maxAttempts}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.gray900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              CourierMeter(
                value: tries,
                color: StatusTone.amber.foreground,
                label:
                    '${parcel.attempts} of ${parcel.maxAttempts} delivery attempts',
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.md),
        RiderCard(
          child: CourierRoute(
            fromLabel: 'From',
            fromTitle: parcel.shopName ?? '—',
            fromDetail: parcel.shopAddress,
            toLabel: 'To',
            toTitle: parcel.recipientName ?? '—',
            toDetail: parcel.recipientAddress,
          ),
        ),
        const SizedBox(height: AppSpace.lg),
        const HubSection(title: 'Order and payment'),
        RiderCard(
          child: Column(
            children: [
              HubFact(
                icon: parcel.isCod ? LucideIcons.coins : LucideIcons.creditCard,
                label: 'Payment',
                value: parcel.isCod
                    ? 'COD ${formatPeso(parcel.codAmount ?? parcel.orderTotal)}'
                    : 'Prepaid ${formatPeso(parcel.orderTotal)}',
              ),
              if (parcel.buyer != null)
                HubFact(
                  icon: LucideIcons.user,
                  label: 'Buyer',
                  value: parcel.buyer,
                ),
              if (parcel.refundStatus != null)
                HubFact(
                  icon: LucideIcons.undo2,
                  label: 'Refund',
                  value: parcel.refundStatus,
                ),
              HubFact(
                icon: LucideIcons.map,
                label: 'Zone and weight',
                value: [
                  parcel.zone ?? 'No zone',
                  if (parcel.weightKg != null) '${parcel.weightKg} kg',
                ].join(' · '),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpace.lg),
        const HubSection(title: 'Who has it'),
        RiderCard(
          child: Column(
            children: [
              HubFact(
                icon: LucideIcons.warehouse,
                label: 'Hub',
                value: parcel.hub ?? 'Not at a hub yet',
              ),
              if (parcel.pickupRider != null)
                HubFact(
                  icon: LucideIcons.packageOpen,
                  label: 'Pickup rider',
                  value: parcel.pickupRider,
                ),
              if (parcel.deliveryRider != null)
                HubFact(
                  icon: LucideIcons.truck,
                  label: 'Delivery rider',
                  value: parcel.deliveryRider,
                ),
              if (parcel.returnRider != null)
                HubFact(
                  icon: LucideIcons.undo2,
                  label: 'Return rider',
                  value: parcel.returnRider,
                ),
            ],
          ),
        ),
        if (parcel.failures.isNotEmpty) ...[
          const SizedBox(height: AppSpace.lg),
          const HubSection(title: 'Failed attempts'),
          RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (index, failure) in parcel.failures.indexed) ...[
                  if (index > 0) const Divider(height: AppSpace.xl),
                  _FailureRow(failure: failure),
                ],
              ],
            ),
          ),
        ],
        if (parcel.exceptionType != null) ...[
          const SizedBox(height: AppSpace.lg),
          MessageBanner(
            message:
                'Marked ${parcel.exceptionType} on ${Fmt.dayTime(parcel.exceptionAt)}: ${parcel.exceptionReason ?? ''}',
          ),
          if (parcel.hasExceptionPhoto) ...[
            const SizedBox(height: AppSpace.sm),
            LinkList(
              children: [
                PrivateDocumentTile(
                  label: 'Photo of the damage',
                  load: () => _api.exceptionPhoto(parcel.id),
                ),
              ],
            ),
          ],
        ],
        const SizedBox(height: AppSpace.lg),
        const HubSection(title: 'Timeline', note: 'Newest first.'),
        RiderCard(
          child: parcel.timeline.isEmpty
              ? const Text('Nothing yet.', style: RiderText.body)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final (index, entry) in parcel.timeline.indexed)
                      CourierTimelineRow(
                        title: _sentence(entry.text),
                        detail: [
                          Fmt.dayTime(entry.at),
                          if (entry.actor != null) _sentence(entry.actor!),
                        ].join(' · '),
                        strong: index == 0,
                        last: index == parcel.timeline.length - 1,
                      ),
                  ],
                ),
        ),
        const SizedBox(height: AppSpace.lg),
        const HubSection(
          title: 'Audit trail',
          note: 'Every manual change. It can\'t be edited or deleted.',
        ),
        AuditCard(entries: parcel.audit, emptyText: 'No manual changes.'),
      ],
    );
  }

  static String _sentence(String text) =>
      text.isEmpty ? text : text[0].toUpperCase() + text.substring(1);
}

/// One failed try: its number, why, and when.
class _FailureRow extends StatelessWidget {
  const _FailureRow({required this.failure});

  final ParcelFailure failure;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: rose.background,
            shape: BoxShape.circle,
          ),
          child: Text(
            '${failure.attempt}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: rose.foreground,
            ),
          ),
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                failure.reason ?? 'Failed',
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.3,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray900,
                ),
              ),
              if (failure.note != null)
                Text(failure.note!, style: RiderText.body),
              Text(Fmt.dayTime(failure.at), style: HubText.small),
            ],
          ),
        ),
      ],
    );
  }
}

/// The audit trail. There is no way to edit or delete an entry.
class AuditCard extends StatelessWidget {
  const AuditCard({super.key, required this.entries, required this.emptyText});

  final List<AuditEntry> entries;
  final String emptyText;

  /// The website's words for what a person did.
  static String actionLabel(String action) => switch (action) {
    'parcel.override' => 'Status overridden',
    'parcel.lost' => 'Marked lost',
    'parcel.damaged' => 'Marked damaged',
    'dispatch.assigned' => 'Pickup assigned',
    'dispatch.reassigned' => 'Pickup reassigned',
    'rts.assigned' => 'Return rider assigned',
    'rider.approved' => 'Approved',
    'rider.rejected' => 'Rejected',
    'rider.suspended' => 'Suspended',
    'rider.reactivated' => 'Reactivated',
    'rider.applied' => 'Applied online',
    'rider.reapplied' => 'Applied again',
    'rider.application_approved' => 'Application approved',
    'rider.activation_resent' => 'Activation email sent again',
    _ => action,
  };

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: entries.isEmpty
          ? Text(emptyText, style: RiderText.body)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (index, entry) in entries.indexed)
                  CourierTimelineRow(
                    title: actionLabel(entry.action),
                    body: entry.reason,
                    detail: [
                      entry.by ?? 'System',
                      Fmt.dayTime(entry.at),
                    ].join(' · '),
                    last: index == entries.length - 1,
                  ),
              ],
            ),
    );
  }
}

/// The company's riders for a picker: the ones who can take the job first, the rest with the reason.
Future<List<PickableRider>> _pickableRiders(
  CourierApi api, {
  int? parcelId,
}) async {
  final riders = await api.dispatchRiders(parcelId: parcelId);
  return [
    for (final rider in [...riders.available, ...riders.unavailable])
      PickableRider(
        id: rider.id,
        name: rider.name,
        detail:
            '${rider.activeJobs} active parcels · server checks cargo eligibility',
        problem: rider.assignable ? null : rider.problem ?? 'Can\'t take a job',
      ),
  ];
}

/// Public for the dispatch and scanning screens.
Future<List<PickableRider>> pickableCourierRiders(
  CourierApi api, {
  int? parcelId,
}) => _pickableRiders(api, parcelId: parcelId);

/// Lost or Damaged: a reason, and for Damaged a photo from the camera only. It cancels the order, so it asks first.
class _ExceptionSheet extends StatefulWidget {
  const _ExceptionSheet({
    required this.parcel,
    required this.damaged,
    required this.onSubmit,
  });

  final ParcelDetail parcel;
  final bool damaged;
  final Future<String> Function(
    String reason,
    PickedPhoto? photo,
    void Function(int sent, int total) onProgress,
  )
  onSubmit;

  @override
  State<_ExceptionSheet> createState() => _ExceptionSheetState();
}

class _ExceptionSheetState extends State<_ExceptionSheet> {
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  final _picker = PhotoPicker();
  PickedPhoto? _photo;
  String? _photoError;
  ApiFailure? _failure;
  (int, int)? _progress;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    try {
      final photo = await _picker.takePhoto(
        context,
        reason:
            'Take a photo of the damage. It goes with the claim for the shop.',
      );
      if (photo != null && mounted) {
        setState(() {
          _photo = photo;
          _photoError = null;
        });
      }
    } on PhotoRejected catch (rejected) {
      if (mounted) setState(() => _photoError = rejected.message);
    }
  }

  Future<void> _submit() async {
    final ok = _form.currentState!.validate();
    final needsPhoto = widget.damaged && _photo == null;
    setState(() {
      _failure = null;
      _photoError = needsPhoto ? 'Add a photo of the damage.' : null;
    });
    if (!ok || needsPhoto) return;
    final confirmed = await confirmAction(
      context,
      title: widget.damaged
          ? 'Mark the parcel damaged?'
          : 'Mark the parcel lost?',
      message:
          'The order is cancelled, the buyer and the shop are told, ${widget.parcel.isCod ? 'nothing was paid so nothing is refunded,' : 'the payment is refunded in full,'} and a claim for the items opens for the shop.',
      confirmLabel: widget.damaged ? 'Mark damaged' : 'Mark lost',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    try {
      final message = await widget.onSubmit(_reason.text.trim(), _photo, (
        sent,
        total,
      ) {
        if (mounted) setState(() => _progress = (sent, total));
      });
      if (mounted) Navigator.of(context).pop(message);
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _failure = failure;
          _progress = null;
          _photoError = failure.errorFor('photo');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final rose = StatusTone.rose.foreground;
    final showBanner =
        failure != null && failure.kind != FailureKind.validation;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.damaged
                    ? 'Mark the parcel damaged'
                    : 'Mark the parcel lost',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpace.md),
              if (showBanner) ...[
                MessageBanner(message: failure.message),
                const SizedBox(height: AppSpace.md),
              ],
              AppTextField(
                label: 'Reason',
                controller: _reason,
                minLines: 3,
                maxLines: 5,
                maxLength: 300,
                showCounter: true,
                textCapitalization: TextCapitalization.sentences,
                validator: Rules.reason,
                serverError: failure?.errorFor('reason'),
              ),
              if (widget.damaged) ...[
                const SizedBox(height: AppSpace.sm),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(56),
                    side: BorderSide(
                      color: _photoError != null ? rose : AppColors.stone300,
                    ),
                  ),
                  onPressed: _takePhoto,
                  icon: Icon(
                    _photo == null
                        ? LucideIcons.camera
                        : LucideIcons.circleCheck,
                    color: _photo == null ? null : kDeliveredGreen,
                  ),
                  label: Text(
                    _photo == null ? 'Take photo' : 'Photo added · take again',
                  ),
                ),
                Text(
                  'From the camera only. JPG or PNG, up to 5 MB.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                if (_photoError != null)
                  Text(
                    _photoError!,
                    style: TextStyle(color: rose, fontSize: 13),
                  ),
              ],
              const SizedBox(height: AppSpace.lg),
              if (_progress != null) ...[
                UploadProgress(sent: _progress!.$1, total: _progress!.$2),
                const SizedBox(height: AppSpace.sm),
              ],
              SubmitButton(
                label: widget.damaged ? 'Mark damaged' : 'Mark lost',
                busyLabel: 'Sending…',
                color: rose,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
