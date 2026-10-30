import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';

/// The two looks of the logistics screens (liam.md): the hub's light pages with dark gray main buttons, and the
/// courier portal's dark header with brand red actions.
abstract final class LogisticsLook {
  static const hubAction = AppColors.gray900;
  static const courierAction = AppColors.brandRed;
}

/// The hub portal's colours for everything inside: dark gray where the rest of the app uses brand red, so on the hub's
/// screens red only ever means a problem. Dialogs and sheets opened from inside keep it.
class HubThemed extends StatelessWidget {
  const HubThemed({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    return Theme(
      data: base.copyWith(
        colorScheme: base.colorScheme.copyWith(
          primary: AppColors.gray900,
          primaryContainer: AppColors.gray100,
          onPrimaryContainer: AppColors.gray900,
        ),
        textButtonTheme: TextButtonThemeData(
          style: base.textButtonTheme.style?.copyWith(
            foregroundColor: const WidgetStatePropertyAll(AppColors.gray900),
          ),
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: AppColors.gray900,
        ),
        inputDecorationTheme: base.inputDecorationTheme.copyWith(
          focusedBorder: OutlineInputBorder(
            borderRadius: AppRadius.cardAll,
            borderSide: const BorderSide(color: AppColors.gray900, width: 1.5),
          ),
        ),
      ),
      child: child,
    );
  }
}

/// The main button when it only opens a sheet: nothing is sending yet, so unlike [SubmitButton] it shows no spinner
/// behind the sheet. A sheet covers it, so a second tap can't land.
class SheetButton extends StatelessWidget {
  const SheetButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      onPressed: onPressed,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 20),
            const SizedBox(width: AppSpace.sm),
          ],
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

/// Loads something once and shows placeholders, then the content with pull to refresh, or Try again when it failed.
/// With [refreshEvery] it re-reads itself like the website's live pages, keeping what is shown when a check fails.
class LoadView<T> extends StatefulWidget {
  const LoadView({
    super.key,
    required this.load,
    required this.builder,
    this.refreshEvery,
    this.placeholder,
  });

  final Future<T> Function() load;

  /// Build something scrollable, so pull to refresh works.
  final Widget Function(BuildContext context, T data) builder;
  final Duration? refreshEvery;
  final Widget? placeholder;

  @override
  State<LoadView<T>> createState() => LoadViewState<T>();
}

class LoadViewState<T> extends State<LoadView<T>> {
  T? _data;
  ApiFailure? _failure;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _quietReload();
    if (widget.refreshEvery != null) {
      _timer = Timer.periodic(widget.refreshEvery!, (_) => _quietReload());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _quietReload() async {
    try {
      final data = await widget.load();
      if (mounted) {
        setState(() {
          _data = data;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted && _data == null) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  /// After the person changed something, and on pull to refresh. Says so when it failed.
  Future<void> reload() async {
    try {
      final data = await widget.load();
      if (mounted) {
        setState(() {
          _data = data;
          _failure = null;
        });
      }
    } catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.from(error);
      if (_data == null) {
        setState(() => _failure = failure);
      } else {
        showRiderMessage(context, failure.message, error: true);
      }
    }
  }

  void _retry() {
    setState(() => _failure = null);
    reload();
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return _failure != null
          ? ErrorRetry(failure: _failure!, onRetry: _retry)
          : widget.placeholder ?? const SkeletonList(count: 4);
    }
    return RefreshIndicator(
      onRefresh: reload,
      child: widget.builder(context, data),
    );
  }
}

/// A search box that waits for a pause in typing before it searches. Never sends an empty search.
class LogisticsSearchBox extends StatefulWidget {
  const LogisticsSearchBox({
    super.key,
    required this.hint,
    required this.onChanged,
    this.upperCase = false,
  });

  final String hint;

  /// Null when the box is empty.
  final ValueChanged<String?> onChanged;

  /// Tracking numbers are typed in capitals.
  final bool upperCase;

  @override
  State<LogisticsSearchBox> createState() => _LogisticsSearchBoxState();
}

class _LogisticsSearchBoxState extends State<LogisticsSearchBox> {
  final _box = TextEditingController();
  Timer? _wait;

  @override
  void dispose() {
    _wait?.cancel();
    _box.dispose();
    super.dispose();
  }

  void _changed(String value) {
    setState(() {});
    _wait?.cancel();
    _wait = Timer(
      const Duration(milliseconds: 350),
      () => widget.onChanged(Rules.searchQuery(value)),
    );
  }

  void _clear() {
    _wait?.cancel();
    _box.clear();
    setState(() {});
    widget.onChanged(null);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.lg,
        0,
      ),
      child: TextField(
        controller: _box,
        textInputAction: TextInputAction.search,
        maxLength: 100,
        textCapitalization: widget.upperCase
            ? TextCapitalization.characters
            : TextCapitalization.none,
        onChanged: _changed,
        onSubmitted: (value) {
          _wait?.cancel();
          widget.onChanged(Rules.searchQuery(value));
        },
        decoration: InputDecoration(
          hintText: widget.hint,
          counterText: '',
          prefixIcon: const Icon(LucideIcons.search, size: 20),
          suffixIcon: _box.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear the search',
                  icon: const Icon(LucideIcons.x, size: 18),
                  onPressed: _clear,
                ),
        ),
      ),
    );
  }
}

