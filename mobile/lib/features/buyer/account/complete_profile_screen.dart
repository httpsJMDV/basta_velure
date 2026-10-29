import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../addresses/psgc.dart';
import '../data/account.dart';
import 'id_upload.dart';

/// Complete profile (B2) for a Google sign-up: birthday, sex, mobile number, an address and a government ID. The
/// app opens nothing else until it is done, like the website's `/complete-profile`.
class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key});

  @override
  ConsumerState<CompleteProfileScreen> createState() =>
      _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  final _form = GlobalKey<FormState>();
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

  Future<void> _submit() async {
    setState(() {
      _showErrors = true;
      _failure = null;
    });
    final fieldsOk = _form.currentState!.validate();
    final needsBack = _idType?.hasBack ?? false;
    if (!fieldsOk ||
        _sex == null ||
        _province == null ||
        _city == null ||
        _barangay == null ||
        _idType == null ||
        _front == null ||
        (needsBack && _back == null)) {
      return;
    }
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
      if (mounted) setState(() => _failure = ApiFailure.fromDio(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final isNcr = _region?.code == ncrCode;
    String? required(Object? value, String message) =>
        _showErrors && value == null ? message : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Finish your profile'),
        automaticallyImplyLeading: false,
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            Text(
              'Hi, ${user?.firstName ?? 'there'}!',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: AppSpace.xs),
            const Text(
              'A few details before your first order. Loved-IT checks every buyer\'s ID to keep shops and riders safe.',
              style: TextStyle(color: AppColors.stone600),
            ),
            const SizedBox(height: AppSpace.lg),
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.md),
            ],
            DateOfBirthField(
              serverError: _failure?.errorFor('date_of_birth'),
              onChanged: (value) => _birthday = value,
            ),
            const SizedBox(height: AppSpace.md),
            DropdownButtonFormField<String>(
              initialValue: _sex,
              decoration: InputDecoration(
                labelText: 'Sex',
                errorText:
                    _failure?.errorFor('sex') ?? required(_sex, 'Choose one.'),
              ),
              items: const [
                DropdownMenuItem(value: 'male', child: Text('Male')),
                DropdownMenuItem(value: 'female', child: Text('Female')),
                DropdownMenuItem(
                  value: 'prefer_not_to_say',
                  child: Text('Prefer not to say'),
                ),
              ],
              onChanged: (value) => setState(() => _sex = value),
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Mobile number',
              controller: _phone,
              hint: '09XXXXXXXXX',
              keyboardType: TextInputType.phone,
              inputFormatters: [Only.mobileChars, Only.max(13)],
              validator: Rules.mobile,
              serverError: _failure?.errorFor('phone'),
            ),
            const SizedBox(height: AppSpace.xl),
            Text('Address', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: AppSpace.sm),
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
            const SizedBox(height: AppSpace.xl),
            Text(
              'Government ID',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: AppSpace.sm),
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
            const SizedBox(height: AppSpace.xl),
            SubmitButton(
              label: 'Finish',
              busyLabel: 'Saving…',
              icon: LucideIcons.check,
              onPressed: _submit,
            ),
            const SizedBox(height: AppSpace.md),
            const Align(alignment: Alignment.center, child: SignOutButton()),
          ],
        ),
      ),
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
