import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/parcel_scanner.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';
import '../widgets/scan_results.dart';
import 'courier_parcels_screen.dart';

enum _Station {
  inbound(
    'Inbound',
    'A rider brings a picked-up parcel in. It becomes At hub.',
  ),
  sort('Sort', 'Puts a received parcel in its delivery zone.'),
  outbound('Outbound', 'Hands a sorted parcel to a delivery rider.');

  const _Station(this.label, this.hint);

  final String label;
  final String hint;
}

enum _View { scans, waiting }

/// Hub scanning on the go (D7): Inbound, then Sort, then Outbound, in that order, each once, and only on the company's
/// own parcels. Anything else is refused with the reason, and nothing changes.
class CourierScanScreen extends ConsumerStatefulWidget {
  const CourierScanScreen({super.key});

  @override
  ConsumerState<CourierScanScreen> createState() => _CourierScanScreenState();
}

class _CourierScanScreenState extends ConsumerState<CourierScanScreen> {
  _Station _station = _Station.inbound;
  _View _view = _View.scans;
  final _rows = <ScanRow>[];
  List<OpsHub> _hubs = const [];
  OpsBoard? _board;
  int? _hubId;
  PickableRider? _rider;

  CourierApi get _api => ref.read(courierApiProvider);

  @override
  void initState() {
    super.initState();
    _loadHubs();
    _loadBoard();
  }

  Future<void> _loadHubs() async {
    try {
      final ops = await _api.hubOps();
      if (mounted) setState(() => _hubs = ops.hubs);
    } catch (_) {
      // Scanning still works: a parcel keeps its own hub.
    }
  }

  Future<void> _loadBoard() async {
    try {
      final board = await _api.opsBoard(hubId: _hubId);
      if (mounted) setState(() => _board = board);
    } catch (_) {
      // Keep the last list; the next good scan loads it again.
    }
  }

  Future<void> _chooseRider() async {
    final rider = await showRiderPicker(
      context,
      title: 'Delivery rider',
      message: 'The rider taking the parcels you scan next.',
      load: () => pickableCourierRiders(_api),
    );
    if (rider != null && mounted) setState(() => _rider = rider);
  }

  void _add(ScanRow row) {
    setState(() {
      _rows.insert(0, row);
      if (_rows.length > 50) _rows.removeLast();
      _view = _View.scans;
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
    if (_station == _Station.outbound && _rider == null) {
      _add(
        ScanRow(
          code: code,
          tone: ScanTone.bad,
          message: 'Choose the delivery rider first.',
        ),
      );
      return ScanTone.bad;
    }
    try {
      final message = await switch (_station) {
        _Station.inbound => _api.scanInbound(code, hubId: _hubId),
        _Station.sort => _api.scanSort(code),
        _Station.outbound => _api.scanOutbound(code, _rider!.id),
      };
      if (!mounted) return ScanTone.good;
      _add(ScanRow(code: code, tone: ScanTone.good, message: message));
      await _loadBoard();
      return ScanTone.good;
    } on ApiFailure catch (failure) {
      // A repeat or a scan out of order is a 409: nothing changed, so it isn't an error to fix.
      final tone = failure.kind == FailureKind.conflict
          ? ScanTone.warn
          : ScanTone.bad;
      if (mounted) {
        _add(ScanRow(code: code, tone: tone, message: failure.message));
      }
      return tone;
    }
  }

  List<OpsParcel> get _waiting {
    final board = _board;
    if (board == null) return const [];
    return switch (_station) {
      _Station.inbound => board.incoming,
      _Station.sort => board.toSort,
      _Station.outbound => [for (final z in board.zones) ...z.parcels],
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Hub scanning')),
      body: ScanSessionLayout(
        scanner: _scannerColumn(),
        results: _view == _View.scans
            ? ScanResultsSliver(
                rows: _rows,
                empty: 'Scan a waybill to start. Each parcel shows here.',
              )
            : _waitingSliver(),
      ),
    );
  }

  Widget _scannerColumn() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<_Station>(
          showSelectedIcon: false,
          style: SegmentedButton.styleFrom(
            selectedBackgroundColor: AppColors.brandRed,
            selectedForegroundColor: AppColors.white,
          ),
          segments: [
            for (final station in _Station.values)
              ButtonSegment(value: station, label: Text(station.label)),
          ],
          selected: {_station},
          onSelectionChanged: (next) => setState(() => _station = next.first),
        ),
        const SizedBox(height: AppSpace.xs),
        Text(_station.hint, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: AppSpace.sm),
        if (_station == _Station.inbound && _hubs.length > 1) ...[
          DropdownButtonFormField<int?>(
            initialValue: _hubId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Receiving at'),
            items: [
              const DropdownMenuItem(
                value: null,
                child: Text("The parcel's own hub"),
              ),
              for (final hub in _hubs)
                DropdownMenuItem(value: hub.id, child: Text(hub.name)),
            ],
            onChanged: (id) {
              setState(() => _hubId = id);
              _loadBoard();
            },
          ),
          const SizedBox(height: AppSpace.sm),
        ],
        if (_station == _Station.outbound) ...[
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: _chooseRider,
            icon: const Icon(LucideIcons.bike, size: 20),
            label: Text(
              _rider == null
                  ? 'Choose the delivery rider'
                  : 'Rider: ${_rider!.name} · change',
            ),
          ),
          const SizedBox(height: AppSpace.sm),
        ],
        ParcelScanner.session(
          onSessionScan: _scan,
          cameraReason:
              'Scan the barcode on each waybill as it moves through the hub.',
        ),
        RiderTabs<_View>(
          values: _View.values,
          selected: _view,
          labelOf: (view) => view == _View.scans ? 'Scans' : 'Waiting',
          countOf: (view) => view == _View.scans
              ? _rows.length
              : (_board == null ? null : _waiting.length),
          onSelected: (view) {
            setState(() => _view = view);
            if (view == _View.waiting) _loadBoard();
          },
        ),
      ],
    );
  }

  Widget _waitingSliver() {
    final parcels = _waiting;
    if (_board == null) {
      return const SliverToBoxAdapter(
        child: SizedBox(height: 240, child: SkeletonList(count: 3)),
      );
    }
    if (parcels.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: EmptyState(
          icon: switch (_station) {
            _Station.inbound => LucideIcons.arrowDownToLine,
            _Station.sort => LucideIcons.shuffle,
            _Station.outbound => LucideIcons.arrowUpFromLine,
          },
          title: switch (_station) {
            _Station.inbound => 'Nothing on the way in',
            _Station.sort => 'Nothing to sort',
            _Station.outbound => 'Nothing ready to go out',
          },
          message: switch (_station) {
            _Station.inbound =>
              'Parcels show here once a rider picks them up from a shop.',
            _Station.sort =>
              'Received parcels wait here until they are sorted.',
            _Station.outbound =>
              'Sorted parcels wait here, by zone, for a delivery rider.',
          },
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.all(AppSpace.lg),
      sliver: SliverList.separated(
        itemCount: parcels.length,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
        itemBuilder: (context, index) {
          final parcel = parcels[index];
          return ParcelRowCard(
            trackingNumber: parcel.trackingNumber,
            lines: [
              [?parcel.barangay, ?parcel.city].join(', '),
              [
                ?parcel.shop,
                if (parcel.rider != null) 'Rider: ${parcel.rider}',
              ].join(' · '),
            ],
          );
        },
      ),
    );
  }
}
