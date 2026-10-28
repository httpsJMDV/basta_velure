import 'package:dio/dio.dart';

/// What went wrong with a request, sorted the way the screens react to it (amaru.md, task A5).
enum FailureKind {
  /// 401: not signed in, or the token was revoked. The session ends.
  unauthenticated,

  /// 403 `email_unverified`: the email code was never entered.
  emailUnverified,

  /// 403 `account_suspended`: an admin suspended the account.
  accountSuspended,

  /// 403 `pending_activation`: a rider who has not opened the activation link yet.
  pendingActivation,

  /// 403 `id_not_verified`: a buyer whose ID is not approved yet tried to order.
  idNotVerified,

  /// Any other 403. [ApiFailure.code] keeps the server's code (for example `rider_application_pending`).
  forbidden,

  /// 404: gone.
  notFound,

  /// 409: someone else already changed it.
  conflict,

  /// 422: wrong input. [ApiFailure.fieldErrors] has a message per field.
  validation,

  /// 429: too many tries. Never retried automatically.
  tooManyRequests,

  /// 5xx, or an answer that is not the API's JSON (a tunnel or proxy error page).
  server,

  /// No internet, DNS failure or a timeout.
  network,

  /// The request was cancelled on purpose (the screen closed). Show nothing.
  cancelled,
}

/// The words people see. One place, so every screen says the same thing.
abstract final class ApiMessages {
  static const unreachable =
      "Couldn't reach Loved-IT. Check your internet and try again.";
  static const tooManyTries = 'Too many tries. Wait a minute and try again.';
  static const sessionEnded = 'Your session ended. Sign in again.';
  static const changed =
      'This was changed or removed. Refresh to see the latest.';
  static const checkFields = 'Check the highlighted fields.';
  static const notAllowed = "This account can't do that.";
  static const somethingWrong = 'Something went wrong. Try again.';
}

/// An API error turned into something a screen can show: a ready-to-read [message], the server's [code] and, for a
/// 422, the first message of each field. Build it with [ApiFailure.from] from whatever a request threw.
class ApiFailure implements Exception {
  const ApiFailure(
    this.kind,
    this.message, {
    this.statusCode,
    this.code,
    this.fieldErrors = const {},
    this.body = const {},
  });

  final FailureKind kind;
  final String message;
  final int? statusCode;
  final String? code;

  /// Laravel's `errors` (`{field: [messages]}`) reduced to the first message of each field.
  final Map<String, String> fieldErrors;

  /// The JSON body as the server sent it, for extra keys such as `email` on `email_unverified`.
  final Map<String, dynamic> body;

  /// The message to show under [field], if the server sent one.
  String? errorFor(String field) => fieldErrors[field];

  /// Network and server problems get a Try again button; the rest need the person to change something first.
  bool get canRetry =>
      kind == FailureKind.network || kind == FailureKind.server;

  /// These end the session on any request: the token is deleted and the person is sent to the right screen.
  bool get endsSession => const {
    FailureKind.unauthenticated,
    FailureKind.emailUnverified,
    FailureKind.accountSuspended,
    FailureKind.pendingActivation,
  }.contains(kind);

  static ApiFailure from(Object error) {
    if (error is ApiFailure) return error;
    if (error is DioException) return ApiFailure.fromDio(error);
    return const ApiFailure(FailureKind.server, ApiMessages.somethingWrong);
  }

  factory ApiFailure.fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.cancel:
        return const ApiFailure(FailureKind.cancelled, '');
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
        return const ApiFailure(FailureKind.network, ApiMessages.unreachable);
      case DioExceptionType.unknown:
        return e.response == null
            ? const ApiFailure(FailureKind.network, ApiMessages.unreachable)
            : ApiFailure.fromResponse(e.response!);
      case DioExceptionType.badResponse:
        return ApiFailure.fromResponse(e.response!);
    }
  }

  factory ApiFailure.fromResponse(Response<dynamic> response) {
    final status = response.statusCode ?? 0;
    final data = response.data;
    final body = data is Map
        ? Map<String, dynamic>.from(data)
        : const <String, dynamic>{};
    final code = body['code'] is String ? body['code'] as String : null;
    final serverMessage =
        body['message'] is String &&
            (body['message'] as String).trim().isNotEmpty
        ? (body['message'] as String).trim()
        : null;

    // Anything that is not the API's JSON (an HTML error page from a proxy or tunnel) is a server problem.
    if (body.isEmpty && status != 401 && status != 429) {
      return ApiFailure(
        FailureKind.server,
        ApiMessages.unreachable,
        statusCode: status,
      );
    }

    if (status == 401) {
      return ApiFailure(
        FailureKind.unauthenticated,
        serverMessage ?? ApiMessages.sessionEnded,
        statusCode: status,
        body: body,
      );
    }
    if (status == 403) {
      final kind = switch (code) {
        'email_unverified' => FailureKind.emailUnverified,
        'account_suspended' => FailureKind.accountSuspended,
        'pending_activation' => FailureKind.pendingActivation,
        'id_not_verified' => FailureKind.idNotVerified,
        _ => FailureKind.forbidden,
      };
      return ApiFailure(
        kind,
        serverMessage ?? ApiMessages.notAllowed,
        statusCode: status,
        code: code,
        body: body,
      );
    }
    if (status == 404 || status == 409) {
      return ApiFailure(
        status == 404 ? FailureKind.notFound : FailureKind.conflict,
        serverMessage ?? ApiMessages.changed,
        statusCode: status,
        code: code,
        body: body,
      );
    }
    if (status == 422) {
      final fields = firstFieldErrors(body['errors']);
      // Laravel's top message reads "The x field is required. (and 2 more errors)": the field messages say it better.
      return ApiFailure(
        FailureKind.validation,
        fields.isNotEmpty
            ? fields.values.first
            : (serverMessage ?? ApiMessages.checkFields),
        statusCode: status,
        code: code,
        fieldErrors: fields,
        body: body,
      );
    }
    if (status == 429) {
      return ApiFailure(
        FailureKind.tooManyRequests,
        ApiMessages.tooManyTries,
        statusCode: status,
        body: body,
      );
    }
    if (status >= 500) {
      // Server errors never show their text: it can be internal detail, and people can't act on it.
      return ApiFailure(
        FailureKind.server,
        ApiMessages.unreachable,
        statusCode: status,
      );
    }
    return ApiFailure(
      FailureKind.forbidden,
      serverMessage ?? ApiMessages.somethingWrong,
      statusCode: status,
      code: code,
      body: body,
    );
  }

  /// `{"email": ["Taken.", "..."]}` → `{"email": "Taken."}`. Keys like `gcash.12.reference` are kept as they are.
  static Map<String, String> firstFieldErrors(Object? errors) {
    if (errors is! Map) return const {};
    final out = <String, String>{};
    errors.forEach((key, value) {
      if (value is List && value.isNotEmpty && value.first is String) {
        out['$key'] = value.first as String;
      } else if (value is String) {
        out['$key'] = value;
      }
    });
    return out;
  }

  @override
  String toString() => 'ApiFailure($kind, $statusCode, $code)';
}
