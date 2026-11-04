import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/theme/app_theme.dart';
import 'package:loved_it/features/buyer/home/home_screen.dart';
import 'package:loved_it/features/buyer/widgets/buyer_theme.dart';

import 'support/fakes.dart';

void main() {
  const pictures = [
    'assets/home/vouchers.webp',
    'assets/home/orders.webp',
    'assets/home/sale.webp',
    'assets/categories/mens-footwear.jpg',
    'assets/categories/earphones-audio.jpg',
    'assets/categories/smartwatches-wearables.jpg',
    'assets/categories/fragrances.jpg',
    'assets/categories/canned-goods.jpg',
    'assets/categories/bags-accessories.jpg',
    'assets/categories/jewelry.jpg',
    'assets/categories/food-grocery.jpg',
  ];

  Future<void> openHome(WidgetTester tester) async {
    final products = [
      for (final (id, label, price) in [
        (1, 'A very long product name that needs both of its lines', 899),
        (2, 'Phone Case (Clear)', 249),
      ])
        {'id': id, 'name': label, 'base_price': price, 'units_sold': id * 3},
    ];
    final scope = containerWith(
      FakeApi({
        'GET /categories': (_) => jsonBody(200, {'data': []}),
        'GET /products': (_) => jsonBody(200, {
          'data': products,
          'meta': {'current_page': 1, 'last_page': 1, 'total': 2},
        }),
        'GET /shops': (_) => jsonBody(200, {'data': []}),
      }),
      MemoryTokenStore('t'),
    );
    addTearDown(scope.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: scope,
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const BuyerThemed(child: Scaffold(body: HomeScreen())),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
  }

  Future<void> leaveHome(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  test('every Home picture is in the app', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final path in pictures) {
      final bytes = await rootBundle.load(path);
      expect(bytes.lengthInBytes, greaterThan(0), reason: path);
    }
  });

  testWidgets('the shortcuts show pictures, each with its words', (
    tester,
  ) async {
    await openHome(tester);

    for (final label in ['Vouchers', 'My orders', 'On sale', 'Trending']) {
      expect(find.text(label), findsOneWidget);
    }
    Finder picture(String path) => find.byWidgetPredicate((widget) {
      final image = widget is Image ? widget.image : null;
      final asset = image is ResizeImage ? image.imageProvider : image;
      return asset is AssetImage && asset.assetName == path;
    });
    for (final path in pictures.take(5)) {
      expect(picture(path), findsOneWidget, reason: path);
    }
    await leaveHome(tester);
  });

  testWidgets('Home fits a small phone with large text', (tester) async {
    tester.view.physicalSize = const Size(720, 1280);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await openHome(tester);
    await tester.drag(find.text('Trending'), const Offset(-700, 0));
    await tester.pump(const Duration(seconds: 1));
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
    await tester.pump(const Duration(seconds: 1));

    expect(tester.takeException(), isNull);
    await leaveHome(tester);
  });
}
