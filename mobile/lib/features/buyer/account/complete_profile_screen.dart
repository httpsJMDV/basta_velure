import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../../auth/auth_layout.dart';
import '../addresses/psgc.dart';
import '../data/account.dart';
import 'id_upload.dart';

/// Complete profile (B2) for a Google sign-up, in the website's three steps: birthday, sex and mobile number, then an
/// address, then a government ID. The app opens nothing else until it is done, like the website's
/// `/complete-profile`.
class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  ConsumerState<CompleteProfileScreen> createState() =>
      _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  static const _steps = ['About you', 'Address', 'Valid ID'];
  static const _hints = [
    'Your mobile number and birthday.',
    'Where should we deliver your orders?',
    'A government-issued ID, so we know it is really you.',
  ];

  /// Which step shows each field the server can complain about.
  static const _stepOfField = {
    'date_of_birth': 0,
    'sex': 0,
    'phone': 0,
    'province': 1,
    'city_municipality': 1,
    'barangay': 1,
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
  PsgcPlace? _region;
  PsgcPlace? _province;
  PsgcPlace? _city;
  PsgcPlace? _barangay;
  GovernmentId? _idType;
  PickedPhoto? _front;
  PickedPhoto? _back;
  bool _showErrors = false;
  ApiFailure? _failure;

  @override
  void dispose() {
    _scroll.dispose();
    _phone.dispose();
    _street.dispose();
    super.dispose();
  }

  Future<void> _pick(
    String title,
    Future<List<PsgcPlace>> Function() load,
    ValueChanged<PsgcPlace> onPicked,
  ) async {
    final picked = await showModalBottomSheet<PsgcPlace>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: FutureBuilder<List<PsgcPlace>>(
          future: load(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return ErrorRetry(failure: ApiFailure.from(snapshot.error!));
            }
            if (!snapshot.hasData) return const SkeletonList();
            return ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpace.lg,
                    0,
                    AppSpace.lg,
                    AppSpace.sm,
                  ),
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                for (final place in snapshot.data!)
                  ListTile(
                    title: Text(place.name),
                    onTap: () => Navigator.of(context).pop(place),
                  ),
              ],
            );
          },
        ),
      ),
    );
    if (picked != null && mounted) setState(() => onPicked(picked));
  }

  void _goTo(int step) {
    setState(() {
      _step = step;
      _showErrors = false;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _continue() async {
    FocusScope.of(context).unfocus();
    final fieldsOk = _forms[_step].currentState!.validateAndReveal();
    final needsBack = _idType?.hasBack ?? false;
    final picksOk = switch (_step) {
      0 => _sex != null,
      1 => _province != null && _city != null && _barangay != null,
      _ => _idType != null && _front != null && (!needsBack || _back != null),
    };
    if (!fieldsOk || !picksOk) {
      setState(() => _showErrors = true);
      return;
    }
    if (_step < _steps.length - 1) return _goTo(_step + 1);

    setState(() => _failure = null);
    try {
      final form = FormData.fromMap({
        'phone': Rules.normalizeMobile(_phone.text) ?? _phone.text.trim(),
        'date_of_birth': Rules.ymd(_birthday!),
        'sex': _sex,
        'province': _province!.name,
        'city_municipality': _city!.name,
        'barangay': _barangay!.name,
        'street_address': _street.text.trim(),
        'government_id_type': _idType!.key,
        'government_id_image': _front!.toMultipart(),
        if (needsBack) 'government_id_image_back': _back!.toMultipart(),
      });
      await ref
          .read(dioProvider)
          .post<Object?>('/auth/complete-profile', data: form);
      // The router opens the shop once the profile has a birthday and a mobile number.
      await ref.read(sessionProvider.notifier).refreshUser();
    } on DioException catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.fromDio(error);
      setState(() => _failure = failure);
      // Open the first step the server found a problem in, so its message is seen.
      final wrong = failure.fieldErrors.keys
          .map((field) => _stepOfField[field])
          .whereType<int>();
      if (wrong.isNotEmpty) _goTo(wrong.reduce((a, b) => a < b ? a : b));
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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isNcr = _region?.code == ncrCode;
    final name = user?.firstName ?? '';
    final last = _step == _steps.length - 1;
    String? required(Object? value, String message) =>
        _showErrors && value == null ? message : null;

    return AuthLayout(
      title: name.isEmpty ? 'Almost done' : 'Almost done, $name',
      subtitle: _hints[_step],
      photo: AuthPhoto.rack,
      controller: _scroll,
      onBack: _step > 0 ? () => _goTo(_step - 1) : null,
      bottomBar: SubmitButton(
        label: last ? 'Finish' : 'Continue',
        busyLabel: 'Saving…',
        icon: last ? LucideIcons.check : null,
        onPressed: _continue,
      ),
      footer: const Align(alignment: Alignment.center, child: SignOutButton()),
      children: [
        AuthStepBar(steps: _steps, current: _step),
        const SizedBox(height: AppSpace.xl),
        if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
          MessageBanner(message: _failure!.message),
          const SizedBox(height: AppSpace.md),
        ],
        _page(0, [
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
          _Picker(
            label: 'Region',
            value: _region?.name,
            error: required(_region, 'Choose the region.'),
            onTap: () => _pick('Region', () async => phRegions, (region) {
              _region = region;
              _province = region.code == ncrCode
                  ? const PsgcPlace(ncrCode, ncrProvinceName)
                  : null;
              _city = null;
              _barangay = null;
            }),
          ),
          if (!isNcr)
            _Picker(
              label: 'Province',
              value: _province?.name,
              error: _region == null
                  ? null
                  : required(_province, 'Choose the province.'),
              onTap: _region == null
                  ? null
                  : () => _pick(
                      'Province',
                      () => ref.read(psgcProvider).provinces(_region!.code),
                      (province) {
                        _province = province;
                        _city = null;
                        _barangay = null;
                      },
                    ),
            ),
          _Picker(
            label: 'City or municipality',
            value: _city?.name,
            error: _province == null
                ? null
                : required(_city, 'Choose the city or municipality.'),
            onTap: _province == null
                ? null
                : () => _pick(
                    'City or municipality',
                    () => ref
                        .read(psgcProvider)
                        .cities(
                          regionCode: _region!.code,
                          provinceCode: _province!.code,
                        ),
                    (city) {
                      _city = city;
                      _barangay = null;
                    },
                  ),
          ),
          _Picker(
            label: 'Barangay',
            value: _barangay?.name,
            error: _city == null
                ? null
                : required(_barangay, 'Choose the barangay.'),
            onTap: _city == null
                ? null
                : () => _pick(
                    'Barangay',
                    () => ref.read(psgcProvider).barangays(_city!.code),
                    (b) => _barangay = b,
                  ),
          ),
          AppTextField(
            label: 'Street, house or building',
            controller: _street,
            maxLength: 255,
            validator: (value) => (value ?? '').trim().isEmpty
                ? 'Enter the street, house or building.'
                : null,
            serverError: _failure?.errorFor('street_address'),
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

class _Picker extends StatelessWidget {
  const _Picker({
    required this.label,
    required this.value,
    required this.onTap,
    this.error,
  });

  final String label;
  final String? value;
  final VoidCallback? onTap;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.cardAll,
        child: InputDecorator(
          isEmpty: value == null,
          decoration: InputDecoration(
            labelText: label,
            enabled: onTap != null,
            errorText: error,
            suffixIcon: const Icon(LucideIcons.chevronDown, size: 18),
          ),
          child: Text(value ?? '', style: const TextStyle(fontSize: 16)),
        ),
      ),
    );
  }
}