/// A status in words, from a `(label, tone)` pair.
class ToneChip extends StatelessWidget {
  const ToneChip(this.status, {super.key});

  final (String, StatusTone) status;

  @override
  Widget build(BuildContext context) =>
      StatusChip(label: status.$1, tone: status.$2);
}

/// One compact row of a parcel list: the tracking number in monospace, a status chip, and a line or two under it. The
/// barangay is always its name, never its code.
class ParcelRowCard extends StatelessWidget {
  const ParcelRowCard({
    super.key,
    required this.trackingNumber,
    this.status,
    this.lines = const [],
    this.onTap,
    this.selected,
    this.onSelected,
    this.footer,
  });

  final String trackingNumber;
  final (String, StatusTone)? status;
  final List<String> lines;
  final VoidCallback? onTap;

  /// With a value, a checkbox shows in front.
  final bool? selected;
  final ValueChanged<bool>? onSelected;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap:
            onTap ??
            (selected == null ? null : () => onSelected?.call(!selected!)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: kMinTap),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: AppSpace.sm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (selected != null)
                      Checkbox(
                        value: selected,
                        onChanged: (v) => onSelected?.call(v ?? false),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // The chip drops under the number when it doesn't fit beside it.
                          Wrap(
                            spacing: AppSpace.sm,
                            runSpacing: AppSpace.xs,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(trackingNumber, style: RiderText.mono),
                              if (status != null) ToneChip(status!),
                            ],
                          ),
                          for (final line in lines.where((l) => l.isNotEmpty))
                            Text(
                              line,
                              style: const TextStyle(
                                fontSize: 14,
                                color: AppColors.gray600,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                ?footer,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A number with its label on the hub's light Home. Opens the screen that works on it.
class HubStat extends StatelessWidget {
  const HubStat({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.onTap,
    this.tone = StatusTone.gray,
  });

  final IconData icon;
  final String label;
  final int value;
  final VoidCallback onTap;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: tone.foreground),
              const SizedBox(height: AppSpace.sm),
              Text(
                '$value',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: AppColors.gray900,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              Text(label, style: RiderText.label),
            ],
          ),
        ),
      ),
    );
  }
}

