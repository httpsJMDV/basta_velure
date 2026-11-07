import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/trip_models.dart';
import '../widgets/rider_widgets.dart';

/// A truck driver's home: the trip on the road now, with the parcels on board and "I'm at the hub", then the trip
/// pay and the trips before. The courier pays a set amount per trip; the next hub's scans finish the trip.
class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});

  @override
  ConsumerState<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends ConsumerState<TripsScreen> {
  TruckTrips? _data;
  ApiFailure? _failure;
  Timer? _timer;
  StreamSubscription<Object?>? _live;

  @override
  void initState() {
    super.initState();
    _load();
    // A new trip or the next hub's scans show within seconds, and at once on a live notice.
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => _load());
    _live = ref
        .read(realtimeProvider)
        ?.notifications()
        .listen((_) => _load(), onError: (_) {});
  }

  @override
  void dispose() {
    _timer?.cancel();
    _live?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await ref.read(riderApiProvider).trips();
      if (mounted) {
        setState(() {
          _data = data;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted && _data == null) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  Future<void> _arrived(TruckTrip trip) async {
    try {
      final message = await ref.read(riderApiProvider).tripArrived(trip.id);
      if (!mounted) return;
      showRiderMessage(context, message);
      await _load();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Trips')),
      body: data == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 3))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.lg,
                  AppSpace.lg,
                  120,
                ),
                children: [
                  if (data.current != null)
                    _CurrentTrip(
                      trip: data.current!,
                      onArrived: () => _arrived(data.current!),
                    )
                  else
                    const RiderCard(
                      child: Row(
                        children: [
                          Icon(
                            LucideIcons.container,
                            color: AppColors.stone600,
                          ),
                          SizedBox(width: AppSpace.md),
                          Expanded(
                            child: Text(
                              'No trip right now. When a hub loads parcels on your truck, the trip shows here.',
                              style: RiderText.body,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: AppSpace.lg),
                  _Pay(data: data),
                  const SizedBox(height: AppSpace.xl),
                  const RiderSectionTitle('Past trips'),
                  if (data.trips.isEmpty)
                    const Text('No trips yet.', style: RiderText.label)
                  else
                    RiderCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpace.lg,
                        vertical: AppSpace.xs,
                      ),
                      child: Column(
                        children: [
                          for (final (i, t) in data.trips.indexed) ...[
                            if (i > 0) const Divider(height: 1),
                            _TripRow(trip: t),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _CurrentTrip extends StatelessWidget {
  const _CurrentTrip({required this.trip, required this.onArrived});

  final TruckTrip trip;
  final Future<void> Function() onArrived;

  @override
  Widget build(BuildContext context) {
    final count = trip.parcelCount;
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'TRIP ${trip.code}${trip.plateNumber != null ? ' · ${trip.plateNumber}' : ''}',
            style: RiderText.label,
          ),
          const SizedBox(height: AppSpace.sm),
          Text(trip.fromHub, style: RiderText.body),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 2),
            child: Icon(
              LucideIcons.arrowDown,
              size: 18,
              color: AppColors.stone600,
            ),
          ),
          Text(trip.toHub, style: RiderText.name),
          if (trip.toCity != null && trip.toCity!.isNotEmpty)
            Text(trip.toCity!, style: RiderText.label),
          const SizedBox(height: AppSpace.md),
          Text(
            '$count parcel${count == 1 ? '' : 's'} on board · left ${Fmt.dayTime(trip.departedAt)}',
            style: RiderText.body,
          ),
          const SizedBox(height: AppSpace.lg),
          if (trip.driverArrivedAt != null)
            MessageBanner(
              tone: StatusTone.emerald,
              icon: LucideIcons.circleCheck,
              message:
                  'The hub knows you are there. ${trip.receivedCount} of $count scanned in.',
            )
          else
            SubmitButton(
              label: "I'm at ${trip.toHub}",
              busyLabel: 'Telling the hub…',
              icon: LucideIcons.mapPin,
              onPressed: onArrived,
            ),
          if (trip.parcels.isNotEmpty) ...[
            const SizedBox(height: AppSpace.lg),
            const RiderSectionTitle('On board'),
            for (final p in trip.parcels)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Icon(
                      p.received ? LucideIcons.circleCheck : LucideIcons.circle,
                      size: 16,
                      color: p.received ? kDeliveredGreen : AppColors.stone400,
                    ),
                    const SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: Text(p.trackingNumber, style: RiderText.mono),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Pay extends StatelessWidget {
  const _Pay({required this.data});

  final TruckTrips data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.xl),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Trip pay not paid yet',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Color(0xFFD6D3D1),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            formatPeso(data.unpaidTotal),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: AppColors.white,
            ),
          ),
          const SizedBox(height: AppSpace.md),
          Text(
            '${data.unpaidTrips} trip${data.unpaidTrips == 1 ? '' : 's'} · ${formatPeso(data.rate)} per trip · '
            '${data.tripsThisWeek} this week · ${formatPeso(data.paidTotal)} paid so far',
            style: const TextStyle(
              fontSize: 14,
              color: Color(0xFFD6D3D1),
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _TripRow extends StatelessWidget {
  const _TripRow({required this.trip});

  final TruckTrip trip;

  @override
  Widget build(BuildContext context) {
    final paid = trip.paidAt != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${trip.fromHub} → ${trip.toHub}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  '${trip.code} · ${Fmt.date(trip.departedAt)} · ${trip.receivedCount}/${trip.parcelCount} parcels · ${trip.statusLabel}',
                  style: RiderText.label,
                ),
                if (trip.closeReason != null)
                  Text(trip.closeReason!, style: RiderText.label),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatPeso(trip.payAmount),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                paid
                    ? 'Paid'
                    : (trip.onTheWay ? 'After the trip' : 'Not paid yet'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: paid ? kDeliveredGreen : AppColors.stone600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
