import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../hub/hub_kit.dart';

export '../hub/hub_kit.dart';

/// The courier team's own pieces, on top of the hub's. Someone in the office reads these to decide what to do next, so
/// each one shows a whole picture: how far along, how many of how many, who has it now.

/// 0.9067 as "91%". Nothing to measure by reads as a dash, never as a made-up number.
String courierRate(double? rate) =>
    rate == null ? '—' : '${(rate * 100).round()}%';

/// 6.4 as "6.4 h".
String courierHours(double? hours) =>
    hours == null ? '—' : '${hours.toStringAsFixed(1)} h';

/// The picture for a parcel's status, in the same tone as its chip.
IconData courierParcelIcon(String status) => switch (status) {
  'READY_FOR_PICKUP' => LucideIcons.packageOpen,
  'PICKED_UP' => LucideIcons.bike,
  'AT_SORTING_CENTER' => LucideIcons.warehouse,
  'SORTED' => LucideIcons.layers,
  'ASSIGNED_TO_RIDER' || 'OUT_FOR_DELIVERY' => LucideIcons.truck,
  'DELIVERED' => LucideIcons.packageCheck,
  'DELIVERY_FAILED' => LucideIcons.triangleAlert,
  'RETURN_TO_SENDER' || 'RETURNED' => LucideIcons.undo2,
  'LOST' => LucideIcons.circleHelp,
  'DAMAGED' => LucideIcons.packageX,
  _ => LucideIcons.package,
};

/// A rounded bar for "this much of that".
class CourierMeter extends StatelessWidget {
  const CourierMeter({
    super.key,
    required this.value,
    this.color = AppColors.gray900,
    this.track = AppColors.gray200,
    this.height = 6,
    this.label,
  });

  /// 0 to 1.
  final double value;
  final Color color;
  final Color track;
  final double height;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final calm = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(height),
        child: SizedBox(
          height: height,
          child: ColoredBox(
            color: track,
            child: Align(
              alignment: Alignment.centerLeft,
              child: AnimatedFractionallySizedBox(
                duration: calm ? Duration.zero : kMotion,
                curve: Curves.easeOutCubic,
                widthFactor: value.isNaN ? 0 : value.clamp(0.0, 1.0),
                heightFactor: 1,
                child: ColoredBox(color: color),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Icon tile, title, and one line under it: a piece of work to open. Two to a row on Home and More.
class CourierWorkTile extends StatelessWidget {
  const CourierWorkTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final int badge;

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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  RiderIconTile(
                    icon: icon,
                    size: 40,
                    color: AppColors.brandRed,
                    background: AppColors.brandRed.withValues(alpha: 0.08),
                  ),
                  if (badge > 0)
                    Badge(
                      backgroundColor: AppColors.brandRed,
                      label: Text(badge > 99 ? '99+' : '$badge'),
                    ),
                ],
              ),
              const SizedBox(height: AppSpace.sm),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 15.5,
                  height: 1.25,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray900,
                ),
              ),
              const SizedBox(height: 2),
              Text(subtitle, style: HubText.small),
            ],
          ),
        ),
      ),
    );
  }
}

/// A person's initials with a green dot when they are Online.
class CourierPersonAvatar extends StatelessWidget {
  const CourierPersonAvatar({
    super.key,
    required this.name,
    this.online = false,
    this.size = 46,
  });

