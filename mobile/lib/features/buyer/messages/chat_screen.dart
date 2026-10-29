import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';
import '../widgets/photo_viewer.dart';

/// One chat (B11). New messages arrive on the conversation's live channel; without it the screen checks every 10
/// seconds. Messages are trimmed, never sent empty, and 1,000 characters at most.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId});

  final int conversationId;

  static const maxLength = 1000;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _box = TextEditingController();
  final _scroll = ScrollController();
  Conversation? _conversation;
  List<ChatMessage> _messages = const [];
  bool _canSend = true;
  String? _closedMessage;
  ApiFailure? _failure;
  bool _sending = false;
  Timer? _poll;
  final _live = <StreamSubscription<void>>[];

  BuyerApi get _api => ref.read(buyerApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshMessages(),
    );
    final realtime = ref.read(realtimeProvider);
    if (realtime != null) {
      for (final event in ['MessageSent', 'MessageRead']) {
        _live.add(
          realtime
              .conversationEvents(widget.conversationId, event)
              .listen((_) => _refreshMessages(), onError: (_) {}),
        );
      }
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    for (final sub in _live) {
      sub.cancel();
    }
    ref.read(realtimeProvider)?.leave('conversation.${widget.conversationId}');
    _box.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final conversation = await _api.conversation(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _conversation = conversation;
        _failure = null;
      });
      await _refreshMessages();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _refreshMessages() async {
    try {
      final (messages, meta) = await _api.messages(widget.conversationId);
      if (!mounted) return;
      final grew = messages.length != _messages.length;
      setState(() {
        _messages = messages;
        _canSend = meta['can_send'] == null || asBool(meta['can_send']);
        _closedMessage = asString(meta['closed_message']);
      });
      if (grew) _toBottom();
    } catch (_) {
      // The next check tries again; the messages on screen stay.
    }
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: kMotion,
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send({
    String? attachmentType,
    Json? attachment,
    PickedPhoto? image,
  }) async {
    final text = _box.text.trim();
    if (_sending || (text.isEmpty && attachmentType == null && image == null)) {
      return;
    }
    setState(() => _sending = true);
    try {
      final message = await _api.sendMessage(
        widget.conversationId,
        body: text.isEmpty ? null : text,
        attachmentType: attachmentType,
        attachment: attachment,
        image: image,
      );
      if (!mounted) return;
      if (attachmentType == null && image == null) _box.clear();
      setState(() => _messages = [..._messages, message]);
      _toBottom();
    } catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.from(error);
      // 409: a rider chat closed when the parcel was delivered.
      if (failure.kind == FailureKind.conflict) await _refreshMessages();
      if (mounted) showSnack(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _attachPhoto() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo to send in this chat.',
      );
      if (photo != null) await _send(image: photo);
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    }
  }

  Future<void> _attachCard(String kind) async {
    final picked = await showModalBottomSheet<Json>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _AttachSheet(conversationId: widget.conversationId, kind: kind),
    );
    if (picked != null) {
      await _send(
        attachmentType: kind == 'products' ? 'product_card' : 'order_card',
        attachment: {'id': picked['id']},
      );
    }
  }

  Future<void> _switchSupport(bool toPerson) async {
    try {
      if (toPerson) {
        await _api.handoffToPerson(widget.conversationId);
      } else {
        await _api.backToAssistant(widget.conversationId);
      }
      await _load();
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversation = _conversation;
    final me = ref.watch(currentUserProvider)?.id;
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(
        title: Text(
          conversation?.title ?? 'Chat',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: _failure != null && conversation == null
          ? ErrorRetry(failure: _failure!, onRetry: _load)
          : conversation == null
          ? const SkeletonList(count: 5)
          : Column(
              children: [
                if (conversation.isSupport)
                  _SupportBar(
                    conversation: conversation,
                    onSwitch: _switchSupport,
                  ),
                Expanded(
                  child: _messages.isEmpty
                      ? EmptyState(
                          icon: LucideIcons.messageCircle,
                          title: 'Say hello',
                          message: conversation.isSupport
                              ? 'Ask about an order, a payment or a return.'
                              : 'Ask about a product, stock or delivery.',
                        )
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(AppSpace.lg),
                          itemCount: _messages.length,
                          itemBuilder: (_, index) => _Bubble(
                            message: _messages[index],
                            mine: _messages[index].senderId == me,
                          ),
                        ),
                ),
                if (!_canSend)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      child: MessageBanner(
                        message:
                            _closedMessage ??
                            'This chat is closed. You can still read it.',
                        tone: StatusTone.gray,
                      ),
                    ),
                  )
                else
                  _Composer(
                    controller: _box,
                    sending: _sending,
                    canAttachCards:
                        conversation.type == 'buyer_seller' ||
                        conversation.isSupport,
                    onSend: () => _send(),
                    onPhoto: _attachPhoto,
                    onProduct: conversation.type == 'buyer_seller'
                        ? () => _attachCard('products')
                        : null,
                    onOrder: () => _attachCard('orders'),
                  ),
              ],
            ),
    );
  }
}

class _SupportBar extends StatelessWidget {
  const _SupportBar({required this.conversation, required this.onSwitch});

  final Conversation conversation;
  final ValueChanged<bool> onSwitch;

