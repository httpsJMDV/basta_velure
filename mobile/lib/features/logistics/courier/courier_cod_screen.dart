import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';

/// Cash on delivery (D7): what each rider collected and handed over on one day, and the remittances waiting for the
/// company. A remittance counts only once it is confirmed, so confirming asks first. Exports stay on the website.
class CourierCodScreen extends ConsumerStatefulWidget {
  const CourierCodScreen({super.key});

  @override
  ConsumerState<CourierCodScreen> createState() => _CourierCodScreenState();
}

class _CourierCodScreenState extends ConsumerState<CourierCodScreen> {
  final _view = GlobalKey<LoadViewState<CodDay>>();
  late DateTime _day = Rules.manilaToday();

  CourierApi get _api => ref.read(courierApiProvider);

  Future<void> _pickDay() async {
    final today = Rules.manilaToday();
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(today.year - 5),
      lastDate: today,
      initialEntryMode: DatePickerEntryMode.calendarOnly,
      helpText: 'Day',
    );
    if (picked == null || !mounted) return;
    setState(() => _day = picked);
    await _view.currentState?.reload();
  }

  Future<void> _confirm(Remittance remittance) async {
    final confirmed = await confirmAction(
      context,
      title: 'Confirm you received ${formatPeso(remittance.amount)}?',
      message: remittance.isShort
          ? 'It is short by ${formatPeso(remittance.shortfall)}. The rest stays on ${remittance.rider ?? 'the rider'}\'s balance. This can\'t be undone.'
          : 'This lowers ${remittance.rider ?? 'the rider'}\'s balance. This can\'t be undone.',
      confirmLabel: 'Confirm received',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(
      context,
      () => _api.confirmRemittance(remittance.id),
    );
    if (ok) await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: const Text('COD'),
        actions: [
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: AppColors.gray900),
            onPressed: _pickDay,
            icon: const Icon(LucideIcons.calendar, size: 18),
            label: Text(
              Fmt.date(DateTime.utc(_day.year, _day.month, _day.day)),
            ),
          ),
        ],
      ),
      body: LoadView<CodDay>(
        key: _view,
        load: () => _api.cod(date: Rules.ymd(_day)),
        builder: (context, day) => ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            RiderCard(
              child: Column(
                children: [
                  _Total('Collected', day.collected),
                  _Total('Remitted', day.remitted),
                  _Total('Difference', day.difference, strong: true),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            RiderSectionTitle(
              'Waiting for your confirmation (${day.pending.length})',
            ),
            if (day.pending.isEmpty)
              const RiderCard(
                child: Text(
                  'No remittances to confirm.',
                  style: RiderText.body,
                ),
              ),
            for (final remittance in day.pending) ...[
              _PendingCard(
                remittance: remittance,
                onConfirm: () => _confirm(remittance),
              ),
              const SizedBox(height: AppSpace.sm),
            ],
            const SizedBox(height: AppSpace.lg),
            const RiderSectionTitle('Riders on this day'),
            if (day.riders.isEmpty)
              const RiderCard(
                child: Text(
                  'No cash on delivery this day.',
                  style: RiderText.body,
                ),
              ),
            for (final rider in day.riders) ...[
              _RiderDayCard(rider: rider),
              const SizedBox(height: AppSpace.sm),
            ],
          ],
        ),
      ),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total(this.label, this.amount, {this.strong = false});

  final String label;
  final String amount;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
      child: Row(
        children: [
          Expanded(child: Text(label, style: RiderText.body)),
          PesoText(
            amount,
            style: TextStyle(
              fontSize: strong ? 20 : 17,
              fontWeight: FontWeight.w800,
              color: AppColors.gray900,
            ),
          ),
        ],
      ),
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.remittance, required this.onConfirm});

  final Remittance remittance;
  final Future<void> Function() onConfirm;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(remittance.rider ?? 'Rider', style: RiderText.name),
              ),
              PesoText(
                remittance.amount,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray900,
                ),
              ),
            ],
          ),
          Text(
            [
              ?remittance.reference,
              if (remittance.balanceAtSubmission != null)
                'Balance when sent ${formatPeso(remittance.balanceAtSubmission)}',
              Fmt.dayTime(remittance.submittedAt),
            ].join(' · '),
            style: const TextStyle(fontSize: 14, color: AppColors.gray600),
          ),
          if (remittance.isShort) ...[
            const SizedBox(height: AppSpace.sm),
            MessageBanner(
              message: 'Short by ${formatPeso(remittance.shortfall)}',
            ),
          ],
          const SizedBox(height: AppSpace.md),
          SubmitButton(
            label: 'Confirm received',
            busyLabel: 'Confirming…',
            icon: LucideIcons.check,
            onPressed: onConfirm,
          ),
        ],
      ),
    );
  }
}

class _RiderDayCard extends StatelessWidget {
  const _RiderDayCard({required this.rider});

  final CodRiderDay rider;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(rider.rider, style: RiderText.name)),
              if (rider.shortfall)
                const StatusChip(label: 'Shortfall', tone: StatusTone.rose),
            ],
          ),
          _Total('Collected', rider.collected),
          _Total('Remitted', rider.remitted),
          _Total('Difference', rider.difference),
          _Total('Balance now', rider.balance),
        ],
      ),
    );
  }
}
