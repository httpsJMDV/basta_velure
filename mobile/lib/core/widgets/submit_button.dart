import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// The main action of a screen. It locks itself while [onPressed] runs, so a double tap can't send twice, and shows
/// that it is working. Full width; put it at the bottom where the thumb reaches.
class SubmitButton extends StatefulWidget {
  const SubmitButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busyLabel,
    this.icon,
    this.color = AppColors.brandRed,
  });

  final String label;

  /// Null disables the button. While the returned future runs, taps do nothing.
  final Future<void> Function()? onPressed;

  /// What the button says while sending, for example "Signing in…".
  final String? busyLabel;
  final IconData? icon;

  /// Brand red by default; the hub screens use [AppColors.gray900].
  final Color color;

  @override
  State<SubmitButton> createState() => _SubmitButtonState();
}

class _SubmitButtonState extends State<SubmitButton> {
  bool _busy = false;

  Future<void> _run() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !_busy;
    final label = _busy ? (widget.busyLabel ?? widget.label) : widget.label;

    final button = FilledButton(
      onPressed: enabled ? _run : null,
      style: FilledButton.styleFrom(
        backgroundColor: widget.color,
        minimumSize: const Size.fromHeight(52),
        // While sending, keep the colour (it is working, not unavailable) but take no taps.
        disabledBackgroundColor: _busy
            ? widget.color.withValues(alpha: 0.75)
            : null,
        disabledForegroundColor: _busy ? AppColors.white : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_busy)
            const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: AppColors.white,
              ),
            )
          else if (widget.icon != null)
            Icon(widget.icon, size: 20),
          if (_busy || widget.icon != null) const SizedBox(width: AppSpace.sm),
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );

    // While sending, screen readers hear that it is working instead of a dimmed button.
    return _busy
        ? Semantics(
            button: true,
            enabled: false,
            label: '$label, please wait',
            excludeSemantics: true,
            child: button,
          )
        : button;
  }
}
