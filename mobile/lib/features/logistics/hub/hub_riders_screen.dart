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
      backgroundColor: AppColors.gray50,
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
    return RiderCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        minTileHeight: 72,
        selected: selected,
        selectedTileColor: AppColors.gray100,
        onTap: onTap,
        title: Text(
          rider.name,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        subtitle: Text(
          [
            [?rider.vehicleType, ?rider.plateNumber].join(' '),
            if (rider.applicant) 'Applied online',
            if (rider.status == 'ACTIVE')
              '${rider.activeAreas} area${rider.activeAreas == 1 ? '' : 's'}'
            else
              'Applied ${Fmt.date(rider.submittedAt)}',
          ].where((part) => part.isNotEmpty).join(' · '),
        ),
        trailing: ToneChip(StatusWords.hubRider(rider.status)),
      ),
    );
  }
}

/// One rider on their own screen, on a phone.
class HubRiderScreen extends StatelessWidget {
  const HubRiderScreen({super.key, required this.riderId});

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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(rider.name, style: RiderText.name),
                          ),
                          ToneChip(StatusWords.hubRider(rider.status)),
                        ],
                      ),
                      if (rider.applicant)
                        const Text('Applied online', style: RiderText.label),
                      const Divider(height: AppSpace.xl),
                      FactRow('Email', rider.email),
                      FactRow('Mobile', rider.phone),
                      FactRow('Date of birth', rider.dateOfBirth),
                      if (rider.address != null)
                        FactRow('Address', rider.address),
                      FactRow(
                        'Vehicle',
                        [?rider.vehicleType, ?rider.plateNumber].join(' · '),
                      ),
                      FactRow(
                        'License',
                        [
                          ?rider.licenseNumber,
                          if (rider.licenseExpiry != null)
                            'expires ${rider.licenseExpiry}',
                        ].join(' · '),
                      ),
                      FactRow('Applied', Fmt.date(rider.submittedAt)),
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
                const RiderSectionTitle('Documents'),
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
                  RiderSectionTitle(
                    'Delivery areas (${rider.areas.where((a) => a.isActive).length})',
                  ),
                  LinkList(
                    children: [
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
