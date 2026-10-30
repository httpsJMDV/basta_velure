import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
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
import 'delivered_sheet.dart';
import 'failed_sheet.dart';

/// Deliveries (C5): parcels waiting at the hub for this rider (scan them there to start), and the stops on the road.
class DeliveriesScreen extends ConsumerStatefulWidget {
  const DeliveriesScreen({super.key});

  @override
  ConsumerState<DeliveriesScreen> createState() => _DeliveriesScreenState();
}

class _DeliveriesScreenState extends ConsumerState<DeliveriesScreen> {
  DeliveryView _view = DeliveryView.outForDelivery;
  DeliveryList? _list;

  /// Parcels this rider is taking back to a seller (the guide lists them on this page).
  int _returns = 0;
  ApiFailure? _failure;
  Timer? _timer;
  bool _chosen = false;

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
    _loadReturns();
    try {
      final list = await ref.read(riderApiProvider).deliveries(view);
      if (!mounted || view != _view) return;
      // Nothing on the road but parcels at the hub: open on To collect, once.
      if (!_chosen &&
          view == DeliveryView.outForDelivery &&
          list.outForDeliveryCount == 0 &&
          list.assignedCount > 0) {
        _chosen = true;
        _select(DeliveryView.assigned);
        return;
      }
      _chosen = true;
      setState(() {
        _list = list;
        _failure = null;
      });
    } catch (error) {
      if (mounted && view == _view) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  Future<void> _loadReturns() async {
    try {
      final returns = await ref.read(riderApiProvider).returns();
      if (mounted) setState(() => _returns = returns.length);
    } catch (_) {
      // Keep the last count; Home shows returns too.
    }
  }

  void _select(DeliveryView view) {
    if (view == _view) return;
    setState(() {
      _view = view;
      _list = null;
      _failure = null;
    });
    _load();
  }

  Future<void> _changed() async {
    await _load();
    unawaited(ref.read(riderStatusProvider.notifier).refresh());
    unawaited(ref.read(locationBeaconProvider.notifier).refresh());
  }

  Future<void> _collect(DeliveryList list) async {
    final started = await context.push<bool>(RiderPaths.collect, extra: list);
    if (!mounted) return;
    if (started == true) {
      _select(DeliveryView.outForDelivery);
    }
    await _changed();
  }

  Future<void> _delivered(DeliveryStop stop) async {
    final message = await showDeliveredSheet(context, stop);
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  Future<void> _failed(DeliveryStop stop) async {
    final message = await showFailedSheet(context, stop);
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _changed();
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: const RiderAppBar(title: 'Deliveries'),
      body: LocationGate(
        child: Column(
          children: [
            RiderTabs<DeliveryView>(
              values: const [
                DeliveryView.assigned,
                DeliveryView.outForDelivery,
              ],
              selected: _view,
              onSelected: _select,
              labelOf: (v) => v == DeliveryView.assigned
                  ? 'To collect'
                  : 'Out for delivery',
              countOf: (v) => list == null
                  ? null
                  : (v == DeliveryView.assigned
                        ? list.assignedCount
                        : list.outForDeliveryCount),
            ),
            if (_returns > 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.md,
                  AppSpace.lg,
                  0,
                ),
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    foregroundColor: StatusTone.rose.foreground,
                    side: BorderSide(color: StatusTone.rose.border),
                  ),
                  onPressed: () async {
                    await context.push(RiderPaths.returns);
                    if (mounted) await _changed();
                  },
                  icon: const Icon(LucideIcons.undo2, size: 20),
                  label: Text(
                    '$_returns parcel${_returns == 1 ? '' : 's'} to return to the seller',
                  ),
                ),
              ),
            Expanded(
              child: RefreshIndicator(onRefresh: _changed, child: _body(list)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(DeliveryList? list) {
    if (_failure != null && list == null) {
      return _scrollable(ErrorRetry(failure: _failure!, onRetry: _load));
    }
    if (list == null) return const SkeletonList(count: 3);
    if (list.groups.isEmpty) {
      return _scrollable(
        _view == DeliveryView.assigned
            ? const EmptyState(
                icon: LucideIcons.warehouse,
                title: 'Nothing to collect',
                message: 'When the hub gives you parcels, they show here. Scan them at the hub to start delivering.',
              )
            : const EmptyState(
                icon: LucideIcons.truck,
                title: 'No stops on the road',
                message: 'Collect your parcels at the hub under To collect, and your route shows here.',
              ),
      );
    }
    return _view == DeliveryView.assigned ? _toCollect(list) : _route(list);
  }

  Widget _toCollect(DeliveryList list) {
    final hub = list.hub;
    return Column(
      children: [
        Expanded(
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              if (hub != null) ...[
                RiderCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Collect at', style: RiderText.label),
                      Text(hub.name ?? 'Your hub', style: RiderText.name),
                      InfoRow(
                        icon: LucideIcons.warehouse,
                        text: hub.fullAddress,
                        action: MapsButton(address: hub.fullAddress),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.md),
              ],
              for (final group in list.groups) ...[
                RiderSectionTitle('${group.barangayName}, ${group.city}'),
                RiderCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpace.lg,
                    vertical: AppSpace.sm,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final stop in group.stops)
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpace.xs,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      stop.recipientName,
                                      style: RiderText.body,
                                    ),
                                    TrackingNumberText(stop.trackingNumber),
                                  ],
                                ),
                              ),
                              if (stop.isCod)
                                StatusChip(
                                  label: 'COD ${formatPeso(stop.codAmount)}',
                                  tone: StatusTone.amber,
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpace.md),
              ],
            ],
          ),
        ),
        Material(
          color: AppColors.white,
          elevation: 8,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.lg),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                ),
                onPressed: () => _collect(list),
                icon: const Icon(LucideIcons.scanLine),
                label: Text('Scan at the hub (${list.assignedCount})'),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _route(DeliveryList list) {
    var number = 0;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(AppSpace.lg),
      children: [
        for (final group in list.groups) ...[
          RiderSectionTitle(
            '${group.barangayName}, ${group.city}',
            trailing: Text(
              '${group.stops.length} stop${group.stops.length == 1 ? '' : 's'}',
              style: RiderText.label,
            ),
          ),
          for (final stop in group.stops) ...[
            StopCard(
              number: ++number,
              stop: stop,
              onDelivered: () => _delivered(stop),
              onFailed: () => _failed(stop),
            ),
            const SizedBox(height: AppSpace.md),
          ],
        ],
      ],
    );
  }

  Widget _scrollable(Widget child) => LayoutBuilder(
    builder: (context, constraints) => SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(height: constraints.maxHeight, child: child),
    ),
  );
}

