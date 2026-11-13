import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:loved_it/core/widgets/home_back_guard.dart';

/// A dock with three tabs and a screen that opens over them, guarded like the app's shells.
GoRouter _router() => GoRouter(
  initialLocation: '/home',
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (_, _, shell) =>
          HomeBackGuard(shell: shell, child: Scaffold(body: shell)),
      branches: [
        for (final tab in ['home', 'orders', 'account'])
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/$tab', builder: (_, _) => Text('tab $tab')),
            ],
          ),
      ],
    ),
    GoRoute(
      path: '/detail',
      builder: (_, _) => const Scaffold(body: Text('detail')),
    ),
  ],
);

Future<GoRouter> _open(WidgetTester tester) async {
  final router = _router();
  addTearDown(router.dispose);
  await tester.pumpWidget(MaterialApp.router(routerConfig: router));
  await tester.pumpAndSettle();
  return router;
}

/// Android's back button, as the system sends it.
Future<void> _back(WidgetTester tester) async {
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
}

void main() {
  late List<MethodCall> platformCalls;

  setUp(() {
    platformCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          platformCalls.add(call);
          return null;
        });
  });

  bool closedApp() =>
      platformCalls.any((c) => c.method == 'SystemNavigator.pop');

  testWidgets('back on another tab goes to the home tab', (tester) async {
    final router = await _open(tester);
    router.go('/orders');
    await tester.pumpAndSettle();
    expect(find.text('tab orders'), findsOneWidget);

    await _back(tester);

    expect(find.text('tab home'), findsOneWidget);
    expect(find.text('Leave Loved-IT?'), findsNothing);
    expect(closedApp(), isFalse);
  });

  testWidgets('a screen over the tabs still closes as usual', (tester) async {
    final router = await _open(tester);
    router.go('/account');
    await tester.pumpAndSettle();
    router.push('/detail');
    await tester.pumpAndSettle();

    await _back(tester);

    expect(find.text('detail'), findsNothing);
    expect(find.text('tab account'), findsOneWidget);
  });

  testWidgets('back on home asks first, and Stay keeps the app open', (
    tester,
  ) async {
    await _open(tester);

    await _back(tester);
    expect(find.text('Leave Loved-IT?'), findsOneWidget);
    expect(closedApp(), isFalse);

    await tester.tap(find.text('Stay'));
    await tester.pumpAndSettle();
    expect(find.text('Leave Loved-IT?'), findsNothing);
    expect(find.text('tab home'), findsOneWidget);
    expect(closedApp(), isFalse);
  });

  testWidgets('back while the question is open just closes it', (
    tester,
  ) async {
    await _open(tester);
    await _back(tester);

    await _back(tester);

    expect(find.text('Leave Loved-IT?'), findsNothing);
    expect(closedApp(), isFalse);
  });

  testWidgets('Leave closes the app', (tester) async {
    await _open(tester);
    await _back(tester);

    await tester.tap(find.text('Leave'));
    await tester.pumpAndSettle();

    expect(closedApp(), isTrue);
  });
}
