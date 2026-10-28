import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_failure.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';

/// The 6-digit email code (`POST /auth/verify-email`). It works for 5 minutes, once; 5 wrong tries need a new code.
/// Resending (`POST /auth/resend-verification`) cancels the old one. A right code signs the person in.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key});

  /// The same wait as the website between two resends.
  static const resendCooldown = 30;

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  final _form = GlobalKey<FormState>();
  final _code = TextEditingController();
  ApiFailure? _failure;
  String? _info;
  int _cooldown = VerifyEmailScreen.resendCooldown;
  bool _resending = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCooldown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = VerifyEmailScreen.resendCooldown);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _cooldown--);
      if (_cooldown <= 0) timer.cancel();
    });
  }

  String? get _email {
    final session = ref.read(sessionProvider);
    return session is NeedsEmailCode ? session.email : null;
  }

  Future<void> _verify() async {
    FocusScope.of(context).unfocus();
    final email = _email;
    if (email == null || !_form.currentState!.validate()) return;
    setState(() {
      _failure = null;
      _info = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .verifyEmail(email: email, code: _code.text.trim());
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  Future<void> _resend() async {
    final email = _email;
    if (email == null || _resending || _cooldown > 0) return;
    setState(() {
      _resending = true;
      _failure = null;
    });
    try {
      final message = await ref
          .read(sessionProvider.notifier)
          .resendEmailCode(email);
      if (!mounted) return;
      _code.clear();
      setState(() => _info = message);
      _startCooldown();
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final email = session is NeedsEmailCode ? session.email : '';
    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    final alreadyVerified = failure?.kind == FailureKind.conflict;

    return AutofillGroup(
      child: AuthLayout(
        title: 'Check your email',
        subtitle:
            'Enter the 6-digit code we sent to $email. It works for 5 minutes.',
        footer: TextButton(
          style: TextButton.styleFrom(foregroundColor: AppColors.stone600),
          onPressed: ref.read(sessionProvider.notifier).useAnotherAccount,
          child: Text(alreadyVerified ? 'Sign in' : 'Use another account'),
        ),
        children: [
          if (banner != null) ...[
            MessageBanner(
              message: banner,
              tone: alreadyVerified ? StatusTone.emerald : StatusTone.rose,
            ),
            const SizedBox(height: AppSpace.lg),
          ] else if (_info != null) ...[
            MessageBanner(message: _info!, tone: StatusTone.emerald),
            const SizedBox(height: AppSpace.lg),
          ],
          Form(
            key: _form,
            child: AppTextField(
              label: '6-digit code',
              controller: _code,
              keyboardType: TextInputType.number,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [Only.digits],
              maxLength: 6,
              autofocus: true,
              validator: Rules.emailCode,
              serverError: failure?.errorFor('code'),
              onSubmitted: (_) => _verify(),
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          SubmitButton(
            label: 'Verify email',
            busyLabel: 'Checking…',
            onPressed: _verify,
          ),
          const SizedBox(height: AppSpace.sm),
          Center(
            child: TextButton(
              onPressed: _cooldown > 0 || _resending ? null : _resend,
              child: Text(
                _resending
                    ? 'Sending…'
                    : _cooldown > 0
                    ? 'Resend in ${_cooldown}s'
                    : 'Resend code',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
