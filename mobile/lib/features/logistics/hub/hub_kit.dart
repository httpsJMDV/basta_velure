import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../rider/widgets/rider_widgets.dart';

export '../../buyer/widgets/buyer_theme.dart' show dockInset;

/// The hub's own pieces. Hub staff read these at a counter with parcels in their hands, so the number that matters is
/// always the biggest thing on the card, and colour only ever means something: amber waits, red is a problem.
abstract final class HubText {
  static const figure = TextStyle(
    fontSize: 26,
    height: 1.1,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.4,
    color: AppColors.gray900,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const small = TextStyle(
    fontSize: 13,
    height: 1.35,
    color: AppColors.gray600,
  );
}

/// How long something has waited, in a chip: amber from a day on, because that is when a buyer starts to notice.
bool waitedLong(DateTime? since) =>
    since != null && DateTime.now().difference(since).inHours >= 24;

/// A few figures in one row, ruled off from each other. The top of every working list.
class HubSummaryStrip extends StatelessWidget {
  const HubSummaryStrip({super.key, required this.items});

  final List<HubSummaryItem> items;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: AppSpace.md,
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0)
                const VerticalDivider(
                  width: AppSpace.lg,
                  color: AppColors.gray200,
                ),
              Expanded(child: items[i]),
            ],
          ],
        ),
      ),
    );
  }
}

class HubSummaryItem extends StatelessWidget {
  const HubSummaryItem({
    super.key,
    required this.value,
    required this.label,
    this.color = AppColors.gray900,
  });

  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label: $value',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: HubText.figure.copyWith(fontSize: 20, color: color),
            ),
          ),
          const SizedBox(height: 2),
          Text(label, style: HubText.small.copyWith(fontSize: 12.5)),
        ],
      ),
    );
  }
}

/// A small icon and a few words. Quiet gray unless it has something to say.
class HubMetaChip extends StatelessWidget {
  const HubMetaChip({
    super.key,
    required this.icon,
    required this.label,
    this.tone,
  });

  final IconData icon;
  final String label;
  final StatusTone? tone;

  @override
  Widget build(BuildContext context) {
    final tint = tone;
    final color = tint?.foreground ?? AppColors.gray600;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: tint?.background ?? AppColors.gray100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One barangay's parcels in a working list: the count in its own tile, what it is, and what is holding it up.
class HubWorkCard extends StatelessWidget {
  const HubWorkCard({
    super.key,
    required this.count,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.chips = const [],
    this.selected = false,
  });

  final int count;
  final String title;
  final String? subtitle;
  final List<Widget> chips;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: AnimatedContainer(
          duration: kMotion,
          color: selected ? AppColors.gray100 : Colors.transparent,
          padding: const EdgeInsets.all(AppSpace.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                constraints: const BoxConstraints(minWidth: 58),
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: AppColors.gray900,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  children: [
                    Text(
                      '$count',
                      style: HubText.figure.copyWith(
                        fontSize: 22,
                        color: AppColors.white,
                      ),
                    ),
                    Text(
                      count == 1 ? 'parcel' : 'parcels',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppColors.white.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        height: 1.25,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray900,
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty)
                      Text(subtitle!, style: HubText.small),
                    if (chips.isNotEmpty) ...[
                      const SizedBox(height: AppSpace.sm),
                      Wrap(spacing: 6, runSpacing: 6, children: chips),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.xs),
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(
                  LucideIcons.chevronRight,
                  size: 18,
                  color: AppColors.gray600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A person's initials in a circle.
class HubAvatar extends StatelessWidget {
  const HubAvatar({super.key, required this.name, this.size = 46});

  final String name;
  final double size;

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '';
    final first = parts.first.characters.first;
    return parts.length == 1
        ? first.toUpperCase()
        : (first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: AppColors.gray900,
          shape: BoxShape.circle,
        ),
        child: Text(
          _initials,
          style: TextStyle(
            fontSize: size * 0.36,
            fontWeight: FontWeight.w700,
            color: AppColors.white,
          ),
        ),
      ),
    );
  }
}

/// The icon for a rider's registered vehicle.
IconData hubVehicleIcon(String? type) => switch (type?.trim().toLowerCase()) {
  'car' => LucideIcons.car,
  'van' => LucideIcons.truck,
  _ => LucideIcons.bike,
};

/// An icon, a label and a value on a details card. The value gets the room.
class HubFact extends StatelessWidget {
  const HubFact({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final String? value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final text = value == null || value!.trim().isEmpty ? '—' : value!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 18, color: AppColors.gray600),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: HubText.small.copyWith(fontSize: 12.5)),
                Text(
                  text,
                  style: const TextStyle(
                    fontSize: 15,
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: AppColors.gray900,
                  ),
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// A short explanation on top of a list, for the person seeing it the first time.
class HubHint extends StatelessWidget {
  const HubHint({super.key, required this.text, this.icon = LucideIcons.info});

  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: AppColors.gray600),
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(child: Text(text, style: HubText.small)),
      ],
    );
  }
}

/// A section's serif heading with a line of explanation under it.
class HubSection extends StatelessWidget {
  const HubSection({super.key, required this.title, this.note});

  final String title;
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: BuyerText.section.copyWith(
              fontSize: 18,
              color: AppColors.gray900,
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: 2),
            Text(note!, style: HubText.small),
          ],
        ],
      ),
    );
  }
}
