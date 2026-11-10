import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// Counter pickups: buyers from very remote towns (no courier branch near them) who chose to collect their parcel
/// here. These parcels skip the riders; when the buyer comes, the hub checks an ID, takes a photo and, for cash on
/// delivery, the exact amount (docs/api/courier-network.md, Very remote towns).
class HubCounterScreen extends ConsumerStatefulWidget {
  const HubCounterScreen({super.key});

  @override
  ConsumerState<HubCounterScreen> createState() => _HubCounterScreenState();
}

class _HubCounterScreenState extends ConsumerState<HubCounterScreen> {
  final _view = GlobalKey<LoadViewState<List<CounterParcel>>>();

  Future<void> _handOver(CounterParcel parcel) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => _HandOverSheet(parcel: parcel),
    );
    if (done == true && mounted) {
      showRiderMessage(context, '${parcel.trackingNumber} handed over to the buyer.');
      await _view.currentState?.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Counter pickups')),
      body: LoadView<List<CounterParcel>>(
        key: _view,
        load: () => ref.read(hubApiProvider).counter(),
        refreshEvery: const Duration(seconds: 30),
        builder: (context, parcels) {
          return ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              if (parcels.isEmpty)
                const EmptyState(
                  icon: LucideIcons.packageCheck,
                  title: 'Nobody to wait for',
                  message: 'Buyers from remote towns who choose to pick up here show up once you have sorted their parcel.',
                )
              else ...[
                HubSection(title: '${parcels.length} waiting at your counter'),
                for (final p in parcels) ...[
                  RiderCard(
                    padding: const EdgeInsets.all(AppSpace.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                p.recipientName,
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.gray900),
                              ),
                            ),
                            if (p.codAmount != null)
                              StatusChip(label: 'COD ${formatPeso(p.codAmount!)}', tone: StatusTone.amber)
                            else
                              const StatusChip(label: 'Paid', tone: StatusTone.emerald),
                          ],
                        ),
                        const SizedBox(height: AppSpace.xs),
                        Text(p.trackingNumber, style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: AppColors.stone600)),
                        Text([p.barangay, p.city].where((s) => s.isNotEmpty).join(', '), style: HubText.small),
                        const SizedBox(height: AppSpace.sm),
                        Row(
                          children: [
                            if (p.recipientPhone.isNotEmpty) ...[
                              Expanded(child: RiderCallPill(phone: p.recipientPhone)),
                              const SizedBox(width: AppSpace.sm),
                            ],
                            Expanded(
                              child: FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  backgroundColor: LogisticsLook.hubAction,
                                  minimumSize: const Size.fromHeight(44),
                                ),
                                onPressed: () => _handOver(p),
                                icon: const Icon(LucideIcons.packageCheck, size: 18),
                                label: const Text('Hand over'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                ],
              ],
            ],
          );
        },
      ),
    );
  }
}

/// The handover: a photo, who took it, and for cash on delivery the exact amount.
class _HandOverSheet extends ConsumerStatefulWidget {
  const _HandOverSheet({required this.parcel});

  final CounterParcel parcel;

  @override
  ConsumerState<_HandOverSheet> createState() => _HandOverSheetState();
}

class _HandOverSheetState extends ConsumerState<_HandOverSheet> {
  late final _name = TextEditingController(text: widget.parcel.recipientName);
  final _cash = TextEditingController();
  PickedPhoto? _photo;
  bool _busy = false;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    _name.dispose();
    _cash.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    try {
      final photo = await PhotoPicker().pick(context, reason: 'Take a photo of the parcel being handed over.');
      if (photo != null && mounted) setState(() => _photo = photo);
    } on PhotoRejected catch (rejected) {
      if (mounted) showRiderMessage(context, rejected.message, error: true);
    }
  }

  Future<void> _submit() async {
    final cod = widget.parcel.codAmount;
    final errors = <String, String>{
      if (_photo == null) 'proof_photo': 'Take a photo of the parcel being handed over.',
      if (_name.text.trim().isEmpty) 'received_by': 'Enter the name of who took the parcel.',
      if (cod != null && ((double.tryParse(_cash.text.trim()) ?? -1) * 100).round() != (cod * 100).round())
        'cod_amount': 'Collect exactly ${formatPeso(cod)}.',
    };
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;

    setState(() => _busy = true);
    try {
      await ref.read(hubApiProvider).handOver(
        widget.parcel.trackingNumber,
        photo: _photo!,
        receivedBy: _name.text.trim(),
        codAmount: cod != null ? _cash.text.trim() : null,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiFailure catch (failure) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _errors = failure.fieldErrors;
      });
      if (failure.fieldErrors.isEmpty) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cod = widget.parcel.codAmount;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(AppSpace.lg, 0, AppSpace.lg, AppSpace.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Hand over at the counter', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.gray900)),
              Text(widget.parcel.trackingNumber, style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: AppColors.stone500)),
              const SizedBox(height: AppSpace.md),
              Text(
                'Check a valid ID: the name should match ${widget.parcel.recipientName}, or a person they sent.',
                style: const TextStyle(fontSize: 14, height: 1.35, color: AppColors.stone600),
              ),
              const SizedBox(height: AppSpace.md),
              OutlinedButton.icon(
                onPressed: _busy ? null : _takePhoto,
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                icon: Icon(_photo == null ? LucideIcons.camera : LucideIcons.circleCheck, size: 18),
                label: Text(_photo == null ? 'Photo of the handover' : 'Photo taken · tap to retake'),
              ),
              if (_errors['proof_photo'] != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(_errors['proof_photo']!, style: const TextStyle(color: AppColors.brandRed, fontSize: 13)),
                ),
              const SizedBox(height: AppSpace.md),
              TextField(
                controller: _name,
                maxLength: 80,
                decoration: InputDecoration(labelText: 'Taken by', errorText: _errors['received_by']),
              ),
              if (cod != null) ...[
                const SizedBox(height: AppSpace.sm),
                TextField(
                  controller: _cash,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Cash collected: exactly ${formatPeso(cod)}',
                    hintText: cod.toStringAsFixed(2),
                    errorText: _errors['cod_amount'],
                  ),
                ),
              ],
              const SizedBox(height: AppSpace.lg),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: StatusTone.emerald.foreground,
                  minimumSize: const Size.fromHeight(50),
                ),
                onPressed: _busy ? null : _submit,
                child: Text(_busy ? 'Saving…' : 'Handed to the buyer'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
