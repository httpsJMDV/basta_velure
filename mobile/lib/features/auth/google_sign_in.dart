import 'package:google_sign_in/google_sign_in.dart';

import '../../core/env.dart';

/// Why Continue with Google stopped, in words people can act on. Null when the person closed the Google sheet.
class GoogleSignInProblem implements Exception {
  const GoogleSignInProblem(this.message);
  final String message;
}

Future<void>? _initialized;

/// Continue with Google (B1): Google's account picker, then its ID token for the server. The token is signed for
/// the website's client ID ([Env.googleServerClientId]), which the server checks. Returns null when the person
/// cancels.
///
/// Google only answers an app it knows: the Google Cloud project needs an Android OAuth client for the package
/// `shop.lovedit.loved_it` with this PC's debug SHA-1 (amaru.md, B1). Without it this throws a
/// [GoogleSignInProblem].
Future<String?> googleIdToken() async {
  final google = GoogleSignIn.instance;
  try {
    await (_initialized ??= google.initialize(
      serverClientId: Env.googleServerClientId.isEmpty
          ? null
          : Env.googleServerClientId,
    ));
    // Each tap shows the account picker again, so another Google account can be chosen.
    await google.signOut();
    final account = await google.authenticate(
      scopeHint: const ['email', 'profile'],
    );
    final token = account.authentication.idToken;
    if (token == null) {
      throw const GoogleSignInProblem(
        'Google did not send a sign-in token. Try again, or sign in with your email.',
      );
    }
    return token;
  } on GoogleSignInException catch (error) {
    switch (error.code) {
      case GoogleSignInExceptionCode.canceled:
      case GoogleSignInExceptionCode.interrupted:
        return null;
      case GoogleSignInExceptionCode.clientConfigurationError:
      case GoogleSignInExceptionCode.providerConfigurationError:
        _initialized = null;
        throw const GoogleSignInProblem(
          'Google sign-in is not set up for this app yet. Sign in with your email for now.',
        );
      default:
        throw const GoogleSignInProblem(
          "Couldn't sign in with Google. Try again, or sign in with your email.",
        );
    }
  }
}
