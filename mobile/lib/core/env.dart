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

  /// The website's Google OAuth client ID (`VITE_GOOGLE_CLIENT_ID`), public. Google signs the app's ID token for
  /// it, and the server accepts only tokens made for Loved-IT's client IDs.
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  /// The map tiles for Track package: OpenStreetMap, the same free map as the website (`VITE_MAP_TILE_URL`).
  static const mapTileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Private channels sign in at `/api/broadcasting/auth`, the same endpoint the website's Echo uses.
  static String get broadcastAuthUrl =>
      '${apiUrl.replaceFirst(RegExp(r'/v1/?$'), '')}/broadcasting/auth';

  /// Photo links are built from the backend's APP_URL, which is `http://localhost:8000` on a dev PC. On the
  /// emulator or a phone, localhost is the device itself, so such links are moved to the API's host.
  static String mediaUrl(String url) => mediaUrlFor(url, apiUrl);

  static String mediaUrlFor(String url, String api) {
    final photo = Uri.tryParse(url);
    if (photo == null ||
        !const {'localhost', '127.0.0.1'}.contains(photo.host)) {
      return url;
    }
    final server = Uri.parse(api);
    return photo
        .replace(scheme: server.scheme, host: server.host, port: server.port)
        .toString();
  }
}
