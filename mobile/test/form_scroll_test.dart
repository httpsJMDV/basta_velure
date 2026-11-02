import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/widgets/widgets.dart';
import 'package:loved_it/features/buyer/account/complete_profile_screen.dart';
import 'package:loved_it/features/buyer/addresses/address_form_screen.dart';

import 'support/fakes.dart';

/// Long forms on a small phone. A field out of view must still be checked, keep what was picked, and show its message
/// where it can be seen.
void main() {
  late FakeApi api;

  Future<void> openScreen(WidgetTester tester, Widget screen) async {
    tester.view.physicalSize = const Size(720, 1280);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    api = FakeApi({});
    final container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> scrollTo(WidgetTester tester, Finder target, double step) async {
    await tester.scrollUntilVisible(
      target,
      step,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
  }

  group('Complete profile', () {
    final next = find.widgetWithText(FilledButton, 'Continue');

    Future<void> pickBirthday(WidgetTester tester) async {
      await tester.ensureVisible(find.byType(DateOfBirthField));
      await tester.tap(find.byType(DateOfBirthField));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
    }

    Future<void> pickSex(WidgetTester tester) async {
      await tester.ensureVisible(find.text('Sex'));
      await tester.tap(find.text('Sex'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Male').last);
      await tester.pumpAndSettle();
    }

    testWidgets('blank fields stop the first step and show their messages', (
      tester,
    ) async {
      await openScreen(tester, const CompleteProfileScreen());
      await tester.tap(next);
      await tester.pumpAndSettle();

      expect(find.text('Date of birth is required.'), findsOneWidget);
      expect(find.text('Choose one.'), findsOneWidget);
      expect(find.text('Mobile number is required.'), findsOneWidget);
      expect(find.text('Region'), findsNothing);
      expect(api.requests, isEmpty);
    });

    testWidgets('Continue opens the address, and Back keeps what was picked', (
      tester,
    ) async {
      await openScreen(tester, const CompleteProfileScreen());
      await pickBirthday(tester);
      await pickSex(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Mobile number'),
        '09171234567',
      );
      await tester.pump();
      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text('Region'), findsOneWidget);
      expect(find.byType(DateOfBirthField), findsNothing);

      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.byType(DateOfBirthField), findsOneWidget);
      expect(find.text('Date of birth is required.'), findsNothing);
      final field = tester.state<FormFieldState<DateTime>>(
        find.byType(DateOfBirthField),
      );
      expect(field.value, isNotNull);
      expect(find.text('09171234567'), findsOneWidget);
    });

    testWidgets('the address step stops until its places are picked', (
      tester,
    ) async {
      await openScreen(tester, const CompleteProfileScreen());
      await pickBirthday(tester);
      await pickSex(tester);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Mobile number'),
        '09171234567',
      );
      await tester.pump();
      await tester.tap(next);
      await tester.pumpAndSettle();

      await tester.tap(next);
      await tester.pumpAndSettle();
      expect(find.text('Choose the region.'), findsOneWidget);
      expect(find.text('Enter the street, house or building.'), findsOneWidget);
      expect(find.text('Government ID'), findsNothing);
    });
  });

  group('New address', () {
    final save = find.widgetWithText(FilledButton, 'Save address');

    testWidgets('a blank field scrolled out of view stops Save', (
      tester,
    ) async {
      await openScreen(tester, const AddressFormScreen());
      await scrollTo(tester, save, 200);
      await tester.tap(save);
      await tester.pumpAndSettle();

      expect(find.text('Mobile number is required.'), findsOneWidget);
      expect(api.requests, isEmpty);
    });

    testWidgets('Save scrolls back to the first wrong field', (tester) async {
      await openScreen(tester, const AddressFormScreen());
      await scrollTo(tester, save, 200);
      await tester.tap(save);
      await tester.pumpAndSettle();

      final message = find.text('Mobile number is required.');
      expect(tester.getRect(message).top, greaterThanOrEqualTo(0));
      expect(tester.getRect(message).bottom, lessThanOrEqualTo(640));
    });
  });
}
