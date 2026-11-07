import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// Trucks on their way to this hub, at the top of Parcel intake. A truck can be received in one go, like scanning one
/// sack: count the parcels off it and tick any that is not there (it stays expected). Shows nothing without trucks.
class HubIncomingTrucks extends ConsumerStatefulWidget {
  const HubIncomingTrucks({super.key, required this.onReceived});

  /// Called after a truck was received, so the expected list refreshes.
  final Future<void> Function() onReceived;

  @override
  ConsumerState<HubIncomingTrucks> createState() => _HubIncomingTrucksState();
}

class _HubIncomingTrucksState extends ConsumerState<HubIncomingTrucks> {
  List<TruckTrip> _trips = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final trips = await ref.read(hubApiProvider).truckTrips('in');
      if (mounted) setState(() => _trips = trips);
    } catch (_) {
      // The parcels can still be scanned one by one.
    }
  }

  Future<void> _receive(TruckTrip trip) async {
    final waiting = trip.parcels
        .where((p) => !p.received)
        .map((p) => p.trackingNumber)
        .toList();
    final missing = <String>{};
    final go = await showModalBottomSheet<bool>(
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
                  'Receive the truck from ${trip.fromHub}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.gray900,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Count the parcels off the truck. Tick any that is not on it; it stays expected until someone scans it in.',
                  style: HubText.small,
                ),
                const SizedBox(height: AppSpace.sm),
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    children: [
                      for (final tn in waiting)
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          value: missing.contains(tn),
                          onChanged: (on) => setSheet(
                            () => on == true
                                ? missing.add(tn)
                                : missing.remove(tn),
                          ),
                          title: Text(
                            tn,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 14,
                            ),
                          ),
                          subtitle: missing.contains(tn)
                              ? const Text('Not on the truck')
                              : null,
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
                  onPressed: missing.length == waiting.length
                      ? null
                      : () => Navigator.of(sheet).pop(true),
                  child: Text(
                    'Receive ${waiting.length - missing.length} parcels',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (go != true || !mounted) return;
    try {
      final message = await ref
          .read(hubApiProvider)
          .receiveTruckTrip(trip.id, missing: missing.toList());
      if (!mounted) return;
      showRiderMessage(context, message);
      await _load();
      await widget.onReceived();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_trips.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.lg,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const HubSection(title: 'Trucks coming here'),
          for (final trip in _trips) ...[
            RiderCard(
              padding: const EdgeInsets.all(AppSpace.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'From ${trip.fromHub}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.gray900,
                    ),
                  ),
                  Text(
                    [
                      trip.code,
                      ?trip.driverName,
                      ?trip.plateNumber,
                      'left ${Fmt.dayTime(trip.departedAt)}',
                    ].join(' · '),
                    style: HubText.small,
                  ),
                  if (trip.driverArrivedAt != null)
                    Text(
                      'At your dock since ${Fmt.dayTime(trip.driverArrivedAt)}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: kDeliveredGreen,
                      ),
                    ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${trip.receivedCount} of ${trip.parcelCount} scanned in',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppColors.gray900,
                          ),
                        ),
                      ),
                      if (trip.receivedCount < trip.parcelCount)
                        FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: LogisticsLook.hubAction,
                            minimumSize: const Size(0, 44),
                          ),
                          onPressed: () => _receive(trip),
                          child: Text(
                            'Receive all ${trip.parcelCount - trip.receivedCount}',
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.sm),
          ],
        ],
      ),
    );
  }
}