/// Two per row, as tall as the tallest, so large text never gets cut.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final columns = MediaQuery.sizeOf(context).width >= 700 ? 4 : 2;
    return Column(
      children: [
        for (var i = 0; i < children.length; i += columns) ...[
          if (i > 0) const SizedBox(height: AppSpace.sm),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var j = i; j < i + columns; j++) ...[
                  if (j > i) const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: j < children.length
                        ? children[j]
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// One figure on the courier's dark header, in a soft see-through box (the website's `HeroStats`).
class HeroFigure {
  const HeroFigure(this.label, this.value, {this.color = AppColors.white});

  final String label;
  final int value;
  final Color color;
}

/// The courier portal's dark header: the company's logo tile, its name, and the numbers in see-through boxes.
class CourierHero extends StatelessWidget {
  const CourierHero({
    super.key,
    required this.eyebrow,
    required this.title,
    required this.figures,
    this.subtitle,
    this.logoText,
    this.onFigureTap,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final String? logoText;
  final List<HeroFigure> figures;
  final ValueChanged<int>? onFigureTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: AppColors.gray900,
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        MediaQuery.paddingOf(context).top + AppSpace.lg,
        AppSpace.lg,
        AppSpace.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (logoText != null) ...[
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: StatusTone.amber.background,
                    borderRadius: AppRadius.cardAll,
                  ),
                  child: Text(
                    logoText!,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: StatusTone.amber.foreground,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpace.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      eyebrow.toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.8,
                        color: AppColors.white.withValues(alpha: 0.65),
                      ),
                    ),
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.white,
                      ),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.white.withValues(alpha: 0.75),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          _HeroFigures(figures: figures, onTap: onFigureTap),
        ],
      ),
    );
  }
}

class _HeroFigures extends StatelessWidget {
  const _HeroFigures({required this.figures, this.onTap});

  final List<HeroFigure> figures;
  final ValueChanged<int>? onTap;

  @override
  Widget build(BuildContext context) {
    final columns = MediaQuery.sizeOf(context).width >= 700 ? 4 : 2;
    return Column(
      children: [
        for (var i = 0; i < figures.length; i += columns) ...[
          if (i > 0) const SizedBox(height: AppSpace.sm),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var j = i; j < i + columns; j++) ...[
                  if (j > i) const SizedBox(width: AppSpace.sm),
                  Expanded(
                    child: j < figures.length
                        ? _box(figures[j], j)
                        : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _box(HeroFigure figure, int index) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: AppRadius.cardAll,
        side: BorderSide(color: AppColors.white.withValues(alpha: 0.12)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap == null ? null : () => onTap!(index),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpace.md,
            vertical: AppSpace.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                figure.label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.white.withValues(alpha: 0.7),
                ),
              ),
              Text(
                '${figure.value}',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: figure.color,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One line of the Home alerts: what needs attention, and tapping it opens the right screen.
class AlertRow extends StatelessWidget {
  const AlertRow({
    super.key,
    required this.icon,
    required this.tone,
    required this.title,
    required this.detail,
    required this.onTap,
  });

  final IconData icon;
  final StatusTone tone;
  final String title;
  final String detail;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        minTileHeight: 64,
        onTap: onTap,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: tone.background,
            borderRadius: AppRadius.cardAll,
          ),
          child: Icon(icon, size: 20, color: tone.foreground),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        subtitle: Text(detail, style: const TextStyle(fontSize: 13)),
        trailing: const Icon(
          LucideIcons.chevronRight,
          size: 18,
          color: AppColors.gray600,
        ),
      ),
    );
  }
}

/// A list of links, for the More tabs.
class LinkList extends StatelessWidget {
  const LinkList({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              const Divider(indent: AppSpace.lg, endIndent: AppSpace.lg),
            children[i],
          ],
        ],
      ),
    );
  }
}

class LinkTile extends StatelessWidget {
  const LinkTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.badge = 0,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 60,
      leading: Icon(icon, color: AppColors.gray900),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.gray900,
        ),
      ),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!, style: const TextStyle(fontSize: 13)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (badge > 0)
            Badge(
              backgroundColor: AppColors.brandRed,
              label: Text(badge > 99 ? '99+' : '$badge'),
            ),
          const SizedBox(width: AppSpace.xs),
          const Icon(
            LucideIcons.chevronRight,
            size: 18,
            color: AppColors.gray600,
          ),
        ],
      ),
      onTap: onTap,
    );
  }
}

