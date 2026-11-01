import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';

/// The email code as six boxes, like the website's: one real text field lies over them, so the number keyboard,
/// pasting and one-time-code autofill all work as usual.
class CodeBoxes extends StatefulWidget {
  const CodeBoxes({
    super.key,
    required this.controller,
    this.serverError,
    this.onSubmitted,
  });

  static const length = 6;

  final TextEditingController controller;

  /// The server's message for the code (`failure.errorFor('code')`). Cleared as soon as the person types.
  final String? serverError;
  final ValueChanged<String>? onSubmitted;

  @override
  State<CodeBoxes> createState() => _CodeBoxesState();
}

class _CodeBoxesState extends State<CodeBoxes> {
  final _focus = FocusNode();
  final _field = GlobalKey<FormFieldState<String>>();
  String? _serverError;

  @override
  void initState() {
    super.initState();
    _serverError = widget.serverError;
    _focus.addListener(_refresh);
    widget.controller.addListener(_refresh);
  }

  @override
  void didUpdateWidget(CodeBoxes oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.serverError != oldWidget.serverError) {
      _serverError = widget.serverError;
    }
  }

  @override
  void dispose() {
    _focus.dispose();
    widget.controller.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final code = widget.controller.text;
    return FormField<String>(
      key: _field,
      validator: (_) => Rules.emailCode(widget.controller.text),
      builder: (field) {
        final error = field.errorText ?? _serverError;
        final rose = StatusTone.rose.foreground;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Stack(
              children: [
                ExcludeSemantics(
                  child: Row(
                    children: [
                      for (var i = 0; i < CodeBoxes.length; i++) ...[
                        if (i > 0) const SizedBox(width: AppSpace.sm),
                        Expanded(
                          child: _Box(
                            digit: i < code.length ? code[i] : '',
                            active:
                                _focus.hasFocus &&
                                i == code.length.clamp(0, CodeBoxes.length - 1),
                            error: error != null,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Positioned.fill(
                  child: Opacity(
                    opacity: 0,
                    alwaysIncludeSemantics: true,
                    child: TextField(
                      controller: widget.controller,
                      focusNode: _focus,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      inputFormatters: [
                        Only.digits,
                        Only.max(CodeBoxes.length),
                      ],
                      showCursor: false,
                      enableInteractiveSelection: false,
                      decoration: const InputDecoration(
                        labelText: '6-digit code',
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                      ),
                      onChanged: (value) {
                        if (_serverError != null) {
                          setState(() => _serverError = null);
                        }
                        if (field.hasError) field.validate();
                      },
                      onSubmitted: widget.onSubmitted,
                    ),
                  ),
                ),
              ],
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.sm),
                child: Text(error, style: TextStyle(fontSize: 12, color: rose)),
              ),
          ],
        );
      },
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.digit, required this.active, required this.error});

  final String digit;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final color = error
        ? StatusTone.rose.foreground
        : active
        ? AppColors.brandRed
        : AppColors.stone300;
    return AnimatedContainer(
      duration: kMotion,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: AppRadius.cardAll,
        border: Border.all(color: color, width: active ? 1.5 : 1),
      ),
      child: Text(
        digit,
        style: const TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          fontFeatures: [FontFeature.tabularFigures()],
          color: AppColors.stone900,
        ),
      ),
    );
  }
}
