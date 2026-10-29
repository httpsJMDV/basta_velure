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
        spacing: 0,
        padding: EdgeInsets.zero,
        onRefresh: () => ref.read(unreadMessagesProvider.notifier).refresh(),
        load: (_) async =>
            ApiPage.single(await ref.read(buyerApiProvider).conversations()),
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
            child: ListTile(
              minTileHeight: 72,
              onTap: _openSupport,
              leading: const CircleAvatar(
                backgroundColor: AppColors.brandRedTint,
                child: Icon(LucideIcons.headset, color: AppColors.brandRed),
              ),
              title: const Text(
                'Loved-IT Support',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Questions about orders, payments and returns',
              ),
              trailing: const Icon(LucideIcons.chevronRight, size: 18),
            ),
          ),
          const SliverToBoxAdapter(child: Divider(height: 1)),
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
    return ListTile(
      minTileHeight: 72,
      onTap: onTap,
      leading: conversation.isRider
          ? const CircleAvatar(
              backgroundColor: AppColors.stone100,
              child: Icon(LucideIcons.bike, color: AppColors.stone700),
            )
          : conversation.isSupport
          ? const CircleAvatar(
              backgroundColor: AppColors.brandRedTint,
              child: Icon(LucideIcons.headset, color: AppColors.brandRed),
            )
          : ShopAvatar(
              name: conversation.title,
              url: conversation.avatarUrl,
              size: 40,
            ),
      title: Text(
        conversation.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
      subtitle: Text(
        conversation.lastMessage ?? conversation.subtitle ?? '',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: unread ? AppColors.stone900 : AppColors.stone500,
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            Fmt.shortWhen(conversation.lastMessageAt),
            style: const TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
          const SizedBox(height: 4),
          if (unread)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
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
    );
  }
}
