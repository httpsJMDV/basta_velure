import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/widgets/widgets.dart';
import 'package:loved_it/features/buyer/buyer_shell.dart';
import 'package:loved_it/features/buyer/data/catalog.dart';
import 'package:loved_it/features/buyer/widgets/buyer_widgets.dart';
import 'package:loved_it/features/buyer/widgets/buyer_theme.dart';

/// The buyer app's own pieces: the dock, the tabs, the product card and the dropdown.
void main() {
  group('The dock', () {
    late int tapped;

    Widget dock(int index) => MaterialApp(
      theme: BuyerThemed.theme(ThemeData()),
      home: Scaffold(
        bottomNavigationBar: BuyerDock(
          index: index,
          onSelected: (i) => tapped = i,
          items: const [
            DockItem(icon: Icons.home, label: 'Home'),
            DockItem(icon: Icons.grid_view, label: 'Categories'),
            DockItem(icon: Icons.chat, label: 'Messages', count: 3),
            DockItem(icon: Icons.shopping_bag, label: 'Cart', count: 120),
            DockItem(icon: Icons.person, label: 'Account'),
          ],
        ),
      ),
    );

    setUp(() => tapped = -1);

    testWidgets('names only the open tab, and every tab keeps a tooltip', (
      tester,
    ) async {
      await tester.pumpWidget(dock(0));
      await tester.pumpAndSettle();
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Cart'), findsNothing);
      expect(find.byTooltip('Categories'), findsOneWidget);
      expect(find.byTooltip('Messages, 3 unread'), findsOneWidget);
      expect(find.byTooltip('Cart, 120 items'), findsOneWidget);
    });

    testWidgets('tapping a tab selects it, and counts stop at 99+', (
      tester,
    ) async {
      await tester.pumpWidget(dock(0));
      await tester.pumpAndSettle();
      expect(find.text('3'), findsOneWidget);
      expect(find.text('99+'), findsOneWidget);

      await tester.tap(find.byTooltip('Categories'));
      expect(tapped, 1);
    });

    testWidgets('the open tab moves without overflowing on a small phone', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(640, 1136);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      for (final index in [0, 1, 2, 3, 4, 0]) {
        await tester.pumpWidget(dock(index));
        // Part-way through the glide, then at rest.
        await tester.pump(const Duration(milliseconds: 90));
        expect(tester.takeException(), isNull);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('can be pressed with a screen reader', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(dock(1));
      await tester.pumpAndSettle();
      expect(
        tester.getSemantics(find.bySemanticsLabel('Cart')),
        isSemantics(label: 'Cart', isButton: true, hasTapAction: true),
      );
      semantics.dispose();
    });
  });

  testWidgets('a product card can be pressed with a screen reader', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 156,
            height: 260,
            child: ProductCard(
              product: ProductSummary.fromJson(const {
                'id': 7,
                'name': 'Earbuds',
                'base_price': 899,
              }),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(
      tester.getSemantics(find.bySemanticsLabel(RegExp('^Earbuds'))),
      isSemantics(isButton: true, hasTapAction: true),
    );
    semantics.dispose();
  });

  group('The tabs', () {
    Widget branches(int index) => MaterialApp(
      home: BuyerBranches(
        index: index,
        children: const [Text('First'), Text('Second'), Text('Third')],
      ),
    );

    double opacityOf(WidgetTester tester, String text) => tester
        .renderObject<RenderAnimatedOpacity>(
          find
              .ancestor(
                of: find.text(text),
                matching: find.byType(FadeTransition),
              )
              .first,
        )
        .opacity
        .value;

    testWidgets('the tab you leave fades out, in either direction', (
      tester,
    ) async {
      for (final (from, to) in [(0, 2), (2, 1), (1, 0)]) {
        const names = ['First', 'Second', 'Third'];
        await tester.pumpWidget(branches(from));
        await tester.pumpAndSettle();
        await tester.pumpWidget(branches(to));
        await tester.pumpAndSettle();
        expect(opacityOf(tester, names[to]), 1, reason: 'opening ${names[to]}');
        expect(
          opacityOf(tester, names[from]),
          0,
          reason: 'leaving ${names[from]}',
        );
      }
    });
  });

  group('The dropdown', () {
    const options = [
      AppOption('male', 'Male'),
      AppOption('female', 'Female'),
      AppOption('other', 'Prefer not to say'),
    ];

    Future<void> open(
      WidgetTester tester, {
      required ValueChanged<String> onChanged,
      String? value,
      String? errorText,
      FormFieldValidator<String>? validator,
      GlobalKey<FormState>? form,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BuyerThemed.theme(ThemeData()),
          home: Scaffold(
            body: Form(
              key: form,
              child: AppSelectField<String>(
                label: 'Sex',
                value: value,
                options: options,
                onChanged: onChanged,
                errorText: errorText,
                validator: validator,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('opens a sheet of choices and returns the one tapped', (
      tester,
    ) async {
      String? chosen;
      await open(tester, onChanged: (value) => chosen = value);
      expect(find.text('Female'), findsNothing);

      await tester.tap(find.text('Sex'));
      await tester.pumpAndSettle();
      expect(find.text('Male'), findsOneWidget);
      expect(find.text('Prefer not to say'), findsOneWidget);

      await tester.tap(find.text('Female'));
      await tester.pumpAndSettle();
      expect(chosen, 'female');
      // The sheet has closed.
      expect(find.text('Male'), findsNothing);
    });

    testWidgets('closing the sheet changes nothing', (tester) async {
      String? chosen;
      await open(tester, value: 'male', onChanged: (value) => chosen = value);
      await tester.tap(find.text('Male'));
      await tester.pumpAndSettle();

      await tester.tapAt(const Offset(20, 20));
      await tester.pumpAndSettle();
      expect(chosen, isNull);
      expect(find.text('Male'), findsOneWidget);
    });

    testWidgets(
      "shows the current choice, and takes part in the form's checks",
      (tester) async {
        final form = GlobalKey<FormState>();
        await open(
          tester,
          form: form,
          onChanged: (_) {},
          validator: (value) => value == null ? 'Choose one.' : null,
        );
        expect(form.currentState!.validate(), isFalse);
        await tester.pump();
        expect(find.text('Choose one.'), findsOneWidget);

        await open(
          tester,
          form: form,
          value: 'female',
          onChanged: (_) {},
          validator: (value) => value == null ? 'Choose one.' : null,
        );
        expect(find.text('Female'), findsOneWidget);
      },
    );

    testWidgets('shows a message from the server', (tester) async {
      await open(tester, onChanged: (_) {}, errorText: 'Not allowed.');
      expect(find.text('Not allowed.'), findsOneWidget);
    });
  });
}
