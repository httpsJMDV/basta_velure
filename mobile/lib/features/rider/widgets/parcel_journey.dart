import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import 'rider_widgets.dart';

/// The hubs a parcel goes through, on one line. Tap it for the whole way as a timeline.
class HubPathStrip extends StatelessWidget {
  const HubPathStrip({
    super.key,
    required this.path,
    required this.trackingNumber,
    this.parcelCount,
  });

  final List<String> path;
  final String trackingNumber;

  /// Said when a shop's parcels go different ways.
  final int? parcelCount;

  @override
  Widget build(BuildContext context) {
    final count = parcelCount;
    return Material(
      color: AppColors.stone100,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => showParcelJourney(context, trackingNumber),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: 10,
          ),
          child: Row(
            children: [
              const Icon(
                LucideIcons.route,
                size: 18,
                color: AppColors.stone700,
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      count == null
                          ? 'Hub route'
                          : 'Hub route · $count parcel${count == 1 ? '' : 's'}',
                      style: RiderText.label,
                    ),
                    Text(
                      path.join(' → '),
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.3,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: AppColors.stone500,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showParcelJourney(BuildContext context, String trackingNumber) =>
    showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _JourneySheet(trackingNumber: trackingNumber),
    );

class _JourneySheet extends ConsumerStatefulWidget {
  const _JourneySheet({required this.trackingNumber});

  final String trackingNumber;

  @override
  ConsumerState<_JourneySheet> createState() => _JourneySheetState();
}

class _JourneySheetState extends ConsumerState<_JourneySheet> {
  List<JourneyNode>? _nodes;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _failure = null);
    try {
      final nodes = await ref
          .read(riderApiProvider)
          .journey(widget.trackingNumber);
      if (mounted) setState(() => _nodes = nodes);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final nodes = _nodes;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.8,
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            0,
            AppSpace.lg,
            AppSpace.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Parcel route',
                style: TextStyle(
                  fontFamily: 'NotoSerif',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                ),
              ),
              TrackingNumberText(widget.trackingNumber),
              const SizedBox(height: AppSpace.lg),
              if (nodes != null)
                JourneyTimeline(nodes: nodes)
              else if (_failure != null)
                SizedBox(
                  height: 220,
                  child: ErrorRetry(failure: _failure!, onRetry: _load),
                )
              else
                const SizedBox(height: 220, child: SkeletonList(count: 3)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The way from the shop to the buyer, one place under the other: what is done, where the parcel is now, and what is
/// next, with a small vehicle moving along the stretch it is on.
class JourneyTimeline extends StatelessWidget {
  const JourneyTimeline({super.key, required this.nodes});

  final List<JourneyNode> nodes;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < nodes.length; i++)
          _JourneyRow(
            node: nodes[i],
            next: i + 1 < nodes.length ? nodes[i + 1] : null,
          ),
      ],
    );
  }
}

class _JourneyRow extends StatelessWidget {
  const _JourneyRow({required this.node, required this.next});

  final JourneyNode node;
  final JourneyNode? next;

