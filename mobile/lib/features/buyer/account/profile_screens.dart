import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/buyer_widgets.dart';

/// Sends a request and returns the server's message, or throws [ApiFailure].
Future<String> _send(
  WidgetRef ref,
  String path,
  Object data, {
  String method = 'POST',
}) async {
  try {
    final response = await ref
        .read(dioProvider)
        .request<Json>(
          path,
          data: data,
          options: Options(method: method),
        );
    return asString(response.data?['message']) ?? 'Saved.';
  } on DioException catch (error) {
    throw ApiFailure.fromDio(error);
  }
}

const _sexes = {
  'male': 'Male',
  'female': 'Female',
  'prefer_not_to_say': 'Prefer not to say',
};

/// Name, birthday, sex and profile photo (B13). Email and mobile number change on their own screens with a code.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  late final user = ref.read(currentUserProvider)!;
  late final _first = TextEditingController(text: user.firstName);
  late final _middle = TextEditingController(text: user.middleName ?? '');
  late final _last = TextEditingController(text: user.lastName);
  late DateTime? _birthday = DateTime.tryParse(user.dateOfBirth ?? '');
  late String? _sex = user.sex;
  ApiFailure? _failure;
  bool _uploading = false;

  @override
  void dispose() {
    for (final box in [_first, _middle, _last]) {
      box.dispose();
    }
    super.dispose();
  }

  Future<void> _changePhoto() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo for your profile.',
      );
      if (photo == null) return;
      setState(() => _uploading = true);
      final message = await _send(
        ref,
        '/auth/avatar',
        FormData.fromMap({'avatar': photo.toMultipart()}),
      );
      await ref.read(sessionProvider.notifier).refreshUser();
      if (mounted) showSnack(context, message);
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _save() async {
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await _send(ref, '/auth/profile', {
        'first_name': Rules.squish(_first.text),
        'middle_name': Rules.squish(_middle.text).isEmpty
            ? null
            : Rules.squish(_middle.text),
        'last_name': Rules.squish(_last.text),
        if (_birthday != null) 'date_of_birth': Rules.ymd(_birthday!),
        'sex': _sex,
      }, method: 'PATCH');
      await ref.read(sessionProvider.notifier).refreshUser();
      if (!mounted) return;
      showSnack(context, message);
      context.pop();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final avatar = ref.watch(currentUserProvider)?.avatarUrl;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            Center(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 44,
                    backgroundColor: AppColors.brandRedTint,
                    child: avatar == null
                        ? const Icon(
                            LucideIcons.user,
                            size: 36,
                            color: AppColors.brandRed,
                          )
                        : ClipOval(
                            child: NetImage(avatar, width: 88, height: 88),
                          ),
                  ),
                  TextButton.icon(
                    onPressed: _uploading ? null : _changePhoto,
                    icon: const Icon(LucideIcons.camera, size: 18),
                    label: Text(_uploading ? 'Uploading…' : 'Change photo'),
                  ),
                ],
              ),
            ),
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.md),
            ],
            _NameField(
              controller: _first,
              label: 'First name',
              failure: _failure,
              field: 'first_name',
            ),
            _NameField(
              controller: _middle,
              label: 'Middle name (optional)',
              failure: _failure,
              field: 'middle_name',
              required: false,
            ),
            _NameField(
              controller: _last,
              label: 'Last name',
              failure: _failure,
              field: 'last_name',
            ),
            DateOfBirthField(
              initialValue: _birthday,
              serverError: _failure?.errorFor('date_of_birth'),
              onChanged: (value) => _birthday = value,
            ),
            const SizedBox(height: AppSpace.md),
            DropdownButtonFormField<String>(
              initialValue: _sex,
              decoration: const InputDecoration(labelText: 'Sex'),
              items: [
                for (final entry in _sexes.entries)
                  DropdownMenuItem(value: entry.key, child: Text(entry.value)),
              ],
              onChanged: (value) => setState(() => _sex = value),
            ),
            const SizedBox(height: AppSpace.md),
            InfoRow('Email', user.email),
            InfoRow('Mobile number', user.phoneLocal ?? '—'),
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: 'Save profile',
              busyLabel: 'Saving…',
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

class _NameField extends StatelessWidget {
  const _NameField({
    required this.controller,
    required this.label,
    required this.failure,
    required this.field,
    this.required = true,
  });

  final TextEditingController controller;
  final String label;
  final ApiFailure? failure;
  final String field;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: AppTextField(
        label: label,
        controller: controller,
        keyboardType: TextInputType.name,
        textCapitalization: TextCapitalization.words,
        inputFormatters: [Only.nameChars],
        maxLength: 50,
        validator: (value) => Rules.name(
          value,
          label.replaceAll(' (optional)', ''),
          required: required,
        ),
        serverError: failure?.errorFor(field),
      ),
    );
  }
}

