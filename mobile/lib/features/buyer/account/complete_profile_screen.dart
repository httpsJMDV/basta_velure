import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/session/app_user.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../../auth/auth_layout.dart';
import '../addresses/place_picker.dart';
import '../data/account.dart';
import '../widgets/buyer_widgets.dart';
import 'id_upload.dart';

/// Complete profile (B2) for a Google sign-up, in the website's three steps: birthday, sex and mobile number, then an
/// address, then a government ID. The app opens nothing else until it is done, like the website's
/// `/complete-profile`. The address is saved to the address book with its PSGC codes, ready for checkout, and the
/// Google picture (saved by the server at sign-in) is the profile photo unless another one is chosen here.
class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  ConsumerState<CompleteProfileScreen> createState() =>
      _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  static const _steps = ['About you', 'Address', 'Valid ID'];
  static const _hints = [
    'Your photo, birthday and mobile number.',
    'Where should we deliver your orders? This becomes your default address.',
    'A government-issued ID, so we know it is really you.',
  ];

  /// Which step shows each field the server can complain about.
  static const _stepOfField = {
    'avatar': 0,
    'date_of_birth': 0,
    'sex': 0,
    'phone': 0,
    'region': 1,
    'region_code': 1,
    'province': 1,
    'province_code': 1,
    'city_municipality': 1,
    'city_code': 1,
    'barangay': 1,
    'barangay_code': 1,
    'street_address': 1,
    'government_id_type': 2,
    'government_id_image': 2,
    'government_id_image_back': 2,
  };

  final _forms = [
    GlobalKey<FormState>(),
    GlobalKey<FormState>(),
    GlobalKey<FormState>(),
  ];
  final _scroll = ScrollController();
  int _step = 0;
  final _phone = TextEditingController();
  final _street = TextEditingController();
  DateTime? _birthday;
  String? _sex;
  PickedPlace _place = const PickedPlace();
  GovernmentId? _idType;
  PickedPhoto? _front;
  PickedPhoto? _back;
  PickedPhoto? _avatar;
  bool _showErrors = false;
  ApiFailure? _failure;
  (int, int)? _progress;

  @override
  void dispose() {
    _scroll.dispose();
    _phone.dispose();
    _street.dispose();
    super.dispose();
  }

  void _goTo(int step) {
    setState(() {
      _step = step;
      _showErrors = false;
    });
    _toTop();
  }

  void _toTop() {
    if (_scroll.hasClients) {
      _scroll.animateTo(0, duration: kMotion, curve: Curves.easeOut);
    }
  }

  Future<void> _pickAvatar() async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo for your profile.',
      );
      if (photo != null && mounted) setState(() => _avatar = photo);
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    }
  }

  bool _stepIsDone(int step) {
    final needsBack = _idType?.hasBack ?? false;
    return switch (step) {
      0 => _sex != null && _birthday != null,
      1 => _place.isComplete,
      _ => _idType != null && _front != null && (!needsBack || _back != null),
    };
  }

  Future<void> _continue() async {
    FocusScope.of(context).unfocus();
    final fieldsOk = _forms[_step].currentState?.validateAndReveal() ?? false;
    if (!fieldsOk || !_stepIsDone(_step)) {
      setState(() => _showErrors = true);
      return;
    }
    if (_step < _steps.length - 1) return _goTo(_step + 1);

    // Every step again, in case one was changed after it was checked.
    for (var step = 0; step < _steps.length; step++) {
      if (!_stepIsDone(step)) {
        _goTo(step);
        setState(() => _showErrors = true);
        return;
      }
    }

    setState(() {
      _failure = null;
      _progress = null;
    });
    final needsBack = _idType!.hasBack;
    try {
      final form = FormData.fromMap({
        'phone': Rules.normalizeMobile(_phone.text) ?? _phone.text.trim(),
        'date_of_birth': Rules.ymd(_birthday!),
        'sex': _sex,
        ..._place.toFields(),
        'street_address': _street.text.trim(),
        'government_id_type': _idType!.key,
        'government_id_image': _front!.toMultipart(),
        if (needsBack) 'government_id_image_back': _back!.toMultipart(),
        if (_avatar != null) 'avatar': _avatar!.toMultipart(),
      });
      await ref
          .read(dioProvider)
          .post<Object?>(
            '/auth/complete-profile',
            data: form,
            onSendProgress: (sent, total) {
              if (mounted && total > 0) {
                setState(() => _progress = (sent, total));
              }
            },
          );
    } catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.from(error);
      setState(() {
        _failure = failure;
        _progress = null;
      });
      // Open the first step the server found a problem in, so its message is seen.
      final wrong = failure.fieldErrors.keys
          .map((field) => _stepOfField[field])
          .whereType<int>();
      if (wrong.isNotEmpty) {
        _goTo(wrong.reduce((a, b) => a < b ? a : b));
      } else {
        _toTop();
      }
      return;
    }

    // Saved. The router opens the shop once the account has a birthday and a mobile number; if that check can't
    // reach the server, the profile is still saved and the next start opens the shop.
    try {
      await ref.read(sessionProvider.notifier).refreshUser();
    } catch (_) {
      if (mounted) {
        setState(() => _progress = null);
        showSnack(
          context,
          "Your profile is saved. We couldn't open the shop just now: check your connection and tap Finish again.",
        );
      }
    }
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

  /// A message the fields don't show: no field named, or only fields this form has no box for.
  String? get _banner {
    final failure = _failure;
    if (failure == null) return null;
    if (failure.fieldErrors.isEmpty) return failure.message;
    final shown = failure.fieldErrors.keys.any(_stepOfField.containsKey);
    return shown ? null : failure.fieldErrors.values.first;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final name = user?.firstName ?? '';
    final last = _step == _steps.length - 1;
    final banner = _banner;
    String? required(Object? value, String message) =>
        _showErrors && value == null ? message : null;

    return AuthLayout(
      title: name.isEmpty ? 'Almost done' : 'Almost done, $name',
      subtitle: _hints[_step],
      photo: AuthPhoto.rack,
      controller: _scroll,
      onBack: _step > 0 ? () => _goTo(_step - 1) : null,
      bottomBar: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_progress != null) ...[
            UploadProgress(sent: _progress!.$1, total: _progress!.$2),
            const SizedBox(height: AppSpace.sm),
          ],
          SubmitButton(
            label: last ? 'Finish' : 'Continue',
            busyLabel: 'Saving your profile…',
            icon: last ? LucideIcons.check : null,
            onPressed: _continue,
          ),
        ],
      ),
      footer: const Align(
        alignment: Alignment.center,
        child: SignOutButton.compact(),
      ),
      children: [
        AuthStepBar(steps: _steps, current: _step),
        const SizedBox(height: AppSpace.xl),
        if (banner != null) ...[
          MessageBanner(message: banner),
          const SizedBox(height: AppSpace.md),
        ],
        _page(0, [
          _ProfilePhotoRow(
            user: user,
            picked: _avatar,
            error: _failure?.errorFor('avatar'),
            onChange: _pickAvatar,
          ),
          const SizedBox(height: AppSpace.lg),
          DateOfBirthField(
            serverError: _failure?.errorFor('date_of_birth'),
            onChanged: (value) => _birthday = value,
          ),
          const SizedBox(height: AppSpace.md),
          AppSelectField<String>(
            label: 'Sex',
            value: _sex,
            errorText:
                _failure?.errorFor('sex') ?? required(_sex, 'Choose one.'),
            options: const [
              AppOption('male', 'Male'),
              AppOption('female', 'Female'),
              AppOption('prefer_not_to_say', 'Prefer not to say'),
            ],
            onChanged: (value) => setState(() => _sex = value),
          ),
          const SizedBox(height: AppSpace.md),
          AppTextField(
            label: 'Mobile number',
            controller: _phone,
            prefixIcon: LucideIcons.smartphone,
            hint: '09XXXXXXXXX',
            keyboardType: TextInputType.phone,
            inputFormatters: [Only.mobileChars, Only.max(13)],
            validator: Rules.mobile,
            serverError: _failure?.errorFor('phone'),
          ),
        ]),
        _page(1, [
          PlaceFields(
            value: _place,
            showErrors: _showErrors,
            serverError:
                _failure?.errorFor('barangay_code') ??
                _failure?.errorFor('city_code') ??
                _failure?.errorFor('province_code') ??
                _failure?.errorFor('barangay'),
            onChanged: (place) => setState(() => _place = place),
          ),
          AppTextField(
            label: 'Street, house or building',
            controller: _street,
            prefixIcon: LucideIcons.house,
            textCapitalization: TextCapitalization.words,
            maxLength: 255,
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Enter the street, house or building.'
                : null,
            serverError: _failure?.errorFor('street_address'),
          ),
          const SizedBox(height: AppSpace.xs),
          const _Note(
            icon: LucideIcons.bookMarked,
            text: 'Saved as your Home address. You can add more under Account › Addresses.',
          ),
        ]),
        _page(2, [
          IdUpload(
            type: _idType,
            front: _front,
            back: _back,
            showErrors: _showErrors,
            typeError: _failure?.errorFor('government_id_type'),
            frontError: _failure?.errorFor('government_id_image'),
            backError: _failure?.errorFor('government_id_image_back'),
            onType: (type) => setState(() => _idType = type),
            onFront: (photo) => setState(() => _front = photo),
            onBack: (photo) => setState(() => _back = photo),
          ),
        ]),
      ],
    );
  }
}

