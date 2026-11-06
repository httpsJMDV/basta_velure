import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';
import '../widgets/buyer_widgets.dart';

/// A refund the shop sends by hand (docs/api/refunds.md). The buyer paid the shop directly (GCash, or cash to the
/// rider), so they give a GCash account, then confirm the money arrived or report that it did not.
class RefundCard extends ConsumerWidget {
  const RefundCard({super.key, required this.order, required this.onChanged});

  final Order order;

  /// Reload the order after any change.
  final VoidCallback onChanged;

  Refund get refund => order.refund!;

  StatusTone get _tone => switch (refund.status) {
    'received' => StatusTone.emerald,
    'not_received' => StatusTone.blue,
    _ => StatusTone.amber,
  };

  String get _explanation => switch (refund.status) {
    'awaiting_account' =>
      'You paid the shop directly, so the shop sends your refund to a GCash account. Tell us which one.',
    'awaiting_shop' =>
      'The shop sends it to ${refund.gcashNumber} (${refund.gcashName})'
          '${refund.sendBy != null ? ' by ${Fmt.dateTime(refund.sendBy)}' : ''}.'
          '${refund.overdue ? ' It is late, and Loved-IT has been told.' : ''}',
    'sent' =>
      'The shop sent it to ${refund.gcashNumber}, reference ${refund.reference}. Check your GCash. '
          'If you do not report a problem by ${Fmt.dateTime(refund.confirmBy)}, it counts as received.',
    'not_received' =>
      'You said it did not arrive. Loved-IT is checking the shop\'s receipt and will tell you what happens next.',
    'received' => refund.autoConfirmed
        ? 'Counted as received: no problem was reported in time.'
        : 'Received ${Fmt.dateTime(refund.receivedAt)}.',
    _ => '',
  };

