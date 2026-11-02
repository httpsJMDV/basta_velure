import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../location/location_beacon.dart';
import '../widgets/rider_widgets.dart';
import 'route_map.dart';
import 'route_map_services.dart';

export 'route_map.dart' show RouteStop;

/// The whole route: the map fills the screen, with the stops as cards along the bottom. Swiping a card flies the map to
/// that stop, and tapping a pin brings up its card.
class RouteMapScreen extends ConsumerStatefulWidget {
  const RouteMapScreen({super.key, required this.stops});

  final List<RouteStop> stops;

  @override
  ConsumerState<RouteMapScreen> createState() => _RouteMapScreenState();
}

class _RouteMapScreenState extends ConsumerState<RouteMapScreen> {
  final _handle = RouteMapHandle();
  final _pages = PageController(viewportFraction: 0.9);
  late final RouteMapData _data = RouteMapData(
    ref.read(routeMapServicesProvider),
    widget.stops,
  );
  int _page = 0;
  bool _previewing = false;

  @override
  void dispose() {
    _data.dispose();
    _pages.dispose();
    super.dispose();
  }

  void _pinTapped(int number) {
    final index = widget.stops.indexWhere((stop) => stop.number == number);
    if (index < 0) return;
    _handle.stopPreview();
    _showCard(index);
  }

  /// The preview has reached a stop: its card comes up, and the map keeps following the vehicle.
  void _reached(int number) {
    final index = widget.stops.indexWhere((stop) => stop.number == number);
    if (index >= 0 && mounted) _showCard(index);
  }

  void _showCard(int index) {
    if (MediaQuery.disableAnimationsOf(context)) {
      _pages.jumpToPage(index);
    } else {
      _pages.animateToPage(
        index,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final hasFix = ref.watch(riderFixProvider) != null;
    final count = widget.stops.length;
    const cardsHeight = 196.0;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        body: Stack(
          children: [
            Positioned.fill(
              child: RouteMap(
                data: _data,
                interactive: true,
                controller: _handle,
                selectedNumber: widget.stops[_page].number,
                onSelect: _pinTapped,
                onStopReached: _reached,
                onPreviewChanged: (on) => setState(() => _previewing = on),
                padding: EdgeInsets.fromLTRB(
                  56,
                  top + 96,
                  56,
                  bottom + cardsHeight + 40,
                ),
              ),
            ),
            Positioned(
              top: top + AppSpace.sm,
              left: AppSpace.lg,
              right: AppSpace.lg,
              child: Row(
                children: [
                  _RoundButton(
                    icon: LucideIcons.arrowLeft,
                    tooltip: 'Back',
                    onTap: () => context.pop(),
                  ),
                  const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      alignment: Alignment.centerLeft,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpace.lg,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: _shadow,
                      ),
                      child: AnimatedBuilder(
                        animation: _data,
                        builder: (_, _) => Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '$count stop${count == 1 ? '' : 's'}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink,
                              ),
                            ),
                            Text(
                              _statusLine(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: RiderText.label,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              right: AppSpace.lg,
              bottom: bottom + cardsHeight + 28,
              child: Column(
                children: [
                  // Plays the trip: the vehicle drives the road with the camera behind it.
                  AnimatedBuilder(
                    animation: _data,
                    builder: (context, _) =>
                        _data.path == null ||
                            MediaQuery.disableAnimationsOf(context)
                        ? const SizedBox.shrink()
                        : Padding(
                            padding: const EdgeInsets.only(bottom: AppSpace.sm),
                            child: _RoundButton(
                              icon: _previewing
                                  ? LucideIcons.square
                                  : LucideIcons.play,
                              tooltip: _previewing
                                  ? 'Stop the preview'
                                  : 'Preview the route',
                              highlighted: _previewing,
                              onTap: _previewing
                                  ? _handle.stopPreview
                                  : _handle.startPreview,
                            ),
                          ),
                  ),
                  _RoundButton(
                    icon: LucideIcons.maximize,
                    tooltip: 'Show the whole route',
                    onTap: _handle.showAll,
                  ),
                  if (hasFix) ...[
                    const SizedBox(height: AppSpace.sm),
                    _RoundButton(
                      icon: LucideIcons.locateFixed,
                      tooltip: 'Show where I am',
                      onTap: _handle.showRider,
                    ),
                  ],
                ],
              ),
            ),
            Positioned(
              left: AppSpace.lg,
              bottom: bottom + cardsHeight + AppSpace.lg + 8,
              child: const MapCredit(),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: bottom + AppSpace.md,
              height: cardsHeight,
              child: AnimatedBuilder(
                animation: _data,
                builder: (_, _) => PageView.builder(
                  controller: _pages,
                  itemCount: widget.stops.length,
                  onPageChanged: (page) {
                    setState(() => _page = page);
                    _handle.showStop(widget.stops[page].number);
                  },
                  itemBuilder: (_, index) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: _StopCard(
                      stop: widget.stops[index],
                      located: _data.located[widget.stops[index].number],
                      searched: _data.searched,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _statusLine() {
    if (_previewing) return 'Previewing your route';
    if (_data.distanceLine != null) return _data.distanceLine!;
    if (!_data.searched) return 'Finding the addresses…';
    if (_data.located.isEmpty) return 'The addresses were not found on the map';
    return 'Your stops on the map';
  }
}

const _shadow = [
  BoxShadow(color: Color(0x26000000), blurRadius: 14, offset: Offset(0, 4)),
];

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.highlighted = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: _shadow,
        ),
        child: Material(
          color: highlighted ? AppColors.brandRed : AppColors.white,
          shape: const CircleBorder(),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: SizedBox(
              width: 48,
              height: 48,
              child: Icon(
                icon,
                size: 20,
                color: highlighted ? AppColors.white : AppColors.ink,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StopCard extends StatelessWidget {
  const _StopCard({
    required this.stop,
    required this.located,
    required this.searched,
  });

  final RouteStop stop;
  final LocatedPlace? located;
  final bool searched;

  @override
  Widget build(BuildContext context) {
    final where = located;
    final String? mapNote = where == null
        ? (searched ? 'Not found on the map. Use Maps or call them.' : null)
        : (where.exact ? null : 'The pin shows the area, not the exact house.');
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: _shadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              StopBadge(number: stop.number),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  stop.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: RiderText.name,
                ),
              ),
              if (stop.codAmount != null) ...[
                const SizedBox(width: AppSpace.sm),
                StatusChip(
                  label: 'COD ${formatPeso(stop.codAmount)}',
                  tone: StatusTone.amber,
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            stop.place.fullAddress,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 14,
              height: 1.35,
              color: AppColors.stone600,
            ),
          ),
          if (stop.note != null || mapNote != null) ...[
            const SizedBox(height: 2),
            Text(
              [stop.note, mapNote].whereType<String>().join(' '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: RiderText.label,
            ),
          ],
          const Spacer(),
          Row(
            children: [
              if ((stop.phone ?? '').isNotEmpty) ...[
                Expanded(child: RiderCallPill(phone: stop.phone!)),
                const SizedBox(width: AppSpace.sm),
              ],
              Expanded(child: RiderMapsPill(address: stop.place.fullAddress)),
            ],
          ),
        ],
      ),
    );
  }
}
