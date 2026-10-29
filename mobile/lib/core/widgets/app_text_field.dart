import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_colors.dart';

/// Every text box in the app: a label, the right keyboard, the formatters that keep wrong characters out, the
/// local check's message under the field, and the server's 422 message there too until the person edits the field.
///
/// ```dart
/// AppTextField(
///   label: 'Mobile number',
///   controller: phone,
///   keyboardType: TextInputType.phone,
///   inputFormatters: [Only.mobileChars, Only.max(13)],
///   validator: Rules.mobile,
///   serverError: failure?.errorFor('phone'),
/// )
/// ```
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.helper,
    this.keyboardType,
    this.textInputAction,
    this.inputFormatters = const [],
    this.validator,
    this.serverError,
    this.maxLength,
    this.showCounter = false,
    this.obscure = false,
    this.autofillHints,
    this.textCapitalization = TextCapitalization.none,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
    this.focusNode,
    this.prefixIcon,
    this.minLines,
    this.maxLines = 1,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? helper;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final List<TextInputFormatter> inputFormatters;
  final FormFieldValidator<String>? validator;

  /// The server's message for this field (`failure.errorFor('field')`). Cleared as soon as the person types.
  final String? serverError;

  /// The most characters allowed. With [showCounter] a "12/300" counter shows under the field.
  final int? maxLength;
  final bool showCounter;

  /// A password: hidden, with an eye button to show it. Nothing is filtered, trimmed or autocorrected.
  final bool obscure;
  final Iterable<String>? autofillHints;
  final TextCapitalization textCapitalization;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final bool autofocus;
  final FocusNode? focusNode;
  final IconData? prefixIcon;
  final int? minLines;
  final int? maxLines;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  final _field = GlobalKey<FormFieldState<String>>();
  late bool _hidden = widget.obscure;
  String? _serverError;

  @override
  void initState() {
    super.initState();
    _serverError = widget.serverError;
  }

  @override
  void didUpdateWidget(AppTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.serverError != oldWidget.serverError) {
      _serverError = widget.serverError;
    }
  }

  @override
  Widget build(BuildContext context) {
    final limit = widget.maxLength;
    return TextFormField(
      key: _field,
      controller: widget.controller,
      focusNode: widget.focusNode,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      textCapitalization: widget.textCapitalization,
      autofillHints: widget.autofillHints,
      obscureText: _hidden,
      enableSuggestions: !widget.obscure,
      autocorrect: !widget.obscure,
      minLines: widget.obscure ? 1 : widget.minLines,
      maxLines: widget.obscure ? 1 : widget.maxLines,
      maxLength: widget.showCounter ? limit : null,
      inputFormatters: [
        ...widget.inputFormatters,
        if (limit != null && !widget.showCounter)
          LengthLimitingTextInputFormatter(limit),
      ],
      validator: widget.validator,
      onChanged: (value) {
        if (_serverError != null) setState(() => _serverError = null);
        // Quiet while someone types for the first time; once a message shows, it follows what they type, so it
        // clears as soon as the value is right.
        if (_field.currentState?.hasError ?? false) {
          _field.currentState!.validate();
        }
        widget.onChanged?.call(value);
      },
      onFieldSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        helperText: widget.helper,
        errorText: _serverError,
        prefixIcon: widget.prefixIcon == null
            ? null
            : Icon(widget.prefixIcon, size: 20, color: AppColors.stone500),
        suffixIcon: widget.obscure
            ? IconButton(
                tooltip: _hidden ? 'Show password' : 'Hide password',
                icon: Icon(
                  _hidden ? LucideIcons.eye : LucideIcons.eyeOff,
                  size: 20,
                ),
                color: AppColors.stone500,
                onPressed: () => setState(() => _hidden = !_hidden),
              )
            : null,
      ),
    );
  }
}
