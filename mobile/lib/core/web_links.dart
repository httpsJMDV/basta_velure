import 'package:url_launcher/url_launcher.dart';

import 'env.dart';

/// Opens a page of the website in the browser, for what stays on the web (admin console, seller centre, password
/// reset). Returns false when no browser could open it.
Future<bool> openWebsite(String path) => launchUrl(
  Uri.parse('${Env.webUrl}$path'),
  mode: LaunchMode.externalApplication,
);
