import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

/// The hub's Messages (D8): its courier company pinned on top, then the threads riders started.
class HubChatsScreen extends ConsumerStatefulWidget {
  const HubChatsScreen({super.key});

  @override
  ConsumerState<HubChatsScreen> createState() => _HubChatsScreenState();
}

class _HubChatsScreenState extends ConsumerState<HubChatsScreen> {
  final _list = GlobalKey<PagedListState<RiderThreadRow>>();
  CourierThread? _courier;

  @override
  void initState() {
    super.initState();
    _loadCourier();
  }

  Future<void> _loadCourier() async {
    try {
      final thread = await ref.read(hubApiProvider).courierThread();
      if (mounted) setState(() => _courier = thread);
    } catch (_) {
      // The pinned row still opens the chat, which says what went wrong.
    }
  }

  Future<void> _open(String path, {String? title}) async {
    await context.push(path, extra: title);
    if (!mounted) return;
    unawaited(ref.read(hubUnreadProvider.notifier).refresh());
    unawaited(_loadCourier());
    unawaited(_list.currentState?.refresh());
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.read(hubApiProvider);
    final courier = _courier;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Messages')),
      body: PagedList<RiderThreadRow>(
        key: _list,
        load: (page) async => (await api.riderThreads(page)).page,
        onRefresh: _loadCourier,
        spacing: AppSpace.sm,
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.sm,
          AppSpace.lg,
          AppSpace.lg,
        ),
        header: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.lg,
              AppSpace.lg,
              0,
            ),
            sliver: SliverToBoxAdapter(
              child: _ThreadTile(
                icon: LucideIcons.truck,
                title: courier?.companyName ?? 'Your courier company',
                subtitle: courier?.lastMessage ?? 'Write to your courier team.',
                when: courier?.lastMessageAt,
                unread: courier?.unread ?? 0,
                onTap: () => _open(
                  LogisticsPaths.hubCourierChat,
                  title: courier?.companyName,
                ),
              ),
            ),
          ),
        ],
        empty: const EmptyState(
          icon: LucideIcons.messageCircle,
          title: 'No rider messages yet',
          message: 'Riders can write to the hub about a parcel, during pickup or delivery.',
        ),
        itemBuilder: (context, thread) => _ThreadTile(
          icon: LucideIcons.bike,
          title: thread.riderName,
          subtitle: [?thread.trackingNumber, ?thread.lastMessage].join(' · '),
          when: thread.lastMessageAt,
          unread: thread.unread,
          muted: !thread.canSend,
          onTap: () => _open(
            LogisticsPaths.hubRiderChat(thread.id),
            title: thread.riderName,
          ),
        ),
      ),
    );
  }
}

/// The courier team's Messages (D8): one thread with each of its hubs.
class CourierChatsScreen extends ConsumerStatefulWidget {
  const CourierChatsScreen({super.key});

  @override
  ConsumerState<CourierChatsScreen> createState() => _CourierChatsScreenState();
}

class _CourierChatsScreenState extends ConsumerState<CourierChatsScreen> {
  final _view = GlobalKey<LoadViewState<List<HubThreadRow>>>();

  Future<void> _open(HubThreadRow row) async {
    final api = ref.read(courierApiProvider);
    try {
      final id = row.threadId ?? await api.openHubThread(row.hubId);
      if (!mounted) return;
      await context.push(LogisticsPaths.courierChat(id), extra: row.hubName);
      if (!mounted) return;
      unawaited(ref.read(courierUnreadProvider.notifier).refresh());
      unawaited(_view.currentState?.reload());
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Messages')),
      body: LoadView<List<HubThreadRow>>(
        key: _view,
        load: ref.read(courierApiProvider).chatHubs,
        builder: (context, rows) => rows.isEmpty
            ? ListView(
                children: const [
                  SizedBox(
                    height: 360,
                    child: EmptyState(
                      icon: LucideIcons.messageCircle,
                      title: 'No hubs to write to yet',
                      message:
                          'Once you approve a hub, you can message it here.',
                    ),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(AppSpace.lg),
                itemCount: rows.length,
                separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
                itemBuilder: (context, index) {
                  final row = rows[index];
                  return _ThreadTile(
                    icon: LucideIcons.warehouse,
                    title: row.hubName,
                    subtitle: row.lastMessage ?? row.place,
                    when: row.lastMessageAt,
                    unread: row.unread,
                    onTap: () => _open(row),
                  );
                },
              ),
      ),
    );
  }
}

class _ThreadTile extends StatelessWidget {
  const _ThreadTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.when,
    this.unread = 0,
    this.muted = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final DateTime? when;
  final int unread;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      muted: muted,
      child: ListTile(
        minTileHeight: 72,
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: AppColors.gray100,
          child: Icon(icon, size: 20, color: AppColors.gray900),
        ),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 16,
            fontWeight: unread > 0 ? FontWeight.w800 : FontWeight.w600,
            color: AppColors.gray900,
          ),
        ),
        subtitle: Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(Fmt.shortWhen(when), style: const TextStyle(fontSize: 12)),
            if (unread > 0)
              Badge(
                backgroundColor: AppColors.brandRed,
                label: Text('$unread'),
              ),
          ],
        ),
      ),
    );
  }
}

