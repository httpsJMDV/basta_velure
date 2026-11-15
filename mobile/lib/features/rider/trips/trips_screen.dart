import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../payments/rider_payments.dart';
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
      if (mounted) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  bool _sendingIssue = false;
  Future<void> _reportIssue(TruckTrip trip) async {
    if (_sendingIssue) return;
    final controller = TextEditingController();
    var kind = 'delay';
    String? error;
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Report trip issue'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: kind,
                  decoration: const InputDecoration(labelText: 'Issue type'),
                  items: const [
                    DropdownMenuItem(value: 'delay', child: Text('Delay')),
                    DropdownMenuItem(
                      value: 'vehicle_issue',
                      child: Text('Vehicle issue'),
                    ),
                    DropdownMenuItem(
                      value: 'parcel_issue',
                      child: Text('Parcel / handover issue'),
                    ),
                    DropdownMenuItem(value: 'other', child: Text('Other')),
                  ],
                  onChanged: (value) => kind = value ?? 'delay',
                ),
                TextField(
                  controller: controller,
                  minLines: 3,
                  maxLines: 5,
                  maxLength: 1000,
                  decoration: InputDecoration(
                    labelText: 'What happened?',
                    errorText: error,
                  ),
                ),
                const Text(
                  'Your courier and both hubs will be notified. Trip and pay status stay unchanged.',
                  style: TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (controller.text.trim().length < 10) {
                  setDialogState(
                    () =>
                        error = 'Describe the issue in at least 10 characters.',
                  );
                  return;
                }
                Navigator.pop(dialogContext, (kind, controller.text.trim()));
              },
              child: const Text('Report issue'),
            ),
          ],
        ),
      ),
    );
    // The dialog route may still be animating while its text field unmounts.
    Future<void>.delayed(const Duration(milliseconds: 300), controller.dispose);
    if (result == null || !mounted) return;
    _sendingIssue = true;
    try {
      final message = await ref
          .read(riderApiProvider)
          .reportTripIssue(trip.id, result.$1, result.$2);
      if (mounted) showRiderMessage(context, message);
      await _load();
    } catch (error) {
      if (mounted) showRiderMessage(context, ApiFailure.from(error).message);
    } finally {
      _sendingIssue = false;
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
                  const RiderPaymentPanel(),
                  if (_failure != null)
                    MessageBanner(
                      message: 'Refresh failed. This trip may be out of date. Pull down to retry.',
                    ),
                  const RiderCard(
                    child: Text(
                      'Your courier pays earned trip shares manually to your saved GCash and records a transfer reference. Use Request payment above to ask your hub or courier for your available earnings. Hubs confirm handover; contact your courier about payment timing and any separate salary agreement.',
                      style: TextStyle(fontSize: 12, height: 1.5),
                    ),
                  ),
                  if (data.current != null)
                    _CurrentTrip(
                      trip: data.current!,
                      onArrived: () => _arrived(data.current!),
                      onIssue: () => _reportIssue(data.current!),
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
  const _CurrentTrip({
    required this.trip,
    required this.onArrived,
    required this.onIssue,
  });

  final TruckTrip trip;
  final Future<void> Function() onArrived;
  final Future<void> Function() onIssue;

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
          if (trip.toAddress != null)
            Text('Receiving hub: ${trip.toAddress}', style: RiderText.body),
          Text(
            'ETA: ${trip.etaAt == null ? 'Not set by dispatch' : Fmt.dayTime(trip.etaAt)} · Expected trip pay: ${formatPeso(trip.payAmount)}',
            style: RiderText.label,
          ),
          if (trip.toPhone != null)
            TextButton.icon(
              onPressed: () async {
                final launched = await launchUrl(
                  Uri(scheme: 'tel', path: trip.toPhone),
                );
                if (!launched && context.mounted) {
                  showRiderMessage(
                    context,
                    'Could not open phone. Hub: ${trip.toPhone}',
                  );
                }
              },
              icon: const Icon(LucideIcons.phone, size: 16),
              label: Text('Call hub · ${trip.toPhone}'),
            ),
          OutlinedButton.icon(
            onPressed: onIssue,
            icon: const Icon(LucideIcons.triangleAlert, size: 16),
            label: const Text('Report trip issue'),
          ),
          for (final issue in trip.issues)
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.sm),
              child: MessageBanner(
                message: '${issue.kind.replaceAll('_', ' ')}: ${issue.note}',
              ),
            ),
          const Text(
            'Arrival notifies the hub. The trip completes when the receiving hub scans every parcel. Missing parcels require courier review.',
            style: TextStyle(fontSize: 12, color: AppColors.stone600),
          ),
          const SizedBox(height: AppSpace.md),
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
                      child: SelectableText(
                        '${p.trackingNumber} · ${p.kind == 'buyer_return'
                            ? 'Buyer return'
                            : p.kind == 'return_to_sender'
                            ? 'Return to sender'
                            : 'Delivery'}',
                        style: RiderText.mono,
                      ),
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
            '${data.unpaidTrips} trip${data.unpaidTrips == 1 ? '' : 's'} · 15% transport pool shared across the route · '
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