  final String name;
  final bool online;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dot = size * 0.3;
    return SizedBox.square(
      dimension: size,
      child: Stack(
        children: [
          HubAvatar(name: name, size: size),
          if (online)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: dot,
                height: dot,
                decoration: BoxDecoration(
                  color: kDeliveredGreen,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.white, width: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Where a parcel starts and where it ends, joined by a line.
class CourierRoute extends StatelessWidget {
  const CourierRoute({
    super.key,
    required this.fromLabel,
    required this.fromTitle,
    required this.toLabel,
    required this.toTitle,
    this.fromDetail,
    this.toDetail,
  });

  final String fromLabel;
  final String fromTitle;
  final String? fromDetail;
  final String toLabel;
  final String toTitle;
  final String? toDetail;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 22,
            child: Column(
              children: [
                const SizedBox(height: 3),
                const Icon(
                  LucideIcons.store,
                  size: 18,
                  color: AppColors.gray600,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Container(width: 2, color: AppColors.gray200),
                  ),
                ),
                const Icon(
                  LucideIcons.mapPin,
                  size: 18,
                  color: AppColors.brandRed,
                ),
                const SizedBox(height: 3),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _RouteEnd(
                  label: fromLabel,
                  title: fromTitle,
                  detail: fromDetail,
                ),
                const SizedBox(height: AppSpace.md),
                _RouteEnd(label: toLabel, title: toTitle, detail: toDetail),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteEnd extends StatelessWidget {
  const _RouteEnd({required this.label, required this.title, this.detail});

  final String label;
  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: HubText.small.copyWith(fontSize: 12.5)),
        Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            height: 1.3,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        if (detail != null && detail!.trim().isNotEmpty)
          Text(detail!, style: HubText.small),
      ],
    );
  }
}

/// One event on a vertical line: a dot, what happened, and when and by whom.
class CourierTimelineRow extends StatelessWidget {
  const CourierTimelineRow({
    super.key,
    required this.title,
    required this.detail,
    this.body,
    this.strong = false,
    this.last = false,
  });

  final String title;
  final String? body;
  final String detail;

  /// The newest event: a filled dot and a heavier title.
  final bool strong;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 16,
            child: Column(
              children: [
                const SizedBox(height: 4),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: strong ? AppColors.brandRed : AppColors.white,
                    border: Border.all(
                      color: strong ? AppColors.brandRed : AppColors.stone300,
                      width: 2,
                    ),
                  ),
                ),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.only(top: 2),
                      color: AppColors.gray200,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : AppSpace.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.3,
                      fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
                      color: AppColors.gray900,
                    ),
                  ),
                  if (body != null && body!.trim().isNotEmpty)
                    Text(
                      body!,
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.35,
                        color: AppColors.gray900,
                      ),
                    ),
                  const SizedBox(height: 1),
                  Text(detail, style: HubText.small),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A card's heading: an icon tile, a title, and what the card is about.
class CourierCardHeader extends StatelessWidget {
  const CourierCardHeader({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.below,
    this.tileColor = AppColors.white,
    this.tileBackground = AppColors.gray900,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  /// Under the text, where a long status has the whole width.
  final Widget? below;
  final Color tileColor;
  final Color tileBackground;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RiderIconTile(
          icon: icon,
          size: 46,
          color: tileColor,
          background: tileBackground,
        ),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: RiderText.name),
              if (subtitle != null && subtitle!.trim().isNotEmpty)
                Text(subtitle!, style: HubText.small),
              if (below != null) ...[
                const SizedBox(height: AppSpace.xs),
                below!,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// What the company still owes a rider or a hub, as the server worked it out, and where the money goes.
class CourierPay extends StatelessWidget {
  const CourierPay({
    super.key,
    required this.amount,
    required this.count,
    required this.lastPaid,
    this.gcash,
  });

  final String amount;
  final int count;
  final String lastPaid;
  final String? gcash;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Not paid yet', style: HubText.small),
          const SizedBox(height: 2),
          Text(amount, style: HubText.figure),
          const SizedBox(height: 2),
          Text(
            count == 0
                ? 'Nothing waiting'
                : '$count unpaid earning${count == 1 ? '' : 's'}',
            style: HubText.small,
          ),
          const Divider(height: AppSpace.xl),
          HubFact(
            icon: LucideIcons.calendarCheck,
            label: 'Last paid',
            value: lastPaid,
          ),
          HubFact(icon: LucideIcons.wallet, label: 'GCash', value: gcash),
        ],
      ),
    );
  }
}
