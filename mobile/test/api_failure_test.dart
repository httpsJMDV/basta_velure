import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_failure.dart';

/// The error table of task A5: each status and code becomes the right kind and message.
void main() {
  final request = RequestOptions(path: '/x');

  ApiFailure respond(int status, Object? body) => ApiFailure.fromDio(
    DioException.badResponse(
      statusCode: status,
      requestOptions: request,
      response: Response<dynamic>(
        requestOptions: request,
        statusCode: status,
        data: body,
      ),
    ),
  );

  test('401 ends the session and keeps the server message ("Invalid credentials.")', () {
    final failure = respond(401, {'message': 'Invalid credentials.'});
    expect(failure.kind, FailureKind.unauthenticated);
    expect(failure.message, 'Invalid credentials.');
    expect(failure.endsSession, isTrue);
  });

  test('403 codes', () {
    expect(
      respond(403, {
        'code': 'email_unverified',
        'email': 'a@b.co',
        'message': 'm',
      }).kind,
      FailureKind.emailUnverified,
    );
    expect(
      respond(403, {'code': 'account_suspended', 'message': 'm'}).kind,
      FailureKind.accountSuspended,
    );
    expect(
      respond(403, {'code': 'pending_activation', 'message': 'm'}).kind,
      FailureKind.pendingActivation,
    );
    expect(
      respond(403, {'code': 'id_not_verified', 'message': 'm'}).kind,
      FailureKind.idNotVerified,
    );

    final pending = respond(403, {
      'code': 'rider_application_pending',
      'message': 'Still being reviewed.',
    });
    expect(pending.kind, FailureKind.forbidden);
    expect(pending.code, 'rider_application_pending');
    expect(pending.message, 'Still being reviewed.');
    expect(pending.endsSession, isFalse);
  });

  test('email_unverified keeps the email from the body', () {
    expect(
      respond(403, {
        'code': 'email_unverified',
        'email': 'a@b.co',
      }).body['email'],
      'a@b.co',
    );
  });

  test('404 and 409 show the server message', () {
    expect(
      respond(404, {'message': 'Order not found.'}).kind,
      FailureKind.notFound,
    );
    final conflict = respond(409, {'message': 'Already confirmed.'});
    expect(conflict.kind, FailureKind.conflict);
    expect(conflict.message, 'Already confirmed.');
  });

  test('422 gives the first message of each field', () {
    final failure = respond(422, {
      'message': 'The phone field is required. (and 1 more error)',
      'errors': {
        'phone': ['Mobile number is required.', 'second'],
        'gcash.12.reference': ['Enter the 13-digit reference.'],
      },
    });
    expect(failure.kind, FailureKind.validation);
    expect(failure.errorFor('phone'), 'Mobile number is required.');
    expect(
      failure.errorFor('gcash.12.reference'),
      'Enter the 13-digit reference.',
    );
    expect(failure.message, 'Mobile number is required.');
  });

  test('429 says to wait and is never retried automatically', () {
    final failure = respond(429, {'message': 'Too Many Attempts.'});
    expect(failure.kind, FailureKind.tooManyRequests);
    expect(failure.message, ApiMessages.tooManyTries);
    expect(failure.canRetry, isFalse);
  });

  test('5xx hides the server text and offers Try again', () {
    final failure = respond(500, {
      'message': 'SQLSTATE[42S22] Column not found',
    });
    expect(failure.kind, FailureKind.server);
    expect(failure.message, ApiMessages.unreachable);
    expect(failure.canRetry, isTrue);
  });

  test('a proxy error page (not JSON) is a server problem', () {
    expect(respond(502, '<html>Bad gateway</html>').kind, FailureKind.server);
    expect(
      respond(404, '<html>Not found</html>').message,
      ApiMessages.unreachable,
    );
  });

  test('no internet and timeouts', () {
    for (final type in [
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.sendTimeout,
    ]) {
      final failure = ApiFailure.fromDio(
        DioException(requestOptions: request, type: type),
      );
      expect(failure.kind, FailureKind.network, reason: '$type');
      expect(failure.message, ApiMessages.unreachable);
    }
    expect(
      ApiFailure.fromDio(DioException(requestOptions: request)).kind,
      FailureKind.network,
    );
  });

  test('a cancelled request shows nothing', () {
    expect(
      ApiFailure.fromDio(
        DioException.requestCancelled(requestOptions: request, reason: null),
      ).kind,
      FailureKind.cancelled,
    );
  });
}
