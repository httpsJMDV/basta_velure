import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Loading placeholders shaped like the content, gently pulsing. Wrap a layout of [SkeletonBox]es in one [Skeleton]:
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
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
    lowerBound: 0.55,
    upperBound: 1,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Reduced motion: a still placeholder.
    if (MediaQuery.of(context).disableAnimations) {
      _pulse.value = 1;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      excludeSemantics: true,
      child: FadeTransition(opacity: _pulse, child: widget.child),
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
        separatorBuilder: (_, _) => const SizedBox(height: AppSpace.md),
        itemBuilder: (_, _) => Container(
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: AppRadius.cardAll,
          ),
          child: const Row(
            children: [
              SkeletonBox(width: 56, height: 56, radius: 10),
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
      ),
    );
  }
}
