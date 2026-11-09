import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/app.dart';
import 'package:loved_it/core/widgets/widgets.dart';
import 'package:loved_it/features/auth/auth_layout.dart';
import 'package:loved_it/features/auth/auth_routes.dart';
import 'package:loved_it/features/auth/google_button.dart';
import 'package:loved_it/features/buyer/addresses/place_picker.dart';
import 'package:loved_it/router.dart';

import 'support/fakes.dart';

/// The sign-in, sign-up and code screens through the router, on a small phone and a usual one.
void main() {
  late ProviderContainer container;

  Future<void> openApp(
    WidgetTester tester,
    FakeApi api, {
    Size size = const Size(1080, 2400),
    double ratio = 2.75,
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = ratio;
    addTearDown(tester.view.reset);
    container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const LovedItApp(),
      ),
    );
    await tester.pumpAndSettle();
    // A guest opens on the shop; these are all about signing in.
    container.read(routerProvider).go(AuthPaths.signIn);
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.widgetWithText(TextFormField, label);
  final next = find.widgetWithText(FilledButton, 'Continue');

  Future<void> press(WidgetTester tester, Finder button) async {
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  Future<void> openSignUp(WidgetTester tester, FakeApi api) async {
    await openApp(tester, api);
    await press(tester, find.text('Create an account'));
    expect(find.text('Create your account'), findsOneWidget);
  }

  /// Picks [option] from the place list a [PlaceField] opens.
  Future<void> pickPlace(
    WidgetTester tester,
    String label,
    String option,
  ) async {
    await press(tester, find.widgetWithText(PlaceField, label));
    await tester.tap(find.text(option).last);
    await tester.pumpAndSettle();
  }

  /// Fills the first three steps (the address in Pasig, NCR), so the password step is open.
  Future<void> fillToPasswordStep(WidgetTester tester) async {
    await tester.enterText(field('First name'), 'Ana');
    await tester.enterText(field('Last name'), 'Cruz');
    await tester.pump();
    await press(tester, find.byType(DateOfBirthField));
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await press(tester, next);

    await tester.enterText(field('Email'), 'ana@example.com');
    await tester.enterText(field('Mobile number'), '09171234567');
    await tester.pump();
    await press(tester, next);

    await pickPlace(tester, 'Region', 'National Capital Region (NCR)');
    // NCR has no provinces.
    expect(find.widgetWithText(PlaceField, 'Province'), findsNothing);
    await pickPlace(tester, 'City or municipality', 'City of Pasig');
    await pickPlace(tester, 'Barangay', 'Rosario');
    await tester.enterText(
      field('Street, house or building'),
      '12 Ortigas Ave',
    );
    await tester.pump();
    await press(tester, next);
    expect(field('Confirm password'), findsOneWidget);
  }

  group('Sign in', () {
    testWidgets('has the real Google logo, not a letter', (tester) async {
      await openApp(tester, FakeApi({}));
      expect(find.byType(GoogleLogo), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('G'), findsNothing);
    });

    testWidgets('nothing overflows on a small phone', (tester) async {
      await openApp(tester, FakeApi({}), size: const Size(720, 1280), ratio: 2);
      expect(tester.takeException(), isNull);
      expect(find.text('Welcome back'), findsOneWidget);
    });

    testWidgets('with the keyboard up, the photo shrinks and Sign in shows', (
      tester,
    ) async {
      await openApp(tester, FakeApi({}));
      final photo = find.byType(Image).first;
      final before = tester.getSize(photo).height;

      // The keyboard covers about the lower half of the phone.
      tester.view.viewInsets = const FakeViewPadding(bottom: 1100);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(tester.getSize(photo).height, lessThan(before));
      final button = find.widgetWithText(FilledButton, 'Sign in');
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      final visibleUntil = (2400 - 1100) / 2.75;
      expect(tester.getRect(button).bottom, lessThanOrEqualTo(visibleUntil));
    });

    testWidgets('an error banner never leaves a link over the Google button', (
      tester,
    ) async {
      await openApp(
        tester,
        FakeApi({
          'POST /auth/login': (_) =>
              jsonBody(401, {'message': 'Invalid credentials.'}),
        }),
      );
      await tester.enterText(field('Email or username'), 'ana@example.com');
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Invalid credentials.'), findsOneWidget);

      final google = find.byType(OutlinedButton);
      await tester.ensureVisible(google);
      await tester.pumpAndSettle();
      final link = find.text('Create an account');
      if (link.evaluate().isNotEmpty) {
        expect(
          tester.getRect(link).top,
          greaterThanOrEqualTo(tester.getRect(google).bottom),
        );
      }
    });
  });

  group('Sign up', () {
    testWidgets('each step checks its own fields before the next opens', (
      tester,
    ) async {
      await openSignUp(tester, FakeApi({}));

      await press(tester, next);
      expect(find.text('First name is required.'), findsOneWidget);
      expect(find.text('Date of birth is required.'), findsOneWidget);
      expect(field('Email'), findsNothing);

      await tester.enterText(field('First name'), 'Ana');
      await tester.enterText(field('Last name'), 'Cruz');
      await tester.pump();
      await press(tester, find.byType(DateOfBirthField));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await press(tester, next);
      expect(field('Email'), findsOneWidget);
      expect(field('First name'), findsNothing);
      // The next step opens clean, with no messages yet.
      expect(find.text('Email is required.'), findsNothing);
    });

    testWidgets('the back arrow keeps what was typed, then leaves', (
      tester,
    ) async {
      await openSignUp(tester, FakeApi({}));
      await tester.enterText(field('First name'), 'Ana');
      await tester.enterText(field('Last name'), 'Cruz');
      await tester.pump();
      await press(tester, find.byType(DateOfBirthField));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await press(tester, next);

      await press(tester, find.byTooltip('Back'));
      expect(find.text('Ana'), findsOneWidget);
      final birthday = tester.state<FormFieldState<DateTime>>(
        find.byType(DateOfBirthField),
      );
      expect(birthday.value, isNotNull);

      await press(tester, find.byTooltip('Back'));
      expect(find.text('Welcome back'), findsOneWidget);
    });

    testWidgets('the terms must be accepted before anything is sent', (
      tester,
    ) async {
      final api = FakeApi({...placeRoutes});
      await openSignUp(tester, api);
      await fillToPasswordStep(tester);
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.enterText(field('Confirm password'), 'Secret#12');
      await tester.pump();

      await press(tester, find.widgetWithText(FilledButton, 'Create account'));
      expect(
        find.textContaining('You must accept the Terms of Use'),
        findsOneWidget,
      );
      expect(api.requests.where((r) => r.method == 'POST'), isEmpty);
    });

    testWidgets("the server's message opens the step that has the field", (
      tester,
    ) async {
      await openSignUp(
        tester,
        FakeApi({
          ...placeRoutes,
          'POST /auth/register': (_) => jsonBody(422, {
            'message': 'The given data was invalid.',
            'errors': {
              'email': ['This email is already registered.'],
            },
          }),
        }),
      );
      await fillToPasswordStep(tester);
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.enterText(field('Confirm password'), 'Secret#12');
      await tester.pump();
      await press(tester, find.byType(Checkbox));

      await press(tester, find.widgetWithText(FilledButton, 'Create account'));
      expect(field('Email'), findsOneWidget);
      expect(find.text('This email is already registered.'), findsOneWidget);
      expect(field('Confirm password'), findsNothing);
    });

    testWidgets('a right form goes to the code screen with six boxes', (
      tester,
    ) async {
      final api = FakeApi({
        ...placeRoutes,
        'POST /auth/register': (_) => jsonBody(201, {
          'message': 'Check your email.',
          'email': 'ana@example.com',
          'requires_verification': true,
        }),
      });
      await openSignUp(tester, api);
      await fillToPasswordStep(tester);
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.enterText(field('Confirm password'), 'Secret#12');
      await tester.pump();
      await press(tester, find.byType(Checkbox));
      await press(tester, find.widgetWithText(FilledButton, 'Create account'));

      final sent = api.requests.singleWhere((r) => r.method == 'POST');
      expect(sent.path, '/auth/register');
      expect((sent.data as Map)['email'], 'ana@example.com');
      expect((sent.data as Map)['accept_terms'], isTrue);
      // The address goes with its PSGC codes, so it is ready for checkout.
      expect((sent.data as Map)['address'], {
        'region': 'National Capital Region (NCR)',
        'region_code': '130000000',
        'province': 'Metro Manila',
        'province_code': '130000000',
        'city_municipality': 'City of Pasig',
        'city_code': '137403000',
        'barangay': 'Rosario',
        'barangay_code': '137403017',
        'street_address': '12 Ortigas Ave',
      });
      expect(find.text('Check your email'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets(
      'the address step needs every place, and a search narrows the list',
      (tester) async {
        await openSignUp(tester, FakeApi({...placeRoutes}));
        await tester.enterText(field('First name'), 'Ana');
        await tester.enterText(field('Last name'), 'Cruz');
        await tester.pump();
        await press(tester, find.byType(DateOfBirthField));
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
        await press(tester, next);
        await tester.enterText(field('Email'), 'ana@example.com');
        await tester.enterText(field('Mobile number'), '09171234567');
        await tester.pump();
        await press(tester, next);

        await press(tester, next);
        expect(find.text('Choose the region.'), findsOneWidget);
        expect(field('Confirm password'), findsNothing);

        await pickPlace(tester, 'Region', 'National Capital Region (NCR)');
        await press(
          tester,
          find.widgetWithText(PlaceField, 'City or municipality'),
        );
        expect(find.text('Quezon City'), findsOneWidget);
        await tester.enterText(find.byType(TextField).last, 'pasig');
        await tester.pump();
        expect(find.text('Quezon City'), findsNothing);
        await tester.tap(find.text('City of Pasig'));
        await tester.pumpAndSettle();

        await press(tester, next);
        expect(find.text('Choose the barangay.'), findsOneWidget);
        expect(field('Confirm password'), findsNothing);
      },
    );

    testWidgets("a problem with the address opens the address step", (
      tester,
    ) async {
      await openSignUp(
        tester,
        FakeApi({
          ...placeRoutes,
          'POST /auth/register': (_) => jsonBody(422, {
            'message': 'The given data was invalid.',
            'errors': {
              'address.street_address': [
                'Enter the street, house or building.',
              ],
            },
          }),
        }),
      );
      await fillToPasswordStep(tester);
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.enterText(field('Confirm password'), 'Secret#12');
      await tester.pump();
      await press(tester, find.byType(Checkbox));
      await press(tester, find.widgetWithText(FilledButton, 'Create account'));

      expect(field('Street, house or building'), findsOneWidget);
      expect(find.text('Enter the street, house or building.'), findsOneWidget);
    });
  });

  group('Email code', () {
    Future<void> openCode(WidgetTester tester, FakeApi api) async {
      await openApp(tester, api);
      await tester.enterText(field('Email or username'), 'ana@example.com');
      await tester.enterText(field('Password'), 'Secret#12');
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Check your email'), findsOneWidget);
    }

    final unverified = {
      'POST /auth/login': (_) => jsonBody(403, {
        'code': 'email_unverified',
        'email': 'ana@example.com',
        'message': 'Please verify your email before signing in.',
      }),
    };

    testWidgets('a short code shows the message and sends nothing', (
      tester,
    ) async {
      final api = FakeApi({...unverified});
      await openCode(tester, api);
      final before = api.requests.length;

      await tester.enterText(find.byType(TextField), '123');
      await tester.pump();
      expect(find.text('1'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Verify email'));
      await tester.pumpAndSettle();
      expect(find.textContaining('6'), findsWidgets);
      expect(api.requests.length, before);

      await tester.pumpWidget(const SizedBox());
    });

    testWidgets("a wrong code shows the server's message under the boxes", (
      tester,
    ) async {
      await openCode(
        tester,
        FakeApi({
          ...unverified,
          'POST /auth/verify-email': (_) => jsonBody(422, {
            'message': 'The given data was invalid.',
            'errors': {
              'code': ['That code is wrong or has expired.'],
            },
          }),
        }),
      );
      await tester.enterText(find.byType(TextField), '123456');
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Verify email'));
      await tester.pumpAndSettle();
      expect(find.text('That code is wrong or has expired.'), findsOneWidget);

      // Typing again clears it.
      await tester.enterText(find.byType(TextField), '12345');
      await tester.pump();
      expect(find.text('That code is wrong or has expired.'), findsNothing);

      await tester.pumpWidget(const SizedBox());
    });
  });

  testWidgets('the layout keeps the step bar words on a small phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(720, 1280);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AuthStepBar(
            steps: ['About you', 'Address', 'Valid ID'],
            current: 1,
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Address'), findsOneWidget);
    expect(find.bySemanticsLabel('Step 2 of 3: Address'), findsOneWidget);
  });
}
