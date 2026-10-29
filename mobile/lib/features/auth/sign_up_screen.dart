import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';
import 'auth_routes.dart';

/// Sign up (B1, `POST /auth/register`). Every field follows the server's rules and messages; the email code screen
/// opens next.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  DateTime? _birthday;
  bool _terms = false;
  bool _showTermsError = false;
  ApiFailure? _failure;

  late final _termsTap = TapGestureRecognizer()
    ..onTap = () => openWebsite('/terms-of-service');
  late final _privacyTap = TapGestureRecognizer()
    ..onTap = () => openWebsite('/privacy-policy');

  @override
  void dispose() {
    for (final box in [
      _first,
      _middle,
      _last,
      _email,
      _phone,
      _password,
      _confirm,
    ]) {
      box.dispose();
    }
    _termsTap.dispose();
    _privacyTap.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _failure = null;
      _showTermsError = !_terms;
    });
    if (!_form.currentState!.validate() || !_terms) return;
    try {
      await ref.read(sessionProvider.notifier).register({
        'first_name': Rules.squish(_first.text),
        'middle_name': Rules.squish(_middle.text).isEmpty
            ? null
            : Rules.squish(_middle.text),
        'last_name': Rules.squish(_last.text),
        'email': Rules.normalizeEmail(_email.text),
        'phone': Rules.normalizeMobile(_phone.text) ?? _phone.text.trim(),
        'date_of_birth': Rules.ymd(_birthday!),
        // Passwords are sent exactly as typed, never trimmed.
        'password': _password.text,
        'password_confirmation': _confirm.text,
        'accept_terms': true,
      });
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  Widget _name(
    TextEditingController controller,
    String label,
    String field, {
    bool required = true,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: AppTextField(
        label: required ? label : '$label (optional)',
        controller: controller,
        keyboardType: TextInputType.name,
        textInputAction: TextInputAction.next,
        textCapitalization: TextCapitalization.words,
        inputFormatters: [Only.nameChars],
        maxLength: 50,
        validator: (value) => Rules.name(value, label, required: required),
        serverError: _failure?.errorFor(field),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    return AutofillGroup(
      child: AuthLayout(
        title: 'Create your account',
        subtitle: 'Shop from trusted Philippine sellers.',
        footer: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Already have an account?',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            TextButton(
              onPressed: () => context.go(AuthPaths.signIn),
              child: const Text('Sign in'),
            ),
          ],
        ),
        children: [
          if (failure != null && failure.fieldErrors.isEmpty) ...[
            MessageBanner(message: failure.message),
            const SizedBox(height: AppSpace.lg),
          ],
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _name(_first, 'First name', 'first_name'),
                _name(_middle, 'Middle name', 'middle_name', required: false),
                _name(_last, 'Last name', 'last_name'),
                AppTextField(
                  label: 'Email',
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  inputFormatters: [Only.noSpaces],
                  maxLength: 100,
                  validator: Rules.email,
                  serverError: failure?.errorFor('email'),
                ),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Mobile number',
                  controller: _phone,
                  hint: '09XXXXXXXXX',
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  inputFormatters: [Only.mobileChars, Only.max(13)],
                  validator: Rules.mobile,
                  serverError: failure?.errorFor('phone'),
                ),
                const SizedBox(height: AppSpace.md),
                DateOfBirthField(
                  serverError: failure?.errorFor('date_of_birth'),
                  onChanged: (value) => _birthday = value,
                ),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Password',
                  controller: _password,
                  obscure: true,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: (_) => setState(() {}),
                  validator: Rules.password,
                  serverError: failure?.errorFor('password'),
                ),
                PasswordChecklist(password: _password.text),
                const SizedBox(height: AppSpace.md),
                AppTextField(
                  label: 'Confirm password',
                  controller: _confirm,
                  obscure: true,
                  textInputAction: TextInputAction.done,
                  validator: (value) =>
                      Rules.passwordConfirmation(_password.text, value),
                ),
                const SizedBox(height: AppSpace.sm),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _terms,
                  onChanged: (on) => setState(() {
                    _terms = on ?? false;
                    if (_terms) _showTermsError = false;
                  }),
                  title: Text.rich(
                    TextSpan(
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.stone700,
                      ),
                      children: [
                        const TextSpan(text: 'I agree to the '),
                        TextSpan(
                          text: 'Terms of Use',
                          style: const TextStyle(
                            color: AppColors.brandRed,
                            fontWeight: FontWeight.w600,
                          ),
                          recognizer: _termsTap,
                        ),
                        const TextSpan(text: ' and '),
                        TextSpan(
                          text: 'Privacy Policy',
                          style: const TextStyle(
                            color: AppColors.brandRed,
                            fontWeight: FontWeight.w600,
                          ),
                          recognizer: _privacyTap,
                        ),
                        const TextSpan(text: '.'),
                      ],
                    ),
                  ),
                ),
                if (_showTermsError ||
                    failure?.errorFor('accept_terms') != null)
                  Text(
                    failure?.errorFor('accept_terms') ?? 'You must accept the Terms of Use and Privacy Policy to create an account.',
                    style: TextStyle(
                      fontSize: 12,
                      color: StatusTone.rose.foreground,
                    ),
                  ),
                const SizedBox(height: AppSpace.lg),
                SubmitButton(
                  label: 'Create account',
                  busyLabel: 'Creating account…',
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
