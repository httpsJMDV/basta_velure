import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../rider/widgets/parcel_scanner.dart';
import '../../rider/widgets/rider_widgets.dart';

/// The result of one scan in a long session, newest first in the list.
class ScanRow {
  ScanRow({
    required this.code,
    required this.tone,
    required this.message,
    this.detail,
  }) : at = DateTime.now();

  final String code;
  final ScanTone tone;
  final String message;
  final String? detail;
  final DateTime at;
}

/// The scan screens' layout: the scanner and the list scroll together, so nothing gets cut off on a small phone or
/// with large text. A wide screen (a counter tablet) keeps the scanner on the left and the list on the right.
class ScanSessionLayout extends StatelessWidget {
  const ScanSessionLayout({
    super.key,
    required this.scanner,
    required this.results,
  });

  final Widget scanner;

  /// A sliver.
  final Widget results;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: LayoutBuilder(
        builder: (context, box) {
          if (box.maxWidth >= 840) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 420,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(AppSpace.lg),
                    child: scanner,
                  ),
                ),
                Expanded(child: CustomScrollView(slivers: [results])),
              ],
            );
          }
          return CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  AppSpace.md,
                  AppSpace.lg,
                  0,
                ),
                sliver: SliverToBoxAdapter(child: scanner),
              ),
              results,
            ],
          );
        },
      ),
    );
  }
}

/// The list under the camera: one row per scan, each in its colour and in words, the newest on top.
class ScanResultsSliver extends StatelessWidget {
  const ScanResultsSliver({super.key, required this.rows, required this.empty});

  final List<ScanRow> rows;
  final String empty;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.xl),
            child: Text(
              empty,
              textAlign: TextAlign.center,
              style: RiderText.body,
            ),
          ),
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.all(AppSpace.lg),
      sliver: SliverList.separated(
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpace.sm),
        itemBuilder: (context, index) => _ResultRow(row: rows[index]),
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({required this.row});

  final ScanRow row;

  @override
  Widget build(BuildContext context) {
    final (tone, icon) = switch (row.tone) {
      ScanTone.good => (StatusTone.emerald, LucideIcons.circleCheck),
      ScanTone.warn => (StatusTone.amber, LucideIcons.triangleAlert),
      ScanTone.bad => (StatusTone.rose, LucideIcons.circleX),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpace.md),
        decoration: BoxDecoration(
          color: tone.background,
          borderRadius: AppRadius.cardAll,
          border: Border.all(color: tone.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 22, color: tone.foreground),
            const SizedBox(width: AppSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row.message,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: tone.foreground,
                    ),
                  ),
                  Text(row.code, style: RiderText.mono),
                  if (row.detail != null && row.detail!.isNotEmpty)
                    Text(
                      row.detail!,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.gray900,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: AppSpace.sm),
            Text(
              Fmt.shortWhen(row.at),
              style: const TextStyle(fontSize: 12, color: AppColors.gray600),
            ),
          ],
        ),
      ),
    );
  }
}
