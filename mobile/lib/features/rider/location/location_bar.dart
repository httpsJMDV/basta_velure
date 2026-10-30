import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/media/permissions.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import 'location_beacon.dart';

/// The thin bar across the top while the rider's location is shared, so they can always see it is on.
class LocationBar extends ConsumerWidget {
  const LocationBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(locationBeaconProvider);
    if (state != BeaconState.sharing && state != BeaconState.starting) {
      return const SizedBox.shrink();
    }
    final parcels = ref.read(locationBeaconProvider.notifier).activeParcels;
    return Material(
      color: const Color(0xFF047857),
      child: SafeArea(
        bottom: false,
        child: Semantics(
          liveRegion: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.lg,
              vertical: 6,
            ),
            child: Row(
              children: [
                const Icon(
                  LucideIcons.locateFixed,
                  size: 16,
                  color: AppColors.white,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    state == BeaconState.starting
                        ? 'Finding your location…'
                        : 'Sharing your location'
                              '${parcels > 0 ? ' · $parcels parcel${parcels == 1 ? '' : 's'}' : ''}',
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// In place of the Pickups and Deliveries screens while the rider has parcels and their location is off, like the
/// website's RiderLocationGate: the buyer, the seller and the hub follow the parcel through this phone.
class LocationGate extends ConsumerWidget {
  const LocationGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(locationBeaconProvider);
    final beacon = ref.read(locationBeaconProvider.notifier);
    final (title, body, action) = switch (state) {
      BeaconState.idle ||
      BeaconState.sharing ||
      BeaconState.starting => (null, null, null),
      BeaconState.needsPermission => (
        'Turn on your location',
        'You have parcels to collect or carry. The buyer, the seller and the hub follow them on the map through '
            'this phone, only while you work.',
        'Turn on location',
      ),
      BeaconState.denied => (
        'Location is blocked',
        'Location is turned off for Loved-IT. Open Settings, allow location, then come back.',
        'Open Settings',
      ),
      BeaconState.serviceOff => (
        "Your phone's location is off",
        'Turn on Location (GPS) in your quick settings, then come back.',
        'Turn on Location',
      ),
    };
    if (title == null) return child;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.brandRedTint,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Icon(
                LucideIcons.mapPinOff,
                color: AppColors.brandRed,
                size: 30,
              ),
            ),
            const SizedBox(height: AppSpace.lg),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.gray900,
              ),
            ),
            const SizedBox(height: AppSpace.sm),
            Text(
              body!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 16,
                color: AppColors.gray600,
                height: 1.45,
              ),
            ),
            const SizedBox(height: AppSpace.xl),
            FilledButton.icon(
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              icon: const Icon(LucideIcons.locateFixed, size: 20),
              label: Text(action!),
              onPressed: () async {
                switch (state) {
                  case BeaconState.needsPermission:
                    final allowed = await askPermission(
                      context,
                      Permission.locationWhenInUse,
                      title: 'Share your location?',
                      reason:
                          'While you collect or carry parcels, the buyer, the seller and the hub see where you are on '
                          'the map. Nothing is sent when you have no parcels.',
                    );
                    if (allowed) await beacon.retry();
                  case BeaconState.denied:
                    await openAppSettings();
                  case BeaconState.serviceOff:
                    await Geolocator.openLocationSettings();
                  default:
                    break;
                }
              },
            ),
            const SizedBox(height: AppSpace.sm),
            TextButton(
              onPressed: beacon.retry,
              child: const Text('I turned it on'),
            ),
          ],
        ),
      ),
    );
  }
}
