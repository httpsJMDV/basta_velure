import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Loading placeholders shaped like the content, with a soft light sweeping across. Wrap a layout of [SkeletonBox]es
/// in one [Skeleton]:
///
/// ```dart
/// Skeleton(child: Column(children: [SkeletonBox(height: 160), SkeletonBox(width: 120, height: 14)]))
/// ```
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.child});

  final Widget child;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reduced motion: a still placeholder.
    if (MediaQuery.disableAnimationsOf(context)) {
      _sweep.stop();
    } else if (!_sweep.isAnimating) {
      _sweep.repeat();
    }
  }

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _sweep,
        child: widget.child,
        builder: (_, child) {
          final x = -2 + 4 * _sweep.value;
          return ShaderMask(
            blendMode: BlendMode.srcATop,
            shaderCallback: (bounds) => LinearGradient(
              begin: Alignment(x - 1, -0.3),
              end: Alignment(x + 1, 0.3),
              colors: const [
                AppColors.stone200,
                AppColors.stone100,
                AppColors.stone200,
              ],
              stops: const [0.3, 0.5, 0.7],
            ).createShader(bounds),
            child: child,
          );
        },
      ),
    );
  }
}

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({super.key, this.width, this.height = 14, this.radius = 6});

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.stone200,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// A list of card-shaped placeholders, for any list screen while its first page loads.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 6});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpace.lg),
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpace.xl),
        itemBuilder: (_, _) => const Row(
          children: [
            SkeletonBox(width: 64, height: 64, radius: 14),
            SizedBox(width: AppSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonBox(height: 14),
                  SizedBox(height: AppSpace.sm),
                  SkeletonBox(width: 140, height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
