import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/home_route.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/widgets/widgets.dart';
import '../buyer/buyer_paths.dart';
import 'auth_layout.dart';
import 'auth_routes.dart';
import 'google_button.dart';

/// `POST /auth/login` with an email or a username. Every account signs in here; the account decides which home
/// opens next (task A6).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.closeWhenDone = false, this.next});

  /// Opened over a screen of the shop (`showSignInOver`), which it goes back to.
  final bool closeWhenDone;

  /// A dock tab to open afterwards.
  final String? next;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  ApiFailure? _failure;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  /// A guest who was asked to sign in goes back to the shop, and on to what they asked for. Any other account is sent
  /// to its own home by the router.
  void _backToShop(SessionState session) {
    if (session is! SignedIn || session.home != AppHome.buyer) return;
    if (session.user.needsProfile) return;
    final router = GoRouter.of(context);
    if (widget.closeWhenDone) {
      Navigator.of(context).pop();
      if (widget.next != null) router.go(widget.next!);
      return;
    }
    // Opened by the router, for a screen that needs an account. The router can't take this screen away by itself: it
    // only looks at the bottom of the stack. Home goes underneath, so Back works from the screen they asked for.
    final next = GoRouterState.of(context).uri.queryParameters['next'];
    if (next == null || !BuyerPaths.isShopScreen(next)) {
      router.go(BuyerPaths.home);
    } else if (BuyerPaths.tabs.contains(next)) {
      router.go(next);
    } else {
      late final VoidCallback landed;
      landed = () {
        if (router.state.uri.path != BuyerPaths.home) return;
        router.routerDelegate.removeListener(landed);
        Future.microtask(() => router.push(next));
      };
      router.routerDelegate.addListener(landed);
      router.go(BuyerPaths.home);
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_form.currentState!.validate()) return;
    setState(() => _failure = null);
    try {
      await ref
          .read(sessionProvider.notifier)
          .signIn(identifier: _identifier.text, password: _password.text);
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (_, next) => _backToShop(next));
    final session = ref.watch(sessionProvider);
    final notice = session is SignedOut ? session.notice : null;
    final failure = _failure;
    // Field problems show under their fields; everything else (wrong password, suspended, no internet) on top.
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;

    return AutofillGroup(
      child: AuthLayout(
        title: 'Welcome back',
        subtitle: 'Sign in with your email or username.',
        photo: AuthPhoto.parcel,
        tall: true,
        footer: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  'New to Loved-IT?',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                TextButton(
                  onPressed: () => context.push(AuthPaths.signUp),
                  child: const Text('Create an account'),
                ),
              ],
            ),
            TextButton(
              style: TextButton.styleFrom(foregroundColor: AppColors.stone700),
              onPressed: () => Navigator.of(context).canPop()
                  ? Navigator.of(context).pop()
                  : context.go(BuyerPaths.home),
              child: const Text('Keep browsing without an account'),
            ),
            // Part C: riders apply on their own form, with an email of their own.
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: AppColors.stone600),
              onPressed: () => context.push(AuthPaths.becomeRider),
              icon: const Icon(LucideIcons.bike, size: 18),
              label: const Text('Want to deliver? Become a rider'),
            ),
          ],
        ),
        children: [
          if (banner != null) ...[
            MessageBanner(message: banner),
            const SizedBox(height: AppSpace.lg),
          ] else if (notice != null) ...[
            MessageBanner(message: notice, tone: StatusTone.amber),
            const SizedBox(height: AppSpace.lg),
          ],
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppTextField(
                  label: 'Email or username',
                  controller: _identifier,
                  prefixIcon: LucideIcons.userRound,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [
                    AutofillHints.email,
                    AutofillHints.username,
                  ],
                  inputFormatters: [Only.noSpaces],
                  maxLength: 255,
                  validator: (value) =>
                      Rules.required(value, 'Email or username'),
                  serverError:
                      failure?.errorFor('identifier') ??
                      failure?.errorFor('email'),
                ),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Password',
                  controller: _password,
                  prefixIcon: LucideIcons.lockKeyhole,
                  obscure: true,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  // Never trimmed or checked for strength here: the password typed at sign-up is what counts.
                  validator: (value) =>
                      (value ?? '').isEmpty ? 'Password is required.' : null,
                  serverError: failure?.errorFor('password'),
                  onSubmitted: (_) => _submit(),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.go(AuthPaths.forgotPassword),
                    child: const Text('Forgot password?'),
                  ),
                ),
                SubmitButton(
                  label: 'Sign in',
                  busyLabel: 'Signing in…',
                  onPressed: _submit,
                ),
                const SizedBox(height: AppSpace.lg),
                const AuthOrDivider(),
                const SizedBox(height: AppSpace.lg),
                GoogleButton(
                  onStart: () => setState(() => _failure = null),
                  onFailure: (failure) => setState(() => _failure = failure),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
