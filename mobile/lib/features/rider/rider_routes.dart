import 'package:go_router/go_router.dart';

import '../../core/session/home_route.dart';
import 'rider_home_screen.dart';

/// Part C (King): every rider screen lives under `/rider`.
final riderRoutes = <RouteBase>[
  GoRoute(path: AppHome.rider.path, builder: (_, _) => const RiderHomeScreen()),
];
