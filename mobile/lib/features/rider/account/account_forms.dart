import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/rider_widgets.dart';

/// The vehicle type picker (Motorcycle, Tricycle, Car or Van), shared by the account and the application form.
class VehicleTypeField extends FormField<String> {
  VehicleTypeField({
    super.key,
    super.initialValue,
    String? serverError,
    ValueChanged<String>? onChanged,
  }) : super(
         validator: Rules.vehicleType,
         builder: (field) => Column(
           crossAxisAlignment: CrossAxisAlignment.start,
           children: [
             const Text('Vehicle', style: RiderText.label),
             const SizedBox(height: AppSpace.xs),
             Wrap(
               spacing: AppSpace.sm,
               runSpacing: AppSpace.sm,
               children: [
                 for (final type in Rules.vehicleTypes)
                   ChoiceChip(
                     label: Text(type),
                     selected: field.value == type,
                     materialTapTargetSize: MaterialTapTargetSize.padded,
                     onSelected: (_) {
                       field.didChange(type);
                       onChanged?.call(type);
                     },
                   ),
               ],
             ),
             if (field.errorText != null || serverError != null)
               Padding(
                 padding: const EdgeInsets.only(top: AppSpace.xs),
                 child: Text(
                   field.errorText ?? serverError!,
                   style: TextStyle(
                     color: StatusTone.rose.foreground,
                     fontSize: 13,
                   ),
                 ),
               ),
           ],
         ),
       );
}

/// A required or optional document photo: license or OR/CR. Camera or gallery, shrunk before it leaves the phone.
class DocumentPhotoField extends StatelessWidget {
  const DocumentPhotoField({
    super.key,
    required this.label,
    required this.photo,
    required this.onPicked,
    this.error,
    this.reason = 'Take a clear photo of the whole document.',
  });

  final String label;
  final PickedPhoto? photo;
  final ValueChanged<PickedPhoto> onPicked;
  final String? error;
  final String reason;

  @override
  Widget build(BuildContext context) {
    final rose = StatusTone.rose.foreground;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(label, style: RiderText.label),
        const SizedBox(height: AppSpace.xs),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(56),
            side: BorderSide(color: error != null ? rose : AppColors.stone300),
          ),
          onPressed: () async {
            try {
              final picked = await PhotoPicker().pick(
                context,
                reason: reason,
                kind: UploadKind.document,
              );
              if (picked != null) onPicked(picked);
            } on PhotoRejected catch (e) {
              if (context.mounted) {
                showRiderMessage(context, e.message, error: true);
              }
            }
          },
          icon: Icon(
            photo == null ? LucideIcons.camera : LucideIcons.circleCheck,
            color: photo == null ? null : kDeliveredGreen,
          ),
          label: Text(photo == null ? 'Add photo' : 'Photo added · change'),
        ),
        Text(
          'JPG or PNG, up to 5 MB.',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (error != null)
          Text(error!, style: TextStyle(color: rose, fontSize: 13)),
      ],
    );
  }
}

/// Change vehicle or plate. A new OR/CR is required, and the courier company checks it again.
class VehicleScreen extends ConsumerStatefulWidget {
  const VehicleScreen({super.key, this.profile});

  final RiderProfile? profile;

  @override
  ConsumerState<VehicleScreen> createState() => _VehicleScreenState();
}

class _VehicleScreenState extends ConsumerState<VehicleScreen> {
  final _form = GlobalKey<FormState>();
  late final _plate = TextEditingController(text: widget.profile?.plateNumber);
  late String? _type = widget.profile?.vehicleType;
  PickedPhoto? _orCr;
  String? _orCrError;
  ApiFailure? _failure;
  (int, int)? _progress;

