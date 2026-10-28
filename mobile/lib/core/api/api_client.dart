import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../env.dart';
import '../session/session.dart';
import '../session/token_store.dart';
import 'api_failure.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

/// The one API client every screen uses. Calls look like `ref.read(dioProvider).get('/auth/me')`; wrap errors with
/// `ApiFailure.from(error)` to show them.
final dioProvider = Provider<Dio>((ref) {
  final dio = buildApiClient(
    tokenStore: ref.watch(tokenStoreProvider),
    onSessionEnded: (failure) =>
        ref.read(sessionProvider.notifier).sessionEnded(failure),
  );
  ref.onDispose(dio.close);
  return dio;
});

Dio buildApiClient({
  required TokenStore tokenStore,
  required void Function(ApiFailure failure) onSessionEnded,
  String baseUrl = Env.apiUrl,
}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      headers: {'Accept': 'application/json'},
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      // A 5 MB photo on a slow mobile connection needs longer than a normal request.
      sendTimeout: const Duration(seconds: 60),
    ),
  );
  dio.interceptors.add(
    _SessionInterceptor(tokenStore: tokenStore, onSessionEnded: onSessionEnded),
  );
  return dio;
}

/// Adds the token to every request, and ends the session when the server refuses the token (401) or the account
/// (403 suspended, unverified or not activated) on any request.
class _SessionInterceptor extends Interceptor {
  _SessionInterceptor({required this.tokenStore, required this.onSessionEnded});

  static const _sentTokenKey = 'sent_token';

  final TokenStore tokenStore;
  final void Function(ApiFailure failure) onSessionEnded;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await tokenStore.read();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
      options.extra[_sentTokenKey] = token;
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final failure = ApiFailure.fromDio(err);
    final sentToken = err.requestOptions.extra[_sentTokenKey];
    // Only when the refused token is still the current one: a slow request that started before a new sign-in must
    // not sign the new session out. A sign-in attempt carries no token, so its 401 is just "Invalid credentials".
    if (failure.endsSession &&
        sentToken != null &&
        sentToken == await tokenStore.read()) {
      onSessionEnded(failure);
    }
    handler.next(err);
  }
}
