import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Spacing on a 4 px grid.
abstract final class AppSpace {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;

  /// The side margin of every screen.
  static const page = EdgeInsets.symmetric(horizontal: lg);
}

abstract final class AppRadius {
  static const card = 12.0;
  static const pill = 999.0;
  static final cardAll = BorderRadius.circular(card);
}

/// The one shadow style, for cards that float over the page (bottom bars, sheets).
abstract final class AppShadow {
  static const soft = [
    BoxShadow(color: Color(0x141C1917), blurRadius: 12, offset: Offset(0, 2)),
  ];
}

/// Smallest tap target for anything people press.
const kMinTap = 48.0;

/// Short and quiet movement.
const kMotion = Duration(milliseconds: 200);

ThemeData buildAppTheme() {
  // fromSeed gives the in-between shades; the main ones are set by hand so nothing drifts to pink or purple.
  final scheme = ColorScheme.fromSeed(seedColor: AppColors.brandRed).copyWith(
    primary: AppColors.brandRed,
    onPrimary: AppColors.white,
    primaryContainer: AppColors.brandRedTint,
    onPrimaryContainer: AppColors.brandRedDark,
    secondary: AppColors.stone800,
    onSecondary: AppColors.white,
    secondaryContainer: AppColors.stone100,
    onSecondaryContainer: AppColors.stone900,
    tertiary: AppColors.stone600,
    surface: AppColors.white,
    onSurface: AppColors.stone900,
    onSurfaceVariant: AppColors.stone600,
    surfaceContainerLowest: AppColors.white,
    surfaceContainerLow: AppColors.stone50,
    surfaceContainer: AppColors.stone100,
    surfaceContainerHigh: AppColors.stone100,
    surfaceContainerHighest: AppColors.stone200,
    surfaceTint: Colors.transparent,
    outline: AppColors.stone300,
    outlineVariant: AppColors.stone200,
    error: StatusTone.rose.foreground,
    onError: AppColors.white,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: 'Inter',
  );
  final text = base.textTheme.apply(
    bodyColor: AppColors.stone900,
    displayColor: AppColors.stone900,
  );

  final roundedCard = RoundedRectangleBorder(borderRadius: AppRadius.cardAll);
  OutlineInputBorder border(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: AppRadius.cardAll,
        borderSide: BorderSide(color: color, width: width),
      );

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.stone50,
    textTheme: text.copyWith(
      headlineSmall: text.headlineSmall?.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        height: 1.25,
      ),
      titleLarge: text.titleLarge?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: text.titleMedium?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: text.bodyLarge?.copyWith(fontSize: 16, height: 1.45),
      bodyMedium: text.bodyMedium?.copyWith(
        fontSize: 14,
        height: 1.45,
        color: AppColors.stone700,
      ),
      bodySmall: text.bodySmall?.copyWith(
        fontSize: 13,
        height: 1.4,
        color: AppColors.stone600,
      ),
      labelLarge: text.labelLarge?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.stone900,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: AppColors.stone900,
      ),
    ),
    cardTheme: CardThemeData(
      color: AppColors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: roundedCard.copyWith(
        side: const BorderSide(color: AppColors.stone200),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.stone200,
      thickness: 1,
      space: 1,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(kMinTap, kMinTap),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.xl,
          vertical: AppSpace.md,
        ),
        shape: roundedCard,
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
        disabledBackgroundColor: AppColors.stone200,
        disabledForegroundColor: AppColors.stone500,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(kMinTap, kMinTap),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpace.xl,
          vertical: AppSpace.md,
        ),
        foregroundColor: AppColors.stone900,
        side: const BorderSide(color: AppColors.stone300),
        shape: roundedCard,
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(kMinTap, kMinTap),
        foregroundColor: AppColors.brandRed,
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(minimumSize: const Size(kMinTap, kMinTap)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.white,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpace.lg,
        vertical: 14,
      ),
      labelStyle: const TextStyle(color: AppColors.stone600),
      floatingLabelStyle: const TextStyle(
        color: AppColors.stone800,
        fontWeight: FontWeight.w500,
      ),
      hintStyle: const TextStyle(color: AppColors.stone400),
      helperMaxLines: 3,
      errorMaxLines: 4,
      border: border(AppColors.stone300),
      enabledBorder: border(AppColors.stone300),
      focusedBorder: border(AppColors.brandRed, 1.5),
      errorBorder: border(StatusTone.rose.foreground),
      focusedErrorBorder: border(StatusTone.rose.foreground, 1.5),
      disabledBorder: border(AppColors.stone200),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: const StadiumBorder(side: BorderSide(color: AppColors.stone200)),
      backgroundColor: AppColors.white,
      selectedColor: AppColors.brandRedTint,
      labelStyle: const TextStyle(
        fontFamily: 'Inter',
        fontSize: 14,
        color: AppColors.stone800,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.stone900,
      contentTextStyle: const TextStyle(
        fontFamily: 'Inter',
        fontSize: 14,
        color: AppColors.white,
      ),
      shape: roundedCard,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      shape: roundedCard,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.brandRedTint,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? AppColors.brandRed
              : AppColors.stone600,
        ),
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.brandRed,
    ),
  );
}
