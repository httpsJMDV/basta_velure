import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';
import 'courier_parcels_screen.dart';

/// Who picks each parcel up (D7). New pickups go to the nearest Online rider for 60 seconds each, up to 3 riders, then
/// wait here. Assign by hand, several at once, or run auto-assign. Re-reads itself every 10 seconds, like the website.
class CourierDispatchScreen extends ConsumerStatefulWidget {
  const CourierDispatchScreen({super.key});

  @override
  ConsumerState<CourierDispatchScreen> createState() =>
      _CourierDispatchScreenState();
}

class _CourierDispatchScreenState extends ConsumerState<CourierDispatchScreen> {
  final _view = GlobalKey<LoadViewState<DispatchBoard>>();
  final _picked = <int>{};
  DispatchState _state = DispatchState.unassigned;

  CourierApi get _api => ref.read(courierApiProvider);

  Future<void> _reload() async => _view.currentState?.reload();

  Future<void> _assign() async {
    final ids = _picked.toList();
    final rider = await showRiderPicker(
      context,
      title: ids.length == 1
          ? 'Assign to a rider'
          : 'Assign ${ids.length} parcels',
      message: ids.length == 1
          ? null
          : 'A rider gets only as many as they can hold. The rest are skipped.',
      load: () => pickableCourierRiders(
        _api,
        parcelId: ids.length == 1 ? ids.first : null,
      ),
    );
    if (rider == null || !mounted) return;
    final ok = await runRiderAction(context, () => _api.assign(ids, rider.id));
    if (!ok || !mounted) return;
    setState(_picked.clear);
    await _reload();
  }

  Future<void> _autoAssign() async {
    final ok = await runRiderAction(
      context,
      () =>
          _api.autoAssign(parcelIds: _picked.isEmpty ? null : _picked.toList()),
    );
    if (!ok || !mounted) return;
    setState(_picked.clear);
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: const Text('Dispatch'),
        actions: [
          TextButton.icon(
            onPressed: _autoAssign,
            icon: const Icon(LucideIcons.wand, size: 18),
            label: Text(
              _picked.isEmpty ? 'Auto-assign' : 'Auto-assign ${_picked.length}',
            ),
          ),
        ],
      ),
      body: LoadView<DispatchBoard>(
        key: _view,
        load: () => _api.dispatch(_state),
        refreshEvery: const Duration(seconds: 10),
        builder: (context, board) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(bottom: AppSpace.lg),
                children: [
                  RiderTabs<DispatchState>(
                    values: DispatchState.values,
                    selected: _state,
                    labelOf: (state) => state.label,
                    countOf: board.count,
                    onSelected: (state) {
                      setState(() {
                        _state = state;
                        _picked.clear();
                      });
                      _reload();
                    },
                  ),
                  if (board.jobs.isEmpty)
                    SizedBox(
                      height: 320,
                      child: EmptyState(
                        icon: LucideIcons.navigation,
                        title: _state == DispatchState.unassigned
                            ? 'Nothing waiting for a rider'
                            : 'No pickup jobs here',
                        message: 'Pickups that no rider accepted wait in Unassigned.',
                      ),
                    ),
                  for (final job in board.jobs)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.lg,
                        AppSpace.sm,
                        AppSpace.lg,
                        0,
                      ),
                      child: _JobRow(
                        job: job,
                        selected: _picked.contains(job.id),
                        onSelected: (on) => setState(
                          () =>
                              on ? _picked.add(job.id) : _picked.remove(job.id),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            if (_picked.isNotEmpty)
              BottomActions(
                children: [
                  SheetButton(
                    label: 'Assign ${_picked.length} to a rider',
                    icon: LucideIcons.bike,
                    onPressed: _assign,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _JobRow extends StatelessWidget {
  const _JobRow({
    required this.job,
    required this.selected,
    required this.onSelected,
  });

  final DispatchJob job;
  final bool selected;
  final ValueChanged<bool> onSelected;

  (String, StatusTone) get _status => switch (job.state) {
    'assigned' => ('Assigned', StatusTone.blue),
    'offering' => ('Being offered', StatusTone.amber),
    _ => ('Unassigned', StatusTone.amber),
  };

  @override
  Widget build(BuildContext context) {
    return ParcelRowCard(
      trackingNumber: job.trackingNumber,
      status: _status,
      selected: selected,
      onSelected: onSelected,
      lines: [
        [?job.shopName, ?job.pickupArea].join(' · '),
        if (job.dropoffArea != null) 'To ${job.dropoffArea}',
        [
          if (job.codAmount != null) 'COD ${formatPeso(job.codAmount)}',
          'Ready ${Fmt.waited(job.readyAt)} ago',
          if (job.attempts > 0) 'Tries ${job.attempts} of ${job.maxAttempts}',
        ].join(' · '),
        if (job.riderName != null) 'Rider: ${job.riderName}',
      ],
      footer: job.offerRider != null && job.offerExpiresAt != null
          ? _OfferClock(rider: job.offerRider!, until: job.offerExpiresAt!)
          : null,
    );
  }
}

/// Seconds left on an open offer, ticking.
class _OfferClock extends StatefulWidget {
  const _OfferClock({required this.rider, required this.until});

  final String rider;
  final DateTime until;

  @override
  State<_OfferClock> createState() => _OfferClockState();
}

class _OfferClockState extends State<_OfferClock> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.until.difference(DateTime.now()).inSeconds;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.xs),
      child: Text(
        'Offered to ${widget.rider} · ${left < 0 ? 0 : left}s left',
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: StatusTone.amber.foreground,
        ),
      ),
    );
  }
}
