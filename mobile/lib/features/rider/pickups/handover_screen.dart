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

/// The handover at the shop (C4): scan each parcel's waybill, then confirm. Each scan is checked with the server
/// (`/rider/pickups/verify`); the confirm takes them all at once, and any the server refuses are unticked so the
/// rest can still go. Parcels not scanned stay in My pickups.
class HandoverScreen extends ConsumerStatefulWidget {
  const HandoverScreen({super.key, required this.group});

  final PickupGroup group;

  @override
  ConsumerState<HandoverScreen> createState() => _HandoverScreenState();
}

class _HandoverScreenState extends ConsumerState<HandoverScreen> {
  final _scanned = <String>[];
  Map<String, String> _refused = const {};
  String? _error;
  bool _sending = false;
  ({String message, List<String> done, RiderPlace? hub})? _result;

  RiderApi get _api => ref.read(riderApiProvider);
  List<String> get _expected => widget.group.trackingNumbers;

  Future<String?> _onScan(String code) async {
    if (_scanned.contains(code)) return 'Already ticked off.';
    try {
      final verified = await _api.verifyPickup(code);
      if (!_expected.contains(verified)) {
        return "$verified is not one of ${widget.group.shopName}'s parcels.";
      }
      if (_scanned.contains(verified)) return 'Already ticked off.';
      setState(() {
        _scanned.add(verified);
        _error = null;
      });
      return null;
    } on ApiFailure catch (failure) {
      return failure.kind == FailureKind.notFound
          ? 'Not one of your parcels.'
          : failure.message;
    }
  }

  Future<void> _confirm() async {
    if (_scanned.isEmpty || _sending) return;
    final sent = List<String>.of(_scanned);
    setState(() {
      _sending = true;
      _error = null;
      _refused = const {};
    });
    try {
      final result = await _api.confirmPickup(sent);
      if (mounted) setState(() => _result = result);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      final refused = itemErrors(failure.fieldErrors, sent);
      setState(() {
        _refused = refused;
        _scanned.removeWhere(refused.containsKey);
        _error = refused.isEmpty
            ? failure.message
            : 'Some parcels were not confirmed. Nothing was changed.';
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return PopScope(
      canPop: !_sending,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        appBar: AppBar(
          title: Text(
            result == null ? 'Pickup handover' : 'Handover confirmed',
          ),
        ),
        body: result == null ? _scanning() : _done(result),
      ),
    );
  }

  Widget _scanning() {
    final total = _expected.length;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              Text(widget.group.shopName, style: RiderText.name),
              const SizedBox(height: AppSpace.md),
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
            if (_scanned.isNotEmpty && _scanned.length < total)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpace.sm),
                child: Text(
                  "Parcels you don't scan stay in My pickups.",
                  style: TextStyle(fontSize: 14, color: AppColors.gray600),
                ),
              ),
            SubmitButton(
              label: 'Confirm handover (${_scanned.length} of $total)',
              busyLabel: 'Confirming…',
              icon: LucideIcons.packageCheck,
              onPressed: _scanned.isEmpty ? null : _confirm,
            ),
          ],
        ),
      ],
    );
  }

  Widget _done(({String message, List<String> done, RiderPlace? hub}) result) {
    final hub = result.hub;
    final left = _expected.length - result.done.length;
    return ListView(
      padding: const EdgeInsets.all(AppSpace.lg),
      children: [
        DoneHeader(
          title:
              '${result.done.length} parcel${result.done.length == 1 ? '' : 's'} picked up',
          message: result.message,
        ),
        const SizedBox(height: AppSpace.lg),
        if (hub != null)
          RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Bring them to', style: RiderText.label),
                Text(hub.name ?? 'Your hub', style: RiderText.name),
                InfoRow(
                  icon: LucideIcons.warehouse,
                  text: hub.fullAddress,
                  action: MapsButton(address: hub.fullAddress),
                ),
              ],
            ),
          ),
        if (left > 0) ...[
          const SizedBox(height: AppSpace.md),
          MessageBanner(
            tone: StatusTone.amber,
            message:
                '$left parcel${left == 1 ? ' is' : 's are'} still waiting at the shop, in My pickups.',
          ),
        ],
        const SizedBox(height: AppSpace.xl),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Done'),
        ),
      ],
    );
  }
}