  @override
  void dispose() {
    _plate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final ok = _form.currentState!.validate();
    setState(() {
      _failure = null;
      _orCrError = _orCr == null ? 'Add a photo of the new OR/CR.' : null;
    });
    if (!ok || _orCr == null) return;
    try {
      final message = await ref
          .read(riderApiProvider)
          .updateVehicle(
            vehicleType: _type!,
            plateNumber: Rules.normalizePlateNumber(_plate.text),
            orCr: _orCr!,
            onSendProgress: (sent, total) {
              if (mounted) setState(() => _progress = (sent, total));
            },
          );
      if (!mounted) return;
      showRiderMessage(context, message);
      Navigator.of(context).pop();
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _failure = failure;
          _progress = null;
          _orCrError = failure.errorFor('or_cr_image');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    return _FormPage(
      title: 'Vehicle',
      formKey: _form,
      failure: failure,
      progress: _progress,
      submitLabel: 'Save vehicle',
      onSubmit: _save,
      children: [
        const MessageBanner(
          tone: StatusTone.blue,
          message: 'A new vehicle or plate needs its OR/CR. Your courier company checks it again.',
        ),
        const SizedBox(height: AppSpace.lg),
        VehicleTypeField(
          initialValue: _type,
          serverError: failure?.errorFor('vehicle_type'),
          onChanged: (type) => _type = type,
        ),
        const SizedBox(height: AppSpace.lg),
        PlateField(
          controller: _plate,
          serverError: failure?.errorFor('plate_number'),
        ),
        const SizedBox(height: AppSpace.lg),
        DocumentPhotoField(
          label: 'OR/CR of the vehicle',
          photo: _orCr,
          error: _orCrError,
          onPicked: (photo) => setState(() {
            _orCr = photo;
            _orCrError = null;
          }),
        ),
      ],
    );
  }
}

class PlateField extends StatelessWidget {
  const PlateField({super.key, required this.controller, this.serverError});

  final TextEditingController controller;
  final String? serverError;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: 'Plate number',
      hint: 'NBC1234',
      controller: controller,
      textCapitalization: TextCapitalization.characters,
      inputFormatters: [Only.plateChars, Only.upper],
      maxLength: 10,
      validator: Rules.plateNumber,
      serverError: serverError,
    );
  }
}

class LicenseNumberField extends StatelessWidget {
  const LicenseNumberField({
    super.key,
    required this.controller,
    this.serverError,
  });

  final TextEditingController controller;
  final String? serverError;

  @override
  Widget build(BuildContext context) {
    return AppTextField(
      label: "Driver's license number",
      hint: 'A00-00-000000',
      controller: controller,
      textCapitalization: TextCapitalization.characters,
      inputFormatters: [Only.licenseChars, Only.upper],
      maxLength: 13,
      validator: Rules.licenseNumber,
      serverError: serverError,
    );
  }
}

/// License expiry from a date picker only: today or later.
class LicenseExpiryField extends FormField<DateTime> {
  LicenseExpiryField({
    super.key,
    super.initialValue,
    String? serverError,
    ValueChanged<DateTime>? onChanged,
  }) : super(
         validator: (value) => Rules.licenseExpiry(value),
         builder: (field) {
           final today = Rules.manilaToday();
           return InkWell(
             borderRadius: AppRadius.cardAll,
             onTap: () async {
               final picked = await showDatePicker(
                 context: field.context,
                 initialDate:
                     field.value != null && !field.value!.isBefore(today)
                     ? field.value!
                     : today,
                 firstDate: today,
                 lastDate: DateTime(today.year + 15),
                 initialEntryMode: DatePickerEntryMode.calendarOnly,
                 helpText: 'License expiry',
               );
               if (picked != null) {
                 field.didChange(picked);
                 onChanged?.call(picked);
               }
             },
             child: InputDecorator(
               isEmpty: field.value == null,
               decoration: InputDecoration(
                 labelText: 'License expiry',
                 errorText: field.errorText ?? serverError,
                 suffixIcon: const Icon(LucideIcons.calendar, size: 20),
               ),
               child: Text(
                 field.value == null
                     ? ''
                     : Fmt.date(
                         DateTime.utc(
                           field.value!.year,
                           field.value!.month,
                           field.value!.day,
                         ),
                       ),
                 style: const TextStyle(fontSize: 16),
               ),
             ),
           );
         },
       );
}

