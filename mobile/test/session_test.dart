import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/core/session/home_route.dart';
import 'package:loved_it/core/session/session.dart';

import 'support/fakes.dart';

/// Task A5: the token, `GET /auth/me` on launch, sign-in, sign-out, and ending the session on a refused token.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('no saved token: signed out, and nothing is requested', () async {
    final api = FakeApi({});
    final container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);

    expect(await settled(container), isA<SignedOut>());
    expect(api.requests, isEmpty);
  });

  test('a good token opens the home with Accept and Bearer headers', () async {
    final api = FakeApi({
      'GET /auth/me': (_) => jsonBody(200, {'data': userJson()}),
    });
    final container = containerWith(api, MemoryTokenStore('tok-1'));
    addTearDown(container.dispose);

    final state = await settled(container);
    expect(state, isA<SignedIn>());
    expect((state as SignedIn).home, AppHome.buyer);
    expect(api.requests.single.headers['Authorization'], 'Bearer tok-1');
    expect(api.requests.single.headers['Accept'], 'application/json');
  });

  test(
    'a revoked token (401) is deleted and the person signs in again',
    () async {
      final store = MemoryTokenStore('old');
      final api = FakeApi({
        'GET /auth/me': (_) => jsonBody(401, {'message': 'Unauthenticated.'}),
      });
      final container = containerWith(api, store);
      addTearDown(container.dispose);

      expect(await settled(container), isA<SignedOut>());
      expect(store.token, isNull);
    },
  );

  test('no internet on launch keeps the token and offers Try again', () async {
    final store = MemoryTokenStore('tok');
    final container = containerWith(FakeApi({}), store);
    addTearDown(container.dispose);

    final state = await settled(container);
    expect(state, isA<SessionUnreachable>());
    expect((state as SessionUnreachable).message, ApiMessages.unreachable);
    expect(store.token, 'tok');
  });

  test('/auth/me for a suspended account signs out and shows why', () async {
    final store = MemoryTokenStore('tok');
    final api = FakeApi({
      'GET /auth/me': (_) =>
          jsonBody(200, {'data': userJson(status: 'suspended')}),
    });
    final container = containerWith(api, store);
    addTearDown(container.dispose);

    final state = await settled(container);
    expect(state, isA<AccountBlocked>());
    expect(store.token, isNull);
  });

  test(
    'sign in saves the token and opens the rider home for a rider',
    () async {
      final store = MemoryTokenStore();
      final api = FakeApi({
        'POST /auth/login': (request) {
          expect(request.data, {
            'identifier': 'rider1',
            'password': ' pass word ',
          });
          return jsonBody(200, {
            'token': 'new-token',
            'data': userJson(
              role: 'rider',
              rider: {'id': 4, 'status': 'ACTIVE'},
            ),
          });
        },
      });
      final container = containerWith(api, store);
      addTearDown(container.dispose);
      await settled(container);

      // The identifier is trimmed; the password is sent exactly as typed.
      await container
          .read(sessionProvider.notifier)
          .signIn(identifier: '  rider1 ', password: ' pass word ');

      final state = container.read(sessionProvider);
      expect(state, isA<SignedIn>());
      expect((state as SignedIn).home, AppHome.rider);
      expect(store.token, 'new-token');
    },
  );

  test(
    'wrong password: "Invalid credentials." for the screen, still signed out',
    () async {
      final api = FakeApi({
        'POST /auth/login': (_) =>
            jsonBody(401, {'message': 'Invalid credentials.'}),
      });
      final container = containerWith(api, MemoryTokenStore());
      addTearDown(container.dispose);
      await settled(container);

      await expectLater(
        container
            .read(sessionProvider.notifier)
            .signIn(identifier: 'ana@example.com', password: 'nope'),
        throwsA(
          isA<ApiFailure>().having(
            (f) => f.message,
            'message',
            'Invalid credentials.',
          ),
        ),
      );
      // A 401 on sign-in carries no token, so it is not treated as "session ended".
      expect(container.read(sessionProvider), isA<SignedOut>());
      expect((container.read(sessionProvider) as SignedOut).notice, isNull);
    },
  );

  test('an unverified email opens the code screen with the email', () async {
    final api = FakeApi({
      'POST /auth/login': (_) => jsonBody(403, {
        'code': 'email_unverified',
        'email': 'ana@example.com',
        'message': 'Please verify your email before signing in.',
      }),
    });
    final container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);
    await settled(container);

    await container
        .read(sessionProvider.notifier)
        .signIn(identifier: 'ana', password: 'x');
    final state = container.read(sessionProvider);
    expect(state, isA<NeedsEmailCode>());
    expect((state as NeedsEmailCode).email, 'ana@example.com');
  });

  test('suspended in the middle of a session: any request signs out and shows the suspended screen', () async {
    final store = MemoryTokenStore('tok');
    final api = FakeApi({
      'GET /auth/me': (_) => jsonBody(200, {'data': userJson()}),
      'GET /cart': (_) => jsonBody(403, {
        'code': 'account_suspended',
        'message': 'Your account has been suspended.',
      }),
    });
    final container = containerWith(api, store);
    addTearDown(container.dispose);
    expect(await settled(container), isA<SignedIn>());

    await expectLater(
      container.read(dioProvider).get<void>('/cart'),
      throwsA(isA<DioException>()),
    );
    await pumpEventQueue();

    expect(container.read(sessionProvider), isA<AccountBlocked>());
    expect(store.token, isNull);
  });

  test(
    'a slow request from an old token does not sign out the new session',
    () async {
      final store = MemoryTokenStore('old');
      final api = FakeApi({
        'GET /auth/me': (_) => jsonBody(200, {'data': userJson()}),
        'GET /slow': (_) {
          store.token = 'new'; // signed in again while the request was out
          return jsonBody(401, {'message': 'Unauthenticated.'});
        },
      });
      final container = containerWith(api, store);
      addTearDown(container.dispose);
      await settled(container);

      await expectLater(
        container.read(dioProvider).get<void>('/slow'),
        throwsA(isA<DioException>()),
      );
      await pumpEventQueue();
      expect(container.read(sessionProvider), isA<SignedIn>());
      expect(store.token, 'new');
    },
  );

  test('sign out forgets the token even with no internet', () async {
    final store = MemoryTokenStore('tok');
    final api = FakeApi({
      'GET /auth/me': (_) => jsonBody(200, {'data': userJson()}),
    });
    final container = containerWith(api, store);
    addTearDown(container.dispose);
    await settled(container);

    await container.read(sessionProvider.notifier).signOut();
    expect(container.read(sessionProvider), isA<SignedOut>());
    expect(store.token, isNull);
  });

  test('switching home only to a home the account has', () async {
    final api = FakeApi({
      'GET /auth/me': (_) => jsonBody(200, {
        'data': userJson(rider: {'id': 1, 'status': 'ACTIVE'}),
      }),
    });
    final container = containerWith(api, MemoryTokenStore('tok'));
    addTearDown(container.dispose);
    await settled(container);
    final controller = container.read(sessionProvider.notifier);

    controller.switchHome(AppHome.buyer);
    expect((container.read(sessionProvider) as SignedIn).home, AppHome.buyer);
    controller.switchHome(AppHome.logistics);
    expect((container.read(sessionProvider) as SignedIn).home, AppHome.buyer);
  });
}
