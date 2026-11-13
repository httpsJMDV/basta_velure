import 'package:flutter/material.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
export '../widgets/logistics_widgets.dart' show LoadView, LoadViewState;
export '../../buyer/widgets/buyer_widgets.dart' show InfoRow;

String text(Json row, String key, [String fallback = '—']) =>
    asString(row[key]) ?? fallback;

String displayDate(Json row, String key) => Fmt.dateTime(asDate(row[key]));

Future<T?> openPortal<T>(BuildContext context, Widget page) =>
    Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));

class PortalHeader extends StatelessWidget {
  const PortalHeader({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon = Icons.work_outline,
  });
  final String title, subtitle;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 20),
    padding: const EdgeInsets.all(22),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xFFC0001A), Color(0xFF730017)],
      ),
      borderRadius: BorderRadius.circular(22),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Colors.white, size: 28),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: const TextStyle(
                  color: Colors.white,
                  height: 1.5,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class PortalCard extends StatelessWidget {
  const PortalCard({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: Color(0xFFE7E5E4)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: SizedBox(width: double.infinity, child: child),
      ),
    ),
  );
}

class EntryField {
  const EntryField(
    this.key,
    this.label, {
    this.initial = '',
    this.required = true,
    this.number = false,
    this.lines = 1,
  });
  final String key, label, initial;
  final bool required, number;
  final int lines;
}

class PortalForm extends StatefulWidget {
  const PortalForm({
    super.key,
    required this.title,
    required this.description,
    required this.fields,
    required this.save,
    this.financial = false,
    this.photoLabel,
    this.photoRequired = false,
  });
  final String title, description;
  final List<EntryField> fields;
  final Future<String> Function(Json values, PickedPhoto? photo) save;
  final bool financial, photoRequired;
  final String? photoLabel;
  @override
  State<PortalForm> createState() => _PortalFormState();
}

class _PortalFormState extends State<PortalForm> {
  late final _controllers = {
    for (final f in widget.fields)
      f.key: TextEditingController(text: f.initial),
  };
  final _form = GlobalKey<FormState>();
  bool _busy = false, _confirmed = false;
  bool _confirming = false;
  PickedPhoto? _photo;
  ApiFailure? _failure;
  String? _photoError;
  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pick() async {
    try {
      final photo = await PhotoPicker().chooseFromGallery();
      if (mounted && photo != null) setState(() => _photo = photo);
    } on PhotoRejected catch (e) {
      if (mounted) setState(() => _photoError = e.message);
    }
  }

  Future<void> _save() async {
    if (_busy ||
        _confirming ||
        !_form.currentState!.validate() ||
        (widget.financial && !_confirmed)) {
      return;
    }
    if (widget.photoRequired && _photo == null) {
      setState(() => _photoError = 'Attach the receipt first.');
      return;
    }
    setState(() => _confirming = true);
    final approved = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(
          widget.financial
              ? 'Confirm this payment record?'
              : 'Save these changes?',
        ),
        content: Text(
          widget.financial
              ? 'Only continue after checking the amount, recipient and reference. This records a payment; it does not send money.'
              : 'Your changes will apply immediately. Existing records keep their recorded values.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Review again'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    setState(() => _confirming = false);
    if (approved != true) {
      setState(() => _busy = false);
      return;
    }
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      final message = await widget.save({
        for (final f in widget.fields)
          f.key: f.number
              ? num.parse(_controllers[f.key]!.text.trim())
              : _controllers[f.key]!.text.trim(),
      }, _photo);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _failure = ApiFailure.from(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: Text(widget.title)),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
          child: FilledButton.icon(
            onPressed: _busy || _confirming || (widget.financial && !_confirmed)
                ? null
                : _save,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: Text(_busy ? 'Saving…' : 'Save changes'),
          ),
        ),
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            PortalHeader(
              title: widget.title,
              subtitle: widget.description,
              icon: widget.financial
                  ? Icons.account_balance_wallet_outlined
                  : Icons.tune,
            ),
            if (_failure != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  _failure!.message,
                  style: const TextStyle(color: AppColors.brandRed),
                ),
              ),
            if (widget.fields.isNotEmpty)
              PortalCard(
                child: Column(
                  children: [
                    for (final f in widget.fields)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: TextFormField(
                          controller: _controllers[f.key],
                          enabled: !_busy,
                          maxLines: f.lines,
                          keyboardType: f.number
                              ? const TextInputType.numberWithOptions(
                                  decimal: true,
                                )
                              : f.key.contains('email')
                              ? TextInputType.emailAddress
                              : f.key.contains('phone') ||
                                    f.key == 'gcash_number'
                              ? TextInputType.phone
                              : f.key == 'reference'
                              ? TextInputType.number
                              : f.lines > 1
                              ? TextInputType.multiline
                              : TextInputType.text,
                          decoration: InputDecoration(
                            labelText: f.label,
                            errorText: _failure?.errorFor(f.key),
                          ),
                          validator: (v) {
                            if (f.required && (v == null || v.trim().isEmpty)) {
                              return 'Enter ${f.label.toLowerCase()}.';
                            }
                            if (f.number &&
                                (num.tryParse(v ?? '') == null ||
                                    !num.parse(v!).isFinite ||
                                    num.parse(v) < 0)) {
                              return 'Enter a valid positive number.';
                            }
                            if (f.key == 'reference' &&
                                !RegExp(r'^\d{13}$')
                                    .hasMatch((v ?? '').replaceAll(' ', ''))) {
                              return 'Enter the 13-digit GCash reference.';
                            }
                            return null;
                          },
                        ),
                      ),
                  ],
                ),
              ),
            if (widget.photoLabel != null)
              PortalCard(
                child: Column(
                  children: [
                    Text(widget.photoLabel!),
                    if (_photo != null) Text('${_photo!.filename} attached'),
                    if (_photoError != null) Text(_photoError!),
                    TextButton.icon(
                      onPressed: _busy ? null : _pick,
                      icon: const Icon(Icons.add_photo_alternate_outlined),
                      label: const Text('Choose photo'),
                    ),
                  ],
                ),
              ),
            if (widget.financial)
              CheckboxListTile(
                value: _confirmed,
                onChanged: _busy
                    ? null
                    : (v) => setState(() => _confirmed = v ?? false),
                title: const Text('I have checked the payment details.'),
                contentPadding: EdgeInsets.zero,
              ),
          ],
        ),
      ),
    ),
  );
}