/// Update the license number and expiry; a new photo of the license is optional (and then checked again).
class LicenseScreen extends ConsumerStatefulWidget {
  const LicenseScreen({super.key, this.profile});

  final RiderProfile? profile;

  @override
  ConsumerState<LicenseScreen> createState() => _LicenseScreenState();
}

class _LicenseScreenState extends ConsumerState<LicenseScreen> {
  final _form = GlobalKey<FormState>();
  late final _number = TextEditingController(
    text: widget.profile?.licenseNumber,
  );
  late DateTime? _expiry = widget.profile?.licenseExpiryDate;
  PickedPhoto? _photo;
  ApiFailure? _failure;
  (int, int)? _progress;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    setState(() => _failure = null);
    if (!_form.currentState!.validate()) return;
    try {
      final message = await ref
          .read(riderApiProvider)
          .updateLicense(
            licenseNumber: Rules.normalizeLicenseNumber(_number.text),
            licenseExpiry: Rules.ymd(_expiry!),
            photo: _photo,
            onSendProgress: (sent, total) {
              if (mounted) setState(() => _progress = (sent, total));
            },
          );
      if (!mounted) return;
      showRiderMessage(context, message);
      Navigator.of(context).pop();
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _failure = failure;
          _progress = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    return _FormPage(
      title: "Driver's license",
      formKey: _form,
      failure: failure,
      progress: _progress,
      submitLabel: 'Save license',
      onSubmit: _save,
      children: [
        LicenseNumberField(
          controller: _number,
          serverError: failure?.errorFor('license_number'),
        ),
        const SizedBox(height: AppSpace.lg),
        LicenseExpiryField(
          initialValue: _expiry,
          serverError: failure?.errorFor('license_expiry'),
          onChanged: (date) => _expiry = date,
        ),
        const SizedBox(height: AppSpace.lg),
        DocumentPhotoField(
          label: 'New photo of the license (optional)',
          photo: _photo,
          error: failure?.errorFor('drivers_license_image'),
          onPicked: (photo) => setState(() => _photo = photo),
        ),
      ],
    );
  }
}

/// The GCash the courier company pays earnings to. Leave both empty to remove it.
class GcashScreen extends ConsumerStatefulWidget {
  const GcashScreen({super.key, this.current});

  final GcashAccount? current;

  @override
  ConsumerState<GcashScreen> createState() => _GcashScreenState();
}

class _GcashScreenState extends ConsumerState<GcashScreen> {
  final _form = GlobalKey<FormState>();
  late final _number = TextEditingController(
    text: widget.current?.number?.replaceAll(RegExp(r'\D'), ''),
  );
  late final _name = TextEditingController(text: widget.current?.name);
  ApiFailure? _failure;