/// A page of the website, for the office work that stays there.
class WebsiteTile extends StatelessWidget {
  const WebsiteTile({
    super.key,
    required this.icon,
    required this.title,
    required this.path,
  });

  final IconData icon;
  final String title;
  final String path;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 56,
      leading: Icon(icon, color: AppColors.gray600),
      title: Text(title, style: const TextStyle(fontSize: 15)),
      trailing: const Icon(
        LucideIcons.externalLink,
        size: 16,
        color: AppColors.gray600,
      ),
      onTap: () async {
        final opened = await openWebsite(path);
        if (!opened && context.mounted) {
          showRiderMessage(context, "Couldn't open that on this phone.");
        }
      },
    );
  }
}

/// A label and its value on a details page.
class FactRow extends StatelessWidget {
  const FactRow(this.label, this.value, {super.key});

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final text = value == null || value!.trim().isEmpty ? '—' : value!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: RiderText.label),
          Text(text, style: RiderText.body),
        ],
      ),
    );
  }
}

/// The buttons that stay at the bottom of a details page, where the thumb reaches. Two to a row.
class BottomActions extends StatelessWidget {
  const BottomActions({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < children.length; i += 2) ...[
                if (i > 0) const SizedBox(height: AppSpace.sm),
                Row(
                  children: [
                    Expanded(child: children[i]),
                    if (i + 1 < children.length) ...[
                      const SizedBox(width: AppSpace.sm),
                      Expanded(child: children[i + 1]),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A quiet button next to the main one, opening a sheet that asks for more. It only locks while that is open, so a
/// double tap can't open two; the sheet's own button shows the sending.
class QuietButton extends StatefulWidget {
  const QuietButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.danger = false,
  });

  final String label;
  final Future<void> Function()? onPressed;
  final IconData? icon;
  final bool danger;

  @override
  State<QuietButton> createState() => _QuietButtonState();
}

class _QuietButtonState extends State<QuietButton> {
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
    final color = widget.danger
        ? StatusTone.rose.foreground
        : AppColors.gray900;
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: color,
        side: BorderSide(color: color),
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
      ),
      onPressed: widget.onPressed == null || _busy ? null : _run,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.icon != null) ...[
            Icon(widget.icon, size: 18),
            const SizedBox(width: AppSpace.sm),
          ],
          Flexible(child: Text(widget.label, overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}

/// On a wide screen (a counter tablet) the list and the details sit side by side. On a phone only the list shows, and
/// the details open as their own screen.
class ListDetailLayout extends StatelessWidget {
  const ListDetailLayout({
    super.key,
    required this.list,
    required this.detail,
    required this.placeholder,
  });

  static const wideFrom = 840.0;

  static bool isWide(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= wideFrom;

  final Widget list;
  final Widget? detail;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    if (!isWide(context)) return list;
    return Row(
      children: [
        SizedBox(width: 400, child: list),
        const VerticalDivider(width: 1),
        Expanded(
          child:
              detail ??
              EmptyState(icon: LucideIcons.panelRight, title: placeholder),
        ),
      ],
    );
  }
}

/// Asks for a reason in a bottom sheet with a counter, checks it, asks once more, then sends it. A 422 from the server
/// shows under the field; anything else closes nothing and shows across the top. Returns the server's message when
/// it went through, or null when cancelled.
Future<String?> showReasonSheet(
  BuildContext context, {
  required String title,
  required String message,
  required String fieldLabel,
  required String submitLabel,
  required String confirmTitle,
  required String confirmMessage,
  required Future<String> Function(String reason) onSubmit,
  FormFieldValidator<String> validator = Rules.reason,
  int maxLength = 300,
  bool destructive = true,
  String serverField = 'reason',
}) => showModalBottomSheet<String>(
  context: context,
  isScrollControlled: true,
  builder: (_) => _ReasonSheet(
    title: title,
    message: message,
    fieldLabel: fieldLabel,
    submitLabel: submitLabel,
    confirmTitle: confirmTitle,
    confirmMessage: confirmMessage,
    onSubmit: onSubmit,
    validator: validator,
    maxLength: maxLength,
    destructive: destructive,
    serverField: serverField,
  ),
);

class _ReasonSheet extends StatefulWidget {
  const _ReasonSheet({
    required this.title,
    required this.message,
    required this.fieldLabel,
    required this.submitLabel,
    required this.confirmTitle,
    required this.confirmMessage,
    required this.onSubmit,
    required this.validator,
    required this.maxLength,
    required this.destructive,
    required this.serverField,
  });

  final String title;
  final String message;
  final String fieldLabel;
  final String submitLabel;
  final String confirmTitle;
  final String confirmMessage;
  final Future<String> Function(String reason) onSubmit;
  final FormFieldValidator<String> validator;
  final int maxLength;
  final bool destructive;
  final String serverField;

  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _form = GlobalKey<FormState>();
  final _reason = TextEditingController();
  ApiFailure? _failure;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final confirmed = await confirmAction(
      context,
      title: widget.confirmTitle,
      message: widget.confirmMessage,
      confirmLabel: widget.submitLabel,
      destructive: widget.destructive,
    );
    if (!confirmed || !mounted) return;
    setState(() => _failure = null);
    try {
      final message = await widget.onSubmit(_reason.text.trim());
      if (mounted) Navigator.of(context).pop(message);
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final fieldError = failure?.errorFor(widget.serverField);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.title, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: AppSpace.sm),
              Text(widget.message, style: RiderText.body),
              const SizedBox(height: AppSpace.md),
              if (failure != null && fieldError == null) ...[
                MessageBanner(message: failure.message),
                const SizedBox(height: AppSpace.md),
              ],
              AppTextField(
                label: widget.fieldLabel,
                controller: _reason,
                minLines: 3,
                maxLines: 5,
                maxLength: widget.maxLength,
                showCounter: true,
                textCapitalization: TextCapitalization.sentences,
                validator: widget.validator,
                serverError: fieldError,
              ),
              const SizedBox(height: AppSpace.md),
              SubmitButton(
                label: widget.submitLabel,
                busyLabel: 'Sending…',
                color: widget.destructive
                    ? StatusTone.rose.foreground
                    : LogisticsLook.hubAction,
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One rider in a picker: why they can't take the job when they can't.
class PickableRider {
  const PickableRider({
    required this.id,
    required this.name,
    this.detail,
    this.problem,
  });

  final int id;
  final String name;
  final String? detail;
  final String? problem;
}

/// Choose a rider in a bottom sheet. Riders who can't take the job show why, and can't be picked. Returns the rider.
Future<PickableRider?> showRiderPicker(
  BuildContext context, {
  required String title,
  required Future<List<PickableRider>> Function() load,
  String? message,
  String emptyMessage = 'No rider can take this job right now.',
}) => showModalBottomSheet<PickableRider>(
  context: context,
  isScrollControlled: true,
  builder: (_) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: 0.6,
    maxChildSize: 0.9,
    builder: (context, scroll) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
      child: LoadView<List<PickableRider>>(
        load: load,
        builder: (context, riders) => ListView(
          controller: scroll,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (message != null) ...[
              const SizedBox(height: AppSpace.xs),
              Text(message, style: RiderText.body),
            ],
            const SizedBox(height: AppSpace.md),
            if (riders.isEmpty)
              MessageBanner(message: emptyMessage, tone: StatusTone.amber),
            for (final rider in riders)
              ListTile(
                minTileHeight: 60,
                contentPadding: EdgeInsets.zero,
                enabled: rider.problem == null,
                leading: Icon(
                  LucideIcons.bike,
                  color: rider.problem == null
                      ? AppColors.gray900
                      : AppColors.stone400,
                ),
                title: Text(
                  rider.name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  [?rider.detail, ?rider.problem].join(' · '),
                  style: const TextStyle(fontSize: 13),
                ),
                onTap: () => Navigator.of(context).pop(rider),
              ),
          ],
        ),
      ),
    ),
  ),
);

bool _isPdf(List<int> bytes) =>
    bytes.length > 4 &&
    bytes[0] == 0x25 &&
    bytes[1] == 0x50 &&
    bytes[2] == 0x44 &&
    bytes[3] == 0x46;

/// Drops every decoded picture from memory, so a private document doesn't stay in the image cache.
void _forgetDecodedPictures() => PaintingBinding.instance.imageCache
  ..clear()
  ..clearLiveImages();

/// A private file (license, OR/CR, permit, ID) as a row with its picture: fetched with the token, shown from memory,
/// never saved to the phone or its gallery. Tap to zoom. The bytes and the decoded picture go when the screen closes.
class PrivateDocumentTile extends StatefulWidget {
  const PrivateDocumentTile({
    super.key,
    required this.label,
    required this.load,
  });

  final String label;
  final Future<List<int>> Function() load;

  @override
  State<PrivateDocumentTile> createState() => _PrivateDocumentTileState();
}

class _PrivateDocumentTileState extends State<PrivateDocumentTile> {
  Uint8List? _bytes;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _bytes = null;
    _forgetDecodedPictures();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final bytes = await widget.load();
      if (mounted) setState(() => _bytes = Uint8List.fromList(bytes));
    } catch (_) {
      // The row stays; tapping it tries again and says what went wrong.
      if (mounted) setState(() => _failed = true);
    }
  }

  Widget _picture(Uint8List? bytes) {
    const icon = Icon(LucideIcons.fileText, color: AppColors.gray600);
    if (bytes == null) {
      return _failed
          ? icon
          : const Skeleton(child: SkeletonBox(height: 72, radius: 8));
    }
    if (_isPdf(bytes)) return icon;
    return Image.memory(
      bytes,
      fit: BoxFit.cover,
      cacheWidth: 216,
      gaplessPlayback: true,
      semanticLabel: widget.label,
      errorBuilder: (_, _, _) => icon,
    );
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    return ListTile(
      minTileHeight: 88,
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ColoredBox(
          color: AppColors.gray100,
          child: SizedBox.square(
            dimension: 72,
            child: Center(child: _picture(bytes)),
          ),
        ),
      ),
      title: Text(
        widget.label,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.gray900,
        ),
      ),
      subtitle: const Text('Tap to zoom', style: TextStyle(fontSize: 13)),
      trailing: const Icon(
        LucideIcons.zoomIn,
        size: 18,
        color: AppColors.gray600,
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => PrivateDocumentScreen(
            label: widget.label,
            load: bytes == null ? widget.load : () async => bytes,
          ),
        ),
      ),
    );
  }
}

