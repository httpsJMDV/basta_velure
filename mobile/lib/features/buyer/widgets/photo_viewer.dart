import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';

/// Full-screen photos to swipe through and pinch to zoom (product photos, review photos).
Future<void> showPhotoViewer(
  BuildContext context,
  List<String> urls, {
  int initial = 0,
}) {
  return Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: AppColors.stone900,
      pageBuilder: (_, _, _) => _PhotoViewer(urls: urls, initial: initial),
      transitionsBuilder: (_, animation, _, child) =>
          FadeTransition(opacity: animation, child: child),
    ),
  );
}

class _PhotoViewer extends StatefulWidget {
  const _PhotoViewer({required this.urls, required this.initial});

  final List<String> urls;
  final int initial;

  @override
  State<_PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<_PhotoViewer> {
  late final _pages = PageController(initialPage: widget.initial);
  late int _current = widget.initial;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.stone900,
      appBar: AppBar(
        backgroundColor: AppColors.stone900,
        foregroundColor: AppColors.white,
        leading: IconButton(
          tooltip: 'Close',
          icon: const Icon(LucideIcons.x),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text('${_current + 1} of ${widget.urls.length}'),
      ),
      body: PageView.builder(
        controller: _pages,
        itemCount: widget.urls.length,
        onPageChanged: (index) => setState(() => _current = index),
        itemBuilder: (_, index) => InteractiveViewer(
          maxScale: 4,
          child: Center(
            child: NetImage(widget.urls[index], fit: BoxFit.contain),
          ),
        ),
      ),
    );
  }
}
