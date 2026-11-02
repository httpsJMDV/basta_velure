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
import 'courier_kit.dart';

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
          padding: EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.lg,
            AppSpace.lg,
            AppSpace.lg + dockInset(context),
          ),
          children: [
            _DayPanel(day: day),
            const SizedBox(height: AppSpace.lg),
            HubSection(
              title: 'Waiting for your confirmation (${day.pending.length})',
              note: 'Cash counts as handed over only once you confirm it here.',
            ),
            if (day.pending.isEmpty)
              const RiderCard(
                child: Row(
                  children: [
                    Icon(LucideIcons.circleCheck, color: kDeliveredGreen),
                    SizedBox(width: AppSpace.sm),
                    Expanded(
                      child: Text(
                        'No remittances to confirm.',
                        style: RiderText.body,
                      ),
                    ),
                  ],
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
            const HubSection(
              title: 'Riders on this day',
              note: 'What each one collected, handed over, and still holds.',
            ),
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

/// The day's cash on the portal's dark panel: what came in, and how much of it reached the company.
class _DayPanel extends StatelessWidget {
  const _DayPanel({required this.day});

  final CodDay day;

  @override
  Widget build(BuildContext context) {
    // Only for the bar's width. Every amount on screen is the one the server sent.
    final collected = double.tryParse(day.collected) ?? 0;
    final remitted = double.tryParse(day.remitted) ?? 0;
    final short = day.riders.where((rider) => rider.shortfall).length;
    final dim = AppColors.white.withValues(alpha: 0.72);
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Collected', style: TextStyle(fontSize: 13, color: dim)),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: PesoText(
              day.collected,
              style: const TextStyle(
                fontSize: 32,
                height: 1.1,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: AppColors.white,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: AppSpace.md),
          CourierMeter(
            value: collected <= 0 ? 0 : remitted / collected,
            color: AppColors.heroEmerald,
            track: AppColors.white.withValues(alpha: 0.14),
            height: 8,
            label:
                'Remitted ${formatPeso(day.remitted)} of ${formatPeso(day.collected)}',
          ),
          const SizedBox(height: AppSpace.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _DarkFigure('Remitted', day.remitted)),
              const SizedBox(width: AppSpace.md),
              Expanded(child: _DarkFigure('Difference', day.difference)),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Text(
            [
              '${day.riders.length} rider${day.riders.length == 1 ? '' : 's'} with cash',
              '${day.pending.length} to confirm',
              if (short > 0) '$short short',
            ].join(' · '),
            style: TextStyle(fontSize: 13, color: dim),
          ),
        ],
      ),
    );
  }
}

class _DarkFigure extends StatelessWidget {
  const _DarkFigure(this.label, this.amount);

  final String label;
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: AppColors.white.withValues(alpha: 0.72),
          ),
        ),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: PesoText(
            amount,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.white,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

class _PendingCard extends StatelessWidget {
  const _PendingCard({required this.remittance, required this.onConfirm});

  final Remittance remittance;
  final Future<void> Function() onConfirm;

  @override
  Widget build(BuildContext context) {
    final name = remittance.rider ?? 'Rider';
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              HubAvatar(name: name, size: 42),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: RiderText.name),
                    Text(
                      'Sent ${Fmt.dayTime(remittance.submittedAt)}',
                      style: HubText.small,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              PesoText(
                remittance.amount,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray900,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          if (remittance.reference != null ||
              remittance.balanceAtSubmission != null) ...[
            const SizedBox(height: AppSpace.sm),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (remittance.reference != null)
                  HubMetaChip(
                    icon: LucideIcons.hash,
                    label: remittance.reference!,
                  ),
                if (remittance.balanceAtSubmission != null)
                  HubMetaChip(
                    icon: LucideIcons.wallet,
                    label:
                        'Balance when sent ${formatPeso(remittance.balanceAtSubmission)}',
                  ),
              ],
            ),
          ],
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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              HubAvatar(name: rider.rider, size: 36),
              const SizedBox(width: AppSpace.md),
              Expanded(child: Text(rider.rider, style: RiderText.name)),
              if (rider.shortfall)
                const StatusChip(label: 'Shortfall', tone: StatusTone.rose),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(rider.collected),
                  label: 'Collected',
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(rider.remitted),
                  label: 'Remitted',
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: HubSummaryItem(
                  value: formatPeso(rider.difference),
                  label: 'Difference',
                  color: rider.shortfall
                      ? StatusTone.rose.foreground
                      : AppColors.gray900,
                ),
              ),
            ],
          ),
          const Divider(height: AppSpace.xl),
          Row(
            children: [
              const Expanded(child: Text('Balance now', style: HubText.small)),
              PesoText(
                rider.balance,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray900,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
