import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

/// The Loved-IT logo, the same picture as the website's header. [onDark] is the white version, for over a photo.
class LovedItLogo extends StatelessWidget {
  const LovedItLogo({super.key, this.height = 40, this.onDark = false});

  final double height;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      onDark
          ? 'assets/branding/loved-it-logo-on-dark.png'
          : 'assets/branding/loved-it-logo.png',
      height: height,
      semanticLabel: 'Loved-IT',
      fit: BoxFit.contain,
    );
  }
}

/// The photo on top of an auth screen: the website's sign-in pictures, each cropped to keep its subject in frame.
enum AuthPhoto {
  parcel('assets/auth/parcel.jpg', Alignment(0, 0.55)),
  bags('assets/auth/bags.jpg', Alignment(0, -0.2)),
  rack('assets/auth/rack.jpg', Alignment(0, 0.1)),
  rider('assets/auth/rider.jpg', Alignment(0, 0.15));

  const AuthPhoto(this.asset, this.alignment);

  final String asset;
  final Alignment alignment;
}

/// The frame of the sign-in, code and account-status screens, like the website's AuthShell on a phone: a photo across
/// the top, then the title and the form on a warm sheet over it. The photo shrinks while the keyboard is up, so the
/// fields stay in view on a small phone.
class AuthLayout extends StatelessWidget {
  const AuthLayout({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
    this.footer,
    this.bottomBar,
    this.photo = AuthPhoto.parcel,
    this.tall = false,
    this.onBack,
    this.controller,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  /// Pinned under the content, for a secondary link like "Create an account".
  final Widget? footer;

  /// The screen's main button, pinned where the thumb reaches and kept above the keyboard.
  final Widget? bottomBar;

  final AuthPhoto photo;

  /// A bigger photo, for the first screen people see.
  final bool tall;

  /// The back arrow over the photo, also used by the phone's back button.
  final VoidCallback? onBack;

  /// For a screen in steps, to go back to the top on each step.
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final keyboardUp = media.viewInsets.bottom > 0;
    // On a short phone the photo is small, and any links scroll with the form.
    final shortPhone = media.size.height < 720;
    final footerScrolls = footer != null && (bottomBar == null || shortPhone);
    final photoHeight = keyboardUp
        ? 64.0
        : shortPhone
        ? 96.0
        : (media.size.height * (tall ? 0.30 : 0.17)).clamp(
            tall ? 170.0 : 104.0,
            tall ? 300.0 : 170.0,
          );
    final sheetTop = media.padding.top + photoHeight;

    final page = Scaffold(
      backgroundColor: AppColors.cream,
      body: Stack(
        children: [
          AnimatedPositioned(
            duration: kMotion,
            curve: Curves.easeOut,
            top: 0,
            left: 0,
            right: 0,
            // Runs under the sheet's rounded corners.
            height: sheetTop + _sheetRadius,
            child: _Photo(photo: photo, onBack: onBack),
          ),
          AnimatedPositioned(
            duration: kMotion,
            curve: Curves.easeOut,
            top: sheetTop,
            left: 0,
            right: 0,
            bottom: 0,
            child: Material(
              color: AppColors.cream,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(_sheetRadius),
              ),
              child: Column(
                children: [
                  Expanded(
                    child: CustomScrollView(
                      controller: controller,
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpace.xl,
                            AppSpace.xxl,
                            AppSpace.xl,
                            AppSpace.lg,
                          ),
                          sliver: SliverToBoxAdapter(
                            child: Center(
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 440,
                                ),
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Text(
                                      title,
                                      style: const TextStyle(
                                        // The phone's serif, like the website's headings.
                                        fontFamily: 'serif',
                                        fontSize: 30,
                                        height: 1.12,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: -0.4,
                                        color: AppColors.ink,
                                      ),
                                    ),
                                    if (subtitle != null) ...[
                                      const SizedBox(height: AppSpace.sm),
                                      Text(
                                        subtitle!,
                                        style: const TextStyle(
                                          fontSize: 14.5,
                                          height: 1.45,
                                          color: AppColors.stone500,
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: AppSpace.xl),
                                    ...children,
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        // At the bottom when there is room; otherwise it scrolls with the form, so it never covers it.
                        if (footerScrolls)
                          SliverFillRemaining(
                            hasScrollBody: false,
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  AppSpace.lg,
                                  0,
                                  AppSpace.lg,
                                  AppSpace.xs,
                                ),
                                child: footer,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (bottomBar != null)
                    DecoratedBox(
                      decoration: const BoxDecoration(
                        border: Border(
                          top: BorderSide(color: AppColors.stone200),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpace.xl,
                          AppSpace.md,
                          AppSpace.xl,
                          AppSpace.md,
                        ),
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 440),
                            child: bottomBar,
                          ),
                        ),
                      ),
                    ),
                  // Under a pinned main button. Hidden while the keyboard is up, to leave room for the form.
                  if (footer != null && !footerScrolls && !keyboardUp)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.lg,
                        0,
                        AppSpace.lg,
                        AppSpace.xs,
                      ),
                      child: footer,
                    ),
                  SizedBox(height: keyboardUp ? 0 : media.padding.bottom),
                ],
              ),
            ),
          ),
        ],
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Light status bar icons over the photo.
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: onBack == null
          ? page
          : PopScope(
              canPop: false,
              onPopInvokedWithResult: (didPop, _) {
                if (!didPop) onBack!();
              },
              child: page,
            ),
    );
  }

