import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../rider_paths.dart';
import '../widgets/rider_widgets.dart';

/// "Message" on a stop card (C8). It offers who the rider may write to in this part of the job: the seller while
/// collecting, the buyer while delivering, and the hub always. The thread opens only while the parcel is active.
class RiderMessageButton extends ConsumerWidget {
  const RiderMessageButton({
    super.key,
    required this.trackingNumber,
    required this.counterparts,
  });

  final String trackingNumber;
  final List<Counterpart> counterparts;

  Future<void> _open(
    BuildContext context,
    WidgetRef ref,
    Counterpart who,
  ) async {
    try {
      final thread = await ref
          .read(riderApiProvider)
          .openThread(trackingNumber, who);
      if (context.mounted) await context.push(RiderPaths.chat(thread.id));
      unawaited(ref.read(riderChatUnreadProvider.notifier).refresh());
    } on ApiFailure catch (failure) {
      if (context.mounted) {
        showRiderMessage(context, failure.message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread =
        ref.watch(riderChatUnreadProvider).value?.byThreadKey ?? const {};
    int countFor(Counterpart c) =>
        unread[RiderApi.threadKey(trackingNumber, c)] ?? 0;
    final total = counterparts.fold<int>(0, (sum, c) => sum + countFor(c));

    return PopupMenuButton<Counterpart>(
      tooltip: 'Message',
      onSelected: (who) => _open(context, ref, who),
      itemBuilder: (_) => [
        for (final c in counterparts)
          PopupMenuItem(
            value: c,
            height: kMinTap,
            child: Row(
              children: [
                Expanded(child: Text('Message the ${c.label.toLowerCase()}')),
                if (countFor(c) > 0)
                  Badge(
                    backgroundColor: AppColors.brandRed,
                    label: Text('${countFor(c)}'),
                  ),
              ],
            ),
          ),
      ],
      child: Container(
        constraints: const BoxConstraints(minHeight: kMinTap),
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Badge(
              isLabelVisible: total > 0,
              backgroundColor: AppColors.brandRed,
              label: Text('$total'),
              child: const Icon(
                LucideIcons.messageCircle,
                size: 18,
                color: AppColors.brandRed,
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            const Text(
              'Message',
              style: TextStyle(
                color: AppColors.brandRed,
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Every delivery chat, newest first.
class RiderChatsScreen extends ConsumerWidget {
  const RiderChatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(riderApiProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Messages')),
      body: PagedList<RiderThread>(
        load: api.threads,
        spacing: AppSpace.sm,
        empty: const EmptyState(
          icon: LucideIcons.messageCircle,
          title: 'No messages yet',
          message: 'Use Message on a pickup or stop to write to the seller, the buyer or the hub.',
        ),
        itemBuilder: (context, thread) => RiderCard(
          padding: EdgeInsets.zero,
          muted: !thread.canSend,
          child: ListTile(
            minTileHeight: 72,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: AppSpace.lg,
              vertical: AppSpace.xs,
            ),
            onTap: () async {
              await context.push(RiderPaths.chat(thread.id));
              unawaited(ref.read(riderChatUnreadProvider.notifier).refresh());
            },
            leading: CircleAvatar(
              backgroundColor: AppColors.brandRedTint,
              child: Icon(
                switch (thread.counterpart) {
                  Counterpart.seller => LucideIcons.store,
                  Counterpart.hub => LucideIcons.warehouse,
                  _ => LucideIcons.user,
                },
                color: AppColors.brandRed,
                size: 20,
              ),
            ),
            title: Text(
              thread.title,
              style: TextStyle(
                fontWeight: thread.unread > 0
                    ? FontWeight.w800
                    : FontWeight.w600,
                fontSize: 16,
                color: AppColors.gray900,
              ),
            ),
            subtitle: Text(
              [
                ?thread.counterpart?.label,
                ?thread.trackingNumber,
                if (thread.lastMessage != null) thread.lastMessage!,
              ].join(' · '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  Fmt.shortWhen(thread.lastMessageAt),
                  style: const TextStyle(fontSize: 12),
                ),
                if (thread.unread > 0)
                  Badge(
                    backgroundColor: AppColors.brandRed,
                    label: Text('${thread.unread}'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One delivery thread. Plain text, 1,000 characters at most. Checks for new messages every 3 seconds while open, like
/// the website. Once the parcel is no longer active, the thread stays readable but can't be written to.
class RiderChatScreen extends ConsumerStatefulWidget {
  const RiderChatScreen({super.key, required this.threadId});

  final int threadId;

  static const maxLength = 1000;

  @override
  ConsumerState<RiderChatScreen> createState() => _RiderChatScreenState();
}

class _RiderChatScreenState extends ConsumerState<RiderChatScreen> {
  final _box = TextEditingController();
  final _scroll = ScrollController();
  RiderThread? _thread;
  List<ThreadMessage> _messages = const [];
  bool _canSend = true;
  String? _closedMessage;
  ApiFailure? _failure;
  bool _sending = false;
  bool _polling = false;
  Timer? _poll;

  RiderApi get _api => ref.read(riderApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _newMessages());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _box.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<Object>([
        _api.thread(widget.threadId),
        _api.messages(widget.threadId),
      ]);
      if (!mounted) return;
      final fetched = results[1] as ThreadMessages;
      setState(() {
        _failure = null;
        _thread = results[0] as RiderThread;
        _messages = fetched.messages;
        _canSend = fetched.canSend;
        _closedMessage = fetched.closedMessage;
      });
      _markRead();
      _toBottom();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _newMessages() async {
    if (_thread == null || _polling) return;
    _polling = true;
    try {
      final fetched = await _api.messages(
        widget.threadId,
        afterId: _messages.isEmpty ? null : _messages.last.id,
      );
      if (!mounted) return;
      final known = {for (final m in _messages) m.id};
      final fresh = fetched.messages
          .where((m) => !known.contains(m.id))
          .toList();
      setState(() {
        _messages = [..._messages, ...fresh];
        _canSend = fetched.canSend;
        _closedMessage = fetched.closedMessage;
      });
      if (fresh.isNotEmpty) {
        _markRead();
        _toBottom();
      }
    } catch (_) {
      // The next check tries again.
    } finally {
      _polling = false;
    }
  }

  void _markRead() {
    _api
        .markRead(widget.threadId)
        .then(
          (_) => ref.read(riderChatUnreadProvider.notifier).refresh(),
          onError: (_) {},
        );
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

  Future<void> _send() async {
    final body = _box.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final message = await _api.send(widget.threadId, body);
      if (!mounted) return;
      _box.clear();
      setState(() {
        if (!_messages.any((m) => m.id == message.id)) {
          _messages = [..._messages, message];
        }
      });
      _toBottom();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      if (failure.kind == FailureKind.conflict) {
        setState(() {
          _canSend = false;
          _closedMessage = failure.message;
        });
      } else {
        showRiderMessage(context, failure.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = ref.watch(currentUserProvider)?.id;
    final thread = _thread;

    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(thread?.title ?? 'Message'),
            if (thread != null)
              Text(
                [
                  ?thread.counterpart?.label,
                  ?thread.trackingNumber,
                ].join(' · '),
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.gray600,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      ),
      body: thread == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 4))
          : Column(
              children: [
                Expanded(
                  child: _messages.isEmpty
                      ? const EmptyState(
                          icon: LucideIcons.messageCircle,
                          title: 'No messages yet',
                          message: 'Say hello, or ask about the parcel.',
                        )
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(AppSpace.lg),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final m = _messages[index];
                            return _Bubble(message: m, mine: m.senderId == me);
                          },
                        ),
                ),
                if (!_canSend)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.lg,
                      0,
                      AppSpace.lg,
                      AppSpace.lg,
                    ),
                    child: SafeArea(
                      top: false,
                      child: MessageBanner(
                        message: _closedMessage ?? 'This chat is closed.',
                        tone: StatusTone.gray,
                      ),
                    ),
                  )
                else
                  _Composer(controller: _box, sending: _sending, onSend: _send),
              ],
            ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine});

  final ThreadMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpace.sm),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.md,
          vertical: AppSpace.sm,
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.brandRed : AppColors.white,
          borderRadius: BorderRadius.circular(16),
          border: mine ? null : Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && message.senderName != null)
              Text(
                message.senderName!,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray600,
                ),
              ),
            // Plain text only: never read as markup or a link.
            Text(
              message.body,
              style: TextStyle(
                fontSize: 16,
                color: mine ? AppColors.white : AppColors.gray900,
              ),
            ),
            Text(
              Fmt.shortWhen(message.createdAt),
              style: TextStyle(
                fontSize: 11,
                color: mine
                    ? AppColors.white.withValues(alpha: 0.8)
                    : AppColors.gray600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.md,
            AppSpace.sm,
            AppSpace.sm,
            AppSpace.sm,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: RiderChatScreen.maxLength,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'Type a message',
                    counterText: '',
                  ),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              IconButton.filled(
                tooltip: 'Send',
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.brandRed,
                  minimumSize: const Size(52, 52),
                ),
                onPressed: sending ? null : onSend,
                icon: sending
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          color: AppColors.white,
                        ),
                      )
                    : const Icon(LucideIcons.send, color: AppColors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
