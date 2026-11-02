import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// The hub's tabs and the status each asks the server for.
enum _RiderTab {
  pending('Pending', 'PENDING'),
  active('Active', 'ACTIVE'),
  disapproved('Disapproved', 'DISAPPROVED'),
  all('All', 'all');

  const _RiderTab(this.label, this.status);

  final String label;
  final String status;
}

/// Riders (D6): applications to review first, then the hub's riders. A tablet shows the rider next to the list.
class HubRidersScreen extends ConsumerStatefulWidget {
  const HubRidersScreen({super.key});

  @override
  ConsumerState<HubRidersScreen> createState() => _HubRidersScreenState();
}

class _HubRidersScreenState extends ConsumerState<HubRidersScreen> {
  final _list = GlobalKey<PagedListState<HubRiderRow>>();
  _RiderTab _tab = _RiderTab.pending;
  String? _search;
  HubRiderCounts? _counts;
  int? _selected;

  Future<void> _refresh() async => _list.currentState?.refresh();

  int? _countOf(_RiderTab tab) => switch (tab) {
    _RiderTab.pending => _counts?.pending,
    _RiderTab.active => _counts?.active,
    _RiderTab.disapproved => _counts?.disapproved,
    _RiderTab.all => _counts?.all,
  };

  Future<void> _open(HubRiderRow rider) async {
    if (ListDetailLayout.isWide(context)) {
      setState(() => _selected = rider.id);
      return;
    }
    await context.push(LogisticsPaths.hubRider(rider.id));
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Riders')),
      body: ListDetailLayout(
        placeholder: 'Choose a rider to see their details.',
        detail: _selected == null
            ? null
            : _RiderBody(
                key: ValueKey(_selected),
                riderId: _selected!,
                onChanged: _refresh,
              ),
        list: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LogisticsSearchBox(
              hint: 'Search name, email, mobile or plate',
              onChanged: (value) {
                _search = value;
                _refresh();
              },
            ),
            RiderTabs<_RiderTab>(
              values: _RiderTab.values,
              selected: _tab,
              labelOf: (tab) => tab.label,
              countOf: _countOf,
              selectedColor: LogisticsLook.hubAction,
              onSelected: (tab) {
                setState(() => _tab = tab);
                _refresh();
              },
            ),
            Expanded(
              child: PagedList<HubRiderRow>(
                key: _list,
                load: (page) async {
                  final result = await api.riders(
                    page,
                    status: _tab.status,
                    search: _search,
                  );
                  if (mounted) setState(() => _counts = result.counts);
                  return result.page;
                },
                spacing: AppSpace.sm,
                empty: EmptyState(
                  icon: LucideIcons.bike,
                  title: _search != null
                      ? 'No rider matches'
                      : _tab == _RiderTab.pending
                      ? 'No applications waiting'
                      : 'No riders here yet',
                  message: 'Riders who choose your hub when they apply show up here.',
                ),
                itemBuilder: (context, rider) => _RiderRow(
                  rider: rider,
                  selected: rider.id == _selected,
                  onTap: () => _open(rider),
                ),
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
    required this.onTap,
    this.selected = false,
  });

  final HubRiderRow rider;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final vehicle = [?rider.vehicleType, ?rider.plateNumber].join(' · ');
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
              HubAvatar(name: rider.name),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: AppSpace.sm,
                      runSpacing: AppSpace.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          rider.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: AppColors.gray900,
                          ),
                        ),
                        ToneChip(StatusWords.hubRider(rider.status)),
                      ],
                    ),
                    const SizedBox(height: AppSpace.sm),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (vehicle.isNotEmpty)
                          HubMetaChip(
                            icon: hubVehicleIcon(rider.vehicleType),
                            label: vehicle,
                          ),
                        if (rider.status == 'ACTIVE')
                          HubMetaChip(
                            icon: LucideIcons.mapPin,
                            label:
                                '${rider.activeAreas} area${rider.activeAreas == 1 ? '' : 's'}',
                            tone: rider.activeAreas == 0
                                ? StatusTone.amber
                                : null,
                          )
                        else
                          HubMetaChip(
                            icon: LucideIcons.calendar,
                            label: 'Applied ${Fmt.date(rider.submittedAt)}',
                          ),
                        if (rider.applicant)
                          const HubMetaChip(
                            icon: LucideIcons.globe,
                            label: 'Applied online',
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

/// A chip when a rider's license has run out or soon will. Only a reminder: the courier decides what to do about it.
Widget? _licenseWarning(String? expiry) {
  final date = expiry == null ? null : DateTime.tryParse(expiry);
  if (date == null) return null;
  final days = date.difference(DateTime.now()).inDays;
  if (days < 0) {
    return const StatusChip(label: 'Expired', tone: StatusTone.rose);
  }
  if (days <= 30) {
    return const StatusChip(label: 'Expires soon', tone: StatusTone.amber);
  }
  return null;
}

/// One rider on their own screen, on a phone.
class HubRiderScreen extends StatelessWidget {
  const HubRiderScreen({super.key, required this.riderId});

  final int riderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rider')),
      body: _RiderBody(riderId: riderId),
    );
  }
}

