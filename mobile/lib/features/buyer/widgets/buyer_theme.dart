import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';

/// The buyer app's type, on top of Inter: the phone's serif for what a person reads first, like the website's
/// headings.
abstract final class BuyerText {
  static const screenTitle = TextStyle(
    fontFamily: 'serif',
    fontSize: 22,
    height: 1.15,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
    color: AppColors.ink,
  );

  static const section = TextStyle(
    fontFamily: 'serif',
    fontSize: 20,
    height: 1.2,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
    color: AppColors.ink,
  );

  static const price = TextStyle(
    fontWeight: FontWeight.w700,
    color: AppColors.brandRed,
    letterSpacing: -0.2,
    fontFeatures: [FontFeature.tabularFigures()],
  );
}

/// Corners of the buyer app: soft on cards, softer on sheets.
abstract final class BuyerRadius {
  static const card = 20.0;
  static const button = 16.0;
  static const field = 14.0;
  static const sheet = 28.0;

  static final cardAll = BorderRadius.circular(card);
  static final buttonAll = BorderRadius.circular(button);
}

/// The soft shadow under things that float over the page.
abstract final class BuyerShadow {
  static const floating = [
    BoxShadow(color: Color(0x1F1E1B18), blurRadius: 24, offset: Offset(0, 10)),
    BoxShadow(color: Color(0x0F1E1B18), blurRadius: 6, offset: Offset(0, 2)),
  ];

  static const card = [
    BoxShadow(color: Color(0x0A1E1B18), blurRadius: 16, offset: Offset(0, 4)),
  ];
}

/// Wraps every buyer screen, like the hub's HubThemed: the website's warm page colour, serif screen titles, softer
/// corners, and buttons, tabs, chips and sheets that belong together.
class BuyerThemed extends StatelessWidget {
  const BuyerThemed({super.key, required this.child});

  final Widget child;

  static ThemeData theme(ThemeData base) {
    final button = RoundedRectangleBorder(borderRadius: BuyerRadius.buttonAll);
    final card = RoundedRectangleBorder(borderRadius: BuyerRadius.cardAll);
    OutlineInputBorder field(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(BuyerRadius.field),
          borderSide: BorderSide(color: color, width: width),
        );
    final rose = StatusTone.rose.foreground;

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.cream,
      canvasColor: AppColors.cream,
      appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: AppColors.cream,
        foregroundColor: AppColors.ink,
        titleTextStyle: BuyerText.screenTitle,
        centerTitle: false,
        titleSpacing: AppSpace.lg,
        systemOverlayStyle: SystemUiOverlayStyle.dark.copyWith(
          statusBarColor: Colors.transparent,
        ),
      ),
      actionIconTheme: ActionIconThemeData(
        backButtonIconBuilder: (_) =>
            const Icon(LucideIcons.arrowLeft, size: 22),
      ),
      cardTheme: base.cardTheme.copyWith(shape: card, color: AppColors.white),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(kMinTap, 50),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          shape: button,
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
          minimumSize: const Size(kMinTap, 50),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          foregroundColor: AppColors.stone900,
          backgroundColor: AppColors.white,
          side: const BorderSide(color: AppColors.stone200),
          shape: button,
          textStyle: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpace.lg,
          vertical: 16,
        ),
        border: field(AppColors.stone200),
        enabledBorder: field(AppColors.stone200),
        disabledBorder: field(AppColors.stone100),
        focusedBorder: field(AppColors.brandRed, 1.5),
        errorBorder: field(rose),
        focusedErrorBorder: field(rose, 1.5),
      ),
      dialogTheme: base.dialogTheme.copyWith(
        backgroundColor: AppColors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        titleTextStyle: BuyerText.section,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.white,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: AppColors.stone300,
        dragHandleSize: Size(40, 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(BuyerRadius.sheet),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: AppColors.white,
        ),
        actionTextColor: const Color(0xFFFFB4B4),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BuyerRadius.field),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        tabAlignment: TabAlignment.start,
        dividerHeight: 0,
        indicatorSize: TabBarIndicatorSize.tab,
        splashBorderRadius: BorderRadius.circular(AppRadius.pill),
        indicator: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        labelColor: AppColors.white,
        unselectedLabelColor: AppColors.stone600,
        labelStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 13.5,
          fontWeight: FontWeight.w500,
        ),
        labelPadding: const EdgeInsets.symmetric(horizontal: 18),
      ),
      chipTheme: base.chipTheme.copyWith(
        showCheckmark: false,
        backgroundColor: AppColors.white,
        selectedColor: AppColors.ink,
        side: const BorderSide(color: AppColors.stone200),
        shape: const StadiumBorder(),
        labelStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 13.5,
          fontWeight: FontWeight.w500,
          color: AppColors.stone800,
        ),
        secondaryLabelStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: AppColors.white,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      ),
      checkboxTheme: CheckboxThemeData(
        shape: const CircleBorder(),
        side: const BorderSide(color: AppColors.stone300, width: 1.5),
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.brandRed
              : Colors.transparent,
        ),
        checkColor: const WidgetStatePropertyAll(AppColors.white),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.brandRed
              : AppColors.stone300,
        ),
      ),
      switchTheme: SwitchThemeData(
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
        thumbColor: const WidgetStatePropertyAll(AppColors.white),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? AppColors.brandRed
              : AppColors.stone300,
        ),
      ),
      listTileTheme: base.listTileTheme.copyWith(
        titleTextStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 14.5,
          fontWeight: FontWeight.w500,
          color: AppColors.stone900,
        ),
        subtitleTextStyle: const TextStyle(
          fontFamily: 'Inter',
          fontSize: 12.5,
          color: AppColors.stone500,
        ),
        iconColor: AppColors.stone700,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.brandRed,
        refreshBackgroundColor: AppColors.white,
      ),
      dividerTheme: base.dividerTheme.copyWith(color: const Color(0xFFEFEBE6)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Theme(data: theme(Theme.of(context)), child: child);
  }
}

/// How much of the screen's bottom the floating dock covers, for the end of a scrolling list on a tab.
double dockInset(BuildContext context) => MediaQuery.paddingOf(context).bottom;
