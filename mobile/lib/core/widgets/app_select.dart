import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'motion.dart';

/// One choice in an [AppSelectField] or a [showAppSelect] sheet.
class AppOption<T> {
  const AppOption(this.value, this.label, {this.subtitle, this.icon});

  final T value;
  final String label;
  final String? subtitle;
  final IconData? icon;
}

/// Opens the choices in a sheet from the bottom, the current one marked, and returns the one tapped (null when the
/// person closes the sheet). Long lists scroll, and the sheet grows only as tall as its choices.
Future<T?> showAppSelect<T>(
  BuildContext context, {
  required String title,
  required List<AppOption<T>> options,
  T? selected,
}) {
  HapticFeedback.selectionClick();
  return showModalBottomSheet<T>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (context) => ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.72,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.xl,
              0,
              AppSpace.xl,
              AppSpace.md,
            ),
            child: Text(
              title,
              style: const TextStyle(
                fontFamily: 'serif',
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
                color: AppColors.ink,
              ),
            ),
          ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              padding: EdgeInsets.fromLTRB(
                AppSpace.md,
                0,
                AppSpace.md,
                MediaQuery.paddingOf(context).bottom + AppSpace.lg,
              ),
              itemCount: options.length,
              itemBuilder: (context, index) {
                final option = options[index];
                return FadeSlideIn(
                  offset: 8,
                  duration: Motion.medium,
                  delay: Duration(milliseconds: (index.clamp(0, 8)) * 18),
                  child: _OptionRow<T>(
                    option: option,
                    selected: option.value == selected,
                    onTap: () => Navigator.of(context).pop(option.value),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class _OptionRow<T> extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final AppOption<T> option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Material(
          color: selected ? AppColors.brandRedTint : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 56),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpace.md,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    if (option.icon != null) ...[
                      Icon(
                        option.icon,
                        size: 20,
                        color: selected
                            ? AppColors.brandRed
                            : AppColors.stone600,
                      ),
                      const SizedBox(width: AppSpace.md),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            option.label,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: selected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                              color: selected
                                  ? AppColors.brandRedDark
                                  : AppColors.stone900,
                            ),
                          ),
                          if (option.subtitle?.isNotEmpty ?? false)
                            Text(
                              option.subtitle!,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: AppColors.stone500,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    AnimatedScale(
                      scale: selected ? 1 : 0,
                      duration: Motion.medium,
                      curve: Curves.easeOutBack,
                      child: const Icon(
                        LucideIcons.check,
                        size: 20,
                        color: AppColors.brandRed,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The app's dropdown: looks like the other fields, opens a sheet of big, easy choices, and takes part in its form's
/// checks. The arrow turns while the sheet is open.
class AppSelectField<T> extends StatefulWidget {
  const AppSelectField({
    super.key,
    required this.label,
    required this.options,
    this.value,
    this.onChanged,
    this.validator,
    this.errorText,
    this.hint,
    this.prefixIcon,
    this.sheetTitle,
  });

  final String label;
  final List<AppOption<T>> options;
  final T? value;
  final ValueChanged<T>? onChanged;
  final FormFieldValidator<T>? validator;

  /// A message from outside the form's checks: the server's, or "Choose one."
  final String? errorText;
  final String? hint;
  final IconData? prefixIcon;

  /// The sheet's heading; the [label] when not given.
  final String? sheetTitle;

  @override
  State<AppSelectField<T>> createState() => _AppSelectFieldState<T>();
}

class _AppSelectFieldState<T> extends State<AppSelectField<T>> {
  bool _open = false;

  Future<void> _pick(FormFieldState<T> field) async {
    FocusScope.of(context).unfocus();
    setState(() => _open = true);
    final picked = await showAppSelect<T>(
      context,
      title: widget.sheetTitle ?? widget.label,
      options: widget.options,
      selected: widget.value,
    );
    if (!mounted) return;
    setState(() => _open = false);
    if (picked != null) {
      field.didChange(picked);
      widget.onChanged?.call(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = widget.options
        .where((option) => option.value == widget.value)
        .firstOrNull;
    return FormField<T>(
      initialValue: widget.value,
      validator: widget.validator,
      builder: (field) {
        // Keeps the form's value in step when the screen changes it.
        if (field.value != widget.value) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) field.didChange(widget.value);
          });
        }
        final enabled = widget.onChanged != null;
        return Semantics(
          button: true,
          label: widget.label,
          value: current?.label,
          excludeSemantics: true,
          onTap: enabled ? () => _pick(field) : null,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: enabled ? () => _pick(field) : null,
            child: InputDecorator(
              isFocused: _open,
              isEmpty: current == null,
              decoration: InputDecoration(
                labelText: widget.label,
                hintText: widget.hint,
                errorText: field.errorText ?? widget.errorText,
                enabled: enabled,
                prefixIcon: widget.prefixIcon == null
                    ? null
                    : Icon(
                        widget.prefixIcon,
                        size: 20,
                        color: AppColors.stone500,
                      ),
                suffixIcon: AnimatedRotation(
                  turns: _open ? 0.5 : 0,
                  duration: Motion.medium,
                  curve: Motion.glide,
                  child: const Icon(
                    LucideIcons.chevronDown,
                    size: 20,
                    color: AppColors.stone500,
                  ),
                ),
              ),
              child: Text(
                current?.label ?? '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, color: AppColors.stone900),
              ),
            ),
          ),
        );
      },
    );
  }
}
