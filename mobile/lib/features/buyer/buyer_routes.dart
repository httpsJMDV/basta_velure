import 'package:go_router/go_router.dart';

import '../../core/session/home_route.dart';
import 'buyer_home_screen.dart';

/// Part B (Amaru): every buyer screen lives under `/buyer`.
final buyerRoutes = <RouteBase>[
  GoRoute(path: AppHome.buyer.path, builder: (_, _) => const BuyerHomeScreen()),
];
