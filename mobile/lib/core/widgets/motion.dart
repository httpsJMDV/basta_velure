import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The app's movement: quick to answer a touch, unhurried to settle. Every animation here stays still when the phone
/// is set to reduce motion.
abstract final class Motion {
  static const fast = Duration(milliseconds: 160);
  static const medium = Duration(milliseconds: 280);
  static const slow = Duration(milliseconds: 420);

  /// Things arriving: a fast start and a long, soft landing.
  static const settle = Curves.easeOutCubic;

  /// Things moving from one place to another on the screen.
  static const glide = Curves.easeInOutCubic;
}

/// Sinks a little under the finger and springs back, for cards and big buttons. Gives a light tap on the phone too.
class PressScale extends StatefulWidget {
  const PressScale({
    super.key,
    required this.child,
    this.onTap,
    this.scale = 0.97,
    this.haptic = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final bool haptic;

  @override
  State<PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<PressScale> {
  bool _down = false;

  void _set(bool down) {
    if (_down != down && mounted) setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.disableAnimationsOf(context);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: widget.onTap == null ? null : (_) => _set(true),
      onTapCancel: () => _set(false),
      onTapUp: (_) => _set(false),
      onTap: widget.onTap == null
          ? null
          : () {
              if (widget.haptic) HapticFeedback.selectionClick();
              widget.onTap!();
            },
      child: AnimatedScale(
        scale: _down && !still ? widget.scale : 1,
        duration: _down ? Motion.fast : Motion.medium,
        curve: _down ? Curves.easeOut : Curves.easeOutBack,
        child: widget.child,
      ),
    );
  }
}

/// Fades in while rising a few pixels, once, when it first appears. [delay] staggers a row or a list.
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.offset = 14,
    this.duration = Motion.slow,
  });

  final Widget child;
  final Duration delay;
  final double offset;
  final Duration duration;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final Animation<double> _curve = CurvedAnimation(
    parent: _controller,
    curve: Motion.settle,
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _controller.value = 1;
    } else if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      Future<void>.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _curve,
      child: widget.child,
      builder: (_, child) => Opacity(
        opacity: _curve.value,
        child: Transform.translate(
          offset: Offset(0, widget.offset * (1 - _curve.value)),
          child: child,
        ),
      ),
    );
  }
}

/// A short pop when [value] changes: a badge's count, a heart.
class PopOnChange extends StatefulWidget {
  const PopOnChange({super.key, required this.value, required this.child});

  final Object? value;
  final Widget child;

  @override
  State<PopOnChange> createState() => _PopOnChangeState();
}

class _PopOnChangeState extends State<PopOnChange>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: Motion.slow,
  );
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween<double>(
        begin: 1,
        end: 1.28,
      ).chain(CurveTween(curve: Curves.easeOut)),
      weight: 35,
    ),
    TweenSequenceItem(
      tween: Tween<double>(
        begin: 1.28,
        end: 1,
      ).chain(CurveTween(curve: Curves.elasticOut)),
      weight: 65,
    ),
  ]).animate(_controller);

  @override
  void didUpdateWidget(PopOnChange oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value &&
        !MediaQuery.disableAnimationsOf(context)) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(scale: _scale, child: widget.child);
  }
}

/// A number that counts to its new value instead of jumping: a cart total.
class CountingNumber extends StatelessWidget {
  const CountingNumber({
    super.key,
    required this.value,
    required this.format,
    this.style,
  });

  final double value;
  final String Function(double value) format;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value),
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : Motion.slow,
      curve: Motion.settle,
      builder: (_, shown, _) => Text(
        format(shown),
        style: style?.copyWith(
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

/// Screen changes: the new screen drifts in from the right and fades up, the old one eases back. Short and calm.
class SoftPageTransitions extends PageTransitionsBuilder {
  const SoftPageTransitions();

  @override
  Duration get transitionDuration => const Duration(milliseconds: 340);

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final enter = CurvedAnimation(
      parent: animation,
      curve: Motion.settle,
      reverseCurve: Curves.easeInCubic,
    );
    final leave = CurvedAnimation(
      parent: secondaryAnimation,
      curve: Motion.glide,
    );
    return AnimatedBuilder(
      animation: Listenable.merge([enter, leave]),
      child: child,
      builder: (_, child) {
        final width = MediaQuery.sizeOf(context).width;
        return Transform.translate(
          offset: Offset(
            width * 0.08 * (1 - enter.value) - width * 0.03 * leave.value,
            0,
          ),
          child: Opacity(opacity: enter.value.clamp(0.0, 1.0), child: child),
        );
      },
    );
  }
}