  @override
  Widget build(BuildContext context) {
    final following = next;
    final times = [
      if (node.at != null) Fmt.dateTime(node.at),
      if (node.leftAt != null) 'left ${Fmt.dateTime(node.leftAt)}',
    ].join(' · ');
    final current = node.state == JourneyNode.current;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 38,
            child: Column(
              children: [
                _NodeDot(node: node),
                if (following != null)
                  Expanded(
                    child: following.movingHere
                        ? _MovingStretch(
                            betweenHubs:
                                node.kind == 'hub' && following.kind == 'hub',
                          )
                        : Center(
                            child: Container(
                              width: 2.5,
                              color: node.state == JourneyNode.done
                                  ? AppColors.ink
                                  : AppColors.stone200,
                            ),
                          ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                top: 2,
                // More room on the stretch the parcel is on, so its vehicle has somewhere to roll.
                bottom: following == null
                    ? 0
                    : (following.movingHere ? 52 : AppSpace.lg),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    node.label,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: current || node.movingHere
                          ? AppColors.brandRed
                          : AppColors.stone500,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    node.title,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color:
                          node.state == JourneyNode.upcoming && !node.movingHere
                          ? AppColors.stone600
                          : AppColors.ink,
                    ),
                  ),
                  if (node.gateway != null || node.goingBack)
                    Text(
                      [?node.gateway, if (node.goingBack) 'Way back'].join(' · ').toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                        color: Color(0xFF4338CA),
                      ),
                    ),
                  if (node.subtitle.isNotEmpty)
                    Text(
                      node.subtitle,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.stone600,
                      ),
                    ),
                  if (times.isNotEmpty)
                    Text(
                      times,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.stone500,
                      ),
                    ),
                  // How the parcel goes on to the next stop: trucks, ships and planes for the long part, a
                  // rider's own vehicle for the short rides.
                  if (following != null && following.kind != 'return')
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            switch (following.arrivesBy) {
                              'sea' => LucideIcons.ship,
                              'air' => LucideIcons.plane,
                              'truck' => LucideIcons.truck,
                              _ => LucideIcons.bike,
                            },
                            size: 15,
                            color: following.arrivesBy == null ? AppColors.stone500 : const Color(0xFF0369A1),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Then ${following.legLabel[0].toLowerCase()}${following.legLabel.substring(1)}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: following.arrivesBy == null ? AppColors.stone500 : const Color(0xFF0369A1),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NodeDot extends StatelessWidget {
  const _NodeDot({required this.node});

  final JourneyNode node;

  @override
  Widget build(BuildContext context) {
    final icon = switch (node.kind) {
      'shop' => LucideIcons.store,
      'hub' => LucideIcons.warehouse,
      'return' => LucideIcons.undo2,
      _ => LucideIcons.mapPin,
    };
    final (background, foreground, border) = switch (node.state) {
      JourneyNode.done => (AppColors.ink, AppColors.white, AppColors.ink),
      JourneyNode.current => (
        AppColors.brandRed,
        AppColors.white,
        AppColors.brandRed,
      ),
      _ when node.movingHere => (
        AppColors.white,
        AppColors.brandRed,
        AppColors.brandRed,
      ),
      _ => (AppColors.stone100, AppColors.stone500, AppColors.stone200),
    };
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: background,
        shape: BoxShape.circle,
        border: Border.all(color: border, width: 2),
      ),
      child: Icon(icon, size: 17, color: foreground),
    );
  }
}

/// The stretch the parcel is on right now: a dashed line, with its vehicle rolling along it.
class _MovingStretch extends StatefulWidget {
  const _MovingStretch({required this.betweenHubs});

  /// The courier's truck between hubs, and a rider everywhere else.
  final bool betweenHubs;

  @override
  State<_MovingStretch> createState() => _MovingStretchState();
}

class _MovingStretchState extends State<_MovingStretch>
    with SingleTickerProviderStateMixin {
  late final AnimationController _roll = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _roll.value = 0.5;
    } else if (!_roll.isAnimating) {
      _roll.repeat();
    }
  }

  @override
  void dispose() {
    _roll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        Positioned.fill(child: CustomPaint(painter: const _DashedLine())),
        AnimatedBuilder(
          animation: _roll,
          builder: (_, child) {
            // It fades in at the top and out at the bottom, so the loop has no jump.
            final t = _roll.value;
            final fade =
                (t < 0.15 ? t / 0.15 : (t > 0.85 ? (1 - t) / 0.15 : 1.0)).clamp(
                  0.0,
                  1.0,
                );
            return Align(
              alignment: Alignment(0, -1 + 2 * Curves.easeInOut.transform(t)),
              child: Opacity(opacity: fade, child: child),
            );
          },
          child: Container(
            width: 24,
            height: 24,
            decoration: const BoxDecoration(
              color: AppColors.brandRed,
              shape: BoxShape.circle,
            ),
            child: Icon(
              widget.betweenHubs ? LucideIcons.truck : LucideIcons.bike,
              size: 14,
              color: AppColors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _DashedLine extends CustomPainter {
  const _DashedLine();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.brandRed
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    final x = size.width / 2;
    for (var y = 3.0; y < size.height; y += 8) {
      canvas.drawLine(
        Offset(x, y),
        Offset(x, (y + 3).clamp(0.0, size.height)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedLine oldDelegate) => false;
}
