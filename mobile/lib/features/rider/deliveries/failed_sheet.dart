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
          onPressed: reasons == null ? null : _submit,
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
                color: AppColors.gray900,
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
                            color: AppColors.gray900,
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
