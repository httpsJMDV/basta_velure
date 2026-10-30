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
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

enum _IntakeTab {
  expected('Expected'),
  received('Received today');

  const _IntakeTab(this.label);

  final String label;
}

/// Parcels coming in (D2): what riders are bringing, and what already came in today.
class HubIntakeScreen extends ConsumerStatefulWidget {
  const HubIntakeScreen({super.key, this.showReceived = false});

  final bool showReceived;

  @override
  ConsumerState<HubIntakeScreen> createState() => _HubIntakeScreenState();
}

class _HubIntakeScreenState extends ConsumerState<HubIntakeScreen> {
  late _IntakeTab _tab = widget.showReceived
      ? _IntakeTab.received
      : _IntakeTab.expected;
  final _list = GlobalKey<PagedListState<IntakeParcel>>();
  final _totals = <_IntakeTab, int>{};

  Future<void> _open(IntakeParcel parcel) async {
    final received = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ParcelSheet(trackingNumber: parcel.trackingNumber),
    );
    if (received == true && mounted) await _list.currentState?.refresh();
  }

  Future<void> _scan() async {
    await context.push(LogisticsPaths.hubScan);
    if (mounted) await _list.currentState?.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Parcel intake')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.gray900,
        foregroundColor: AppColors.white,
        onPressed: _scan,
        icon: const Icon(LucideIcons.scanLine),
        label: const Text('Scan parcels in'),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RiderTabs<_IntakeTab>(
            values: _IntakeTab.values,
            selected: _tab,
            labelOf: (tab) => tab.label,
            countOf: (tab) => _totals[tab],
            selectedColor: LogisticsLook.hubAction,
            onSelected: (tab) {
              setState(() => _tab = tab);
              unawaited(_list.currentState?.refresh());
            },
          ),
          Expanded(
            child: PagedList<IntakeParcel>(
              key: _list,
              load: (page) => _tab == _IntakeTab.expected
                  ? api.expected(page)
                  : api.receivedToday(page),
              onLoaded: (page) => setState(() => _totals[_tab] = page.total),
              spacing: AppSpace.sm,
              empty: EmptyState(
                icon: LucideIcons.inbox,
                title: _tab == _IntakeTab.expected
                    ? 'Nothing on the way in'
                    : 'Nothing received yet today',
                message: _tab == _IntakeTab.expected
                    ? 'Parcels show here once a rider picks them up from a shop.'
                    : 'Scan a parcel as a rider drops it off.',
              ),
              itemBuilder: (context, parcel) => ParcelRowCard(
                trackingNumber: parcel.trackingNumber,
                status: StatusWords.parcel(parcel.status),
                lines: [
                  [?parcel.barangayName, ?parcel.shopName].join(' · '),
                  if (parcel.riderName != null) 'Rider: ${parcel.riderName}',
                  if (_tab == _IntakeTab.received)
                    'Received ${Fmt.dayTime(parcel.scannedInAt)}'
                  else if (parcel.pickedUpAt != null)
                    'Picked up ${Fmt.dayTime(parcel.pickedUpAt)}',
                ],
                onTap: () => _open(parcel),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One parcel looked up (`GET /hub/parcels/{tracking}`), with Receive while it's still on its way in.
class _ParcelSheet extends ConsumerStatefulWidget {
  const _ParcelSheet({required this.trackingNumber});

  final String trackingNumber;

  @override
  ConsumerState<_ParcelSheet> createState() => _ParcelSheetState();
}

class _ParcelSheetState extends ConsumerState<_ParcelSheet> {
  IntakeParcel? _parcel;
  ApiFailure? _failure;

  HubApi get _api => ref.read(hubApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failure = null);
    try {
      final parcel = await _api.lookUp(widget.trackingNumber);
      if (mounted) setState(() => _parcel = parcel);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _receive() async {
    try {
      await _api.receive(widget.trackingNumber);
      if (!mounted) return;
      showRiderMessage(context, 'Parcel received.');
      Navigator.of(context).pop(true);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() => _failure = failure);
      await _load();
      if (mounted) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final parcel = _parcel;
    if (parcel == null) {
      return SizedBox(
        height: 320,
        child: _failure != null
            ? ErrorRetry(failure: _failure!, onRetry: _load)
            : const SkeletonList(count: 2),
      );
    }
    return SafeArea(
      child: SingleChildScrollView(
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
            TrackingNumberText(parcel.trackingNumber),
            Align(
              alignment: Alignment.centerLeft,
              child: ToneChip(StatusWords.parcel(parcel.status)),
            ),
            const SizedBox(height: AppSpace.sm),
            FactRow('Order', parcel.orderNumber),
            FactRow('Shop', parcel.shopName),
            FactRow('Going to', parcel.barangayName),
            FactRow('Recipient', parcel.recipientName),
            FactRow('Address', parcel.recipientAddress),
            FactRow(
              'Pickup rider',
              [?parcel.riderName, ?parcel.riderPlate].join(' · '),
            ),
            if (parcel.scannedInAt != null)
              FactRow('Received', Fmt.dateTime(parcel.scannedInAt)),
            if (parcel.status == 'PICKED_UP') ...[
              const SizedBox(height: AppSpace.md),
              SubmitButton(
                label: 'Receive parcel',
                busyLabel: 'Receiving…',
                color: LogisticsLook.hubAction,
                onPressed: _receive,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
