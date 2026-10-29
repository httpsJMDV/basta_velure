import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../data/account.dart';
import '../widgets/buyer_widgets.dart';

/// The ID type and the photos of its front (and back, for IDs that have one). Shared by ID verification and
/// Complete profile. The photos stay in memory only and are gone when the screen closes.
class IdUpload extends StatelessWidget {
  const IdUpload({
    super.key,
    required this.type,
    required this.front,
    required this.back,
    required this.onType,
    required this.onFront,
    required this.onBack,
    this.showErrors = false,
    this.typeError,
    this.frontError,
    this.backError,
  });

  final GovernmentId? type;
  final PickedPhoto? front;
  final PickedPhoto? back;
  final ValueChanged<GovernmentId?> onType;
  final ValueChanged<PickedPhoto> onFront;
  final ValueChanged<PickedPhoto> onBack;
  final bool showErrors;
  final String? typeError;
  final String? frontError;
  final String? backError;

  Future<void> _pick(
    BuildContext context,
    String side,
    ValueChanged<PickedPhoto> done,
  ) async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason:
            'Take a clear photo of the $side of your ID. It is only used to check who you are.',
      );
      if (photo != null) done(photo);
    } on PhotoRejected catch (rejected) {
      if (context.mounted) showSnack(context, rejected.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<GovernmentId>(
          initialValue: type,
          decoration: InputDecoration(
            labelText: 'Government ID',
            errorText:
                typeError ??
                (showErrors && type == null ? 'Choose your ID type.' : null),
          ),
          items: [
            for (final id in GovernmentId.values)
              DropdownMenuItem(value: id, child: Text(id.label)),
          ],
          onChanged: onType,
        ),
        const SizedBox(height: AppSpace.xs),
        const Text(
          'Government IDs only. School IDs are not accepted.',
          style: TextStyle(fontSize: 12, color: AppColors.stone500),
        ),
        const SizedBox(height: AppSpace.md),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _Side(
                label: 'Front',
                photo: front,
                error:
                    frontError ??
                    (showErrors && front == null ? 'Add the front.' : null),
                onTap: () => _pick(context, 'front', onFront),
              ),
            ),
            if (type?.hasBack ?? false) ...[
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: _Side(
                  label: 'Back',
                  photo: back,
                  error:
                      backError ??
                      (showErrors && back == null ? 'Add the back.' : null),
                  onTap: () => _pick(context, 'back', onBack),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({
    required this.label,
    required this.photo,
    required this.onTap,
    this.error,
  });

  final String label;
  final PickedPhoto? photo;
  final VoidCallback onTap;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: AspectRatio(
            aspectRatio: 1.58,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: error == null
                      ? AppColors.stone300
                      : StatusTone.rose.foreground,
                ),
                color: AppColors.stone50,
              ),
              clipBehavior: Clip.antiAlias,
              child: photo == null
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          LucideIcons.camera,
                          color: AppColors.stone500,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Add $label',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.stone600,
                          ),
                        ),
                      ],
                    )
                  : Image.memory(
                      Uint8List.fromList(photo!.bytes),
                      fit: BoxFit.cover,
                    ),
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              error!,
              style: TextStyle(fontSize: 12, color: StatusTone.rose.foreground),
            ),
          ),
      ],
    );
  }
}
