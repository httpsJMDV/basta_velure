import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/realtime/realtime.dart';
import 'core/theme/app_theme.dart';
import 'router.dart';

class LovedItApp extends ConsumerWidget {
  const LovedItApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keeps the live-updates client for whoever is signed in (it connects when a screen first listens) and closes it
    // on sign-out.
    ref.watch(realtimeProvider);

    return MaterialApp.router(
      title: 'Loved-IT',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      themeMode: ThemeMode.light,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
