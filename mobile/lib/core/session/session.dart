import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/api_failure.dart';
import 'app_user.dart';
import 'home_route.dart';

/// Where the app stands with the account. The router reads this to decide which screen may open.
sealed class SessionState {
  const SessionState();
}

/// The app just opened and is checking the saved token with `GET /auth/me`.
class SessionRestoring extends SessionState {
  const SessionRestoring();
}

/// A token is saved but the server could not be reached. The token is kept: it may still be good.
class SessionUnreachable extends SessionState {
  const SessionUnreachable(this.message);
  final String message;
}

class SignedOut extends SessionState {
  const SignedOut({this.notice});

  /// Why the person was signed out, shown once on the sign-in screen (for example "Your session ended").
  final String? notice;
}

/// The account exists but its email code was never entered.
class NeedsEmailCode extends SessionState {
  const NeedsEmailCode(this.email, {this.message});
  final String email;
  final String? message;
}

/// Suspended, or a rider who has not activated the account. The server's message says what to do.
class AccountBlocked extends SessionState {
  const AccountBlocked(this.kind, this.message);
  final FailureKind kind;
  final String message;
}

class SignedIn extends SessionState {
  const SignedIn(this.user, this.home);

  final AppUser user;

  /// The home screen open now; [homes] lists the others this account may switch to.
  final AppHome home;

