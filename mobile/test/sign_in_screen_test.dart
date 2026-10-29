import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/app.dart';

import 'support/fakes.dart';

/// The sign-in screen end to end through the router: messages under the fields, the server's messages, and the
/// home each account lands on.
void main() {
  late ProviderContainer container;

  Future<void> openApp(WidgetTester tester, FakeApi api) async {
    container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const LovedItApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Closes the app before the test ends, so the buyer home's live counters (checked every 30 seconds) stop.
  Future<void> closeApp(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  }

  Future<void> signIn(
    WidgetTester tester,
    String identifier,
    String password,
  ) async {
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email or username'),
      identifier,
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Password'),
      password,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
  }

  testWidgets('opens on sign in, and empty fields show their messages', (
    tester,
  ) async {
    await openApp(tester, FakeApi({}));
    expect(find.text('Welcome back'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Email or username is required.'), findsOneWidget);
    expect(find.text('Password is required.'), findsOneWidget);

    // Typing a valid value clears that field's message without another tap on Sign in.
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email or username'),
      'buyer1',
    );
    await tester.pump();
    expect(find.text('Email or username is required.'), findsNothing);
    expect(find.text('Password is required.'), findsOneWidget);
  });

  testWidgets('wrong password shows the server message', (tester) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) =>
            jsonBody(401, {'message': 'Invalid credentials.'}),
      }),
    );
    await signIn(tester, 'ana@example.com', 'wrong');
    expect(find.text('Invalid credentials.'), findsOneWidget);
  });

  testWidgets('no internet says so', (tester) async {
    await openApp(tester, FakeApi({}));
    await signIn(tester, 'ana@example.com', 'Secret#12');
    expect(
      find.text("Couldn't reach Loved-IT. Check your internet and try again."),
      findsOneWidget,
    );
  });

  testWidgets('a 422 shows under its field', (tester) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) => jsonBody(422, {
          'message': 'The identifier field is required.',
          'errors': {
            'identifier': ['Enter your email or username.'],
          },
        }),
      }),
    );
    await signIn(tester, 'x', 'y');
    expect(find.text('Enter your email or username.'), findsOneWidget);
  });

  testWidgets('a buyer lands on the shop home', (tester) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) =>
            jsonBody(200, {'token': 't', 'data': userJson()}),
      }),
    );
    await signIn(tester, 'buyer1', 'buyer123');
    expect(find.text('Search Loved-IT'), findsOneWidget);
    expect(find.text('Cart'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('a rider who also shops lands on Rider and can switch', (
    tester,
  ) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) => jsonBody(200, {
          'token': 't',
          'data': userJson(rider: {'id': 1, 'status': 'ACTIVE'}),
        }),
      }),
    );
    await signIn(tester, 'rider1', 'rider123');
    expect(find.text('Courier Station'), findsOneWidget);

    await tester.tap(find.text('Switch to Shop'));
    await tester.pumpAndSettle();
    expect(find.text('Search Loved-IT'), findsOneWidget);
    await closeApp(tester);
  });

  testWidgets('an admin is sent to the website', (tester) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) =>
            jsonBody(200, {'token': 't', 'data': userJson(role: 'admin')}),
      }),
    );
    await signIn(tester, 'admin', 'admin123');
    expect(
      find.text('Use loved-it.shop on a computer for the admin console.'),
      findsOneWidget,
    );
  });

  testWidgets('an unverified email opens the code screen', (tester) async {
    await openApp(
      tester,
      FakeApi({
        'POST /auth/login': (_) => jsonBody(403, {
          'code': 'email_unverified',
          'email': 'ana@example.com',
          'message': 'Please verify your email before signing in.',
        }),
      }),
    );
    await signIn(tester, 'ana@example.com', 'Secret#12');
    expect(find.text('Check your email'), findsOneWidget);
    expect(find.textContaining('ana@example.com'), findsOneWidget);
    expect(find.text('Resend in 30s'), findsOneWidget);

    // Unmount so the resend countdown timer stops with the screen.
    await tester.pumpWidget(const SizedBox());
  });
}
