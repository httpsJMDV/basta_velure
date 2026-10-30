import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../chat/rider_chat.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../location/location_bar.dart';
import '../location/location_beacon.dart';
import '../rider_paths.dart';
import '../widgets/rider_app_bar.dart';
import '../widgets/rider_widgets.dart';

/// Pickups (C4): shops in the rider's areas with parcels ready, the shops this rider accepted (scan each parcel at the
/// shop), and what was collected and goes to the hub next.
class PickupsScreen extends ConsumerStatefulWidget {
  const PickupsScreen({super.key});

  @override
  ConsumerState<PickupsScreen> createState() => _PickupsScreenState();
}

class _PickupsScreenState extends ConsumerState<PickupsScreen> {
  PickupView _view = PickupView.available;
  PickupList? _list;
  ApiFailure? _failure;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final view = _view;
    try {
      final list = await ref.read(riderApiProvider).pickups(view);
      if (mounted && view == _view) {
        setState(() {
          _list = list;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted && view == _view) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  void _select(PickupView view) {
    if (view == _view) return;
    setState(() {
      _view = view;
      _list = _list == null
          ? null
          : PickupList(groups: const [], counts: _list!.counts);
      _failure = null;
    });
    _load();
  }

  /// After anything that changes the rider's jobs: the list, the slots and location sharing.
  Future<void> _changed() async {
    await _load();
    unawaited(ref.read(riderStatusProvider.notifier).refresh());
    unawaited(ref.read(locationBeaconProvider.notifier).refresh());
  }

  Future<void> _accept(PickupGroup group) async {
    final ok = await runRiderAction(
      context,
      () => ref.read(riderApiProvider).acceptPickup(group.sellerId),
    );
    if (ok && mounted) {
      await _changed();
      _select(PickupView.mine);
    }
  }

  Future<void> _decline(PickupGroup group) async {
    final confirmed = await confirmAction(
      context,
      title: 'Decline this pickup?',
      message: "${group.shopName}'s parcels go to another rider.",
      confirmLabel: 'Decline',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await runRiderAction(
      context,
      () => ref.read(riderApiProvider).declinePickup(group.sellerId),
    );
    await _changed();
  }

  Future<void> _release(PickupGroup group) async {
    final confirmed = await confirmAction(
      context,
      title: 'Give this pickup back?',
      message:
          "You haven't collected ${group.shopName}'s parcels yet. They go back to the list for another rider.",
      confirmLabel: 'Give back',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    await runRiderAction(
      context,
      () => ref.read(riderApiProvider).releasePickup(group.sellerId),
    );
    await _changed();
  }

  Future<void> _scan(PickupGroup group) async {
    await context.push(RiderPaths.handover, extra: group);
    if (mounted) await _changed();
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: const RiderAppBar(title: 'Pickups'),
      body: LocationGate(
        child: Column(
          children: [
            RiderTabs<PickupView>(
              values: PickupView.values,
              selected: _view,
              onSelected: _select,
              labelOf: (v) => switch (v) {
                PickupView.available => 'Available',
                PickupView.mine => 'My pickups',
                PickupView.pickedUp => 'To the hub',
              },
              countOf: (v) => list?.counts.of(v),
            ),
            Expanded(
              child: RefreshIndicator(onRefresh: _changed, child: _body(list)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(PickupList? list) {
    if (_failure != null && (list == null || list.groups.isEmpty)) {
      return _scrollable(ErrorRetry(failure: _failure!, onRetry: _load));
    }
    if (list == null) return const SkeletonList(count: 3);
    if (list.groups.isEmpty) {
      return _scrollable(
        !list.counts.hasAreas
            ? const EmptyState(
                icon: LucideIcons.mapPinned,
                title: 'No area yet',
                message: 'Your hub has not given you an area to cover. Pickups show here once it does.',
              )
            : switch (_view) {
                PickupView.available => const EmptyState(
                  icon: LucideIcons.packageOpen,
                  title: 'No pickups right now',
                  message: 'Shops in your areas with parcels ready show here. Pull down to check again.',
                ),
                PickupView.mine => const EmptyState(
                  icon: LucideIcons.store,
                  title: 'No pickups accepted',
                  message: 'Accept a shop under Available, then scan its parcels here.',
                ),
                PickupView.pickedUp => const EmptyState(
                  icon: LucideIcons.warehouse,
                  title: 'Nothing to bring to the hub',
                  message: 'Parcels you collect show here until the hub scans them in.',
                ),
              },
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpace.lg),
      itemCount: list.groups.length,
      separatorBuilder: (_, _) => const SizedBox(height: AppSpace.md),
      itemBuilder: (context, index) {
        final group = list.groups[index];
        return switch (_view) {
          PickupView.available => _AvailableCard(
            group: group,
            onAccept: () => _accept(group),
            onDecline: () => _decline(group),
          ),
          PickupView.mine => _MineCard(
            group: group,
            onScan: () => _scan(group),
            onRelease: () => _release(group),
          ),
          PickupView.pickedUp => _ToHubCard(group: group),
        };
      },
    );
  }

  Widget _scrollable(Widget child) => LayoutBuilder(
    builder: (context, constraints) => SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(height: constraints.maxHeight, child: child),
    ),
  );
}

class _ShopHeader extends StatelessWidget {
  const _ShopHeader({required this.group, this.trailing});

  final PickupGroup group;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.brandRedTint,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(LucideIcons.store, color: AppColors.brandRed),
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(group.shopName, style: RiderText.name),
              Text(
                '${group.parcelCount} parcel${group.parcelCount == 1 ? '' : 's'}'
                '${group.areaLabel != null ? ' · ${group.areaLabel}' : ''}',
                style: const TextStyle(
                  fontSize: 15,
                  color: AppColors.gray600,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class _AvailableCard extends StatefulWidget {
  const _AvailableCard({
    required this.group,
    required this.onAccept,
    required this.onDecline,
  });

  final PickupGroup group;
  final Future<void> Function() onAccept;
  final Future<void> Function() onDecline;

  @override
  State<_AvailableCard> createState() => _AvailableCardState();
}

class _AvailableCardState extends State<_AvailableCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ShopHeader(group: group),
          const SizedBox(height: AppSpace.md),
          if (group.pickupAddress != null)
            InfoRow(
              icon: LucideIcons.mapPin,
              text: group.pickupAddress!.fullAddress,
            ),
          if (group.readySince != null) ...[
            const SizedBox(height: AppSpace.xs),
            InfoRow(
              icon: LucideIcons.clock,
              text: 'Ready since ${Fmt.dateTime(group.readySince)}',
            ),
          ],
          const SizedBox(height: AppSpace.lg),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  onPressed: _busy ? null : () => _run(widget.onDecline),
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  onPressed: _busy ? null : () => _run(widget.onAccept),
                  child: const Text('Accept'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MineCard extends StatelessWidget {
  const _MineCard({
    required this.group,
    required this.onScan,
    required this.onRelease,
  });

  final PickupGroup group;
  final VoidCallback onScan;
  final VoidCallback onRelease;

  @override
  Widget build(BuildContext context) {
    final address = group.pickupAddress?.fullAddress ?? '';
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ShopHeader(
            group: group,
            trailing: group.trackingNumbers.isEmpty
                ? null
                : RiderMessageButton(
                    trackingNumber: group.trackingNumbers.first,
                    counterparts: const [Counterpart.seller, Counterpart.hub],
                  ),
          ),
          const SizedBox(height: AppSpace.md),
          if (group.shopPhone != null)
            InfoRow(
              icon: LucideIcons.phone,
              text: group.shopPhone!,
              action: CallButton(phone: group.shopPhone!),
            ),
          if (address.isNotEmpty)
            InfoRow(
              icon: LucideIcons.mapPin,
              text: address,
              action: MapsButton(address: address),
            ),
          const SizedBox(height: AppSpace.sm),
          for (final tn in group.trackingNumbers) TrackingNumberText(tn),
          const SizedBox(height: AppSpace.md),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: onScan,
            icon: const Icon(LucideIcons.scanLine),
            label: const Text('Scan parcels at the shop'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.gray600),
            onPressed: onRelease,
            child: const Text('Give this pickup back'),
          ),
        ],
      ),
    );
  }
}

class _ToHubCard extends StatelessWidget {
  const _ToHubCard({required this.group});

  final PickupGroup group;

  @override
  Widget build(BuildContext context) {
    final hub = group.hub;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ShopHeader(group: group),
          if (group.pickedUpAt != null) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              'Collected ${Fmt.dateTime(group.pickedUpAt)}',
              style: RiderText.label,
            ),
          ],
          const SizedBox(height: AppSpace.md),
          if (hub != null) ...[
            const Text('Drop off at', style: RiderText.label),
            Text(hub.name ?? 'Your hub', style: RiderText.name),
            InfoRow(
              icon: LucideIcons.warehouse,
              text: hub.fullAddress,
              action: MapsButton(address: hub.fullAddress),
            ),
            const SizedBox(height: AppSpace.sm),
          ],
          for (final tn in group.trackingNumbers) TrackingNumberText(tn),
          const SizedBox(height: AppSpace.sm),
          const MessageBanner(
            tone: StatusTone.blue,
            message: 'Hand the parcels to the hub. They scan them in, and the pickup pay is added then.',
          ),
        ],
      ),
    );
  }
}
