import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// The rider screens' look (king.md): riders read them outside in sunlight, often with one hand, so text that
/// matters is dark, at least 16, and numbers are bold.
abstract final class RiderText {
  static const name = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.ink,
    height: 1.3,
  );
  static const body = TextStyle(
    fontSize: 16,
    color: AppColors.ink,
    height: 1.4,
  );
  static const label = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.stone600,
    letterSpacing: 0.2,
  );
  static const mono = TextStyle(
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: AppColors.ink,
    letterSpacing: 0.5,
  );
}

/// Emerald for Delivered, the brand red for the main action.
const kDeliveredGreen = Color(0xFF047857);

/// A white card on the rider's light gray background.
class RiderCard extends StatelessWidget {
  const RiderCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.lg),
    this.muted = false,
  });

  final Widget child;
  final EdgeInsets padding;

  /// Gray, for a finished stop.
  final bool muted;

  @override
  Widget build(BuildContext context) {
    // A Material (not a coloured box), so list rows inside still show their tap ripple.
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A1E1B18),
            blurRadius: 16,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: muted ? AppColors.stone100 : AppColors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xFFEFEBE6)),
        ),
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// "Stop 1" in a red circle.
class StopBadge extends StatelessWidget {
  const StopBadge({super.key, required this.number});

  final int number;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Stop $number',
      excludeSemantics: true,
      child: Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          '$number',
          style: const TextStyle(
            color: AppColors.white,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
      ),
    );
  }
}

/// The amber block for cash to collect: "Collect ₱1,250.00 cash on delivery".
class CodBlock extends StatelessWidget {
  const CodBlock({super.key, required this.amount, this.prefix = 'Collect'});

  final Object amount;
  final String prefix;

  @override
  Widget build(BuildContext context) {
    final tone = StatusTone.amber;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(LucideIcons.banknote, color: tone.foreground, size: 24),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '$prefix '),
                  TextSpan(
                    text: formatPeso(amount),
                    style: const TextStyle(
                      fontSize: 22,
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const TextSpan(text: ' cash on delivery'),
                ],
              ),
              style: const TextStyle(
                fontSize: 15,
                color: Color(0xFF78350F),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A tracking number in a monospace font, with a copy button.
class TrackingNumberText extends StatelessWidget {
  const TrackingNumberText(this.trackingNumber, {super.key});

  final String trackingNumber;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: SelectableText(trackingNumber, style: RiderText.mono)),
        IconButton(
          tooltip: 'Copy tracking number',
          icon: const Icon(LucideIcons.copy, size: 18),
          color: AppColors.stone600,
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: trackingNumber));
            if (context.mounted) {
              showRiderMessage(context, 'Tracking number copied.');
            }
          },
        ),
      ],
    );
  }
}

/// A row with an icon, for an address or a phone number, with its action on the right.
class InfoRow extends StatelessWidget {
  const InfoRow({
    super.key,
    required this.icon,
    required this.text,
    this.action,
  });

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Icon(icon, size: 20, color: AppColors.stone600),
        const SizedBox(width: AppSpace.sm),
        Expanded(child: Text(text, style: RiderText.body)),
        ?action,
      ],
    );
  }
}

/// A wide soft button for reaching someone or somewhere, in a row of equals on a job card.
class RiderActionPill extends StatelessWidget {
  const RiderActionPill({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = onTap == null ? AppColors.stone400 : AppColors.ink;
    return Material(
      color: const Color(0xFFF5F2EE),
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 20, color: color),
                const SizedBox(height: 3),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// [RiderActionPill] that phones this number.
class RiderCallPill extends StatelessWidget {
  const RiderCallPill({super.key, required this.phone, this.onCall});

  final String phone;

  /// Runs as the call starts, for example to record that the rider tried to reach the buyer.
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    return RiderActionPill(
      icon: LucideIcons.phone,
      label: 'Call',
      onTap: phone.isEmpty
          ? null
          : () {
              onCall?.call();
              _open(context, Uri(scheme: 'tel', path: phone));
            },
    );
  }
}

/// Opens the phone's dialer or messages app for [phone] (`tel:` or `sms:`).
Future<void> openPhoneApp(
  BuildContext context,
  String phone, {
  bool sms = false,
}) => _open(context, Uri(scheme: sms ? 'sms' : 'tel', path: phone));

/// [RiderActionPill] that opens this address in a maps app.
class RiderMapsPill extends StatelessWidget {
  const RiderMapsPill({super.key, required this.address});

  final String address;

  @override
  Widget build(BuildContext context) {
    return RiderActionPill(
      icon: LucideIcons.navigation,
      label: 'Maps',
      onTap: address.trim().isEmpty
          ? null
          : () => _open(context, MapsButton.uriFor(address)),
    );
  }
}

/// A rounded square around an icon, in the colour of what it stands for.
class RiderIconTile extends StatelessWidget {
  const RiderIconTile({
    super.key,
    required this.icon,
    this.color = AppColors.ink,
    this.background = const Color(0xFFF5F2EE),
    this.size = 44,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      child: Icon(icon, size: size * 0.5, color: color),
    );
  }
}

/// Tap to call. Only shown on the rider's own stops.
class CallButton extends StatelessWidget {
  const CallButton({super.key, required this.phone, this.label = 'Call'});

  final String phone;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: phone.isEmpty
          ? null
          : () => _open(context, Uri(scheme: 'tel', path: phone)),
      icon: const Icon(LucideIcons.phone, size: 18),
      label: Text(label),
    );
  }
}

