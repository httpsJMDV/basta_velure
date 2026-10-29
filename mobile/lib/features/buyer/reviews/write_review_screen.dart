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
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// Write a review (a [PendingReview]) or edit one (a [MyReview]): 1 to 5 stars, up to 500 characters and, for a new
/// review, up to 5 photos. One review per product per delivered order. Pops `true` when saved.
class WriteReviewScreen extends ConsumerStatefulWidget {
  const WriteReviewScreen({super.key, required this.target});

  final Object? target;

  @override
  ConsumerState<WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends ConsumerState<WriteReviewScreen> {
  static const maxPhotos = 5;

  late final PendingReview? _pending = widget.target is PendingReview
      ? widget.target! as PendingReview
      : null;
  late final MyReview? _existing = widget.target is MyReview
      ? widget.target! as MyReview
      : null;
  late int? _stars = _existing?.rating;
  late final _comment = TextEditingController(text: _existing?.comment ?? '');
  final _photos = <PickedPhoto>[];
  final _form = GlobalKey<FormState>();
  bool _showErrors = false;
  ApiFailure? _failure;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _addPhoto() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo of the product for your review.',
      );
      if (photo != null && mounted) setState(() => _photos.add(photo));
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    }
  }

  Future<void> _save() async {
    setState(() {
      _showErrors = true;
      _failure = null;
    });
    if (Rules.stars(_stars) != null || !_form.currentState!.validate()) return;
    final api = ref.read(buyerApiProvider);
    try {
      if (_existing != null) {
        await api.editReview(
          _existing.id,
          rating: _stars!,
          comment: _comment.text.trim(),
        );
      } else {
        await api.writeReview(
          orderId: _pending!.orderId,
          productId: _pending.productId,
          rating: _stars!,
          comment: _comment.text.trim(),
          photos: _photos,
        );
      }
      if (!mounted) return;
      showSnack(context, 'Thanks for your review!');
      context.pop(true);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pending == null && _existing == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const EmptyState(
          icon: LucideIcons.star,
          title: 'Open a product from Reviews to rate it.',
        ),
      );
    }
    final starError =
        _failure?.errorFor('rating') ??
        (_showErrors ? Rules.stars(_stars) : null);
    return Scaffold(
      appBar: AppBar(
        title: Text(_existing == null ? 'Write a review' : 'Edit your review'),
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.lg),
            ],
            Text(
              _pending?.productName ?? _existing?.productName ?? 'Product',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpace.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    tooltip: '$i star${i == 1 ? '' : 's'}',
                    iconSize: 36,
                    onPressed: () => setState(() => _stars = i),
                    icon: Icon(
                      LucideIcons.star,
                      color: i <= (_stars ?? 0)
                          ? const Color(0xFFF59E0B)
                          : AppColors.stone300,
                      fill: i <= (_stars ?? 0) ? 1 : 0,
                    ),
                  ),
              ],
            ),
            if (starError != null)
              Text(
                starError,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: StatusTone.rose.foreground,
                  fontSize: 12,
                ),
              ),
            const SizedBox(height: AppSpace.lg),
            AppTextField(
              label: 'Your review (optional)',
              controller: _comment,
              minLines: 3,
              maxLines: 6,
              maxLength: 500,
              showCounter: true,
              textCapitalization: TextCapitalization.sentences,
              validator: (value) => Rules.maxLength(value, 'Your review', 500),
              serverError: _failure?.errorFor('comment'),
            ),
            if (_existing == null) ...[
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
                    GestureDetector(
                      onLongPress: () => setState(() => _photos.removeAt(i)),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.memory(
                          Uint8List.fromList(_photos[i].bytes),
                          width: 80,
                          height: 80,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                  if (_photos.length < maxPhotos)
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(80, 80),
                      ),
                      onPressed: _addPhoto,
                      child: const Icon(LucideIcons.camera),
                    ),
                ],
              ),
              if (_photos.isNotEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpace.xs),
                  child: Text(
                    'Press and hold a photo to remove it.',
                    style: TextStyle(fontSize: 12, color: AppColors.stone500),
                  ),
                ),
              if (_failure?.errorFor('photos') != null)
                Text(
                  _failure!.errorFor('photos')!,
                  style: TextStyle(
                    color: StatusTone.rose.foreground,
                    fontSize: 12,
                  ),
                ),
            ],
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: 'Post review',
              busyLabel: 'Posting…',
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