  @override
  void dispose() {
    _number.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save({bool remove = false}) async {
    FocusScope.of(context).unfocus();
    setState(() => _failure = null);
    if (remove) {
      final confirmed = await confirmAction(
        context,
        title: 'Remove your GCash?',
        message: 'Your courier company will have nowhere to send your earnings until you add one again.',
        confirmLabel: 'Remove',
        destructive: true,
      );
      if (!confirmed) return;
    } else if (!_form.currentState!.validate()) {
      return;
    }
    try {
      await ref
          .read(riderApiProvider)
          .saveGcash(
            number: remove ? null : Rules.normalizeGcashNumber(_number.text),
            name: remove ? null : Rules.squish(_name.text),
          );
      if (!mounted) return;
      showRiderMessage(context, remove ? 'GCash removed.' : 'GCash saved.');
      Navigator.of(context).pop();
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _failure = failure);
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    return _FormPage(
      title: 'GCash for payouts',
      formKey: _form,
      failure: failure,
      submitLabel: 'Save GCash',
      onSubmit: _save,
      extra: widget.current?.isSet == true
          ? TextButton(
              style: TextButton.styleFrom(
                foregroundColor: StatusTone.rose.foreground,
              ),
              onPressed: () => _save(remove: true),
              child: const Text('Remove GCash'),
            )
          : null,
      children: [
        AppTextField(
          label: 'GCash number',
          hint: '09XXXXXXXXX',
          controller: _number,
          keyboardType: TextInputType.phone,
          inputFormatters: [Only.digits, Only.max(11)],
          validator: Rules.gcashNumber,
          serverError: failure?.errorFor('gcash_number'),
        ),
        const SizedBox(height: AppSpace.lg),
        AppTextField(
          label: 'Name on the GCash account',
          controller: _name,
          textCapitalization: TextCapitalization.words,
          maxLength: 120,
          validator: Rules.gcashAccountName,
          serverError: failure?.errorFor('gcash_name'),
        ),
      ],
    );
  }
}

class _FormPage extends StatelessWidget {
  const _FormPage({
    required this.title,
    required this.formKey,
    required this.children,
    required this.submitLabel,
    required this.onSubmit,
    this.failure,
    this.progress,
    this.extra,
  });

  final String title;
  final GlobalKey<FormState> formKey;
  final List<Widget> children;
  final String submitLabel;
  final Future<void> Function() onSubmit;
  final ApiFailure? failure;
  final (int, int)? progress;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final banner = failure != null && failure!.kind != FailureKind.validation
        ? failure!.message
        : null;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: Text(title)),
      body: Form(
        key: formKey,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (banner != null) ...[
              MessageBanner(message: banner),
              const SizedBox(height: AppSpace.lg),
            ],
            ...children,
            const SizedBox(height: AppSpace.xl),
            if (progress != null) ...[
              UploadProgress(sent: progress!.$1, total: progress!.$2),
              const SizedBox(height: AppSpace.sm),
            ],
            SubmitButton(
              label: submitLabel,
              busyLabel: 'Saving…',
              onPressed: onSubmit,
            ),
            ?extra,
          ],
        ),
      ),
    );
  }
}

/// The rider's own license or OR/CR, fetched with the token and shown from memory: never saved to the phone.
class RiderDocumentScreen extends ConsumerStatefulWidget {
  const RiderDocumentScreen({super.key, required this.docKey, this.label});

  final String docKey;
  final String? label;

  @override
  ConsumerState<RiderDocumentScreen> createState() =>
      _RiderDocumentScreenState();
}

class _RiderDocumentScreenState extends ConsumerState<RiderDocumentScreen> {
  Uint8List? _bytes;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final bytes = await ref.read(riderApiProvider).document(widget.docKey);
      if (mounted) setState(() => _bytes = Uint8List.fromList(bytes));
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  void dispose() {
    // Drop the decoded picture from memory as soon as the screen closes.
    _bytes = null;
    PaintingBinding.instance.imageCache.clearLiveImages();
    super.dispose();
  }

  static bool _isPdf(Uint8List bytes) =>
      bytes.length > 4 &&
      bytes[0] == 0x25 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x44 &&
      bytes[3] == 0x46;

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;
    return Scaffold(
      backgroundColor: AppColors.gray900,
      appBar: AppBar(title: Text(widget.label ?? 'Document')),
      body: bytes == null
          ? (_failure != null
                ? ColoredBox(
                    color: AppColors.white,
                    child: ErrorRetry(failure: _failure!, onRetry: _load),
                  )
                : const Center(child: CircularProgressIndicator()))
          : _isPdf(bytes)
          ? const ColoredBox(
              color: AppColors.white,
              child: EmptyState(
                icon: LucideIcons.fileText,
                title: 'This document is a PDF',
                message: 'Open it on the rider website to view it.',
              ),
            )
          : InteractiveViewer(
              maxScale: 5,
              child: Center(
                child: Image.memory(
                  bytes,
                  gaplessPlayback: true,
                  semanticLabel: widget.label,
                ),
              ),
            ),
    );
  }
}
