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
    color: AppColors.gray900,
    height: 1.3,
  );
  static const body = TextStyle(
    fontSize: 16,
    color: AppColors.gray900,
    height: 1.4,
  );
  static const label = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.gray600,
    letterSpacing: 0.2,
  );
  static const mono = TextStyle(
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: AppColors.gray900,
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
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: muted ? AppColors.gray100 : AppColors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFE5E7EB)),
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
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: AppColors.brandRed,
          shape: BoxShape.circle,
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
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: AppSpace.md,
      ),
      decoration: BoxDecoration(
        color: tone.background,
        borderRadius: AppRadius.cardAll,
        border: Border.all(color: tone.border),
      ),
      child: Row(
        children: [
          Icon(LucideIcons.banknote, color: tone.foreground, size: 22),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '$prefix '),
                  TextSpan(
                    text: formatPeso(amount),
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const TextSpan(text: ' cash on delivery'),
                ],
              ),
              style: const TextStyle(
                fontSize: 16,
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
          color: AppColors.gray600,
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
        Icon(icon, size: 20, color: AppColors.gray600),
        const SizedBox(width: AppSpace.sm),
        Expanded(child: Text(text, style: RiderText.body)),
        ?action,
      ],
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
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppColors.gray900,
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
              minimumSize: const Size.fromHeight(52),
              foregroundColor: rose,
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
              minimumSize: const Size.fromHeight(52),
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

/// Segmented tabs at the top of a list, with counts ("To collect 3").
class RiderTabs<T> extends StatelessWidget {
  const RiderTabs({
    super.key,
    required this.values,
    required this.selected,
    required this.labelOf,
    required this.onSelected,
    this.countOf,
  });

  final List<T> values;
  final T selected;
  final String Function(T value) labelOf;
  final int? Function(T value)? countOf;
  final ValueChanged<T> onSelected;

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
              selectedColor: AppColors.brandRed,
              labelStyle: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: value == selected ? AppColors.white : AppColors.gray900,
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