  List<AppHome> get homes => homesFor(user);
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// The signed-in user, or null. Providers that hold one person's data watch this, so they reset on sign-out.
final currentUserProvider = Provider<AppUser?>((ref) {
  final session = ref.watch(sessionProvider);
  return session is SignedIn ? session.user : null;
});

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    scheduleMicrotask(restore);
    return const SessionRestoring();
  }

  Dio get _api => ref.read(dioProvider);

  /// On launch, and from the "Couldn't reach Loved-IT" screen: check the saved token.
  Future<void> restore() async {
    final store = ref.read(tokenStoreProvider);
    if (await store.read() == null) {
      state = const SignedOut();
      return;
    }
    state = const SessionRestoring();
    try {
      final response = await _api.get<Map<String, dynamic>>('/auth/me');
      await _enter(_userFrom(response.data));
    } catch (error) {
      final failure = ApiFailure.from(error);
      if (failure.endsSession) {
        // The interceptor already ended the session; this covers a failure it could not attribute to the token.
        await sessionEnded(failure);
      } else {
        state = SessionUnreachable(failure.message);
      }
    }
  }

  /// `POST /auth/login`. An email or a username. Throws [ApiFailure] for the screen to show, except an unverified
  /// email, which opens the code screen.
  Future<void> signIn({
    required String identifier,
    required String password,
  }) async {
    try {
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'identifier': identifier.trim(), 'password': password},
      );
      await _acceptToken(response.data);
    } on DioException catch (error) {
      final failure = ApiFailure.fromDio(error);
      if (failure.kind == FailureKind.emailUnverified) {
        state = NeedsEmailCode(
          (failure.body['email'] as String?) ?? identifier.trim(),
          message: failure.message,
        );
        return;
      }
      throw failure;
    }
  }

  /// `POST /auth/register`. The account starts unverified, so the code screen opens next. Throws [ApiFailure].
  Future<void> register(Map<String, dynamic> fields) async {
    try {
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/register',
        data: fields,
      );
      final email =
          response.data?['email'] as String? ?? fields['email'] as String;
      state = NeedsEmailCode(
        email,
        message:
            response.data?['message'] as String? ??
            'We sent a 6-digit code to $email. Enter it to finish signing up.',
      );
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// `POST /auth/google` with the Google ID token. A new Google account signs in at once and finishes its profile
  /// before shopping (the router sends it to Complete profile). Throws [ApiFailure].
  Future<void> signInWithGoogle(String credential) async {
    try {
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/google',
        data: {'credential': credential},
      );
      await _acceptToken(response.data);
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// `POST /auth/verify-email`: the 6-digit code signs the person in.
  Future<void> verifyEmail({
    required String email,
    required String code,
  }) async {
    try {
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/verify-email',
        data: {'email': email, 'code': code},
      );
      await _acceptToken(response.data);
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// `POST /auth/resend-verification`. Returns the server's message; the old code stops working.
  Future<String> resendEmailCode(String email) async {
    try {
      final response = await _api.post<Map<String, dynamic>>(
        '/auth/resend-verification',
        data: {'email': email},
      );
      return (response.data?['message'] as String?) ??
          'A new code is on its way to $email.';
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// Leaves the code or blocked screen for the sign-in screen.
  void useAnotherAccount() => state = const SignedOut();

  /// `POST /auth/logout`, then forget the token and everything about the person, even if the request fails.
  Future<void> signOut() async {
    try {
      await _api.post<void>(
        '/auth/logout',
        options: Options(receiveTimeout: const Duration(seconds: 8)),
      );
    } catch (_) {
      // Signed out on this phone either way; the server drops unused tokens on its own.
    }
    await _forget();
    state = const SignedOut();
  }

  /// Called by the API client when the server refuses the token (401) or the account (403 with a code).
  Future<void> sessionEnded(ApiFailure failure) async {
    final email = switch (state) {
      SignedIn(:final user) => user.email,
      _ => failure.body['email'] as String?,
    };
    await _forget();
    state = switch (failure.kind) {
      FailureKind.emailUnverified when email != null => NeedsEmailCode(
        email,
        message: failure.message,
      ),
      FailureKind.accountSuspended || FailureKind.pendingActivation =>
        AccountBlocked(failure.kind, failure.message),
      _ => const SignedOut(notice: ApiMessages.sessionEnded),
    };
  }

  /// Fetches `GET /auth/me` again, for example after the profile or an application changed.
  Future<void> refreshUser() async {
    if (state is! SignedIn) return;
    final response = await _api.get<Map<String, dynamic>>('/auth/me');
    final user = _userFrom(response.data);
    final current = state;
    if (current is SignedIn && homesFor(user).contains(current.home)) {
      state = SignedIn(user, current.home);
    } else {
      await _enter(user);
    }
  }

  /// "Switch to rider" and the like, for an account with more than one home.
  void switchHome(AppHome home) {
    final current = state;
    if (current is SignedIn && current.homes.contains(home)) {
      state = SignedIn(current.user, home);
    }
  }

  Future<void> _acceptToken(Map<String, dynamic>? body) async {
    final token = body?['token'];
    if (token is! String || token.isEmpty) {
      throw const ApiFailure(FailureKind.server, ApiMessages.somethingWrong);
    }
    await ref.read(tokenStoreProvider).write(token);
    await _enter(_userFrom(body));
  }

  /// `/auth/me` answers even for an account that may not use the app, so its status is checked here too.
  Future<void> _enter(AppUser user) async {
    switch (user.status) {
      case 'unverified':
        await _forget();
        state = NeedsEmailCode(user.email);
      case 'suspended':
        await _forget();
        state = const AccountBlocked(
          FailureKind.accountSuspended,
          'Your account has been suspended due to a violation of our platform rules or policies. If you believe '
          'this is a mistake, please contact our support team for assistance.',
        );
      case 'pending_activation':
        await _forget();
        state = const AccountBlocked(
          FailureKind.pendingActivation,
          'Open the activation link we emailed you to set your password, then sign in.',
        );
      default:
        state = SignedIn(user, defaultHomeFor(user));
    }
  }

  AppUser _userFrom(Map<String, dynamic>? body) {
    final data = body?['data'];
    if (data is! Map) {
      throw const ApiFailure(FailureKind.server, ApiMessages.somethingWrong);
    }
    return AppUser.fromJson(Map<String, dynamic>.from(data));
  }

  Future<void> _forget() async {
    await ref.read(tokenStoreProvider).clear();
    // Photos of the last account (avatars, IDs shown on screen) must not show for the next one.
    PaintingBinding.instance.imageCache.clear();
  }
}