  @override
  Widget build(BuildContext context) {
    final ai = conversation.supportMode == 'ai';
    return Container(
      color: StatusTone.blue.background,
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.sm,
        AppSpace.sm,
        AppSpace.sm,
      ),
      child: Row(
        children: [
          Icon(
            ai ? LucideIcons.bot : LucideIcons.headset,
            size: 18,
            color: StatusTone.blue.foreground,
          ),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: Text(
              ai
                  ? 'The Loved-IT Assistant answers. It explains and guides; it never refunds or cancels.'
                  : 'A Loved-IT team member will answer here.',
              style: TextStyle(fontSize: 12, color: StatusTone.blue.foreground),
            ),
          ),
          if (ai)
            TextButton(
              onPressed: () => onSwitch(true),
              child: const Text('Talk to a person'),
            )
          else if (conversation.assistantAvailable)
            TextButton(
              onPressed: () => onSwitch(false),
              child: const Text('Back to assistant'),
            ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine});

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final card = _attachment(context);
    final system = message.senderRole == 'system';
    if (system) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
        child: Center(
          child: Text(
            message.body ?? '',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
        ),
      );
    }
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: Container(
          margin: const EdgeInsets.only(bottom: AppSpace.sm),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: mine ? AppColors.brandRed : AppColors.white,
            borderRadius: BorderRadius.circular(14),
            border: mine ? null : Border.all(color: AppColors.stone200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!mine && message.senderName.isNotEmpty)
                Text(
                  message.senderName,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.stone500,
                  ),
                ),
              ?card,
              if (message.body != null)
                Text(
                  message.body!,
                  style: TextStyle(
                    color: mine ? AppColors.white : AppColors.stone900,
                    height: 1.35,
                  ),
                ),
              const SizedBox(height: 2),
              Text(
                Fmt.shortWhen(message.createdAt),
                style: TextStyle(
                  fontSize: 10,
                  color: mine
                      ? AppColors.white.withValues(alpha: 0.8)
                      : AppColors.stone400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget? _attachment(BuildContext context) {
    final data = message.attachment;
    switch (message.attachmentType) {
      case 'image':
        final url = asString(data['url']);
        if (url == null) return null;
        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: GestureDetector(
            onTap: () => showPhotoViewer(context, [url]),
            child: NetImage(url, width: 200, height: 200, radius: 10),
          ),
        );
      case 'product_card':
        final id = asIntOrNull(data['id']);
        return _Card(
          image: asString(data['image']),
          title: asString(data['name']) ?? 'Product',
          subtitle: formatPeso(data['price']),
          onTap: id == null ? null : () => context.push(BuyerPaths.product(id)),
        );
      case 'order_card':
        final id = asIntOrNull(data['id']);
        return _Card(
          image: asString(data['image']),
          title: 'Order ${asString(data['order_number']) ?? ''}',
          subtitle:
              '${asString(data['items_summary']) ?? ''} · ${formatPeso(data['total'])}',
          onTap: id == null ? null : () => context.push(BuyerPaths.order(id)),
        );
      default:
        return null;
    }
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.title,
    required this.subtitle,
    this.image,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final String? image;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: AppColors.stone50,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.sm),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                NetImage(image, width: 44, height: 44, radius: 6),
                const SizedBox(width: AppSpace.sm),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.stone600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.canAttachCards,
    required this.onSend,
    required this.onPhoto,
    required this.onOrder,
    this.onProduct,
  });

  final TextEditingController controller;
  final bool sending;
  final bool canAttachCards;
  final VoidCallback onSend;
  final VoidCallback onPhoto;
  final VoidCallback onOrder;
  final VoidCallback? onProduct;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        boxShadow: AppShadow.soft,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.xs,
        AppSpace.sm,
        AppSpace.sm,
        AppSpace.sm,
      ),
      child: SafeArea(
        top: false,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            PopupMenuButton<String>(
              tooltip: 'Attach',
              icon: const Icon(LucideIcons.plus),
              onSelected: (choice) => switch (choice) {
                'photo' => onPhoto(),
                'product' => onProduct?.call(),
                _ => onOrder(),
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'photo', child: Text('Photo')),
                if (onProduct != null)
                  const PopupMenuItem(
                    value: 'product',
                    child: Text('A product from this shop'),
                  ),
                if (canAttachCards)
                  const PopupMenuItem(
                    value: 'order',
                    child: Text('One of my orders'),
                  ),
              ],
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                inputFormatters: [Only.max(ChatScreen.maxLength)],
                decoration: const InputDecoration(
                  hintText: 'Write a message',
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: AppSpace.xs),
            IconButton.filled(
              tooltip: 'Send',
              style: IconButton.styleFrom(
                backgroundColor: AppColors.brandRed,
                minimumSize: const Size(48, 48),
              ),
              onPressed: sending ? null : onSend,
              icon: sending
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.white,
                      ),
                    )
                  : const Icon(LucideIcons.send, size: 20),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttachSheet extends ConsumerWidget {
  const _AttachSheet({required this.conversationId, required this.kind});

  final int conversationId;

  /// `products` or `orders`.
  final String kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.7,
      child: FutureBuilder<List<Json>>(
        future: ref.read(buyerApiProvider).attachable(conversationId, kind),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return ErrorRetry(failure: ApiFailure.from(snapshot.error!));
          }
          if (!snapshot.hasData) return const SkeletonList();
          final items = snapshot.data!;
          if (items.isEmpty) {
            return EmptyState(
              icon: kind == 'products'
                  ? LucideIcons.package
                  : LucideIcons.receipt,
              title: kind == 'products'
                  ? 'No products to share'
                  : 'No orders to share',
            );
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return ListTile(
                minTileHeight: 64,
                leading: NetImage(
                  asString(item['image']),
                  width: 48,
                  height: 48,
                  radius: 8,
                ),
                title: Text(
                  kind == 'products'
                      ? (asString(item['name']) ?? '')
                      : 'Order ${asString(item['order_number']) ?? ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(formatPeso(item['price'] ?? item['total'])),
                onTap: () => Navigator.of(context).pop(item),
              );
            },
          );
        },
      ),
    );
  }
}
