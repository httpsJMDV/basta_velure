import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

/// Truck drivers: who is on the road between the hubs, and the trip pay the company owes each one. The company pays
/// from its own money (it is not the riders' or hubs' share), then marks it paid here; the driver is told.
class CourierTrucksScreen extends ConsumerStatefulWidget {
  const CourierTrucksScreen({super.key});

  @override
  ConsumerState<CourierTrucksScreen> createState() =>
      _CourierTrucksScreenState();
}

class _CourierTrucksScreenState extends ConsumerState<CourierTrucksScreen> {
  final _view = GlobalKey<LoadViewState<CourierTrucks>>();

  Future<void> _pay(CourierTruckDriver driver) async {
    final reference = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Pay ${driver.name}?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Send ${formatPeso(driver.unpaidAmount)} for ${driver.unpaidTrips} '
              'trip${driver.unpaidTrips == 1 ? '' : 's'} by GCash or bank first, then mark it paid.',
            ),
            const SizedBox(height: AppSpace.md),
            TextField(
              controller: reference,
              maxLength: 40,
              decoration: const InputDecoration(
                labelText: 'Reference (optional)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: const Text('Mark paid'),
          ),
        ],
      ),
    );
    final text = reference.text.trim();
    reference.dispose();
    if (confirmed != true || !mounted) return;
    try {
      final message = await ref
          .read(courierApiProvider)
          .payTruckDriver(driver.id, reference: text.isEmpty ? null : text);
      if (!mounted) return;
      showRiderMessage(context, message);
      await _view.currentState?.reload();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: const Text('Truck drivers'),
        actions: [
          IconButton(
            tooltip: 'Add truck driver',
            icon: const Icon(LucideIcons.userPlus),
            onPressed: () async {
              await context.push(LogisticsPaths.courierAddRider);
              await _view.currentState?.reload();
            },
          ),
        ],
      ),
      body: LoadView<CourierTrucks>(
        key: _view,
        load: () => ref.read(courierApiProvider).truckDrivers(),
        refreshEvery: const Duration(seconds: 30),
        builder: (context, data) => ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            _Summary(data: data),
            const SizedBox(height: AppSpace.md),
            const _PlanCard(),
            const SizedBox(height: AppSpace.lg),
            if (data.drivers.isEmpty)
              const EmptyState(
                icon: LucideIcons.container,
                title: 'No truck drivers yet',
                message: 'Add one with the button at the top. Your hubs then pick a driver whenever they send parcels to another hub.',
              )
            else
              for (final d in data.drivers) ...[
                _DriverCard(driver: d, onPay: () => _pay(d)),
                const SizedBox(height: AppSpace.md),
              ],
          ],
        ),
      ),
    );
  }
}

/// "Do we need more truck drivers?": the answer worked out from a week of trips between the hubs.
class _PlanCard extends ConsumerWidget {
  const _PlanCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder(
      future: ref.read(courierApiProvider).truckPlan(),
      builder: (context, snap) {
        final plan = snap.data;
        if (plan == null) return const SizedBox.shrink();
        final tone = switch (plan.verdict) {
          'short' => StatusTone.rose,
          'tight' => StatusTone.amber,
          'ok' || 'more_than_needed' => StatusTone.emerald,
          _ => StatusTone.gray,
        };
        return RiderCard(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Do we need more truck drivers?', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.gray900)),
              const SizedBox(height: AppSpace.sm),
              Row(
                children: [
                  Expanded(child: _big('You need', '${plan.need}')),
                  Expanded(child: _big('You have', '${plan.have}')),
                  Expanded(child: _big('Trips a day', '${plan.tripsPerDay}')),
                ],
              ),
              const SizedBox(height: AppSpace.sm),
              Text(plan.message, style: TextStyle(fontSize: 14, height: 1.35, color: tone.foreground)),
              if (plan.waiting > 0)
                Text('${plan.waiting} parcels are waiting for a truck now.', style: const TextStyle(fontSize: 13, color: AppColors.stone600)),
            ],
          ),
        );
      },
    );
  }

  Widget _big(String label, String value) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(fontSize: 12, color: AppColors.stone500)),
      Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.gray900)),
    ],
  );
}

class _Summary extends StatelessWidget {
  const _Summary({required this.data});

  final CourierTrucks data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        children: [
          _figure('On the road', '${data.onTheWay}'),
          _figure('You owe', formatPeso(data.unpaidAmount)),
          _figure('Per trip', formatPeso(data.rate)),
        ],
      ),
    );
  }

  Widget _figure(String label, String value) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Color(0xFFD1D5DB)),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.white,
          ),
        ),
      ],
    ),
  );
}

class _DriverCard extends StatelessWidget {
  const _DriverCard({required this.driver, required this.onPay});

  final CourierTruckDriver driver;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    final trip = driver.currentTrip;
    return RiderCard(
      padding: const EdgeInsets.all(AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      driver.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray900,
                      ),
                    ),
                    Text(
                      [
                        driver.vehicleType,
                        ?driver.plateNumber,
                        ?driver.homeHub,
                      ].join(' · '),
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.gray600,
                      ),
                    ),
                  ],
                ),
              ),
              if (driver.status != 'ACTIVE')
                StatusChip(
                  label: driver.status == 'PENDING_ACTIVATION'
                      ? 'Not activated'
                      : driver.status.toLowerCase(),
                  tone: StatusTone.gray,
                )
              else if (trip != null)
                const StatusChip(label: 'On the road', tone: StatusTone.amber)
              else
                const StatusChip(label: 'Free', tone: StatusTone.emerald),
            ],
          ),
          if (trip != null) ...[
            const SizedBox(height: AppSpace.sm),
            Text(
              '${trip.fromHub} → ${trip.toHub} · ${trip.receivedCount}/${trip.parcelCount} scanned in · left ${Fmt.dayTime(trip.departedAt)}',
              style: const TextStyle(fontSize: 13, color: AppColors.gray900),
            ),
          ],
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Expanded(
                child: Text(
                  driver.unpaidTrips > 0
                      ? '${formatPeso(driver.unpaidAmount)} owed for ${driver.unpaidTrips} trip${driver.unpaidTrips == 1 ? '' : 's'}'
                      : 'Nothing owed · ${driver.tripsThisWeek} trip${driver.tripsThisWeek == 1 ? '' : 's'} this week',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.gray600,
                  ),
                ),
              ),
              if (driver.unpaidTrips > 0)
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.gray900,
                    minimumSize: const Size(0, 40),
                  ),
                  onPressed: onPay,
                  icon: const Icon(LucideIcons.wallet, size: 16),
                  label: const Text('Pay'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
