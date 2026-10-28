import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';

/// `POST /auth/login` with an email or a username. Every account signs in here; the account decides which home
/// opens next (task A6).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

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
        footer: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'New to Loved-IT?',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            // Task B1 brings sign up into the app; until then it opens the website's form.
            TextButton(
              onPressed: () => openWebsite('/register'),
              child: const Text('Create an account'),
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
                const SizedBox(height: AppSpace.lg),
                AppTextField(
                  label: 'Password',
                  controller: _password,
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
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.brandRed,
                    ),
                    // The reset link in the email opens the website, so the whole flow stays there for now (B1).
                    onPressed: () => openWebsite('/forgot-password'),
                    child: const Text('Forgot password?'),
                  ),
                ),
                const SizedBox(height: AppSpace.sm),
                SubmitButton(
                  label: 'Sign in',
                  busyLabel: 'Signing in…',
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
