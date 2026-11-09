import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/realtime/realtime.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/badges.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// The inboxes of the Messages tab, like the website's Messages sidebar: everything, shops, the rider bringing a
/// parcel, and Loved-IT Support. Each shows how many of its chats have unread messages.
enum MessageInbox {
  all('All'),
  shops('Shops'),
  delivery('Delivery'),
  support('Support');

  const MessageInbox(this.label);

  final String label;

  bool includes(Conversation chat) => switch (this) {
    MessageInbox.all => true,
    MessageInbox.shops => !chat.isRider && !chat.isSupport,
    MessageInbox.delivery => chat.isRider,
    MessageInbox.support => chat.isSupport,
  };

  /// Chats in this inbox with unread messages (the website counts chats, not messages).
  int unreadChats(List<Conversation> chats) =>
      chats.where((chat) => includes(chat) && chat.unread > 0).length;
}

/// The Messages tab (B11): chats with shops, the rider bringing a parcel, and Loved-IT Support. There is no live
/// connection on the server yet, so while this tab is on screen the list checks for new messages every few seconds
/// (and at once when a live event does arrive), and the Messages badge on the dock follows it.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  /// How often an open Messages tab checks for new messages.
  static const pollEvery = Duration(seconds: 8);

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  StreamSubscription<void>? _live;
  Timer? _poll;
  List<Conversation>? _chats;
  ApiFailure? _failure;
  MessageInbox _inbox = MessageInbox.all;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _load();
    _live = ref
        .read(realtimeProvider)
        ?.conversationUpdates()
        .listen((_) => _load(), onError: (_) {});
    _poll = Timer.periodic(MessagesScreen.pollEvery, (_) => _tick());
  }

  @override
  void dispose() {
    _live?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  /// Only while this tab shows and no chat is open over it.
  void _tick() {
    if (!mounted || !TickerMode.valuesOf(context).enabled) return;
    if (ModalRoute.of(context)?.isCurrent == false) return;
    _load();
  }

  /// Reloads quietly: the list stays on screen while it checks, and a failed check keeps what is shown.
  Future<void> _load() async {
    if (_loading) return;
    _loading = true;
    try {
      final chats = await ref.read(buyerApiProvider).conversations();
      if (!mounted) return;
      final shown = [
        // Opening Support creates its chat. Until it has a message, the card above already opens it, so a second
        // row would only repeat it.
        for (final chat in chats)
          if (!chat.isSupport || chat.lastMessage != null || chat.unread > 0)
            chat,
      ];
      setState(() {
        _chats = shown;
        _failure = null;
      });
      ref
          .read(unreadMessagesProvider.notifier)
          .show(shown.fold(0, (sum, chat) => sum + chat.unread));
    } catch (error) {
      if (mounted && _chats == null) {
        setState(() => _failure = ApiFailure.from(error));
      }
    } finally {
      _loading = false;
    }
  }

  Future<void> _openSupport() async {
    try {
      final id = await ref.read(buyerApiProvider).startChat();
      if (mounted) await _open(id);
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  Future<void> _open(int conversationId) async {
    await context.push(BuyerPaths.chat(conversationId));
    // Opening a chat marks it read.
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final chats = _chats;
    final visible = chats?.where(_inbox.includes).toList();
    final showSupportCard =
        _inbox == MessageInbox.all || _inbox == MessageInbox.support;

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: RefreshIndicator(
        color: AppColors.brandRed,
        onRefresh: () async {
          await _load();
          await ref.read(unreadMessagesProvider.notifier).refresh();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: _InboxTabs(
                selected: _inbox,
                counts: {
                  for (final inbox in MessageInbox.values)
                    inbox: chats == null ? 0 : inbox.unreadChats(chats),
                },
                onSelected: (inbox) => setState(() => _inbox = inbox),
              ),
            ),
            if (showSupportCard)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpace.xs),
                  child: BlockCard(
                    padding: EdgeInsets.zero,
                    child: MenuRow(
                      icon: LucideIcons.headset,
                      iconColor: AppColors.brandRed,
                      iconBackground: AppColors.brandRedTint,
                      title: 'Loved-IT Support',
                      subtitle: 'Questions about orders, payments and returns',
                      onTap: _openSupport,
                    ),
                  ),
                ),
              ),
            if (_failure != null && chats == null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: ErrorRetry(
                  failure: _failure!,
                  onRetry: () {
                    setState(() => _failure = null);
                    _load();
                  },
                ),
              )
            else if (visible == null)
              const SliverToBoxAdapter(
                child: SizedBox(height: 520, child: SkeletonList(count: 5)),
              )
            else if (visible.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyInbox(inbox: _inbox),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  AppSpace.sm,
                  0,
                  AppSpace.sm,
                  AppSpace.lg + MediaQuery.paddingOf(context).bottom,
                ),
                sliver: SliverList.separated(
                  itemCount: visible.length,
                  separatorBuilder: (_, _) =>
                      const SizedBox(height: AppSpace.xs),
                  itemBuilder: (_, index) => _ConversationTile(
                    conversation: visible[index],
                    onTap: () => _open(visible[index].id),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The inbox pills, each with its count of chats that have unread messages.
class _InboxTabs extends StatelessWidget {
  const _InboxTabs({
    required this.selected,
    required this.counts,
    required this.onSelected,
  });

  final MessageInbox selected;
  final Map<MessageInbox, int> counts;
  final ValueChanged<MessageInbox> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.xs,
        AppSpace.lg,
        AppSpace.sm,
      ),
      child: Row(
        children: [
          for (final inbox in MessageInbox.values) ...[
            if (inbox != MessageInbox.all) const SizedBox(width: AppSpace.sm),
            _InboxPill(
              label: inbox.label,
              count: counts[inbox] ?? 0,
              selected: inbox == selected,
              onTap: () => onSelected(inbox),
            ),
          ],
        ],
      ),
    );
  }
}

class _InboxPill extends StatelessWidget {
  const _InboxPill({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: count > 0 ? '$label, $count unread' : label,
      excludeSemantics: true,
      child: Material(
        color: selected ? AppColors.ink : AppColors.white,
        shape: StadiumBorder(
          side: BorderSide(
            color: selected ? AppColors.ink : AppColors.stone200,
          ),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.fromLTRB(14, 8, count > 0 ? 8 : 14, 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? AppColors.white : AppColors.stone700,
                  ),
                ),
                if (count > 0) ...[
                  const SizedBox(width: 6),
                  Container(
                    constraints: const BoxConstraints(minWidth: 20),
                    height: 20,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: selected ? AppColors.white : AppColors.brandRed,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: PopOnChange(
                      value: count,
                      child: Text(
                        count > 99 ? '99+' : '$count',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          fontFeatures: const [FontFeature.tabularFigures()],
                          color: selected
                              ? AppColors.brandRed
                              : AppColors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox({required this.inbox});

  final MessageInbox inbox;

  @override
  Widget build(BuildContext context) {
    final (title, message) = switch (inbox) {
      MessageInbox.all => (
        'No messages yet',
        'Chat with a shop from its page or a product, or ask Loved-IT Support.',
      ),
      MessageInbox.shops => (
        'No chats with shops',
        'Tap Chat on a product or a shop page to ask the seller.',
      ),
      MessageInbox.delivery => (
        'No rider chats',
        'The rider bringing your parcel can message you here while it is on the way.',
      ),
      MessageInbox.support => (
        'No support chats yet',
        'Tap Loved-IT Support above to ask about an order, a payment or a return.',
      ),
    };
    return EmptyState(
      icon: LucideIcons.messageCircle,
      title: title,
      message: message,
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.onTap});

  final Conversation conversation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final unread = conversation.unread > 0;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.sm,
            vertical: 10,
          ),
          child: Row(
            children: [
              if (conversation.isRider)
                const _RoundIcon(
                  icon: LucideIcons.bike,
                  color: AppColors.stone700,
                  background: AppColors.stone100,
                )
              else if (conversation.isSupport)
                const _RoundIcon(
                  icon: LucideIcons.headset,
                  color: AppColors.brandRed,
                  background: AppColors.brandRedTint,
                )
              else
                ShopAvatar(
                  name: conversation.title,
                  url: conversation.avatarUrl,
                  size: 50,
                ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                        color: AppColors.stone900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      conversation.lastMessage ?? conversation.subtitle ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13.5,
                        color: unread ? AppColors.stone900 : AppColors.stone500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    Fmt.shortWhen(conversation.lastMessageAt),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
                      color: unread ? AppColors.brandRed : AppColors.stone500,
                    ),
                  ),
                  const SizedBox(height: 5),
                  if (unread)
                    Container(
                      constraints: const BoxConstraints(minWidth: 20),
                      height: 20,
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                        color: AppColors.brandRed,
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                      child: Text(
                        '${conversation.unread}',
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    )
                  else if (!conversation.canSend)
                    const StatusChip(label: 'Closed', tone: StatusTone.gray),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({
    required this.icon,
    required this.color,
    required this.background,
  });

  final IconData icon;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, size: 22, color: color),
    );
  }
}
