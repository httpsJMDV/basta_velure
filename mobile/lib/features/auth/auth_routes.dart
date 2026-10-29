import 'package:go_router/go_router.dart';

import 'account_blocked_screen.dart';
import 'forgot_password_screen.dart';
import 'launch_screen.dart';
import 'offline_screen.dart';
import 'sign_in_screen.dart';
import 'sign_up_screen.dart';
import 'verify_email_screen.dart';
import 'web_only_screen.dart';

abstract final class AuthPaths {
  static const launch = '/launch';
  static const offline = '/offline';
  static const signIn = '/sign-in';
  static const verifyEmail = '/verify-email';
  static const blocked = '/account-blocked';
  static const webOnly = '/web-only';
  static const signUp = '/sign-up';
  static const forgotPassword = '/forgot-password';

  /// The screens a signed-out person may open.
  static const signedOut = [signIn, signUp, forgotPassword];
}

final authRoutes = <RouteBase>[
  GoRoute(path: AuthPaths.launch, builder: (_, _) => const LaunchScreen()),
  GoRoute(path: AuthPaths.offline, builder: (_, _) => const OfflineScreen()),
  GoRoute(path: AuthPaths.signIn, builder: (_, _) => const SignInScreen()),
  GoRoute(
    path: AuthPaths.verifyEmail,
    builder: (_, _) => const VerifyEmailScreen(),
  ),
  GoRoute(
    path: AuthPaths.blocked,
    builder: (_, _) => const AccountBlockedScreen(),
  ),
  GoRoute(path: AuthPaths.webOnly, builder: (_, _) => const WebOnlyScreen()),
  GoRoute(path: AuthPaths.signUp, builder: (_, _) => const SignUpScreen()),
  GoRoute(
    path: AuthPaths.forgotPassword,
    builder: (_, _) => const ForgotPasswordScreen(),
  ),
];
