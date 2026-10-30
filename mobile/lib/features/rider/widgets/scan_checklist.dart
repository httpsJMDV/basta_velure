import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import 'rider_widgets.dart';

/// The parcels a scan screen expects, each ticked once scanned, with the server's reason under any it refused.
class ScanChecklist extends StatelessWidget {
  const ScanChecklist({
    super.key,
    required this.expected,
    required this.scanned,
    this.refused = const {},
  });

  final List<String> expected;
  final List<String> scanned;

  /// Tracking number → why the server refused it.
  final Map<String, String> refused;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose.foreground;
    return RiderCard(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.lg,
              vertical: AppSpace.sm,
            ),
            child: Text(
              '${scanned.length} of ${expected.length} scanned',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.gray900,
              ),
            ),
          ),
          for (final tn in expected)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpace.lg,
                vertical: 6,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    scanned.contains(tn)
                        ? LucideIcons.circleCheck
                        : refused.containsKey(tn)
                        ? LucideIcons.circleAlert
                        : LucideIcons.circle,
                    size: 22,
                    color: scanned.contains(tn)
                        ? kDeliveredGreen
                        : refused.containsKey(tn)
                        ? rose
                        : AppColors.gray600,
                    semanticLabel: scanned.contains(tn)
                        ? 'Scanned'
                        : 'Not scanned',
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tn, style: RiderText.mono),
                        if (refused[tn] != null)
                          Text(
                            refused[tn]!,
                            style: TextStyle(fontSize: 14, color: rose),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The main button fixed at the bottom, where the thumb reaches.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.md,
            AppSpace.lg,
            AppSpace.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
        ),
      ),
    );
  }
}

/// The green tick at the top of a "done" screen.
class DoneHeader extends StatelessWidget {
  const DoneHeader({super.key, required this.title, this.message});

  final String title;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: RiderCard(
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: StatusTone.emerald.background,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(
                LucideIcons.circleCheck,
                color: kDeliveredGreen,
                size: 36,
              ),
            ),
            const SizedBox(height: AppSpace.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.gray900,
              ),
            ),
            if (message != null) ...[
              const SizedBox(height: AppSpace.xs),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: RiderText.body,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
