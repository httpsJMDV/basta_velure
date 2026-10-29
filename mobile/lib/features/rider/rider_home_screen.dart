import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../auth/placeholder_home.dart';

/// The rider home. Part C (king.md) replaces this with the rider app.
class RiderHomeScreen extends StatelessWidget {
  const RiderHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const PlaceholderHome(
      title: 'Courier Station',
      icon: LucideIcons.bike,
      message: 'Job offers, pickups, deliveries and earnings come in Part C.',
    );
  }
}
