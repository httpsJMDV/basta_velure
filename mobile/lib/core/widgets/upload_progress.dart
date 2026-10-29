import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Upload progress for a photo or document. Feed it from Dio's `onSendProgress: (sent, total) => ...`.
class UploadProgress extends StatelessWidget {
  const UploadProgress({super.key, required this.sent, required this.total});

  final int sent;
  final int total;

  @override
  Widget build(BuildContext context) {
    final fraction = total <= 0 ? null : (sent / total).clamp(0.0, 1.0);
    final percent = fraction == null ? null : (fraction * 100).round();
    return Semantics(
      liveRegion: true,
      label: percent == null ? 'Uploading' : 'Uploading, $percent percent',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 6,
              backgroundColor: AppColors.stone200,
            ),
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            percent == null ? 'Uploading…' : 'Uploading $percent%',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
