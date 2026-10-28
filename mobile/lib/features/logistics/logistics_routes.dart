import 'package:go_router/go_router.dart';

import '../../core/session/home_route.dart';
import 'logistics_home_screen.dart';

/// Part D (Liam): every hub and courier-team screen lives under `/logistics`.
final logisticsRoutes = <RouteBase>[
  GoRoute(
    path: AppHome.logistics.path,
    builder: (_, _) => const LogisticsHomeScreen(),
  ),
];
