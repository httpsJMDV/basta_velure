import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/web_links.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';
import 'auth_routes.dart';
import 'google_button.dart';

/// Sign up (B1, `POST /auth/register`) in three short steps. Every field follows the server's rules and messages;
/// the email code screen opens next.
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  static const _steps = ['About you', 'Contact', 'Password'];
  static const _hints = [
    'We email you a 6-digit code to confirm it\'s you.',
    'Your code goes to this email. Your mobile number is for your deliveries.',
    'Choose a password only you know.',
  ];

  /// Which step shows each field the server can complain about.
  static const _stepOfField = {
    'first_name': 0,
    'middle_name': 0,
    'last_name': 0,
    'date_of_birth': 0,
    'email': 1,
    'phone': 1,
    'password': 2,
    'password_confirmation': 2,
    'accept_terms': 2,
  };

  final _forms = [
    GlobalKey<FormState>(),
    GlobalKey<FormState>(),
    GlobalKey<FormState>(),
  ];
  final _scroll = ScrollController();
  final _first = TextEditingController();
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  int _step = 0;
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
    _scroll.dispose();
    _termsTap.dispose();
    _privacyTap.dispose();
    super.dispose();
  }

  void _goTo(int step) {
    setState(() => _step = step);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _back() => _step > 0 ? _goTo(_step - 1) : context.go(AuthPaths.signIn);

  Future<void> _continue() async {
    FocusScope.of(context).unfocus();
    final fieldsOk = _forms[_step].currentState!.validateAndReveal();
    if (_step == _steps.length - 1) setState(() => _showTermsError = !_terms);
    if (!fieldsOk) return;
    if (_step < _steps.length - 1) return _goTo(_step + 1);
    if (!_terms) return;

    setState(() => _failure = null);
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
      if (!mounted) return;
      setState(() => _failure = failure);
      // Open the first step the server found a problem in, so its message is seen.
      final wrong = failure.fieldErrors.keys
          .map((field) => _stepOfField[field])
          .whereType<int>();
      if (wrong.isNotEmpty) _goTo(wrong.reduce((a, b) => a < b ? a : b));
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

  /// One step's fields. The steps stay mounted while hidden, so what was typed or picked is kept.
  Widget _page(int step, List<Widget> children) {
    return Visibility(
      visible: _step == step,
      maintainState: true,
      child: Form(
        key: _forms[step],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final last = _step == _steps.length - 1;
    return AutofillGroup(
      child: AuthLayout(
        title: 'Create your account',
        subtitle: _hints[_step],
        photo: AuthPhoto.bags,
        controller: _scroll,
        onBack: _back,
        bottomBar: SubmitButton(
          label: last ? 'Create account' : 'Continue',
          busyLabel: 'Creating account…',
          onPressed: _continue,
        ),
        footer: Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
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
          AuthStepBar(steps: _steps, current: _step),
          const SizedBox(height: AppSpace.xl),
          if (failure != null && failure.fieldErrors.isEmpty) ...[
            MessageBanner(message: failure.message),
            const SizedBox(height: AppSpace.lg),
          ],
          _page(0, [
            GoogleButton(
              onStart: () => setState(() => _failure = null),
              onFailure: (failure) => setState(() => _failure = failure),
            ),
            const SizedBox(height: AppSpace.lg),
            const AuthOrDivider(),
            const SizedBox(height: AppSpace.lg),
            _name(_first, 'First name', 'first_name'),
            _name(_middle, 'Middle name', 'middle_name', required: false),
            _name(_last, 'Last name', 'last_name'),
            DateOfBirthField(
              serverError: failure?.errorFor('date_of_birth'),
              onChanged: (value) => _birthday = value,
            ),
          ]),
          _page(1, [
            AppTextField(
              label: 'Email',
              controller: _email,
              prefixIcon: LucideIcons.mail,
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
              prefixIcon: LucideIcons.smartphone,
              hint: '09XXXXXXXXX',
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.telephoneNumber],
              inputFormatters: [Only.mobileChars, Only.max(13)],
              validator: Rules.mobile,
              serverError: failure?.errorFor('phone'),
            ),
          ]),
          _page(2, [
            AppTextField(
              label: 'Password',
              controller: _password,
              prefixIcon: LucideIcons.lockKeyhole,
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
              prefixIcon: LucideIcons.lockKeyhole,
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
            if (_showTermsError || failure?.errorFor('accept_terms') != null)
              Text(
                failure?.errorFor('accept_terms') ?? 'You must accept the Terms of Use and Privacy Policy to create an account.',
                style: TextStyle(
                  fontSize: 12,
                  color: StatusTone.rose.foreground,
                ),
              ),
          ]),
        ],
      ),
    );
  }
}
