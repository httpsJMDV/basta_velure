import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/sound/notification_sound.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

/// Opens [NotificationSoundScreen] over the whole app (any home's account or More screen).
Future<void> openNotificationSound(BuildContext context) =>
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(builder: (_) => const NotificationSoundScreen()),
    );

/// The row on an account or More screen: what plays now, and the way to change it.
class NotificationSoundTile extends ConsumerWidget {
  const NotificationSoundTile({super.key, this.color = AppColors.stone700});

  /// The area's text colour (stone for the shop, gray for the rider and logistics screens).
  final Color color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sound = NotificationSound.byId(ref.watch(notificationSoundProvider));
    return ListTile(
      minTileHeight: 60,
      leading: Icon(
        sound.isOff ? LucideIcons.volumeX : LucideIcons.bellRing,
        color: color,
      ),
      title: Text(
        'Notification sound',
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
      subtitle: Text(
        sound.name,
        style: const TextStyle(fontSize: 13, color: AppColors.stone500),
      ),
      trailing: const Icon(
        LucideIcons.chevronRight,
        size: 18,
        color: AppColors.stone400,
      ),
      onTap: () => openNotificationSound(context),
    );
  }
}

/// Choose the sound a new notification or message makes while Loved-IT is open. Tapping one plays it and keeps it.
class NotificationSoundScreen extends ConsumerWidget {
  const NotificationSoundScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chosen = ref.watch(notificationSoundProvider);
    final sounds = NotificationSound.all.where((s) => !s.isOff).toList();
    final off = NotificationSound.byId(NotificationSound.off);

    void choose(NotificationSound sound) {
      HapticFeedback.selectionClick();
      ref.read(notificationSoundProvider.notifier).choose(sound.id);
      ref.read(soundPlayerProvider).play(sound.id, preview: true);
    }

    return Scaffold(
      backgroundColor: AppColors.cream,
      appBar: AppBar(
        title: const Text('Notification sound'),
        backgroundColor: AppColors.cream,
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.xs,
          AppSpace.lg,
          AppSpace.xl + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          const Text(
            'Plays when a notification or a message arrives while Loved-IT is open. Your phone\'s notification '
            'volume, silent mode and Do Not Disturb still apply. Tap a sound to hear it.',
            style: TextStyle(
              fontSize: 13.5,
              height: 1.45,
              color: AppColors.stone600,
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          _Group(
            children: [
              for (final sound in sounds)
                _SoundRow(
                  sound: sound,
                  selected: sound.id == chosen,
                  onTap: () => choose(sound),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          _Group(
            children: [
              _SoundRow(
                sound: off,
                selected: chosen == NotificationSound.off,
                onTap: () => choose(off),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.only(top: 1),
                child: Icon(
                  LucideIcons.info,
                  size: 14,
                  color: AppColors.stone400,
                ),
              ),
              SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  'Kept on this phone. On the website, choose a sound under the bell.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: AppColors.stone500,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.stone200),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              const Divider(height: 1, indent: 64, color: AppColors.stone100),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _SoundRow extends StatelessWidget {
  const _SoundRow({
    required this.sound,
    required this.selected,
    required this.onTap,
  });

  final NotificationSound sound;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: '${sound.name}. ${sound.hint}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.lg,
            vertical: 13,
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: selected ? AppColors.brandRed : AppColors.stone100,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  sound.isOff
                      ? LucideIcons.volumeX
                      : selected
                      ? LucideIcons.volume2
                      : LucideIcons.play,
                  size: 16,
                  color: selected ? AppColors.white : AppColors.stone600,
                ),
              ),
              const SizedBox(width: AppSpace.md + 2),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      sound.name,
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w600,
                        color: AppColors.stone900,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      sound.hint,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.stone500,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Icon(
                  LucideIcons.check,
                  size: 18,
                  color: AppColors.brandRed,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
