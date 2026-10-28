import 'package:flutter/widgets.dart';

/// Every colour the app uses, named. Screens never type a hex value.
abstract final class AppColors {
  // Brand (the website's tailwind `brand` colours)
  static const brandRed = Color(0xFFC0001A);
  static const brandRedDark = Color(0xFF8B0013);
  static const brandRedLight = Color(0xFFE8002A);
  static const brandRedTint = Color(0xFFFDECEE);

  static const white = Color(0xFFFFFFFF);

  // Warm stone: the storefront's backgrounds and text (tailwind stone)
  static const stone50 = Color(0xFFFAFAF9);
  static const stone100 = Color(0xFFF5F5F4);
  static const stone200 = Color(0xFFE7E5E4);
  static const stone300 = Color(0xFFD6D3D1);
  static const stone400 = Color(0xFFA8A29E);
  static const stone500 = Color(0xFF78716C);
  static const stone600 = Color(0xFF57534E);
  static const stone700 = Color(0xFF44403C);
  static const stone800 = Color(0xFF292524);
  static const stone900 = Color(0xFF1C1917);

  // Cool gray: the hub portal's main buttons (gray-900) and the rider screens' backgrounds
  static const gray50 = Color(0xFFF9FAFB);
  static const gray100 = Color(0xFFF3F4F6);
  static const gray600 = Color(0xFF4B5563);
  static const gray900 = Color(0xFF111827);
}

/// The status colours, used the same way on every screen: amber = waiting or cash to collect, emerald = done or
/// delivered, rose = failed or cancelled, blue = on the way, gray = closed. Always shown with words, never colour alone.
enum StatusTone {
  amber(Color(0xFFFFFBEB), Color(0xFFB45309), Color(0xFFFDE68A)),
  emerald(Color(0xFFECFDF5), Color(0xFF047857), Color(0xFFA7F3D0)),
  rose(Color(0xFFFFF1F2), Color(0xFFBE123C), Color(0xFFFECDD3)),
  blue(Color(0xFFEFF6FF), Color(0xFF1D4ED8), Color(0xFFBFDBFE)),
  gray(Color(0xFFF3F4F6), Color(0xFF4B5563), Color(0xFFE5E7EB));

  const StatusTone(this.background, this.foreground, this.border);

  final Color background;
  final Color foreground;
  final Color border;
}
