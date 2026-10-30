import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/rider_widgets.dart';
import 'rider_sheet.dart';

/// Confirm delivery, as a bottom sheet with numbered steps like the website's: 1 the photo, 2 a second photo
/// (optional), 3 the cash for COD. There is no delivery code. Returns the server's message, or null if closed.
Future<String?> showDeliveredSheet(BuildContext context, DeliveryStop stop) =>
    showRiderSheet<String>(context, (_) => DeliveredSheet(stop: stop));

class DeliveredSheet extends ConsumerStatefulWidget {
  const DeliveredSheet({super.key, required this.stop});

  final DeliveryStop stop;

  @override
  ConsumerState<DeliveredSheet> createState() => _DeliveredSheetState();
}

class _DeliveredSheetState extends ConsumerState<DeliveredSheet> {
  final _form = GlobalKey<FormState>();
  final _cash = TextEditingController();
  final _receivedBy = TextEditingController();
  final _picker = PhotoPicker();

  PickedPhoto? _photo;
  PickedPhoto? _photo2;
  String? _photoError;
  String? _photo2Error;
  ApiFailure? _failure;
  (int, int)? _progress;

  DeliveryStop get _stop => widget.stop;

  @override
  void dispose() {
    _cash.dispose();
    _receivedBy.dispose();
    super.dispose();
  }

  /// Camera only, never the gallery, so an old photo can't be used as proof.
  Future<void> _take({required bool second}) async {
    try {
      final photo = await _picker.takePhoto(
        context,
        reason: 'Take a photo of the parcel at the door as proof of delivery.',
        kind: UploadKind.proofPhoto,
      );
      if (photo == null || !mounted) return;
      setState(() {
        if (second) {
          _photo2 = photo;
        } else {
          _photo = photo;
          _photoError = null;
        }
        // The server refuses the same picture twice.
        _photo2Error =
            _photo != null &&
                _photo2 != null &&
                listEquals(_photo2!.bytes, _photo!.bytes)
            ? 'Take a second, different photo.'
            : null;
      });
    } on PhotoRejected catch (e) {
      if (mounted) {
        setState(
          () => second ? _photo2Error = e.message : _photoError = e.message,
        );
      }
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final formOk = _form.currentState!.validate();
    setState(() {
      _failure = null;
      if (_photo == null) {
        _photoError =
            'Take a photo of the parcel at the door as proof of delivery.';
      }
    });
    if (!formOk || _photo == null || _photo2Error != null) return;

    final confirmed = await confirmAction(
      context,
      title: 'Mark as delivered?',
      message: _stop.isCod
          ? 'You collected ${formatPeso(_stop.codAmount)} cash from ${_stop.recipientName}. This can\'t be undone.'
          : 'The parcel was handed to ${_stop.recipientName}. This can\'t be undone.',
      confirmLabel: 'Delivered',
    );
    if (!confirmed || !mounted) return;

    try {
      final result = await ref
          .read(riderApiProvider)
          .delivered(
            _stop.trackingNumber,
            photo: _photo!,
            secondPhoto: _photo2,
            receivedBy: Rules.squish(_receivedBy.text),
            codAmount: _stop.isCod ? _cash.text.trim() : null,
            onSendProgress: (sent, total) {
              if (mounted) setState(() => _progress = (sent, total));
            },
          );
      if (!mounted) return;
      Navigator.of(context).pop(
        result.pay == null
            ? result.message
            : '${result.message} You earned ${formatPeso(result.pay)}.',
      );
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _progress = null;
        _failure = failure;
        _photoError = failure.errorFor('proof_photo') ?? _photoError;
        _photo2Error = failure.errorFor('proof_photo_2') ?? _photo2Error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    var step = 0;

    return RiderSheetFrame(
      title: 'Confirm delivery',
      subtitle: '${_stop.recipientName} · ${_stop.trackingNumber}',
      footer: [
        if (_progress != null) ...[
          UploadProgress(sent: _progress!.$1, total: _progress!.$2),
          const SizedBox(height: AppSpace.sm),
        ],
        SubmitButton(
          label: 'Delivered',
          busyLabel: 'Sending…',
          icon: LucideIcons.circleCheck,
          color: kDeliveredGreen,
          onPressed: _submit,
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
            SheetStep(
              number: ++step,
              title: 'Photo of the parcel at the door',
              child: _PhotoBox(
                photo: _photo,
                error: _photoError,
                onTake: () => _take(second: false),
              ),
            ),
            SheetStep(
              number: ++step,
              title: 'A second photo (optional)',
              child: _PhotoBox(
                photo: _photo2,
                error: _photo2Error,
                onTake: () => _take(second: true),
                onRemove: _photo2 == null
                    ? null
                    : () => setState(() {
                        _photo2 = null;
                        _photo2Error = null;
                      }),
              ),
            ),
            if (_stop.isCod)
              SheetStep(
                number: ++step,
                title: 'Cash collected',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    CodBlock(
                      amount: _stop.codAmount!,
                      prefix: 'Collect exactly',
                    ),
                    const SizedBox(height: AppSpace.md),
                    AppTextField(
                      label: 'Cash you collected (₱)',
                      controller: _cash,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [Only.pesos],
                      validator: (value) =>
                          Rules.codCollected(value, _stop.codAmount!),
                      serverError: failure?.errorFor('cod_amount'),
                    ),
                  ],
                ),
              ),
            SheetStep(
              number: ++step,
              title: 'Who received it (optional)',
              last: true,
              child: AppTextField(
                label: 'Received by',
                hint: 'Full name',
                controller: _receivedBy,
                textCapitalization: TextCapitalization.words,
                inputFormatters: [Only.nameChars],
                maxLength: 50,
                validator: (value) => Rules.name(
                  value,
                  'The name of who received it',
                  required: false,
                ),
                serverError: failure?.errorFor('received_by'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoBox extends StatelessWidget {
  const _PhotoBox({
    required this.photo,
    required this.onTake,
    this.error,
    this.onRemove,
  });

  final PickedPhoto? photo;
  final String? error;
  final VoidCallback onTake;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose.foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (photo == null)
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              side: BorderSide(
                color: error != null ? rose : AppColors.stone300,
              ),
            ),
            onPressed: onTake,
            icon: const Icon(LucideIcons.camera),
            label: const Text('Take photo'),
          )
        else
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                // Shown from memory only; never saved to the gallery.
                child: Image.memory(
                  Uint8List.fromList(photo!.bytes),
                  width: 88,
                  height: 88,
                  fit: BoxFit.cover,
                  semanticLabel: 'Proof photo',
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Wrap(
                  spacing: AppSpace.sm,
                  children: [
                    TextButton.icon(
                      onPressed: onTake,
                      icon: const Icon(LucideIcons.camera, size: 18),
                      label: const Text('Retake'),
                    ),
                    if (onRemove != null)
                      TextButton(
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.gray600,
                        ),
                        onPressed: onRemove,
                        child: const Text('Remove'),
                      ),
                  ],
                ),
              ),
            ],
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpace.xs),
            child: Text(error!, style: TextStyle(color: rose, fontSize: 13)),
          ),
      ],
    );
  }
}
