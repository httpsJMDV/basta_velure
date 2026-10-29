import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../product/reviews_sheet.dart';
import '../widgets/buyer_widgets.dart';

/// Comments about a shop, without stars (B5). One comment per buyer, only after a completed order from the shop,
/// and at most 2 edits a day; the server decides all three.
class ShopCommentsScreen extends ConsumerStatefulWidget {
  const ShopCommentsScreen({super.key, required this.shopKey});

  final String shopKey;

  @override
  ConsumerState<ShopCommentsScreen> createState() => _ShopCommentsScreenState();
}

class _ShopCommentsScreenState extends ConsumerState<ShopCommentsScreen> {
  final _list = GlobalKey<PagedListState<ShopComment>>();
  late Future<MyShopComment> _mine = _loadMine();

  Future<MyShopComment> _loadMine() =>
      ref.read(buyerApiProvider).myShopComment(widget.shopKey);

  Future<void> _write(MyShopComment mine) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CommentSheet(shopKey: widget.shopKey, mine: mine),
    );
    if (saved == true && mounted) {
      showSnack(
        context,
        mine.review == null
            ? 'Thanks! Your comment is posted.'
            : 'Your comment is updated.',
      );
      setState(() => _mine = _loadMine());
      await _list.currentState?.refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Comments about the shop')),
      body: PagedList<ShopComment>(
        key: _list,
        spacing: 0,
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
        load: (page) =>
            ref.read(buyerApiProvider).shopComments(widget.shopKey, page: page),
        itemBuilder: (_, comment) => ShopCommentTile(comment: comment),
        empty: const EmptyState(
          icon: LucideIcons.messageSquare,
          title: 'No comments yet',
          message: 'Buyers can comment after a completed order from this shop.',
        ),
        header: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(AppSpace.lg),
              child: FutureBuilder<MyShopComment>(
                future: _mine,
                builder: (context, snapshot) {
                  final mine = snapshot.data;
                  if (mine == null) return const SizedBox.shrink();
                  if (!mine.canReview && mine.review == null) {
                    return MessageBanner(
                      message: mine.reason ?? 'You can comment after a completed order from this shop.',
                      tone: StatusTone.gray,
                    );
                  }
                  final editing = mine.review != null;
                  return OutlinedButton.icon(
                    onPressed: editing && mine.editsLeftToday <= 0
                        ? null
                        : () => _write(mine),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    icon: Icon(
                      editing
                          ? LucideIcons.squarePen
                          : LucideIcons.messageSquare,
                      size: 18,
                    ),
                    label: Text(
                      !editing
                          ? 'Comment on this shop'
                          : mine.editsLeftToday <= 0
                          ? 'No edits left today'
                          : 'Edit your comment (${mine.editsLeftToday} left today)',
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentSheet extends ConsumerStatefulWidget {
  const _CommentSheet({required this.shopKey, required this.mine});

  final String shopKey;
  final MyShopComment mine;

  @override
  ConsumerState<_CommentSheet> createState() => _CommentSheetState();
}

class _CommentSheetState extends ConsumerState<_CommentSheet> {
  final _form = GlobalKey<FormState>();
  late final _text = TextEditingController(
    text: widget.mine.review?.comment ?? '',
  );
  late final Set<String> _tags = {...?widget.mine.review?.tags};
  ApiFailure? _failure;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _failure = null);
    try {
      await ref
          .read(buyerApiProvider)
          .saveShopComment(
            widget.shopKey,
            comment: _text.text.trim(),
            // Sent in the server's order.
            tags: widget.mine.tags.where(_tags.contains).toList(),
            editing: widget.mine.review != null,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom + AppSpace.lg,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.mine.review == null
                    ? 'Comment on this shop'
                    : 'Edit your comment',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpace.md),
              if (_failure != null &&
                  _failure!.errorFor('comment') == null) ...[
                MessageBanner(message: _failure!.message),
                const SizedBox(height: AppSpace.md),
              ],
              AppTextField(
                label: 'Your comment',
                controller: _text,
                minLines: 3,
                maxLines: 6,
                maxLength: 500,
                showCounter: true,
                textCapitalization: TextCapitalization.sentences,
                validator: (value) =>
                    Rules.words(value, 'Your comment', min: 2, max: 500),
                serverError: _failure?.errorFor('comment'),
              ),
              const SizedBox(height: AppSpace.md),
              const Text(
                'Quick tags (optional)',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: AppSpace.sm),
              Wrap(
                spacing: AppSpace.sm,
                runSpacing: AppSpace.sm,
                children: [
                  for (final tag in widget.mine.tags)
                    FilterChip(
                      label: Text(tag),
                      selected: _tags.contains(tag),
                      onSelected: (on) => setState(
                        () => on ? _tags.add(tag) : _tags.remove(tag),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.xl),
              SubmitButton(
                label: 'Post comment',
                busyLabel: 'Posting…',
                onPressed: _save,
              ),
              const SizedBox(height: AppSpace.sm),
              const Text(
                'Comments are honest feedback: nobody can hide them, and you can edit yours twice a day.',
                style: TextStyle(fontSize: 12, color: AppColors.stone500),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
