import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_failure.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/validation/rules.dart';
import '../../core/widgets/widgets.dart';
import 'auth_layout.dart';
import 'auth_routes.dart';

/// Forgot password (B1, `POST /auth/forgot-password`). The reset link in the email opens the website, which is fine.
/// The answer is the same whether or not the email has an account.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  String? _sent;
  ApiFailure? _failure;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final response = await ref
          .read(dioProvider)
          .post<Map<String, dynamic>>(
            '/auth/forgot-password',
            data: {'email': Rules.normalizeEmail(_email.text)},
          );
      if (!mounted) return;
      setState(
        () => _sent =
            response.data?['message'] as String? ??
            'If that email has an account, a reset link is on its way.',
      );
    } on DioException catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.fromDio(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      title: 'Forgot password',
      subtitle: 'We will email you a link to set a new password.',
      footer: Center(
        child: TextButton(
          onPressed: () => context.go(AuthPaths.signIn),
          child: const Text('Back to sign in'),
        ),
      ),
      children: [
        if (_sent != null) ...[
          MessageBanner(
            message: _sent!,
            tone: StatusTone.emerald,
            icon: LucideIcons.mail,
          ),
          const SizedBox(height: AppSpace.md),
          const Text(
            'Open the link in the email, set your new password on the website, then sign in here.',
            style: TextStyle(color: AppColors.stone600),
          ),
        ] else ...[
          if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
            MessageBanner(message: _failure!.message),
            const SizedBox(height: AppSpace.lg),
          ],
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppTextField(
                  label: 'Email',
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  inputFormatters: [Only.noSpaces],
                  maxLength: 100,
                  validator: Rules.email,
                  serverError: _failure?.errorFor('email'),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: AppSpace.lg),
                SubmitButton(
                  label: 'Send reset link',
                  busyLabel: 'Sending…',
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
