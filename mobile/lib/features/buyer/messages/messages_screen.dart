import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
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

/// The Messages tab (B11): chats with shops, the rider bringing a parcel, and Loved-IT Support. The list follows
/// the live channel, so a new message moves its chat to the top.
class MessagesScreen extends ConsumerStatefulWidget {
  const MessagesScreen({super.key});

  @override
  ConsumerState<MessagesScreen> createState() => _MessagesScreenState();
}

class _MessagesScreenState extends ConsumerState<MessagesScreen> {
  final _list = GlobalKey<PagedListState<Conversation>>();
  StreamSubscription<void>? _live;

  @override
  void initState() {
    super.initState();
    _live = ref
        .read(realtimeProvider)
        ?.conversationUpdates()
        .listen((_) => _list.currentState?.refresh(), onError: (_) {});
  }

  @override
  void dispose() {
    _live?.cancel();
    super.dispose();
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
    ref.read(unreadMessagesProvider.notifier).refresh();
    await _list.currentState?.refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: PagedList<Conversation>(
        key: _list,
        spacing: AppSpace.xs,
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
        onRefresh: () => ref.read(unreadMessagesProvider.notifier).refresh(),
        load: (_) async {
          final chats = await ref.read(buyerApiProvider).conversations();
          // Opening Support creates its chat. Until it has a message, the card
          // above already opens it, so a second row would only repeat it.
          return ApiPage.single([
            for (final chat in chats)
              if (!chat.isSupport ||
                  chat.lastMessage != null ||
                  chat.unread > 0)
                chat,
          ]);
        },
        itemBuilder: (_, conversation) => _ConversationTile(
          conversation: conversation,
          onTap: () => _open(conversation.id),
        ),
        empty: const EmptyState(
          icon: LucideIcons.messageCircle,
          title: 'No messages yet',
          message: 'Chat with a shop from its page or a product, or ask Loved-IT Support.',
        ),
        header: [
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
        ],
      ),
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