/// The rider's facts, license and OR/CR, then Approve and Disapprove fixed at the bottom. Documents stay inside the app.
class _RiderBody extends ConsumerStatefulWidget {
  const _RiderBody({super.key, required this.riderId, this.onChanged});

  final int riderId;
  final Future<void> Function()? onChanged;

  @override
  ConsumerState<_RiderBody> createState() => _RiderBodyState();
}

class _RiderBodyState extends ConsumerState<_RiderBody> {
  final _view = GlobalKey<LoadViewState<HubRiderDetail>>();

  HubApi get _api => ref.read(hubApiProvider);

  Future<void> _changed() async {
    await _view.currentState?.reload();
    await widget.onChanged?.call();
  }

  Future<void> _approve(HubRiderDetail rider) async {
    final confirmed = await confirmAction(
      context,
      title: 'Approve ${rider.name}?',
      message: rider.applicant
          ? 'We email them a link to set a password. They can start once they do.'
          : 'They become one of your active riders.',
      confirmLabel: 'Approve',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(context, () => _api.approveRider(rider.id));
    if (ok) await _changed();
  }

  Future<void> _disapprove(HubRiderDetail rider) async {
    final message = await showReasonSheet(
      context,
      title: 'Disapprove ${rider.name}',
      message: 'The applicant sees this reason, so say what they should fix.',
      fieldLabel: 'Reason',
      submitLabel: 'Disapprove',
      confirmTitle: 'Disapprove ${rider.name}?',
      confirmMessage: 'We email them your reason. They can apply again.',
      validator: (value) => Rules.words(value, 'The disapproval reason'),
      maxLength: 500,
      onSubmit: (reason) => _api.disapproveRider(rider.id, reason),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<HubRiderDetail>(
      key: _view,
      load: () => _api.rider(widget.riderId),
      builder: (context, rider) => Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpace.lg),
              children: [
                RiderCard(
                  child: Row(
                    children: [
                      HubAvatar(name: rider.name, size: 56),
                      const SizedBox(width: AppSpace.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(rider.name, style: RiderText.name),
                            const SizedBox(height: AppSpace.xs),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                ToneChip(StatusWords.hubRider(rider.status)),
                                if (rider.applicant)
                                  const HubMetaChip(
                                    icon: LucideIcons.globe,
                                    label: 'Applied online',
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                const HubSection(title: 'Contact'),
                RiderCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.lg,
                    vertical: AppSpace.sm,
                  ),
                  child: Column(
                    children: [
                      HubFact(
                        icon: LucideIcons.phone,
                        label: 'Mobile',
                        value: rider.phone,
                      ),
                      HubFact(
                        icon: LucideIcons.mail,
                        label: 'Email',
                        value: rider.email,
                      ),
                      HubFact(
                        icon: LucideIcons.cake,
                        label: 'Date of birth',
                        value: rider.dateOfBirth,
                      ),
                      if (rider.address != null)
                        HubFact(
                          icon: LucideIcons.house,
                          label: 'Address',
                          value: rider.address,
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.lg),
                const HubSection(title: 'Vehicle and license'),
                RiderCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.lg,
                    vertical: AppSpace.sm,
                  ),
                  child: Column(
                    children: [
                      HubFact(
                        icon: hubVehicleIcon(rider.vehicleType),
                        label: 'Vehicle',
                        value: [
                          ?rider.vehicleType,
                          ?rider.plateNumber,
                        ].join(' · '),
                      ),
                      HubFact(
                        icon: LucideIcons.idCard,
                        label: 'License',
                        value: [
                          ?rider.licenseNumber,
                          if (rider.licenseExpiry != null)
                            'expires ${rider.licenseExpiry}',
                        ].join(' · '),
                        trailing: _licenseWarning(rider.licenseExpiry),
                      ),
                      HubFact(
                        icon: LucideIcons.calendar,
                        label: 'Applied',
                        value: Fmt.date(rider.submittedAt),
                      ),
                      if (rider.reviewedAt != null)
                        HubFact(
                          icon: LucideIcons.userCheck,
                          label: 'Reviewed',
                          value: [
                            Fmt.date(rider.reviewedAt),
                            if (rider.reviewerName != null)
                              'by ${rider.reviewerName}',
                          ].join(' '),
                        ),
                    ],
                  ),
                ),
                if (rider.rejectionReason != null) ...[
                  const SizedBox(height: AppSpace.md),
                  MessageBanner(
                    message: 'Disapproved: ${rider.rejectionReason}',
                  ),
                ],
                const SizedBox(height: AppSpace.lg),
                const HubSection(
                  title: 'Documents',
                  note: 'Shown from memory only. Never saved to this phone.',
                ),
                if (!rider.hasLicense && !rider.hasOrCr)
                  const RiderCard(
                    child: Text('No documents on file.', style: RiderText.body),
                  )
                else
                  LinkList(
                    children: [
                      if (rider.hasLicense)
                        PrivateDocumentTile(
                          label: "Driver's license",
                          load: () => _api.riderLicense(rider.id),
                        ),
                      if (rider.hasOrCr)
                        PrivateDocumentTile(
                          label: 'Vehicle OR/CR',
                          load: () => _api.riderOrCr(rider.id),
                        ),
                    ],
                  ),
                if (rider.status == 'ACTIVE') ...[
                  const SizedBox(height: AppSpace.lg),
                  HubSection(
                    title:
                        'Delivery areas (${rider.areas.where((a) => a.isActive).length})',
                  ),
                  LinkList(
                    children: [
                      for (final area in rider.areas.where((a) => a.isActive))
                        ListTile(
                          leading: const RiderIconTile(
                            icon: LucideIcons.mapPin,
                            size: 40,
                            color: AppColors.gray900,
                            background: AppColors.gray100,
                          ),
                          title: Text(
                            area.label,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: AppColors.gray900,
                            ),
                          ),
                          subtitle: Text(
                            '${area.barangays.length} barangay${area.barangays.length == 1 ? '' : 's'}',
                            style: HubText.small,
                          ),
                        ),
                      LinkTile(
                        icon: LucideIcons.mapPin,
                        title: 'Set delivery areas',
                        subtitle: 'A rider only gets parcels for barangays in their areas.',
                        onTap: () async {
                          await context.push(
                            LogisticsPaths.hubRiderAreas(rider.id),
                            extra: rider.name,
                          );
                          if (mounted) await _changed();
                        },
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (rider.isPending)
            BottomActions(
              children: [
                QuietButton(
                  label: 'Disapprove',
                  danger: true,
                  onPressed: () => _disapprove(rider),
                ),
                SubmitButton(
                  label: 'Approve',
                  busyLabel: 'Approving…',
                  color: LogisticsLook.hubAction,
                  onPressed: () => _approve(rider),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