/// The profile photo: the one just chosen, else the account's (the Google picture), else the initials.
class _ProfilePhotoRow extends StatelessWidget {
  const _ProfilePhotoRow({
    required this.user,
    required this.picked,
    required this.onChange,
    this.error,
  });

  final AppUser? user;
  final PickedPhoto? picked;
  final VoidCallback onChange;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final url = user?.avatarUrl;
    final initials = [
      user?.firstName,
      user?.lastName,
    ].whereType<String>().where((p) => p.isNotEmpty).map((p) => p[0]).join();
    final Widget photo = picked != null
        ? Image.memory(Uint8List.fromList(picked!.bytes), fit: BoxFit.cover)
        : url != null
        ? NetImage(url, width: 64, height: 64, icon: LucideIcons.userRound)
        : Container(
            color: AppColors.brandRedTint,
            alignment: Alignment.center,
            child: Text(
              initials.toUpperCase(),
              style: const TextStyle(
                fontFamily: 'NotoSerif',
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: AppColors.brandRedDark,
              ),
            ),
          );
    final caption = picked != null
        ? 'New photo, saved when you finish'
        : url != null
        ? 'From your Google account'
        : 'No profile photo yet (optional)';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpace.md),
          decoration: BoxDecoration(
            color: AppColors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.stone200),
          ),
          child: Row(
            children: [
              ClipOval(child: SizedBox.square(dimension: 64, child: photo)),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.fullName ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.stone900,
                      ),
                    ),
                    Text(
                      user?.email ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: AppColors.stone500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      caption,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.stone600,
                      ),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onChange,
                child: Text(picked != null || url != null ? 'Change' : 'Add'),
              ),
            ],
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 2),
            child: Text(
              error!,
              style: TextStyle(fontSize: 12, color: StatusTone.rose.foreground),
            ),
          ),
      ],
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: AppColors.stone500),
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.4,
              color: AppColors.stone600,
            ),
          ),
        ),
      ],
    );
  }
}