  Future<void> _account(BuildContext context) async {
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AccountSheet(order: order),
    );
    if (message != null && context.mounted) {
      onChanged();
      showSnack(context, message);
    }
  }

  Future<void> _confirm(BuildContext context, WidgetRef ref) async {
    final ok = await confirmAction(
      context,
      title: 'Did the refund arrive?',
      message: 'Only confirm once ${formatPeso(refund.amount)} is in your GCash.',
      confirmLabel: 'Yes, I received it',
    );
    if (!ok) return;
    try {
      final message = await ref.read(buyerApiProvider).confirmRefund(order.id);
      onChanged();
      if (context.mounted) showSnack(context, message);
    } catch (error) {
      if (context.mounted) showSnack(context, ApiFailure.from(error).message, error: true);
    }
  }

  Future<void> _report(BuildContext context) async {
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ReportSheet(order: order),
    );
    if (message != null && context.mounted) {
      onChanged();
      showSnack(context, message);
    }
  }

  Future<void> _receipt(BuildContext context, WidgetRef ref) async {
    await showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(AppSpace.lg),
        child: FutureBuilder<List<int>>(
          future: ref.read(buyerApiProvider).refundReceipt(refund.id),
          builder: (context, snapshot) => Padding(
            padding: const EdgeInsets.all(AppSpace.md),
            child: snapshot.hasError
                ? const Text('The receipt could not be loaded.')
                : !snapshot.hasData
                ? const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()))
                : InteractiveViewer(child: Image.memory(Uint8List.fromList(snapshot.data!))),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: BlockTitle('Refund ${formatPeso(refund.amount)}')),
              StatusChip(label: refund.statusLabel, tone: _tone),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Text(_explanation, style: const TextStyle(color: AppColors.stone700, height: 1.45)),
          if (refund.resolutionNote != null && !refund.done) ...[
            const SizedBox(height: AppSpace.sm),
            MessageBanner(message: 'Loved-IT: ${refund.resolutionNote}', tone: StatusTone.blue),
          ],
          const SizedBox(height: AppSpace.md),
          Wrap(
            spacing: AppSpace.sm,
            runSpacing: AppSpace.sm,
            children: [
              if (refund.status == 'awaiting_account')
                FilledButton.icon(
                  onPressed: () => _account(context),
                  icon: const Icon(LucideIcons.wallet, size: 18),
                  label: const Text('Add GCash account'),
                ),
              if (refund.status == 'awaiting_shop' && refund.canSetAccount)
                OutlinedButton(onPressed: () => _account(context), child: const Text('Change account')),
              if (refund.canConfirm)
                FilledButton(onPressed: () => _confirm(context, ref), child: const Text('I received it')),
              if (refund.canReport)
                OutlinedButton.icon(
                  onPressed: () => _report(context),
                  icon: const Icon(LucideIcons.circleAlert, size: 18),
                  label: const Text('It did not arrive'),
                ),
              if (refund.hasReceipt)
                TextButton.icon(
                  onPressed: () => _receipt(context, ref),
                  icon: const Icon(LucideIcons.receipt, size: 18),
                  label: const Text('Shop\'s receipt'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccountSheet extends ConsumerStatefulWidget {
  const _AccountSheet({required this.order});

  final Order order;

  @override
  ConsumerState<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends ConsumerState<_AccountSheet> {
  final _form = GlobalKey<FormState>();
  late final _number = TextEditingController(text: widget.order.refund?.gcashNumber ?? '');
  late final _name = TextEditingController(text: widget.order.refund?.gcashName ?? '');
  ApiFailure? _failure;

  @override
  void dispose() {
    _number.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _failure = null);
    try {
      final message = await ref.read(buyerApiProvider).setRefundAccount(
        widget.order.id,
        gcashNumber: Rules.normalizeGcashNumber(_number.text) ?? _number.text.trim(),
        gcashName: Rules.squish(_name.text),
      );
      if (mounted) Navigator.of(context).pop(message);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetFrame(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Where should the refund go?', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpace.xs),
            const Text(
              'The shop sends it to this GCash account. You can change it until the shop has sent it.',
              style: TextStyle(color: AppColors.stone600),
            ),
            const SizedBox(height: AppSpace.md),
            if (_failure != null && _failure!.fieldErrors.isEmpty) MessageBanner(message: _failure!.message),
            AppTextField(
              label: 'GCash number',
              controller: _number,
              hint: '0917 123 4567',
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              validator: Rules.gcashNumber,
              serverError: _failure?.errorFor('gcash_number'),
            ),
            const SizedBox(height: AppSpace.sm),
            AppTextField(
              label: 'Name on the account',
              controller: _name,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              validator: Rules.gcashAccountName,
              serverError: _failure?.errorFor('gcash_name'),
            ),
            const SizedBox(height: AppSpace.lg),
            SubmitButton(label: 'Save account', busyLabel: 'Saving…', onPressed: _save),
          ],
        ),
      ),
    );
  }
}

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.order});

  final Order order;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  final _form = GlobalKey<FormState>();
  final _note = TextEditingController();
  ApiFailure? _failure;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _failure = null);
    try {
      final message = await ref.read(buyerApiProvider).reportRefund(widget.order.id, _note.text.trim());
      if (mounted) Navigator.of(context).pop(message);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final refund = widget.order.refund!;
    return _SheetFrame(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('The refund did not arrive', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpace.xs),
            Text(
              'Loved-IT compares the shop\'s receipt (reference ${refund.reference}) with your GCash. Say what you see in your GCash history.',
              style: const TextStyle(color: AppColors.stone600),
            ),
            const SizedBox(height: AppSpace.md),
            if (_failure != null && _failure!.fieldErrors.isEmpty) MessageBanner(message: _failure!.message),
            AppTextField(
              label: 'What happened?',
              controller: _note,
              minLines: 3,
              maxLines: 5,
              maxLength: 500,
              showCounter: true,
              textCapitalization: TextCapitalization.sentences,
              validator: (value) => Rules.words(value, 'What happened', min: 10, max: 500),
              serverError: _failure?.errorFor('note'),
            ),
            const SizedBox(height: AppSpace.lg),
            SubmitButton(label: 'Send to Loved-IT', busyLabel: 'Sending…', onPressed: _send),
          ],
        ),
      ),
    );
  }
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom + MediaQuery.paddingOf(context).bottom + AppSpace.lg,
      ),
      child: SingleChildScrollView(child: child),
    );
  }
}
