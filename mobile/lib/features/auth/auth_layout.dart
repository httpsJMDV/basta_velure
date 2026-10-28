import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

/// The Loved-IT logo, the same picture as the website's header.
class LovedItLogo extends StatelessWidget {
  const LovedItLogo({super.key, this.height = 40});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/branding/loved-it-logo.png',
      height: height,
      semanticLabel: 'Loved-IT',
      fit: BoxFit.contain,
    );
  }
}

/// The frame of the sign-in, code and account-status screens: the logo, a title, then the content, scrolling above
/// the keyboard on a small phone.
class AuthLayout extends StatelessWidget {
  const AuthLayout({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
    this.footer,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;

  /// Pinned under the content, for a secondary link like "Create an account".
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: AppColors.white,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.xl,
                  AppSpace.xxl,
                  AppSpace.xl,
                  AppSpace.xl,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: LovedItLogo(),
                        ),
                        const SizedBox(height: AppSpace.xxl),
                        Text(title, style: theme.textTheme.headlineSmall),
                        if (subtitle != null) ...[
                          const SizedBox(height: AppSpace.xs),
                          Text(subtitle!, style: theme.textTheme.bodyMedium),
                        ],
                        const SizedBox(height: AppSpace.xl),
                        ...children,
                      ],
                    ),
                  ),
                ),
              ),
            ),
            // Hidden while the keyboard is up, so it never sits on top of the form's main button.
            if (footer != null && MediaQuery.viewInsetsOf(context).bottom == 0)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpace.lg,
                  0,
                  AppSpace.lg,
                  AppSpace.sm,
                ),
                child: footer,
              ),
          ],
        ),
      ),
    );
  }
}
