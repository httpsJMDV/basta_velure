import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import 'data/rider_models.dart';
import 'data/rider_state.dart';
import 'home/offer_overlay.dart';
import 'location/location_bar.dart';
import 'location/location_beacon.dart';

/// The rider app's frame: the same five places as the website's menu at the bottom, the "Sharing your location" bar
/// on top while it is on, and a new job offer over everything the moment it arrives.
class RiderShell extends ConsumerWidget {
  const RiderShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A new offer: vibrate and make a sound so a rider with the phone in a holder notices.
    ref.listen<List<RiderOffer>>(riderOffersProvider, (previous, next) {
      final seen = {for (final o in previous ?? const <RiderOffer>[]) o.id};
      if (next.any((o) => !seen.contains(o.id))) _alert();
    });
    // Watching it here keeps location sharing alive on every tab.
    final beacon = ref.watch(locationBeaconProvider);
    final barShown =
        beacon == BeaconState.sharing || beacon == BeaconState.starting;
    final offers = ref.watch(riderOffersProvider);

    return Stack(
      children: [
        Scaffold(
          backgroundColor: AppColors.gray50,
          body: Column(
            children: [
              const LocationBar(),
              // The bar already sits under the status bar, so the screen below it doesn't pad for it again.
              Expanded(
                child: MediaQuery.removePadding(
                  context: context,
                  removeTop: barShown,
                  child: shell,
                ),
              ),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: shell.currentIndex,
            onDestinationSelected: (index) => shell.goBranch(
              index,
              initialLocation: index == shell.currentIndex,
            ),
            destinations: const [
              NavigationDestination(
                icon: Icon(LucideIcons.house),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(LucideIcons.packageOpen),
                label: 'Pickups',
              ),
              NavigationDestination(
                icon: Icon(LucideIcons.truck),
                label: 'Deliveries',
              ),
              NavigationDestination(
                icon: Icon(LucideIcons.wallet),
                label: 'Earnings',
              ),
              NavigationDestination(
                icon: Icon(LucideIcons.user),
                label: 'Account',
              ),
            ],
          ),
        ),
        if (offers.isNotEmpty)
          OfferOverlay(offer: offers.first, more: offers.length - 1),
      ],
    );
  }

  static Future<void> _alert() async {
    await SystemSound.play(SystemSoundType.alert);
    for (var i = 0; i < 3; i++) {
      await HapticFeedback.vibrate();
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }
  }
}