/// What differs between the three kinds of thread. [myRole] decides which side a message sits on, so a courier team
/// member also sees a teammate's messages on their own side.
class ChatConnection {
  const ChatConnection({
    required this.myRole,
    required this.fetch,
    required this.send,
    required this.markRead,
  });

  final String myRole;
  final Future<ChatMessages> Function({int? afterId}) fetch;
  final Future<ChatMessage> Function(String body) send;
  final Future<void> Function() markRead;
}

/// One logistics thread (D8). Plain text, 1,000 characters at most. Checks for new messages every 3 seconds while
/// open, like the website. A thread the server closed stays readable but can't be written to.
class LogisticsChatScreen extends ConsumerStatefulWidget {
  const LogisticsChatScreen({
    super.key,
    required this.title,
    required this.connection,
    this.subtitle,
    this.onRead,
  });

  final String title;
  final String? subtitle;
  final ChatConnection Function(WidgetRef ref) connection;

  /// Refreshes the badge once messages were read.
  final void Function(WidgetRef ref)? onRead;

  @override
  ConsumerState<LogisticsChatScreen> createState() =>
      _LogisticsChatScreenState();
}

class _LogisticsChatScreenState extends ConsumerState<LogisticsChatScreen> {
  final _box = TextEditingController();
  final _scroll = ScrollController();
  late final ChatConnection _connection = widget.connection(ref);
  List<ChatMessage>? _messages;
  bool _canSend = true;
  String? _closedMessage;
  ApiFailure? _failure;
  bool _sending = false;
  bool _polling = false;
  Timer? _poll;

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
    setState(() => _failure = null);
    try {
      final fetched = await _connection.fetch();
      if (!mounted) return;
      setState(() {
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
    final known = _messages;
    if (known == null || _polling) return;
    _polling = true;
    try {
      final fetched = await _connection.fetch(
        afterId: known.isEmpty ? null : known.last.id,
      );
      if (!mounted) return;
      final ids = {for (final m in known) m.id};
      final fresh = fetched.messages.where((m) => !ids.contains(m.id)).toList();
      setState(() {
        _messages = [...?_messages, ...fresh];
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
    _connection.markRead().then((_) {
      if (mounted) widget.onRead?.call(ref);
    }, onError: (_) {});
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
      final message = await _connection.send(body);
      if (!mounted) return;
      _box.clear();
      setState(() {
        if (!(_messages ?? const []).any((m) => m.id == message.id)) {
          _messages = [...?_messages, message];
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
    final messages = _messages;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title),
            if (widget.subtitle != null)
              Text(
                widget.subtitle!,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.gray600,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      ),
      body: messages == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 4))
          : Column(
              children: [
                Expanded(
                  child: messages.isEmpty
                      ? const EmptyState(
                          icon: LucideIcons.messageCircle,
                          title: 'No messages yet',
                          message: 'Say hello, or ask about a parcel.',
                        )
                      : ListView.builder(
                          controller: _scroll,
                          padding: const EdgeInsets.all(AppSpace.lg),
                          itemCount: messages.length,
                          itemBuilder: (context, index) {
                            final message = messages[index];
                            return _Bubble(
                              message: message,
                              mine: message.senderRole == _connection.myRole,
                            );
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

  final ChatMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final name = message.senderName;
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
          color: mine ? AppColors.gray900 : AppColors.white,
          borderRadius: BorderRadius.circular(16),
          border: mine ? null : Border.all(color: AppColors.gray200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (name != null && name != 'You')
              Text(
                name,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: mine
                      ? AppColors.white.withValues(alpha: 0.8)
                      : AppColors.gray600,
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
                  maxLength: 1000,
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
                  backgroundColor: AppColors.gray900,
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
