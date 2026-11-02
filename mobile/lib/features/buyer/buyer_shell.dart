import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/motion.dart';
import 'data/badges.dart';
import 'data/cart.dart';
import 'widgets/buyer_theme.dart';

/// The buyer app's frame (B0): a dock floating over the page, each tab keeping its own place when you switch. On the
/// browsing tabs the dock slides away while scrolling down and comes back on the way up.
class BuyerShell extends ConsumerStatefulWidget {
  const BuyerShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  ConsumerState<BuyerShell> createState() => _BuyerShellState();
}

class _BuyerShellState extends ConsumerState<BuyerShell> {
  bool _dockHidden = false;

  bool _onScroll(UserScrollNotification notification) {
    if (notification.metrics.axis != Axis.vertical) return false;
    // Home and Categories are for browsing; the other tabs have actions near the dock, so it stays.
    final browsing = widget.shell.currentIndex <= 1;
    final hide =
        browsing &&
        notification.direction == ScrollDirection.reverse &&
        notification.metrics.pixels > 80;
    final show = notification.direction == ScrollDirection.forward || !browsing;
    if (hide && !_dockHidden) setState(() => _dockHidden = true);
    if (show && _dockHidden) setState(() => _dockHidden = false);
    return false;
  }

  void _select(int index) {
    final shell = widget.shell;
    if (index != shell.currentIndex) HapticFeedback.selectionClick();
    setState(() => _dockHidden = false);
    // Tapping the open tab again goes back to its first screen.
    shell.goBranch(index, initialLocation: index == shell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    final cartLines = ref.watch(cartProvider).value?.lines ?? 0;
    final unread = ref.watch(unreadMessagesProvider).value ?? 0;

    return BuyerThemed(
      child: Scaffold(
        extendBody: true,
        body: NotificationListener<UserScrollNotification>(
          onNotification: _onScroll,
          child: widget.shell,
        ),
        bottomNavigationBar: AnimatedSlide(
          offset: _dockHidden ? const Offset(0, 1.3) : Offset.zero,
          duration: Motion.medium,
          curve: Motion.glide,
          child: BuyerDock(
            index: widget.shell.currentIndex,
            onSelected: _select,
            items: [
              const DockItem(icon: LucideIcons.house, label: 'Home'),
              const DockItem(icon: LucideIcons.layoutGrid, label: 'Categories'),
              DockItem(
                icon: LucideIcons.messageCircle,
                label: 'Messages',
                count: unread,
              ),
              DockItem(
                icon: LucideIcons.shoppingBag,
                label: 'Cart',
                count: cartLines,
              ),
              const DockItem(icon: LucideIcons.userRound, label: 'Account'),
            ],
          ),
        ),
      ),
    );
  }
}

/// The five tabs fade across instead of jumping. Each keeps its place, and a hidden tab stops all its animations.
class BuyerBranches extends StatelessWidget {
  const BuyerBranches({super.key, required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.disableAnimationsOf(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        for (var i = 0; i < children.length; i++)
          IgnorePointer(
            ignoring: i != index,
            child: ExcludeSemantics(
              excluding: i != index,
              child: AnimatedOpacity(
                opacity: i == index ? 1 : 0,
                duration: still ? Duration.zero : Motion.medium,
                curve: Motion.settle,
                child: AnimatedSlide(
                  offset: i == index ? Offset.zero : const Offset(0, 0.012),
                  duration: still ? Duration.zero : Motion.medium,
                  curve: Motion.settle,
                  // Inside the fade: around it, a closed tab's fade would stop
                  // too and leave it on screen.
                  child: TickerMode(enabled: i == index, child: children[i]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class DockItem {
  const DockItem({required this.icon, required this.label, this.count = 0});

  final IconData icon;
  final String label;
  final int count;
}

/// The floating dock: a dark rounded bar, with a red capsule that glides to the open tab and opens to show its name.
class BuyerDock extends StatelessWidget {
  const BuyerDock({
    super.key,
    required this.index,
    required this.onSelected,
    required this.items,
  });

  final int index;
  final ValueChanged<int> onSelected;
  final List<DockItem> items;

  static const _height = 64.0;
  static const _inner = 6.0;

  @override
  Widget build(BuildContext context) {
    final duration = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : Motion.medium;
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: Center(
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Container(
            height: _height,
            padding: const EdgeInsets.all(_inner),
            decoration: BoxDecoration(
              color: AppColors.ink,
              borderRadius: BorderRadius.circular(22),
              boxShadow: BuyerShadow.floating,
            ),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final width = constraints.maxWidth;
                final open = (width * 0.36).clamp(112.0, 148.0);
                final closed = (width - open) / (items.length - 1);
                return Stack(
                  children: [
                    AnimatedPositioned(
                      duration: duration,
                      curve: Motion.glide,
                      left: index * closed,
                      top: 0,
                      bottom: 0,
                      width: open,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: AppColors.brandRed,
                          borderRadius: BorderRadius.circular(17),
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        for (var i = 0; i < items.length; i++)
                          _DockTab(
                            item: items[i],
                            selected: i == index,
                            width: i == index ? open : closed,
                            duration: duration,
                            onTap: () => onSelected(i),
                          ),
                      ],
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _DockTab extends StatelessWidget {
  const _DockTab({
    required this.item,
    required this.selected,
    required this.width,
    required this.duration,
    required this.onTap,
  });

  final DockItem item;
  final bool selected;
  final double width;
  final Duration duration;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final foreground = selected ? AppColors.white : const Color(0xFFB9B3AC);
    return Tooltip(
      message: item.count > 0
          ? '${item.label}, ${item.count} ${item.label == 'Cart' ? 'items' : 'unread'}'
          : item.label,
      excludeFromSemantics: true,
      child: Semantics(
        button: true,
        selected: selected,
        label: item.label,
        value: item.count > 0 ? '${item.count}' : null,
        excludeSemantics: true,
        onTap: onTap,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: AnimatedContainer(
            duration: duration,
            curve: Motion.glide,
            width: width,
            alignment: Alignment.center,
            clipBehavior: Clip.hardEdge,
            decoration: const BoxDecoration(),
            child: OverflowBox(
              maxWidth: double.infinity,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _DockIcon(
                    icon: item.icon,
                    count: item.count,
                    color: foreground,
                    selected: selected,
                  ),
                  AnimatedSize(
                    duration: duration,
                    curve: Motion.glide,
                    alignment: Alignment.centerLeft,
                    child: selected
                        ? Padding(
                            padding: const EdgeInsets.only(left: AppSpace.sm),
                            child: Text(
                              item.label,
                              maxLines: 1,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.white,
                              ),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DockIcon extends StatelessWidget {
  const _DockIcon({
    required this.icon,
    required this.count,
    required this.color,
    required this.selected,
  });

  final IconData icon;
  final int count;
  final Color color;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Badge(
      isLabelVisible: count > 0,
      backgroundColor: selected ? AppColors.white : AppColors.brandRed,
      textColor: selected ? AppColors.brandRed : AppColors.white,
      offset: const Offset(7, -6),
      label: PopOnChange(
        value: count,
        child: Text(count > 99 ? '99+' : '$count'),
      ),
      child: AnimatedScale(
        scale: selected ? 1.04 : 1,
        duration: Motion.medium,
        curve: Motion.settle,
        child: Icon(icon, size: 21, color: color),
      ),
    );
  }
}
