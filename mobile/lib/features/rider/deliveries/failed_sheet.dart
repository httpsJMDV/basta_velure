import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/rider_widgets.dart';
import 'rider_sheet.dart';

/// Delivery failed (C5): a reason from the server's list, and a note when the reason needs one ("Other"). Returns the
/// server's message ("attempt 2 of 3", or that the parcel goes back to the seller), or null if closed.
Future<String?> showFailedSheet(BuildContext context, DeliveryStop stop) =>
    showRiderSheet<String>(context, (_) => FailedSheet(stop: stop));

class FailedSheet extends ConsumerStatefulWidget {
  const FailedSheet({super.key, required this.stop});

  final DeliveryStop stop;

  @override
  ConsumerState<FailedSheet> createState() => _FailedSheetState();
}

class _FailedSheetState extends ConsumerState<FailedSheet> {
  final _form = GlobalKey<FormState>();
  final _note = TextEditingController();
  List<FailureReason>? _reasons;
  ApiFailure? _loadFailure;
  FailureReason? _reason;
  String? _reasonError;
  ApiFailure? _failure;

  /// "Not at home" and "could not contact" need a call or a text on this trip first (the server checks it too).
  late bool _contacted = widget.stop.buyerContacted;
  bool _contacting = false;

  bool get _contactFirst =>
      _reason != null && widget.stop.contactFirstReasons.contains(_reason!.code);

  Future<void> _contact({required bool sms}) async {
    setState(() {
      _contacting = true;
      _failure = null;
    });
    try {
      await ref
          .read(riderApiProvider)
          .contactBuyer(widget.stop.trackingNumber, method: sms ? 'sms' : 'call');
      if (!mounted) return;
      setState(() => _contacted = true);
      if (widget.stop.recipientPhone.isNotEmpty) {
        await openPhoneApp(context, widget.stop.recipientPhone, sms: sms);
      }
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    } finally {
      if (mounted) setState(() => _contacting = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadFailure = null);
    try {
      final reasons = await ref.read(riderApiProvider).failureReasons();
      if (mounted) setState(() => _reasons = reasons);
    } catch (error) {
      if (mounted) setState(() => _loadFailure = ApiFailure.from(error));
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final reason = _reason;
    final formOk = _form.currentState!.validate();
    setState(() {
      _failure = null;
      _reasonError = reason == null ? 'Choose what happened.' : null;
    });
    if (reason == null || !formOk) return;

    final confirmed = await confirmAction(
      context,
      title: 'Record failed delivery?',
      message:
          '${reason.label}. The hub sees this and decides what happens next.',
      confirmLabel: 'Record it',
      destructive: true,
    );
    if (!confirmed || !mounted) return;

    final note = _note.text.trim();
    try {
      final result = await ref
          .read(riderApiProvider)
          .failed(
            widget.stop.trackingNumber,
            reason: reason.code,
            note: note.isEmpty ? null : note,
          );
      if (mounted) Navigator.of(context).pop(result.message);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _failure = failure;
        _reasonError = failure.errorFor('reason');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final reasons = _reasons;
    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    final noteRequired = _reason?.requiresNote ?? false;

    return RiderSheetFrame(
      title: 'Delivery failed',
      subtitle: '${widget.stop.recipientName} · ${widget.stop.trackingNumber}',
      footer: [
        SubmitButton(
          label: 'Record failed delivery',
          busyLabel: 'Sending…',
          icon: LucideIcons.circleX,
          color: StatusTone.rose.foreground,
          onPressed: reasons == null || (_contactFirst && !_contacted) ? null : _submit,
        ),
      ],
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (banner != null) ...[
              MessageBanner(message: banner),
              const SizedBox(height: AppSpace.lg),
            ],
            const Text(
              'What happened?',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
            const SizedBox(height: AppSpace.sm),
            if (_loadFailure != null)
              SizedBox(
                height: 240,
                child: ErrorRetry(failure: _loadFailure!, onRetry: _load),
              )
            else if (reasons == null)
              const Padding(
                padding: EdgeInsets.all(AppSpace.xl),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              RadioGroup<String>(
                groupValue: _reason?.code,
                onChanged: (code) => setState(() {
                  _reason = reasons.firstWhere((r) => r.code == code);
                  _reasonError = null;
                }),
                child: Column(
                  children: [
                    for (final r in reasons)
                      RadioListTile<String>(
                        value: r.code,
                        contentPadding: EdgeInsets.zero,
                        title: Text(
                          r.label,
                          style: const TextStyle(
                            fontSize: 16,
                            color: AppColors.ink,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            if (_reasonError != null)
              Text(
                _reasonError!,
                style: TextStyle(
                  color: StatusTone.rose.foreground,
                  fontSize: 13,
                ),
              ),
            if (_contactFirst) ...[
              const SizedBox(height: AppSpace.md),
              _contacted
                  ? const MessageBanner(
                      message: 'You tried to reach the buyer on this trip.',
                      tone: StatusTone.emerald,
                    )
                  : Container(
                      padding: const EdgeInsets.all(AppSpace.md),
                      decoration: BoxDecoration(
                        color: StatusTone.amber.background,
                        border: Border.all(color: StatusTone.amber.border),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Call or text the buyer first',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: StatusTone.amber.foreground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'They may be nearby. The buyer is told you are trying to reach them.',
                            style: TextStyle(fontSize: 14, color: AppColors.ink),
                          ),
                          const SizedBox(height: AppSpace.sm),
                          Row(
                            children: [
                              Expanded(
                                child: FilledButton.icon(
                                  onPressed: _contacting ? null : () => _contact(sms: false),
                                  icon: const Icon(LucideIcons.phone, size: 18),
                                  label: const Text('Call'),
                                ),
                              ),
                              const SizedBox(width: AppSpace.sm),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _contacting ? null : () => _contact(sms: true),
                                  icon: const Icon(LucideIcons.messageSquare, size: 18),
                                  label: const Text('Text'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
            ],
            const SizedBox(height: AppSpace.lg),
            AppTextField(
              label: noteRequired ? 'Note (required)' : 'Note (optional)',
              hint: 'Say what happened',
              controller: _note,
              minLines: 2,
              maxLines: 5,
              maxLength: 500,
              showCounter: true,
              textCapitalization: TextCapitalization.sentences,
              validator: (value) => Rules.words(
                value,
                'The note',
                min: 5,
                max: 500,
                required: noteRequired,
              ),
              serverError: failure?.errorFor('note'),
            ),
          ],
        ),
      ),
    );
  }
}