/// Change password (B13): the current one first, and a new one that is different. Other phones and browsers are
/// signed out by the server.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  ApiFailure? _failure;

  @override
  void dispose() {
    for (final box in [_current, _password, _confirm]) {
      box.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await _send(ref, '/auth/change-password', {
        'current_password': _current.text,
        'password': _password.text,
        'password_confirmation': _confirm.text,
      });
      if (!mounted) return;
      showSnack(context, message);
      context.pop();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.md),
            ],
            AppTextField(
              label: 'Current password',
              controller: _current,
              obscure: true,
              autofillHints: const [AutofillHints.password],
              validator: (value) =>
                  (value ?? '').isEmpty ? 'Enter your current password.' : null,
              serverError: _failure?.errorFor('current_password'),
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'New password',
              controller: _password,
              obscure: true,
              autofillHints: const [AutofillHints.newPassword],
              onChanged: (_) => setState(() {}),
              validator: (value) {
                final rule = Rules.password(value);
                if (rule != null) return rule;
                return value == _current.text
                    ? 'Choose a password different from your current one.'
                    : null;
              },
              serverError: _failure?.errorFor('password'),
            ),
            PasswordChecklist(password: _password.text),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Confirm new password',
              controller: _confirm,
              obscure: true,
              validator: (value) =>
                  Rules.passwordConfirmation(_password.text, value),
            ),
            const SizedBox(height: AppSpace.md),
            const Text(
              'Your other phones and browsers will be signed out.',
              style: TextStyle(fontSize: 13, color: AppColors.stone500),
            ),
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: 'Change password',
              busyLabel: 'Saving…',
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

/// Change email (B13): the code goes to the new email; the old one keeps working until it is entered.
class ChangeEmailScreen extends StatelessWidget {
  const ChangeEmailScreen({super.key});

  @override
  Widget build(BuildContext context) => _CodeChangeScreen(
    title: 'Change email',
    fieldLabel: 'New email',
    field: 'email',
    requestPath: '/auth/email-change',
    confirmPath: '/auth/email-change/confirm',
    keyboardType: TextInputType.emailAddress,
    formatters: [Only.noSpaces, Only.max(100)],
    validator: Rules.email,
    normalize: Rules.normalizeEmail,
  );
}

/// Change mobile number (B13): Loved-IT sends no SMS, so the code goes to the account's email.
class ChangePhoneScreen extends StatelessWidget {
  const ChangePhoneScreen({super.key});

  @override
  Widget build(BuildContext context) => _CodeChangeScreen(
    title: 'Change mobile number',
    fieldLabel: 'New mobile number',
    field: 'phone',
    requestPath: '/auth/phone-change',
    confirmPath: '/auth/phone-change/confirm',
    keyboardType: TextInputType.phone,
    formatters: [Only.mobileChars, Only.max(13)],
    validator: Rules.mobile,
    normalize: (value) => Rules.normalizeMobile(value) ?? value.trim(),
  );
}

class _CodeChangeScreen extends ConsumerStatefulWidget {
  const _CodeChangeScreen({
    required this.title,
    required this.fieldLabel,
    required this.field,
    required this.requestPath,
    required this.confirmPath,
    required this.keyboardType,
    required this.formatters,
    required this.validator,
    required this.normalize,
  });

  final String title;
  final String fieldLabel;
  final String field;
  final String requestPath;
  final String confirmPath;
  final TextInputType keyboardType;
  final List<TextInputFormatter> formatters;
  final FormFieldValidator<String> validator;
  final String Function(String) normalize;

  @override
  ConsumerState<_CodeChangeScreen> createState() => _CodeChangeScreenState();
}

class _CodeChangeScreenState extends ConsumerState<_CodeChangeScreen> {
  final _form = GlobalKey<FormState>();
  final _value = TextEditingController();
  final _code = TextEditingController();
  String? _sentMessage;
  ApiFailure? _failure;

  @override
  void dispose() {
    _value.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await _send(ref, widget.requestPath, {
        widget.field: widget.normalize(_value.text),
      });
      if (mounted) setState(() => _sentMessage = message);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _confirm() async {
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await _send(ref, widget.confirmPath, {
        'code': _code.text.trim(),
      });
      await ref.read(sessionProvider.notifier).refreshUser();
      if (!mounted) return;
      showSnack(context, message);
      context.pop();
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final waiting = _sentMessage != null;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.md),
            ],
            AppTextField(
              label: widget.fieldLabel,
              controller: _value,
              enabled: !waiting,
              keyboardType: widget.keyboardType,
              inputFormatters: widget.formatters,
              validator: widget.validator,
              serverError: _failure?.errorFor(widget.field),
            ),
            if (waiting) ...[
              const SizedBox(height: AppSpace.md),
              MessageBanner(
                message: _sentMessage!,
                tone: StatusTone.blue,
                icon: LucideIcons.mail,
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: '6-digit code',
                controller: _code,
                keyboardType: TextInputType.number,
                autofillHints: const [AutofillHints.oneTimeCode],
                inputFormatters: [Only.digits, Only.max(6)],
                validator: Rules.emailCode,
                serverError: _failure?.errorFor('code'),
              ),
              TextButton(
                onPressed: () => setState(() {
                  _sentMessage = null;
                  _code.clear();
                }),
                child: Text(
                  'Use a different ${widget.field == 'email' ? 'email' : 'number'}',
                ),
              ),
            ],
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: waiting ? 'Confirm' : 'Send code',
              busyLabel: waiting ? 'Checking…' : 'Sending…',
              onPressed: waiting ? _confirm : _request,
            ),
          ],
        ),
      ),
    );
  }
}
