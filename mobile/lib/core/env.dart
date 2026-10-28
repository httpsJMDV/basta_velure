/// Where the app finds the backend. Never typed into the code: pass them when you run the app,
/// `flutter run --dart-define-from-file=dart_defines/dev.json` (see dart_defines/example.json).
/// The defaults are the live site, so a release build without defines still talks to production over HTTPS.
abstract final class Env {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.loved-it.shop/api/v1',
  );

  static const wsHost = String.fromEnvironment(
    'WS_HOST',
    defaultValue: 'ws.loved-it.shop',
  );
  static const wsPort = int.fromEnvironment('WS_PORT', defaultValue: 443);
  static const wsScheme = String.fromEnvironment(
    'WS_SCHEME',
    defaultValue: 'https',
  );

  /// Reverb's public app key. The Reverb secret stays on the server.
  static const reverbKey = String.fromEnvironment('REVERB_KEY');

  /// The website, for the pages that stay on the web (admin console, seller centre, password reset).
  static const webUrl = String.fromEnvironment(
    'WEB_URL',
    defaultValue: 'https://loved-it.shop',
  );

  /// Private channels sign in at `/api/broadcasting/auth`, the same endpoint the website's Echo uses.
  static String get broadcastAuthUrl =>
      '${apiUrl.replaceFirst(RegExp(r'/v1/?$'), '')}/broadcasting/auth';
}
