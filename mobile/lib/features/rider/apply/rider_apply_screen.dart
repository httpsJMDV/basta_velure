import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/auth_layout.dart';
import '../../auth/auth_routes.dart';
import '../account/account_forms.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import 'hub_search.dart';

/// "Become a rider" (C1): the public application, `POST /auth/register-rider`. It goes to one approved hub, which (or
/// its courier company) approves it; the activation link in the email then opens the website to set a password. A
/// rider account is separate from a shopping account, so the email and mobile must not belong to another account.
class RiderApplyScreen extends ConsumerStatefulWidget {
  const RiderApplyScreen({super.key});

  @override
  ConsumerState<RiderApplyScreen> createState() => _RiderApplyScreenState();
}

class _RiderApplyScreenState extends ConsumerState<RiderApplyScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _middle = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _license = TextEditingController();
  final _plate = TextEditingController();

  PublicHub? _hub;
  DateTime? _birthday;
  DateTime? _expiry;
  String? _vehicle;

  /// `truck`: drives parcels between the courier's hubs, and the courier reviews the application.
  String _duty = 'delivery';
  PickedPhoto? _licensePhoto;
  PickedPhoto? _orCrPhoto;
  String? _licensePhotoError;
  String? _orCrError;
  String? _hubError;
  bool _terms = false;
  String? _termsError;
  ApiFailure? _failure;
  (int, int)? _progress;
  String? _sent;

  @override
  void dispose() {
    for (final c in [
      _first,
      _middle,
      _last,
      _email,
      _phone,
      _license,
      _plate,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickHub() async {
    FocusScope.of(context).unfocus();
    final hub = await showHubSearch(context, selected: _hub);
    if (hub != null && mounted) {
      setState(() {
        _hub = hub;
        _hubError = null;
      });
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final ok = _form.currentState!.validate();
    setState(() {
      _failure = null;
      _hubError = _hub == null ? 'Choose the hub you want to ride for.' : null;
      _licensePhotoError = _licensePhoto == null
          ? "Add a photo of your driver's license."
          : null;
      _orCrError = _orCrPhoto == null
          ? 'Add a photo of the vehicle OR/CR.'
          : null;
      _termsError = _terms
          ? null
          : 'You must accept the Terms of Use and Privacy Policy to apply.';
    });
    if (!ok ||
        _hub == null ||
        _licensePhoto == null ||
        _orCrPhoto == null ||
        !_terms) {
      return;
    }

    try {
      final message = await ref
          .read(riderApiProvider)
          .apply(
            {
              'sorting_center_id': _hub!.id,
              'first_name': Rules.squish(_first.text),
              'middle_name': Rules.squish(_middle.text),
              'last_name': Rules.squish(_last.text),
              'date_of_birth': Rules.ymd(_birthday!),
              'email': Rules.normalizeEmail(_email.text),
              'phone': Rules.normalizeMobile(_phone.text),
              'license_number': Rules.normalizeLicenseNumber(_license.text),
              'license_expiry': Rules.ymd(_expiry!),
              'duty': _duty,
              'vehicle_type': _vehicle,
              'plate_number': Rules.normalizePlateNumber(_plate.text),
              'accept_terms': '1',
            },
            license: _licensePhoto!,
            orCr: _orCrPhoto!,
            onSendProgress: (sent, total) {
              if (mounted) setState(() => _progress = (sent, total));
            },
          );
      if (mounted) setState(() => _sent = message);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _failure = failure;
        _progress = null;
        _hubError = failure.errorFor('sorting_center_id');
        _licensePhotoError = failure.errorFor('drivers_license_image');
        _orCrError = failure.errorFor('or_cr_image');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_sent != null) {
      return AuthLayout(
        title: 'Application sent',
        subtitle: _sent,
        photo: AuthPhoto.rider,
        children: [
          const MessageBanner(
            tone: StatusTone.blue,
            message:
                'Once the hub approves you, open the activation link in the email to set your password. Then sign '
                'in here with that email.',
          ),
          const SizedBox(height: AppSpace.xl),
          FilledButton(
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: () => context.go(AuthPaths.signIn),
            child: const Text('Back to sign in'),
          ),
        ],
      );
    }

    final failure = _failure;
    final banner = failure != null && failure.kind != FailureKind.validation
        ? failure.message
        : null;
    final rose = StatusTone.rose.foreground;
    final termsError = _termsError ?? failure?.errorFor('accept_terms');

    return AuthLayout(
      title: 'Become a rider',
      subtitle: 'Deliver Loved-IT parcels for a hub near you. Use an email that is not on another Loved-IT account.',
      photo: AuthPhoto.rider,
      onBack: () => context.go(AuthPaths.signIn),
      footer: TextButton(
        onPressed: () => context.go(AuthPaths.signIn),
        child: const Text('Already a rider? Sign in'),
      ),
      children: [
        if (banner != null) ...[
          MessageBanner(message: banner),
          const SizedBox(height: AppSpace.lg),
        ],
        Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Job', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: AppSpace.xs),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'delivery', label: Text('Rider')),
                  ButtonSegment(value: 'truck', label: Text('Truck driver')),
                ],
                selected: {_duty},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() {
                  _duty = s.first;
                  _vehicle = null;
                }),
              ),
              const SizedBox(height: AppSpace.xs),
              Text(
                _duty == 'truck'
                    ? 'Drive parcels from one hub to another. The courier company reviews you and pays per trip. Pick your home hub below.'
                    : 'Pick up from shops and deliver to buyers. The hub reviews you.',
                style: const TextStyle(fontSize: 13, color: AppColors.stone600),
              ),
              const SizedBox(height: AppSpace.lg),
              HubField(hub: _hub, error: _hubError, onTap: _pickHub),
              const SizedBox(height: AppSpace.lg),
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
                key: ValueKey(_duty),
                types: _duty == 'truck' ? Rules.truckTypes : Rules.vehicleTypes,
                serverError: failure?.errorFor('vehicle_type'),
                onChanged: (type) => _vehicle = type,
              ),
              const SizedBox(height: AppSpace.md),
              PlateField(
                controller: _plate,
                serverError: failure?.errorFor('plate_number'),
              ),
              const SizedBox(height: AppSpace.lg),
              DocumentPhotoField(
                label: "Driver's license",
                photo: _licensePhoto,
                error: _licensePhotoError,
                reason: 'Take a clear photo of the front of your driver\'s license.',
                onPicked: (p) => setState(() {
                  _licensePhoto = p;
                  _licensePhotoError = null;
                }),
              ),
              const SizedBox(height: AppSpace.md),
              DocumentPhotoField(
                label: 'Vehicle OR/CR',
                photo: _orCrPhoto,
                error: _orCrError,
                reason: 'Take a clear photo of the vehicle OR/CR.',
                onPicked: (p) => setState(() {
                  _orCrPhoto = p;
                  _orCrError = null;
                }),
              ),
              const SizedBox(height: AppSpace.lg),
              CheckboxListTile(
                value: _terms,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                onChanged: (v) => setState(() {
                  _terms = v ?? false;
                  _termsError = null;
                }),
                title: const Text(
                  'I accept the Terms of Use and Privacy Policy',
                ),
                subtitle: termsError == null
                    ? null
                    : Text(termsError, style: TextStyle(color: rose)),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => openWebsite('/terms-of-service'),
                  icon: const Icon(LucideIcons.externalLink, size: 16),
                  label: const Text('Read the terms'),
                ),
              ),
              const SizedBox(height: AppSpace.lg),
              if (_progress != null) ...[
                UploadProgress(sent: _progress!.$1, total: _progress!.$2),
                const SizedBox(height: AppSpace.sm),
              ],
              SubmitButton(
                label: 'Send application',
                busyLabel: 'Sending…',
                onPressed: _submit,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
