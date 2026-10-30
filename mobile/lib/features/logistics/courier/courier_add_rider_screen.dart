import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/account/account_forms.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';

/// Add a rider (D7). The rider gets an email link to set their password; it works once, for 24 hours.
class CourierAddRiderScreen extends ConsumerStatefulWidget {
  const CourierAddRiderScreen({super.key});

  @override
  ConsumerState<CourierAddRiderScreen> createState() =>
      _CourierAddRiderScreenState();
}

class _CourierAddRiderScreenState extends ConsumerState<CourierAddRiderScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _license = TextEditingController();
  final _plate = TextEditingController();
  DateTime? _birthday;
  DateTime? _expiry;
  String? _vehicle;
  int? _hubId;
  List<OpsHub> _hubs = const [];
  PickedPhoto? _licensePhoto;
  PickedPhoto? _orCrPhoto;
  String? _licensePhotoError;
  String? _orCrError;
  ApiFailure? _failure;
  (int, int)? _progress;

  @override
  void initState() {
    super.initState();
    _loadHubs();
  }

  @override
  void dispose() {
    for (final box in [
      _first,
      _middle,
      _last,
      _email,
      _phone,
      _license,
      _plate,
    ]) {
      box.dispose();
    }
    super.dispose();
  }

  Future<void> _loadHubs() async {
    try {
      final ops = await ref.read(courierApiProvider).hubOps();
      if (mounted) setState(() => _hubs = ops.hubs);
    } catch (_) {
      // The hub is optional: the server uses the company's main hub without one.
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final ok = _form.currentState!.validate();
    setState(() {
      _failure = null;
      _licensePhotoError = _licensePhoto == null
          ? "Add a photo of the driver's license."
          : null;
      _orCrError = _orCrPhoto == null
          ? 'Add a photo of the vehicle OR/CR.'
          : null;
    });
    if (!ok || _licensePhoto == null || _orCrPhoto == null) return;

    final middle = Rules.squish(_middle.text);
    try {
      final message = await ref
          .read(courierApiProvider)
          .addRider(
            {
              'first_name': Rules.squish(_first.text),
              if (middle.isNotEmpty) 'middle_name': middle,
              'last_name': Rules.squish(_last.text),
              'date_of_birth': Rules.ymd(_birthday!),
              'email': Rules.normalizeEmail(_email.text),
              'phone': Rules.normalizeMobile(_phone.text),
              'license_number': Rules.normalizeLicenseNumber(_license.text),
              'license_expiry': Rules.ymd(_expiry!),
              'vehicle_type': _vehicle,
              'plate_number': Rules.normalizePlateNumber(_plate.text),
              'sorting_center_id': ?_hubId,
            },
            license: _licensePhoto!,
            orCr: _orCrPhoto!,
            onSendProgress: (sent, total) {
              if (mounted) setState(() => _progress = (sent, total));
            },
          );
      if (!mounted) return;
      showRiderMessage(context, message);
      Navigator.of(context).pop();
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _failure = failure;
        _progress = null;
        _licensePhotoError = failure.errorFor('drivers_license_image');
        _orCrError = failure.errorFor('or_cr_image');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Add rider')),
      body: Form(
        key: _form,
        // Not a lazy list: a field scrolled out of a ListView is unmounted, and validate() skips it.
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (banner != null) ...[
                MessageBanner(message: banner),
                const SizedBox(height: AppSpace.lg),
              ],
              AppTextField(
                label: 'First name',
                controller: _first,
                textCapitalization: TextCapitalization.words,
                inputFormatters: [Only.nameChars],
                maxLength: 50,
                validator: (v) => Rules.name(v, 'First name'),
                serverError: failure?.errorFor('first_name'),
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Middle name (optional)',
                controller: _middle,
                textCapitalization: TextCapitalization.words,
                inputFormatters: [Only.nameChars],
                maxLength: 50,
                validator: (v) => Rules.name(v, 'Middle name', required: false),
                serverError: failure?.errorFor('middle_name'),
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Last name',
                controller: _last,
                textCapitalization: TextCapitalization.words,
                inputFormatters: [Only.nameChars],
                maxLength: 50,
                validator: (v) => Rules.name(v, 'Last name'),
                serverError: failure?.errorFor('last_name'),
              ),
              const SizedBox(height: AppSpace.md),
              DateOfBirthField(
                serverError: failure?.errorFor('date_of_birth'),
                onChanged: (date) => _birthday = date,
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Email',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                inputFormatters: [Only.noSpaces],
                maxLength: 100,
                validator: Rules.email,
                serverError: failure?.errorFor('email'),
              ),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'Mobile number',
                hint: '09XXXXXXXXX',
                controller: _phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [Only.mobileChars, Only.max(13)],
                validator: Rules.mobile,
                serverError: failure?.errorFor('phone'),
              ),
              const SizedBox(height: AppSpace.xl),
              LicenseNumberField(
                controller: _license,
                serverError: failure?.errorFor('license_number'),
              ),
              const SizedBox(height: AppSpace.md),
              LicenseExpiryField(
                serverError: failure?.errorFor('license_expiry'),
                onChanged: (date) => _expiry = date,
              ),
              const SizedBox(height: AppSpace.lg),
              VehicleTypeField(
                serverError: failure?.errorFor('vehicle_type'),
                onChanged: (type) => _vehicle = type,
              ),
              const SizedBox(height: AppSpace.md),
              PlateField(
                controller: _plate,
                serverError: failure?.errorFor('plate_number'),
              ),
              if (_hubs.isNotEmpty) ...[
                const SizedBox(height: AppSpace.lg),
                DropdownButtonFormField<int>(
                  initialValue: _hubId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: 'Hub they start from (optional)',
                    errorText: failure?.errorFor('sorting_center_id'),
                  ),
                  items: [
                    for (final hub in _hubs)
                      DropdownMenuItem(value: hub.id, child: Text(hub.name)),
                  ],
                  onChanged: (id) => setState(() => _hubId = id),
                ),
              ],
              const SizedBox(height: AppSpace.lg),
              DocumentPhotoField(
                label: "Driver's license",
                photo: _licensePhoto,
                error: _licensePhotoError,
                reason:
                    'Take a clear photo of the front of the driver\'s license.',
                onPicked: (photo) => setState(() {
                  _licensePhoto = photo;
                  _licensePhotoError = null;
                }),
              ),
              const SizedBox(height: AppSpace.md),
              DocumentPhotoField(
                label: 'Vehicle OR/CR',
                photo: _orCrPhoto,
                error: _orCrError,
                reason: 'Take a clear photo of the vehicle OR/CR.',
                onPicked: (photo) => setState(() {
                  _orCrPhoto = photo;
                  _orCrError = null;
                }),
              ),
              const SizedBox(height: AppSpace.xl),
              if (_progress != null) ...[
                UploadProgress(sent: _progress!.$1, total: _progress!.$2),
                const SizedBox(height: AppSpace.sm),
              ],
              SubmitButton(
                label: 'Add rider',
                busyLabel: 'Adding…',
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
