import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/parcel_scanner.dart';
import '../widgets/rider_widgets.dart';
import '../widgets/scan_checklist.dart';

/// Collect at the hub (C5): scan each parcel (its waybill, or the QR code the hub shows), then start the delivery.
/// Matching is against the list already loaded, like the website. The start is all or nothing; parcels the server
/// refuses are unticked so the rest can go. Pops with true once something went out for delivery.
class CollectScreen extends ConsumerStatefulWidget {
  const CollectScreen({super.key, required this.list});

  final DeliveryList list;

  @override
  ConsumerState<CollectScreen> createState() => _CollectScreenState();
}

class _CollectScreenState extends ConsumerState<CollectScreen> {
  // A snapshot taken when the screen opens, so a refresh behind it can't reshuffle the checklist.
  late final List<String> _expected = [
    for (final s in widget.list.stops) s.trackingNumber,
  ];
  final _scanned = <String>[];
  Map<String, String> _refused = const {};
  String? _error;
  bool _sending = false;
  List<String>? _started;

  Future<String?> _onScan(String code) async {
    if (_scanned.contains(code)) return 'Already ticked off.';
    if (!_expected.contains(code)) return 'Not one of your parcels.';
    setState(() {
      _scanned.add(code);
      _error = null;
    });
    return null;
  }

  Future<void> _start() async {
    if (_scanned.isEmpty || _sending) return;
    final sent = List<String>.of(_scanned);
    setState(() {
      _sending = true;
      _error = null;
      _refused = const {};
    });
    try {
      final started = await ref.read(riderApiProvider).startDeliveries(sent);
      if (mounted) setState(() => _started = started);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      final refused = itemErrors(failure.fieldErrors, sent);
      setState(() {
        _refused = refused;
        _scanned.removeWhere(refused.containsKey);
        _error = refused.isEmpty
            ? failure.message
            : 'Some parcels could not be started. Nothing was changed.';
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final started = _started;
    return PopScope(
      canPop: !_sending,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        appBar: AppBar(
          title: Text(started == null ? 'Collect at hub' : 'Delivery started'),
          leading: started == null
              ? null
              : IconButton(
                  icon: const Icon(LucideIcons.x),
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(true),
                ),
        ),
        body: started == null ? _scanning() : _done(started),
      ),
    );
  }

  Widget _scanning() {
    final hub = widget.list.hub;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              if (hub != null) ...[
                Text(hub.name ?? 'Your hub', style: RiderText.name),
                const SizedBox(height: AppSpace.md),
              ],
              ParcelScanner(onScan: _onScan, enabled: !_sending),
              const SizedBox(height: AppSpace.md),
              ScanChecklist(
                expected: _expected,
                scanned: _scanned,
                refused: _refused,
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpace.md),
                MessageBanner(message: _error!),
              ],
            ],
          ),
        ),
        BottomActionBar(
          children: [
            SubmitButton(
              label:
                  'Start delivery (${_scanned.length} of ${_expected.length})',
              busyLabel: 'Starting…',
              icon: LucideIcons.truck,
              onPressed: _scanned.isEmpty ? null : _start,
            ),
          ],
        ),
      ],
    );
  }

  Widget _done(List<String> started) {
    final left = _expected.length - started.length;
    return ListView(
      padding: const EdgeInsets.all(AppSpace.lg),
      children: [
        DoneHeader(
          title:
              '${started.length} parcel${started.length == 1 ? ' is' : 's are'} now out for delivery',
          message: 'Your route is ready under Out for delivery.',
        ),
        if (left > 0) ...[
          const SizedBox(height: AppSpace.md),
          MessageBanner(
            tone: StatusTone.amber,
            message:
                '$left parcel${left == 1 ? ' is' : 's are'} still waiting to be collected at the hub.',
          ),
        ],
        const SizedBox(height: AppSpace.xl),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('View my route'),
        ),
      ],
    );
  }
}
