import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import '../product/reviews_sheet.dart';
import '../widgets/buyer_widgets.dart';
import 'review_guidelines.dart';

/// Write a review (a [PendingReview]) or edit one (a [MyReview]): 1 to 5 stars, up to 500 characters and, for a new
/// review, up to 5 photos of what arrived, taken or chosen several at once. One review per product per completed order;
/// stars and text can be changed once, photos can't. Pops `true` when saved.
class WriteReviewScreen extends ConsumerStatefulWidget {
  const WriteReviewScreen({super.key, required this.target});

  final Object? target;

  @override
  ConsumerState<WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends ConsumerState<WriteReviewScreen> {
  static const maxPhotos = 5;
  static const maxText = 500;

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
  bool _picking = false;
  ApiFailure? _failure;
  String? _photoError;
  int _sent = 0;
  int _total = 0;
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _addPhotos() async {
    if (_picking) return;
    setState(() {
      _picking = true;
      _photoError = null;
    });
    try {
      final picked = await PhotoPicker().pickSeveral(
        context,
        reason: 'Take a photo of the product you received for your review.',
        max: maxPhotos - _photos.length,
      );
      if (!mounted) return;
      setState(() {
        _photos.addAll(picked.photos.take(maxPhotos - _photos.length));
        _photoError = picked.rejected;
      });
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  void _removePhoto(int index) {
    HapticFeedback.selectionClick();
    setState(() => _photos.removeAt(index));
  }

  Future<void> _save() async {
    setState(() {
      _showErrors = true;
      _failure = null;
    });
    if (Rules.stars(_stars) != null ||
        !_form.currentState!.validateAndReveal()) {
      return;
    }
    final api = ref.read(buyerApiProvider);
    setState(() {
      _sending = true;
      _sent = 0;
      _total = 0;
    });
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
          onSendProgress: (sent, total) {
            if (mounted) {
              setState(() {
                _sent = sent;
                _total = total;
              });
            }
          },
        );
      }
      if (!mounted) return;
      showSnack(context, 'Thanks for your review!');
      context.pop(true);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    } finally {
      if (mounted) setState(() => _sending = false);
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
    final editing = _existing != null;
    final starError =
        _failure?.errorFor('rating') ??
        (_showErrors ? Rules.stars(_stars) : null);
    final photoError = _failure?.errorFor('photos') ?? _photoError;
    return Scaffold(
      appBar: AppBar(
        title: Text(editing ? 'Edit your review' : 'Rate product'),
      ),
      body: Form(
        key: _form,
        // Not a lazy list: a field scrolled out of a ListView is unmounted, and validate() skips it.
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(top: AppSpace.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_failure != null && _failure!.fieldErrors.isEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpace.lg,
                    0,
                    AppSpace.lg,
                    AppSpace.md,
                  ),
                  child: MessageBanner(message: _failure!.message),
                ),
              BlockCard(
                child: _ProductHeader(pending: _pending, existing: _existing),
              ),
              BlockCard(
                child: Column(
                  children: [
                    const Text(
                      'How would you rate it?',
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpace.sm),
                    _StarPicker(
                      value: _stars,
                      onChanged: (stars) => setState(() => _stars = stars),
                    ),
                    AnimatedSwitcher(
                      duration: kMotion,
                      child: Text(
                        _stars == null
                            ? 'Tap a star to rate'
                            : ReviewTile.wordFor(_stars!),
                        key: ValueKey(_stars),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: _stars == null
                              ? AppColors.stone500
                              : StatusTone.amber.foreground,
                        ),
                      ),
                    ),
                    if (starError != null) ...[
                      const SizedBox(height: AppSpace.xs),
                      Text(
                        starError,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: StatusTone.rose.foreground,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              BlockCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _CardTitle(
                      icon: LucideIcons.camera,
                      title: 'Photos',
                      trailing: editing ? null : '${_photos.length}/$maxPhotos',
                    ),
                    const SizedBox(height: AppSpace.xs),
                    Text(
                      editing
                          ? "Photos can't be changed after a review is posted."
                          : 'Show the product you received. Real photos help other buyers the most.',
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: AppColors.stone500,
                      ),
                    ),
                    const SizedBox(height: AppSpace.md),
                    if (editing)
                      _existing.images.isEmpty
                          ? const Text(
                              'No photos on this review.',
                              style: TextStyle(color: AppColors.stone500),
                            )
                          : Wrap(
                              spacing: AppSpace.sm,
                              runSpacing: AppSpace.sm,
                              children: [
                                for (final url in _existing.images)
                                  NetImage(
                                    url,
                                    width: _PhotoTile.size,
                                    height: _PhotoTile.size,
                                    radius: 12,
                                  ),
                              ],
                            )
                    else
                      Wrap(
                        spacing: AppSpace.sm,
                        runSpacing: AppSpace.sm,
                        children: [
                          for (var i = 0; i < _photos.length; i++)
                            _PhotoTile(
                              bytes: _photos[i].bytes,
                              label: 'Photo ${i + 1}',
                              onRemove: _sending ? null : () => _removePhoto(i),
                            ),
                          if (_photos.length < maxPhotos)
                            _AddPhotoTile(
                              busy: _picking,
                              onTap: _sending ? null : _addPhotos,
                            ),
                        ],
                      ),
                    if (photoError != null) ...[
                      const SizedBox(height: AppSpace.sm),
                      Text(
                        photoError,
                        style: TextStyle(
                          color: StatusTone.rose.foreground,
                          fontSize: 12.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              BlockCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _CardTitle(
                      icon: LucideIcons.penLine,
                      title: 'Your review',
                      trailing: 'Optional',
                    ),
                    const SizedBox(height: AppSpace.md),
                    AppTextField(
                      label: 'What did you like or not like?',
                      hint: 'Quality, size, how it matches the photos…',
                      controller: _comment,
                      minLines: 4,
                      maxLines: 8,
                      maxLength: maxText,
                      showCounter: true,
                      textCapitalization: TextCapitalization.sentences,
                      validator: (value) =>
                          Rules.maxLength(value, 'Your review', maxText),
                      serverError: _failure?.errorFor('comment'),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
                child: TextButton.icon(
                  onPressed: () => showReviewGuidelines(context),
                  icon: const Icon(LucideIcons.bookOpen, size: 17),
                  label: const Text('Read the review guidelines'),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.stone700,
                    alignment: Alignment.centerLeft,
                  ),
                ),
              ),
              const SizedBox(height: AppSpace.lg),
            ],
          ),
        ),
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.white,
          border: Border(top: BorderSide(color: AppColors.stone200)),
        ),
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.md,
          AppSpace.lg,
          AppSpace.md,
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_sending && _photos.isNotEmpty && !editing) ...[
                UploadProgress(sent: _sent, total: _total),
                const SizedBox(height: AppSpace.sm),
              ],
              SubmitButton(
                label: editing ? 'Save changes' : 'Post review',
                busyLabel: editing ? 'Saving…' : 'Posting…',
                onPressed: _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProductHeader extends StatelessWidget {
  const _ProductHeader({this.pending, this.existing});

  final PendingReview? pending;
  final MyReview? existing;

  @override
  Widget build(BuildContext context) {
    final details = [
      pending?.variantLabel,
      pending?.shopName,
      pending?.orderNumber ?? existing?.orderNumber,
    ].whereType<String>().where((part) => part.isNotEmpty).join(' · ');
    return Row(
      children: [
        NetImage(
          pending?.imageUrl ?? existing?.productImageUrl,
          width: 60,
          height: 60,
          radius: 12,
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pending?.productName ?? existing?.productName ?? 'Product',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              if (details.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  details,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.stone500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _CardTitle extends StatelessWidget {
  const _CardTitle({required this.icon, required this.title, this.trailing});

  final IconData icon;
  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.brandRed),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.stone500),
          ),
      ],
    );
  }
}

/// Five big stars to tap.
class _StarPicker extends StatelessWidget {
  const _StarPicker({required this.value, required this.onChanged});

  final int? value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 1; i <= 5; i++)
          IconButton(
            tooltip: '$i star${i == 1 ? '' : 's'}',
            iconSize: 40,
            isSelected: i <= (value ?? 0),
            onPressed: () {
              HapticFeedback.selectionClick();
              onChanged(i);
            },
            icon: AnimatedScale(
              scale: i <= (value ?? 0) ? 1.08 : 1,
              duration: kMotion,
              child: Icon(
                Icons.star_rounded,
                color: i <= (value ?? 0)
                    ? const Color(0xFFF59E0B)
                    : AppColors.stone200,
              ),
            ),
          ),
      ],
    );
  }
}

/// A picked photo with a round × to take it out again.
class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.bytes, required this.label, this.onRemove});

  static const size = 88.0;

  final List<int> bytes;
  final String label;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                Uint8List.fromList(bytes),
                fit: BoxFit.cover,
                semanticLabel: label,
              ),
            ),
          ),
          if (onRemove != null)
            Positioned(
              top: -10,
              right: -10,
              child: IconButton(
                tooltip: 'Remove ${label.toLowerCase()}',
                onPressed: onRemove,
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.stone900,
                  foregroundColor: AppColors.white,
                  minimumSize: const Size(28, 28),
                  fixedSize: const Size(28, 28),
                  padding: EdgeInsets.zero,
                  tapTargetSize: MaterialTapTargetSize.padded,
                ),
                icon: const Icon(LucideIcons.x, size: 15),
              ),
            ),
        ],
      ),
    );
  }
}

/// The dashed square that adds photos.
class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({required this.onTap, this.busy = false});

  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Add photos',
      excludeSemantics: true,
      child: Material(
        color: AppColors.stone50,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.stone300),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: busy ? null : onTap,
          child: SizedBox.square(
            dimension: _PhotoTile.size,
            child: busy
                ? const Center(
                    child: SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4),
                    ),
                  )
                // Shrinks with large text instead of spilling out of the square.
                : const Padding(
                    padding: EdgeInsets.all(AppSpace.sm),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Column(
                        children: [
                          Icon(
                            LucideIcons.imagePlus,
                            size: 24,
                            color: AppColors.stone600,
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Add photos',
                            maxLines: 1,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: AppColors.stone600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
