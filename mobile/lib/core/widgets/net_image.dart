import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../env.dart';
import '../theme/app_colors.dart';

/// A public photo from the API (products, shops, categories): cached on the phone, a stone box while it loads and
/// an icon when it is missing. Links go through [Env.mediaUrl], so a local backend's `localhost` links load too.
///
/// Private files (IDs, receipts, proof photos) never use this: they are fetched with the token and shown from
/// memory, so nothing is kept on the phone.
class NetImage extends StatelessWidget {
  const NetImage(
    this.url, {
    super.key,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius = 0,
    this.icon = LucideIcons.image,
  });

  final String? url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final double radius;

  /// What shows when there is no photo.
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final link = url;
    final placeholder = Container(
      width: width,
      height: height,
      color: AppColors.stone100,
      alignment: Alignment.center,
      child: Icon(icon, color: AppColors.stone300, size: 28),
    );
    final image = link == null || link.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: Env.mediaUrl(link),
            width: width,
            height: height,
            fit: fit,
            fadeInDuration: const Duration(milliseconds: 150),
            placeholder: (_, _) => Container(
              width: width,
              height: height,
              color: AppColors.stone100,
            ),
            errorWidget: (_, _, _) => placeholder,
          );
    return radius == 0
        ? image
        : ClipRRect(borderRadius: BorderRadius.circular(radius), child: image);
  }
}
