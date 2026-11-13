import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:loved_it/core/api/json.dart';
import 'package:loved_it/features/buyer/catalog/categories_screen.dart';
import 'package:loved_it/features/buyer/data/buyer_api.dart';
import 'package:loved_it/features/buyer/data/catalog.dart';
import 'package:loved_it/features/buyer/widgets/buyer_theme.dart';

Category _category(
  int id,
  String name, {
  int products = 3,
  List<Category> children = const [],
}) => Category(
  id: id,
  slug: 'test-$id',
  name: name,
  productCount: products,
  children: children,
);

final _categories = [
  _category(
    1,
    'Gadgets',
    children: [
      _category(11, 'Phones'),
      _category(12, 'A category with a very long name that needs two lines'),
    ],
  ),
  _category(2, 'Grocery', products: 1, children: [_category(21, 'Snacks')]),
  _category(3, 'Others', products: 0),
  _category(4, 'Toys', children: [_category(41, 'Puzzles')]),
];

class _FakeBuyerApi extends Fake implements BuyerApi {
  _FakeBuyerApi(this.popular);

  final List<Map<String, Object?>> popular;
  Object? parentCategoryId;
  String? sort;

  @override
  Future<ApiPage<ProductSummary>> products({
    int page = 1,
    int perPage = 20,
    String? q,
    Object? categoryId,
    Object? parentCategoryId,
    String? sort,
    String? minPrice,
    String? maxPrice,
    int? minRating,
    bool onSale = false,
    bool newArrivals = false,
    int? sellerId,
    int? storeCategoryId,
    int? seed,
  }) async {
    this.parentCategoryId = parentCategoryId;
    this.sort = sort;
    return ApiPage.single(popular.map(ProductSummary.fromJson).toList());
  }
}

void main() {
  late List<String> opened;
  late _FakeBuyerApi api;
  late GoRouter router;

  /// The screen on a normal phone, with [popular] as every category's best sellers.
  Future<void> open(
    WidgetTester tester, {
    List<Map<String, Object?>> popular = const [],
    List<Category>? categories,
    Size size = const Size(360, 780),
  }) async {
    tester.view.physicalSize = size * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    opened = [];
    api = _FakeBuyerApi(popular);
    router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const CategoriesScreen(),
          routes: [
            GoRoute(
              path: 'buyer/search',
              builder: (_, state) {
                opened.add(state.uri.toString());
                return const SizedBox();
              },
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          buyerApiProvider.overrideWithValue(api),
          categoriesProvider.overrideWith(
            (ref) async => categories ?? _categories,
          ),
        ],
        child: MaterialApp.router(
          theme: BuyerThemed.theme(ThemeData()),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  group('Categories', () {
    testWidgets('opens on the first category, with its types', (tester) async {
      await open(tester);
      // In the row and on the banner.
      expect(find.text('Gadgets'), findsNWidgets(2));
      expect(find.text('See all 3 products'), findsOneWidget);
      expect(find.text('Shop by type'), findsOneWidget);
      expect(find.text('Phones'), findsOneWidget);
      expect(find.text('Snacks'), findsNothing);
    });

    testWidgets('tapping a photo in the row opens that category', (
      tester,
    ) async {
      await open(tester);
      await tester.tap(find.text('Grocery'));
      await tester.pumpAndSettle();
      expect(find.text('Snacks'), findsOneWidget);
      expect(find.text('Phones'), findsNothing);
      expect(find.text('See 1 product'), findsOneWidget);
    });

    testWidgets('a far category opens straight away', (tester) async {
      await open(tester);
      await tester.tap(find.text('Toys'));
      await tester.pumpAndSettle();
      expect(find.text('Puzzles'), findsOneWidget);
    });

    testWidgets('swiping the page moves the row to match', (tester) async {
      await open(tester);
      final semantics = tester.ensureSemantics();
      expect(_rowItem(tester, 'Gadgets'), _selected(true));

      await tester.fling(find.byType(PageView), const Offset(-300, 0), 1200);
      await tester.pumpAndSettle();
      expect(find.text('Snacks'), findsOneWidget);
      expect(_rowItem(tester, 'Grocery'), _selected(true));
      expect(_rowItem(tester, 'Gadgets'), _selected(false));
      semantics.dispose();
    });

    testWidgets('a category with no types or products says so plainly', (
      tester,
    ) async {
      await open(tester);
      await tester.tap(find.text('Others'));
      await tester.pumpAndSettle();
      expect(find.text('No products yet'), findsOneWidget);
      expect(find.text('Shop by type'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the banner and a type open their product lists', (
      tester,
    ) async {
      await open(tester);
      await tester.tap(find.text('See all 3 products'));
      await tester.pumpAndSettle();
      expect(opened.single, contains('parent=1'));

      opened.clear();
      router.pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Phones'));
      await tester.pumpAndSettle();
      expect(opened.single, contains('category=11'));
    });

    testWidgets('shows what is popular, and hides the row when nothing is', (
      tester,
    ) async {
      await open(
        tester,
        popular: [
          {'id': 7, 'name': 'Wireless Earbuds', 'base_price': 899},
        ],
      );
      await tester.scrollUntilVisible(
        find.text('Popular right now'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Popular right now'), findsOneWidget);
      expect(api.parentCategoryId, 1);
      expect(api.sort, 'trending');
    });

    testWidgets('leaves out the popular row when it is empty', (tester) async {
      await open(tester);
      expect(find.text('Popular right now'), findsNothing);
    });

    testWidgets('fits a small phone with large text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await open(tester, size: const Size(320, 568));
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Grocery'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });

    testWidgets('says so when there are no categories', (tester) async {
      await open(tester, categories: const []);
      expect(find.text('No categories yet'), findsOneWidget);
    });
  });
}

SemanticsNode _rowItem(WidgetTester tester, String label) =>
    tester.getSemantics(find.bySemanticsLabel(label).first);

Matcher _selected(bool selected) =>
    isSemantics(isButton: true, hasTapAction: true, isSelected: selected);
