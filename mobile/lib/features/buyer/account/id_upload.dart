import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
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
        kind: UploadKind.document,
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
    final hasBack = type?.hasBack ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSelectField<GovernmentId>(
          label: 'Government ID',
          prefixIcon: LucideIcons.idCard,
          value: type,
          errorText:
              typeError ??
              (showErrors && type == null ? 'Choose your ID type.' : null),
          options: [
            for (final id in GovernmentId.values)
              AppOption(
                id,
                id.label,
                subtitle: id.hasBack ? 'Front and back' : 'Front only',
              ),
          ],
          onChanged: onType,
        ),
        const SizedBox(height: AppSpace.xs),
        const Text(
          'Government IDs only. School IDs are not accepted.',
          style: TextStyle(fontSize: 12, color: AppColors.stone500),
        ),
        const SizedBox(height: AppSpace.lg),
        IdSideTile(
          label: 'Front of your ID',
          photo: front,
          error:
              frontError ??
              (showErrors && front == null
                  ? 'Add a photo of the front.'
                  : null),
          onTap: () => _pick(context, 'front', onFront),
        ),
        if (hasBack) ...[
          const SizedBox(height: AppSpace.md),
          IdSideTile(
            label: 'Back of your ID',
            photo: back,
            error:
                backError ??
                (showErrors && back == null
                    ? 'Add a photo of the back.'
                    : null),
            onTap: () => _pick(context, 'back', onBack),
          ),
        ],
        const SizedBox(height: AppSpace.md),
        const _PhotoTips(),
      ],
    );
  }
}

/// One side of the ID: an empty frame to tap, or the photo with a Retake label. Card-shaped (ID-1, 85.6 × 54 mm), so
/// the preview looks like the card it shows.
class IdSideTile extends StatelessWidget {
  const IdSideTile({
    super.key,
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
    final rose = StatusTone.rose.foreground;
    final picked = photo;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          label: picked == null ? 'Add $label' : '$label added. Retake',
          excludeSemantics: true,
          child: Material(
            color: picked == null ? AppColors.white : AppColors.stone900,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: error != null
                    ? rose
                    : picked == null
                    ? AppColors.stone300
                    : AppColors.stone900,
                width: error != null ? 1.5 : 1,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: AspectRatio(
                aspectRatio: 1.586,
                child: picked == null
                    ? _Empty(label: label, error: error != null)
                    : _Filled(label: label, photo: picked),
              ),
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 2),
            child: Text(error!, style: TextStyle(fontSize: 12, color: rose)),
          ),
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.label, required this.error});

  final String label;
  final bool error;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // The corners of a viewfinder, so it reads as "put the card here".
        const Padding(
          padding: EdgeInsets.all(14),
          child: CustomPaint(painter: _CornerMarks(AppColors.stone300)),
        ),
        Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: error ? StatusTone.rose.background : AppColors.stone100,
                shape: BoxShape.circle,
              ),
              child: Icon(
                LucideIcons.camera,
                size: 20,
                color: error ? StatusTone.rose.foreground : AppColors.stone600,
              ),
            ),
            const SizedBox(height: AppSpace.sm),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.stone900,
              ),
            ),
            const SizedBox(height: 2),
            const Text(
              'Take a photo or choose one',
              style: TextStyle(fontSize: 12.5, color: AppColors.stone500),
            ),
          ],
        ),
      ],
    );
  }
}

class _Filled extends StatelessWidget {
  const _Filled({required this.label, required this.photo});

  final String label;
  final PickedPhoto photo;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.memory(
          Uint8List.fromList(photo.bytes),
          fit: BoxFit.cover,
          gaplessPlayback: true,
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            color: const Color(0xCC1C1917),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: 9,
            ),
            child: Row(
              children: [
                Icon(
                  LucideIcons.circleCheck,
                  size: 16,
                  color: StatusTone.emerald.border,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.white,
                    ),
                  ),
                ),
                const Icon(
                  LucideIcons.refreshCw,
                  size: 14,
                  color: AppColors.white,
                ),
                const SizedBox(width: 6),
                const Text(
                  'Retake',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PhotoTips extends StatelessWidget {
  const _PhotoTips();

  @override
  Widget build(BuildContext context) {
    const tips = [
      'The whole card fits in the photo',
      'Name, photo and ID number are easy to read',
      'No glare from a light or the flash',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final tip in tips)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                Icon(
                  LucideIcons.check,
                  size: 14,
                  color: StatusTone.emerald.foreground,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    tip,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.stone600,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CornerMarks extends CustomPainter {
  const _CornerMarks(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const arm = 18.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final w = size.width;
    final h = size.height;
    for (final (corner, dx, dy) in [
      (Offset.zero, 1.0, 1.0),
      (Offset(w, 0), -1.0, 1.0),
      (Offset(0, h), 1.0, -1.0),
      (Offset(w, h), -1.0, -1.0),
    ]) {
      canvas.drawLine(corner, corner + Offset(arm * dx, 0), paint);
      canvas.drawLine(corner, corner + Offset(0, arm * dy), paint);
    }
  }

  @override
  bool shouldRepaint(_CornerMarks oldDelegate) => oldDelegate.color != color;
}
