import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:loved_it/core/api/api_client.dart';
import 'package:loved_it/core/session/session.dart';
import 'package:loved_it/core/session/token_store.dart';

/// The sign-in token kept in memory instead of the Android Keystore.
class MemoryTokenStore implements TokenStore {
  MemoryTokenStore([this.token]);

  String? token;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async => token = value;

  @override
  Future<void> clear() async => token = null;
}

typedef FakeHandler = ResponseBody Function(RequestOptions request);

/// Answers requests from a table of `'METHOD /path'` handlers. Anything else fails like a phone with no internet.
class FakeApi implements HttpClientAdapter {
  FakeApi(this.routes);

  final Map<String, FakeHandler> routes;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final handler = routes['${options.method} ${options.path}'];
    if (handler == null) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'No internet in tests',
      );
    }
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(int status, Object body) => ResponseBody.fromString(
  jsonEncode(body),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

Map<String, dynamic> userJson({
  int id = 7,
  String firstName = 'Ana',
  String role = 'buyer',
  String status = 'active',
  Map<String, dynamic>? rider,
  Map<String, dynamic>? sortingCenter,
  Map<String, dynamic>? logisticsCompany,
  Map<String, dynamic>? sellerProfile,
}) => {
  'id': id,
  'first_name': firstName,
  'middle_name': null,
  'last_name': 'Santos',
  'email': 'ana@example.com',
  'phone_local': '09171234567',
  'role': role,
  'status': status,
  'seller_profile': ?sellerProfile,
  'sorting_center': ?sortingCenter,
  'rider': ?rider,
  'logistics_company': logisticsCompany,
};

/// A container whose API answers from [api] and whose token lives in [store].
ProviderContainer containerWith(FakeApi api, MemoryTokenStore store) {
  final container = ProviderContainer(
    overrides: [tokenStoreProvider.overrideWithValue(store)],
  );
  container.read(dioProvider).httpClientAdapter = api;
  return container;
}

/// Waits until the session has finished checking the saved token.
Future<SessionState> settled(ProviderContainer container) {
  final done = Completer<SessionState>();
  final subscription = container.listen<SessionState>(sessionProvider, (
    _,
    next,
  ) {
    if (next is! SessionRestoring && !done.isCompleted) done.complete(next);
  }, fireImmediately: true);
  return done.future
      .timeout(const Duration(seconds: 5))
      .whenComplete(subscription.close);
}
