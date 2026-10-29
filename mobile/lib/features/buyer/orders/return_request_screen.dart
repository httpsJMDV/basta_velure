import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';
import '../widgets/buyer_widgets.dart';

/// Ask for a return or refund (B9): a reason, a 10 to 500 character description and 1 to 5 photos of the problem.
/// Pops `true` when it was sent.
class ReturnRequestScreen extends ConsumerStatefulWidget {
  const ReturnRequestScreen({super.key, required this.orderId});

  final int orderId;

  @override
  ConsumerState<ReturnRequestScreen> createState() =>
      _ReturnRequestScreenState();
}

class _ReturnRequestScreenState extends ConsumerState<ReturnRequestScreen> {
  static const maxPhotos = 5;

  final _form = GlobalKey<FormState>();
  final _description = TextEditingController();
  final _photos = <PickedPhoto>[];
  String? _reason;
  bool _showErrors = false;
  ApiFailure? _failure;
  int _sent = 0;
  int _total = 0;
  bool _sending = false;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _addPhoto() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo of the problem so the shop can see it.',
      );
      if (photo != null && mounted) setState(() => _photos.add(photo));
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _showErrors = true;
      _failure = null;
    });
    if (!_form.currentState!.validate() || _reason == null || _photos.isEmpty) {
      return;
    }
    final confirmed = await confirmAction(
      context,
      title: 'Send this return request?',
      message: 'The shop answers within a few days. You can ask Loved-IT to review if they refuse.',
      confirmLabel: 'Send request',
    );
    if (!confirmed) return;
    setState(() => _sending = true);
    try {
      final message = await ref
          .read(buyerApiProvider)
          .requestReturn(
            widget.orderId,
            reason: _reason!,
            description: _description.text.trim(),
            photos: _photos,
            onSendProgress: (sent, total) {
              if (!mounted) return;
              setState(() {
                _sent = sent;
                _total = total;
              });
            },
          );
      if (!mounted) return;
      showSnack(context, message);
      context.pop(true);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final photoError =
        _failure?.errorFor('photos') ??
        (_showErrors && _photos.isEmpty
            ? 'Add at least one photo of the problem.'
            : null);
    return Scaffold(
      appBar: AppBar(title: const Text('Return or refund')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.lg),
            ],
            const Text(
              'What went wrong?',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (value) => setState(() => _reason = value),
              child: Column(
                children: [
                  for (final reason in OrderReasons.returns)
                    RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      value: reason,
                      title: Text(reason),
                    ),
                ],
              ),
            ),
            if (_showErrors && _reason == null)
              Text(
                'Choose a reason for the return.',
                style: TextStyle(
                  color: StatusTone.rose.foreground,
                  fontSize: 12,
                ),
              ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Describe the problem',
              controller: _description,
              minLines: 3,
              maxLines: 6,
              maxLength: 500,
              showCounter: true,
              textCapitalization: TextCapitalization.sentences,
              validator: (value) =>
                  Rules.words(value, 'The description', min: 10, max: 500),
              serverError: _failure?.errorFor('description'),
            ),
            const SizedBox(height: AppSpace.lg),
            Text(
              'Photos (${_photos.length} of $maxPhotos)',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpace.sm),
            Wrap(
              spacing: AppSpace.sm,
              runSpacing: AppSpace.sm,
              children: [
                for (var i = 0; i < _photos.length; i++)
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.memory(
                          Uint8List.fromList(_photos[i].bytes),
                          width: 88,
                          height: 88,
                          fit: BoxFit.cover,
                        ),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: IconButton.filledTonal(
                          tooltip: 'Remove photo',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => setState(() => _photos.removeAt(i)),
                          icon: const Icon(LucideIcons.x, size: 14),
                        ),
                      ),
                    ],
                  ),
                if (_photos.length < maxPhotos)
                  InkWell(
                    onTap: _addPhoto,
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 88,
                      height: 88,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.stone300),
                      ),
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(LucideIcons.camera, color: AppColors.stone500),
                          SizedBox(height: 4),
                          Text(
                            'Add photo',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            if (photoError != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.sm),
                child: Text(
                  photoError,
                  style: TextStyle(
                    color: StatusTone.rose.foreground,
                    fontSize: 12,
                  ),
                ),
              ),
            const SizedBox(height: AppSpace.xl),
            if (_sending) ...[
              UploadProgress(sent: _sent, total: _total),
              const SizedBox(height: AppSpace.md),
            ],
            SubmitButton(
              label: 'Send request',
              busyLabel: 'Sending…',
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