/// One stop, like the website's: the stop number, the attempt, the recipient, the cash to collect, how to reach
/// them, what is in the parcel, and Delivered / Delivery failed side by side at the bottom.
class StopCard extends StatelessWidget {
  const StopCard({
    super.key,
    required this.number,
    required this.stop,
    required this.onDelivered,
    required this.onFailed,
  });

  final int number;
  final DeliveryStop stop;
  final VoidCallback onDelivered;
  final VoidCallback onFailed;

  @override
  Widget build(BuildContext context) {
    final address = stop.address.fullAddress;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StopBadge(number: number),
              const SizedBox(width: AppSpace.sm),
              // Scaled down rather than overflowing on a narrow phone or with large text.
              if (stop.attempt != null)
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: StatusChip(
                      label:
                          'Attempt ${stop.attempt}${stop.maxAttempts != null ? ' of ${stop.maxAttempts}' : ''}',
                      tone: (stop.attempt ?? 1) > 1
                          ? StatusTone.amber
                          : StatusTone.gray,
                    ),
                  ),
                ),
              const Spacer(),
              RiderMessageButton(
                trackingNumber: stop.trackingNumber,
                counterparts: const [Counterpart.buyer, Counterpart.hub],
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Text(
            stop.recipientName,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.gray900,
            ),
          ),
          if (stop.previousFailure != null) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              'Last try: ${stop.previousFailure}',
              style: TextStyle(
                fontSize: 15,
                color: StatusTone.amber.foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: AppSpace.md),
          if (stop.isCod) ...[
            CodBlock(amount: stop.codAmount!),
            const SizedBox(height: AppSpace.md),
          ] else ...[
            const StatusChip(
              label: 'Paid. No cash to collect',
              tone: StatusTone.emerald,
              icon: LucideIcons.circleCheck,
            ),
            const SizedBox(height: AppSpace.md),
          ],
          InfoRow(
            icon: LucideIcons.phone,
            text: stop.recipientPhone.isEmpty
                ? 'No phone number'
                : stop.recipientPhone,
            action: CallButton(phone: stop.recipientPhone),
          ),
          const SizedBox(height: AppSpace.xs),
          InfoRow(
            icon: LucideIcons.mapPin,
            text: address,
            action: MapsButton(address: address),
          ),
          const SizedBox(height: AppSpace.xs),
          InfoRow(
            icon: LucideIcons.package,
            text:
                '${stop.itemCount} item${stop.itemCount == 1 ? '' : 's'}${stop.itemSummary.isEmpty ? '' : ': ${stop.itemSummary}'}',
          ),
          const SizedBox(height: AppSpace.xs),
          TrackingNumberText(stop.trackingNumber),
          const SizedBox(height: AppSpace.md),
          OutcomeButtons(onDelivered: onDelivered, onFailed: onFailed),
        ],
      ),
    );
  }
}
