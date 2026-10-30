import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../rider/widgets/parcel_scanner.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../widgets/scan_results.dart';

/// What a scan does at the hub.
enum HubScanMode {
  receive('Receive'),
  sort('Sort');

  const HubScanMode(this.label);

  final String label;
}

/// The heart of the hub app (D2, D3). It stays open for many scans in a row, and each scan adds a row at the top: green
/// "Received", amber "Already received on Oct 28, 2:15 PM", red "Not one of this hub's parcels". A count for today, a
/// vibration on each scan, a torch and "Type it instead".
class HubScanScreen extends ConsumerStatefulWidget {
  const HubScanScreen({super.key, this.initialMode = HubScanMode.receive});

  final HubScanMode initialMode;

  @override
  ConsumerState<HubScanScreen> createState() => _HubScanScreenState();
}

class _HubScanScreenState extends ConsumerState<HubScanScreen> {
  late HubScanMode _mode = widget.initialMode;
  final _rows = <ScanRow>[];
  int? _receivedToday;
  int _sortedNow = 0;

  HubApi get _api => ref.read(hubApiProvider);

  @override
  void initState() {
    super.initState();
    _loadCount();
  }

  Future<void> _loadCount() async {
    try {
      final metrics = await _api.metrics();
      if (mounted) setState(() => _receivedToday = metrics.receivedToday);
    } catch (_) {
      // The count comes back with the next good scan's refresh.
    }
  }

  void _add(ScanRow row) {
    setState(() {
      _rows.insert(0, row);
      if (_rows.length > 50) _rows.removeLast();
    });
  }

  Future<ScanTone> _scan(String code) async {
    if (Rules.trackingNumber(code) != null) {
      _add(
        ScanRow(
          code: code,
          tone: ScanTone.bad,
          message: 'Not a Loved-IT tracking number',
        ),
      );
      return ScanTone.bad;
    }
    final row = await switch (_mode) {
      HubScanMode.receive => _receive(code),
      HubScanMode.sort => _sort(code),
    };
    if (mounted) _add(row);
    return row.tone;
  }

  Future<ScanRow> _receive(String code) async {
    try {
      final parcel = await _api.receive(code);
      if (mounted) {
        setState(() => _receivedToday = (_receivedToday ?? 0) + 1);
      }
      return ScanRow(
        code: code,
        tone: ScanTone.good,
        message: 'Received',
        detail: [?parcel.barangayName, ?parcel.shopName].join(' · '),
      );
    } on ApiFailure catch (failure) {
      return _receiveProblem(code, failure);
    }
  }

  static ScanRow _receiveProblem(String code, ApiFailure failure) {
    final when = asDate(failure.body['scanned_in_at']);
    return switch (failure.kind) {
      FailureKind.conflict => ScanRow(
        code: code,
        tone: ScanTone.warn,
        message: when == null
            ? failure.message
            : 'Already received on ${Fmt.dayTime(when)}',
      ),
      FailureKind.notFound => ScanRow(
        code: code,
        tone: ScanTone.bad,
        message: "Not one of this hub's parcels",
      ),
      _ => ScanRow(code: code, tone: ScanTone.bad, message: failure.message),
    };
  }

  Future<ScanRow> _sort(String code) async {
    try {
      final result = await _api.sort([code]);
      if (mounted) setState(() => _sortedNow++);
      return ScanRow(
        code: code,
        tone: ScanTone.good,
        message: 'Sorted',
        detail: result.barangay,
      );
    } on ApiFailure catch (failure) {
      // The server names the problem per parcel: "not waiting to be sorted", "not found for this hub".
      return ScanRow(
        code: code,
        tone: failure.kind == FailureKind.conflict
            ? ScanTone.warn
            : ScanTone.bad,
        message: failure.errorFor('tracking_numbers.0') ?? failure.message,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Scan parcels')),
      body: ScanSessionLayout(
        scanner: _scannerColumn(),
        results: ScanResultsSliver(
          rows: _rows,
          empty: 'Scan a waybill to start. Each parcel shows here.',
        ),
      ),
    );
  }

  Widget _scannerColumn() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SegmentedButton<HubScanMode>(
          showSelectedIcon: false,
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: AppColors.gray900,
            selectedForegroundColor: AppColors.white,
          ),
          segments: [
            for (final mode in HubScanMode.values)
              ButtonSegment(value: mode, label: Text(mode.label)),
          ],
          selected: {_mode},
          onSelectionChanged: (next) => setState(() => _mode = next.first),
        ),
        const SizedBox(height: AppSpace.sm),
        _Count(
          value: _mode == HubScanMode.receive ? _receivedToday : _sortedNow,
          label: _mode == HubScanMode.receive
              ? 'received today'
              : 'sorted just now',
        ),
        const SizedBox(height: AppSpace.sm),
        ParcelScanner.session(
          onSessionScan: _scan,
          cameraReason:
              'Scan the barcode on each waybill as parcels come into the hub.',
        ),
      ],
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.value, required this.label});

  final int? value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Row(
        children: [
          const Icon(LucideIcons.packageCheck, size: 18),
          const SizedBox(width: AppSpace.sm),
          Text(
            value == null ? '—' : '$value',
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: AppSpace.xs),
          Expanded(child: Text(label, style: RiderText.body)),
        ],
      ),
    );
  }
}