/// Opens the address in Google Maps (or whichever maps app the phone uses).
class MapsButton extends StatelessWidget {
  const MapsButton({super.key, required this.address});

  final String address;

  static Uri uriFor(String address) => Uri.https(
    'www.google.com',
    '/maps/search/',
    {'api': '1', 'query': address},
  );

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: address.trim().isEmpty
          ? null
          : () => _open(context, uriFor(address)),
      icon: const Icon(LucideIcons.navigation, size: 18),
      label: const Text('Open in Maps'),
    );
  }
}

Future<void> _open(BuildContext context, Uri uri) async {
  final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened && context.mounted) {
    showRiderMessage(context, "Couldn't open that on this phone.");
  }
}

/// A short message at the bottom of the screen.
void showRiderMessage(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? StatusTone.rose.foreground : null,
      ),
    );
}

/// Runs a request from a button and shows the server's answer or its error. Returns true when it worked.
Future<bool> runRiderAction(
  BuildContext context,
  Future<String> Function() action,
) async {
  try {
    final message = await action();
    if (context.mounted && message.isNotEmpty) {
      showRiderMessage(context, message);
    }
    return true;
  } on ApiFailure catch (failure) {
    if (context.mounted && failure.kind != FailureKind.cancelled) {
      showRiderMessage(context, failure.message, error: true);
    }
    return false;
  }
}

/// A section heading with an optional count.
class RiderSectionTitle extends StatelessWidget {
  const RiderSectionTitle(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontFamily: 'NotoSerif',
                fontSize: 18,
                height: 1.25,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
                color: AppColors.ink,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// The big side-by-side buttons at the bottom of a stop card.
class OutcomeButtons extends StatelessWidget {
  const OutcomeButtons({
    super.key,
    required this.onDelivered,
    required this.onFailed,
    this.deliveredLabel = 'Delivered',
  });

  final VoidCallback? onDelivered;
  final VoidCallback? onFailed;
  final String deliveredLabel;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose.foreground;
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              foregroundColor: rose,
              backgroundColor: AppColors.white,
              side: BorderSide(color: rose, width: 1.5),
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
            ),
            onPressed: onFailed,
            icon: const Icon(LucideIcons.circleX, size: 20),
            label: const Text('Delivery failed'),
          ),
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              backgroundColor: kDeliveredGreen,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.sm),
            ),
            onPressed: onDelivered,
            icon: const Icon(LucideIcons.circleCheck, size: 20),
            label: Text(deliveredLabel),
          ),
        ),
      ],
    );
  }
}

/// Up to three choices sharing the full width, with a dark thumb that slides to the open one.
class RiderSegments<T> extends StatelessWidget {
  const RiderSegments({
    super.key,
    required this.values,
    required this.selected,
    required this.labelOf,
    required this.onSelected,
    this.countOf,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpace.lg,
      AppSpace.sm,
      AppSpace.lg,
      0,
    ),
  });

  final List<T> values;
  final T selected;
  final String Function(T value) labelOf;
  final int? Function(T value)? countOf;
  final ValueChanged<T> onSelected;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final index = values.indexOf(selected);
    final duration = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : Motion.medium;
    return Padding(
      padding: padding,
      child: Container(
        height: 50,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: const Color(0xFFEFEBE6),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Stack(
          children: [
            AnimatedAlign(
              duration: duration,
              curve: Motion.glide,
              alignment: Alignment(
                values.length < 2 ? 0 : -1 + 2 * index / (values.length - 1),
                0,
              ),
              child: FractionallySizedBox(
                widthFactor: 1 / values.length,
                heightFactor: 1,
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.ink,
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            Row(
              children: [
                for (final value in values)
                  Expanded(
                    child: Semantics(
                      button: true,
                      selected: value == selected,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          if (value == selected) return;
                          HapticFeedback.selectionClick();
                          onSelected(value);
                        },
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            // Scaled down rather than cut off on a narrow phone or with large text.
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: AnimatedDefaultTextStyle(
                                duration: duration,
                                style: TextStyle(
                                  fontFamily: 'Inter',
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w600,
                                  color: value == selected
                                      ? AppColors.white
                                      : AppColors.ink,
                                ),
                                child: Text(
                                  countOf?.call(value) == null
                                      ? labelOf(value)
                                      : '${labelOf(value)}  ${countOf!(value)}',
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Segmented tabs at the top of a list, with counts ("To collect 3").
class RiderTabs<T> extends StatelessWidget {
  const RiderTabs({
    super.key,
    required this.values,
    required this.selected,
    required this.labelOf,
    required this.onSelected,
    this.countOf,
    this.selectedColor = AppColors.brandRed,
  });

  final List<T> values;
  final T selected;
  final String Function(T value) labelOf;
  final int? Function(T value)? countOf;
  final ValueChanged<T> onSelected;

  /// Brand red by default; the hub screens use [AppColors.gray900].
  final Color selectedColor;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.lg,
        0,
      ),
      child: Row(
        children: [
          for (final value in values) ...[
            ChoiceChip(
              showCheckmark: false,
              selected: value == selected,
              onSelected: (_) => onSelected(value),
              selectedColor: selectedColor,
              labelStyle: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: value == selected ? AppColors.white : AppColors.ink,
              ),
              materialTapTargetSize: MaterialTapTargetSize.padded,
              label: Text(
                countOf?.call(value) == null
                    ? labelOf(value)
                    : '${labelOf(value)}  ${countOf!(value)}',
              ),
            ),
            const SizedBox(width: AppSpace.sm),
          ],
        ],
      ),
    );
  }
}