class PrivateDocumentScreen extends StatefulWidget {
  const PrivateDocumentScreen({
    super.key,
    required this.label,
    required this.load,
  });

  final String label;
  final Future<List<int>> Function() load;

  @override
  State<PrivateDocumentScreen> createState() => _PrivateDocumentScreenState();
}

class _PrivateDocumentScreenState extends State<PrivateDocumentScreen> {
  Uint8List? _bytes;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _failure = null);
    try {
      final bytes = await widget.load();
      if (mounted) setState(() => _bytes = Uint8List.fromList(bytes));
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  void dispose() {
    _bytes = null;
    _forgetDecodedPictures();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    return Scaffold(
      backgroundColor: AppColors.gray900,
      appBar: AppBar(title: Text(widget.label)),
      body: bytes == null
          ? (_failure != null
                ? ColoredBox(
                    color: AppColors.white,
                    child: ErrorRetry(failure: _failure!, onRetry: _fetch),
                  )
                : const Center(child: CircularProgressIndicator()))
          : _isPdf(bytes)
          ? const ColoredBox(
              color: AppColors.white,
              child: EmptyState(
                icon: LucideIcons.fileText,
                title: 'This document is a PDF',
                message: 'Open it on the website to view it.',
              ),
            )
          : InteractiveViewer(
              maxScale: 5,
              child: Center(
                child: Image.memory(
                  bytes,
                  gaplessPlayback: true,
                  semanticLabel: widget.label,
                ),
              ),
            ),
    );
  }
}