  static const _sheetRadius = 28.0;
}

class _Photo extends StatelessWidget {
  const _Photo({required this.photo, required this.onBack});

  final AuthPhoto photo;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ExcludeSemantics(
          child: Image.asset(
            photo.asset,
            fit: BoxFit.cover,
            alignment: photo.alignment,
          ),
        ),
        // A scrim only where the logo sits, so the photo stays bright under it.
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xB31E1B18), Color(0x001E1B18)],
              stops: [0, 0.75],
            ),
          ),
        ),
        Align(
          alignment: Alignment.topLeft,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpace.lg,
                vertical: AppSpace.sm,
              ),
              child: Row(
                children: [
                  if (onBack != null) ...[
                    IconButton(
                      tooltip: 'Back',
                      onPressed: onBack,
                      color: AppColors.white,
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0x331E1B18),
                      ),
                      icon: const Icon(LucideIcons.arrowLeft, size: 20),
                    ),
                    const SizedBox(width: AppSpace.sm),
                  ],
                  const LovedItLogo(height: 34, onDark: true),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Three segments that fill as the steps are done, with the step names under them, like the website's.
class AuthStepBar extends StatelessWidget {
  const AuthStepBar({super.key, required this.steps, required this.current});

  final List<String> steps;
  final int current;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Step ${current + 1} of ${steps.length}: ${steps[current]}',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0) const SizedBox(width: AppSpace.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: kMotion,
                    height: 4,
                    decoration: BoxDecoration(
                      color: i <= current
                          ? AppColors.brandRed
                          : AppColors.stone200,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                  ),
                  const SizedBox(height: AppSpace.sm),
                  Row(
                    children: [
                      if (i < current) ...[
                        const Icon(
                          LucideIcons.check,
                          size: 14,
                          color: AppColors.brandRed,
                        ),
                        const SizedBox(width: AppSpace.xs),
                      ],
                      Flexible(
                        child: Text(
                          steps[i],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: i == current
                                ? AppColors.stone900
                                : i < current
                                ? AppColors.stone500
                                : AppColors.stone400,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The "or" rule between a form and the Google button.
class AuthOrDivider extends StatelessWidget {
  const AuthOrDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        Expanded(child: Divider()),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: AppSpace.md),
          child: Text(
            'or',
            style: TextStyle(fontSize: 13, color: AppColors.stone500),
          ),
        ),
        Expanded(child: Divider()),
      ],
    );
  }
}
