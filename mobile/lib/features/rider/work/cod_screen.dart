import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/rider_widgets.dart';

/// Cash on delivery (C7): what the rider holds for the courier company, the orders behind it, and handing it over.
/// A remittance stays Pending until the company confirms it.
class CodScreen extends ConsumerStatefulWidget {
  const CodScreen({super.key});

  @override
  ConsumerState<CodScreen> createState() => _CodScreenState();
}

class _CodScreenState extends ConsumerState<CodScreen> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  CodSummary? _cod;
  ApiFailure? _loadFailure;
  ApiFailure? _failure;

  /// One key per hand-over. A retry after a network error sends the same key, so the money is never counted twice.
  String _idempotencyKey = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final cod = await ref.read(riderApiProvider).cod();
      if (mounted) {
        setState(() {
          _cod = cod;
          _loadFailure = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _loadFailure = ApiFailure.from(error));
    }
  }

  Future<void> _remit() async {
    FocusScope.of(context).unfocus();
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    final amount = _amount.text.trim();
    final confirmed = await confirmAction(
      context,
      title: 'Hand over ${formatPeso(amount)}?',
      message: 'Only send this once you gave the cash to your courier company or sent it to them.',
      confirmLabel: 'Hand over',
    );
    if (!confirmed || !mounted) return;
    try {
      final reference = Rules.squish(_reference.text);
      final message = await ref
          .read(riderApiProvider)
          .remit(
            amount: amount,
            reference: reference.isEmpty ? null : reference,
            idempotencyKey: _idempotencyKey,
          );
      if (!mounted) return;
      showRiderMessage(context, message);
      _amount.clear();
      _reference.clear();
      // Done: the next hand-over is a new one.
      _idempotencyKey = const Uuid().v4();
      await _load();
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cod = _cod;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Cash on delivery')),
      body: cod == null
          ? (_loadFailure != null
                ? ErrorRetry(failure: _loadFailure!, onRetry: _load)
                : const SkeletonList(count: 3))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.lg),
                children: [
                  _Balance(cod: cod),
                  const SizedBox(height: AppSpace.lg),
                  if (cod.canRemitValue > 0)
                    _remitForm(cod)
                  else
                    const MessageBanner(
                      tone: StatusTone.emerald,
                      icon: LucideIcons.circleCheck,
                      message: 'Nothing to hand over right now.',
                    ),
                  const SizedBox(height: AppSpace.xl),
                  if (cod.remittances.isNotEmpty) ...[
                    const RiderSectionTitle('Hand-overs'),
                    for (final r in cod.remittances)
                      _RemittanceRow(remittance: r),
                    const SizedBox(height: AppSpace.lg),
                  ],
                  if (cod.collections.isNotEmpty) ...[
                    const RiderSectionTitle('Cash collected'),
                    RiderCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpace.lg,
                        vertical: AppSpace.sm,
                      ),
                      child: Column(
                        children: [
                          for (final c in cod.collections)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          c.trackingNumber,
                                          style: RiderText.mono,
                                        ),
                                        Text(
                                          Fmt.dateTime(c.collectedAt),
                                          style: RiderText.label,
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    formatPeso(c.amount),
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _remitForm(CodSummary cod) {
    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    return RiderCard(
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Hand over cash', style: RiderText.name),
            Text(
              'You can hand over up to ${formatPeso(cod.canRemit)}.',
              style: RiderText.body,
            ),
            const SizedBox(height: AppSpace.md),
            if (banner != null) ...[
              MessageBanner(message: banner),
              const SizedBox(height: AppSpace.md),
            ],
            AppTextField(
              label: 'Amount (₱)',
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [Only.pesos],
              validator: (value) =>
                  Rules.remittanceAmount(value, max: cod.canRemitValue),
              serverError: failure?.errorFor('amount'),
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Reference (optional)',
              hint: 'GCash or bank reference',
              controller: _reference,
              inputFormatters: [Only.referenceChars],
              maxLength: 40,
              validator: Rules.paymentReference,
              serverError: failure?.errorFor('reference'),
            ),
            const SizedBox(height: AppSpace.lg),
            SubmitButton(
              label: 'Hand over',
              busyLabel: 'Sending…',
              icon: LucideIcons.banknote,
              onPressed: _remit,
            ),
          ],
        ),
      ),
    );
  }
}

class _Balance extends StatelessWidget {
  const _Balance({required this.cod});

  final CodSummary cod;

  @override
  Widget build(BuildContext context) {
    final tone = StatusTone.amber;
    return Container(
      padding: const EdgeInsets.all(AppSpace.xl),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Cash you hold', style: RiderText.label),
          Text(
            formatPeso(cod.outstanding),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: Color(0xFF78350F),
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            'Collected ${formatPeso(cod.collected)} · Confirmed ${formatPeso(cod.confirmed)} · Pending ${formatPeso(cod.pending)}',
            style: const TextStyle(fontSize: 14, color: Color(0xFF78350F)),
          ),
        ],
      ),
    );
  }
}

class _RemittanceRow extends StatelessWidget {
  const _RemittanceRow({required this.remittance});

  final CodRemittance remittance;

  @override
  Widget build(BuildContext context) {
    final short = double.tryParse(remittance.shortfall) ?? 0;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.sm),
      child: RiderCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatPeso(remittance.amount),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    [
                      Fmt.dateTime(remittance.submittedAt),
                      ?remittance.reference,
                    ].join(' · '),
                    style: RiderText.label,
                  ),
                  if (short > 0)
                    Text(
                      'Short by ${formatPeso(remittance.shortfall)}',
                      style: TextStyle(
                        fontSize: 14,
                        color: StatusTone.rose.foreground,
                      ),
                    ),
                ],
              ),
            ),
            StatusChip(
              label: remittance.isConfirmed ? 'Confirmed' : 'Pending',
              tone: remittance.isConfirmed
                  ? StatusTone.emerald
                  : StatusTone.amber,
            ),
          ],
        ),
      ),
    );
  }
}
