import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import 'google_sign_in.dart';

/// Continue with Google (B1), with Google's own four-colour logo: its account picker, then `POST /auth/google` with
/// the ID token. Anything that goes wrong goes to [onFailure], for the screen's banner.
class GoogleButton extends ConsumerStatefulWidget {
  const GoogleButton({super.key, required this.onFailure, this.onStart});

  final ValueChanged<ApiFailure> onFailure;
  final VoidCallback? onStart;

  @override
  ConsumerState<GoogleButton> createState() => _GoogleButtonState();
}

class _GoogleButtonState extends ConsumerState<GoogleButton> {
  bool _busy = false;

  Future<void> _press() async {
    setState(() => _busy = true);
    widget.onStart?.call();
    try {
      final token = await googleIdToken();
      if (token == null) return;
      await ref.read(sessionProvider.notifier).signInWithGoogle(token);
    } on GoogleSignInProblem catch (problem) {
      if (mounted) {
        widget.onFailure(ApiFailure(FailureKind.forbidden, problem.message));
      }
    } on ApiFailure catch (failure) {
      if (mounted) widget.onFailure(failure);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: AppColors.white,
      ),
      onPressed: _busy ? null : _press,
      icon: const GoogleLogo(),
      label: Text(_busy ? 'Opening Google…' : 'Continue with Google'),
    );
  }
}

/// Google's "G", drawn from the same shapes as the website's button (Google's 24 x 24 logo), in Google's colours.
class GoogleLogo extends StatelessWidget {
  const GoogleLogo({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Google',
      excludeSemantics: true,
      child: CustomPaint(size: Size.square(size), painter: _GooglePainter()),
    );
  }
}

class _GooglePainter extends CustomPainter {
  static final _blue = Path()
    ..moveTo(22.56, 12.25)
    ..relativeCubicTo(0, -.78, -.07, -1.53, -.2, -2.25)
    ..lineTo(12, 10)
    ..relativeLineTo(0, 4.26)
    ..relativeLineTo(5.92, 0)
    ..relativeCubicTo(-.26, 1.37, -1.04, 2.53, -2.21, 3.31)
    ..relativeLineTo(0, 2.77)
    ..relativeLineTo(3.57, 0)
    ..relativeCubicTo(2.08, -1.92, 3.28, -4.74, 3.28, -8.09)
    ..close();

  static final _green = Path()
    ..moveTo(12, 23)
    ..relativeCubicTo(2.97, 0, 5.46, -.98, 7.28, -2.66)
    ..relativeLineTo(-3.57, -2.77)
    ..relativeCubicTo(-.98, .66, -2.23, 1.06, -3.71, 1.06)
    ..relativeCubicTo(-2.86, 0, -5.29, -1.93, -6.16, -4.53)
    ..lineTo(2.18, 14.1)
    ..relativeLineTo(0, 2.84)
    ..cubicTo(3.99, 20.53, 7.7, 23, 12, 23)
    ..close();

  static final _yellow = Path()
    ..moveTo(5.84, 14.09)
    ..relativeCubicTo(-.22, -.66, -.35, -1.36, -.35, -2.09)
    ..relativeCubicTo(0, -.73, .13, -1.43, .35, -2.09)
    ..lineTo(5.84, 7.07)
    ..lineTo(2.18, 7.07)
    ..cubicTo(1.43, 8.55, 1, 10.22, 1, 12)
    ..relativeCubicTo(0, 1.78, .43, 3.45, 1.18, 4.93)
    ..relativeLineTo(3.66, -2.84)
    ..close();

  static final _red = Path()
    ..moveTo(12, 5.38)
    ..relativeCubicTo(1.62, 0, 3.06, .56, 4.21, 1.64)
    ..relativeLineTo(3.15, -3.15)
    ..cubicTo(17.45, 2.09, 14.97, 1, 12, 1)
    ..cubicTo(7.7, 1, 3.99, 3.47, 2.18, 7.07)
    ..relativeLineTo(3.66, 2.84)
    ..relativeCubicTo(.87, -2.6, 3.3, -4.53, 6.16, -4.53)
    ..close();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24);
    final paint = Paint()..isAntiAlias = true;
    canvas.drawPath(_blue, paint..color = const Color(0xFF4285F4));
    canvas.drawPath(_green, paint..color = const Color(0xFF34A853));
    canvas.drawPath(_yellow, paint..color = const Color(0xFFFBBC05));
    canvas.drawPath(_red, paint..color = const Color(0xFFEA4335));
  }

  @override
  bool shouldRepaint(_GooglePainter oldDelegate) => false;
}
