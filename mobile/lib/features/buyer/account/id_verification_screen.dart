import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';
import 'id_upload.dart';

/// ID verification (B2). No order until the ID is approved; buyers can still browse and fill a cart.
class IdVerificationScreen extends ConsumerStatefulWidget {
  const IdVerificationScreen({super.key});

  @override
  ConsumerState<IdVerificationScreen> createState() =>
      _IdVerificationScreenState();
}

class _IdVerificationScreenState extends ConsumerState<IdVerificationScreen> {
  GovernmentId? _type;
  PickedPhoto? _front;
  PickedPhoto? _back;
  bool _showErrors = false;
  ApiFailure? _failure;
  int _sent = 0;
  int _total = 0;
  bool _sending = false;

  Future<void> _submit() async {
    setState(() {
      _showErrors = true;
      _failure = null;
    });
    final needsBack = _type?.hasBack ?? false;
    if (_type == null || _front == null || (needsBack && _back == null)) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(buyerApiProvider)
          .submitId(
            type: _type!,
            front: _front!,
            back: needsBack ? _back : null,
            onSendProgress: (sent, total) {
              if (!mounted) return;
              setState(() {
                _sent = sent;
                _total = total;
              });
            },
          );
      ref.invalidate(idVerificationProvider);
      if (!mounted) return;
      setState(() {
        _front = null;
        _back = null;
      });
      showSnack(
        context,
        'Thanks! Your ID was sent. We will let you know once it is checked.',
      );
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(idVerificationProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('ID verification')),
      body: status.when(
        loading: () => const SkeletonList(count: 2),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(idVerificationProvider),
        ),
        data: (check) {
          final canSend = check.status == 'none' || check.status == 'rejected';
          return ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              _StatusBanner(check: check),
              if (canSend) ...[
                const SizedBox(height: AppSpace.xl),
                if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
                  MessageBanner(message: _failure!.message),
                  const SizedBox(height: AppSpace.md),
                ],
                IdUpload(
                  type: _type,
                  front: _front,
                  back: _back,
                  showErrors: _showErrors,
                  typeError: _failure?.errorFor('government_id_type'),
                  frontError: _failure?.errorFor('government_id_image'),
                  backError: _failure?.errorFor('government_id_image_back'),
                  onType: (type) => setState(() => _type = type),
                  onFront: (photo) => setState(() => _front = photo),
                  onBack: (photo) => setState(() => _back = photo),
                ),
                const SizedBox(height: AppSpace.lg),
                const Text(
                  'JPG or PNG, up to 5 MB. Photos are shrunk and their location data removed before sending. Only '
                  'the Loved-IT team sees them.',
                  style: TextStyle(fontSize: 12, color: AppColors.stone500),
                ),
                const SizedBox(height: AppSpace.xl),
                if (_sending) ...[
                  UploadProgress(sent: _sent, total: _total),
                  const SizedBox(height: AppSpace.md),
                ],
                SubmitButton(
                  label: check.status == 'rejected'
                      ? 'Send again'
                      : 'Send my ID',
                  busyLabel: 'Sending…',
                  icon: LucideIcons.shieldCheck,
                  onPressed: _submit,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.check});

  final IdVerification check;

  @override
  Widget build(BuildContext context) {
    final (message, tone) = switch (check.status) {
      'approved' => (
        'Your ID is approved. You can place orders.',
        StatusTone.emerald,
      ),
      'pending' => (
        'Your ID is being checked. You can order once it is approved.',
        StatusTone.amber,
      ),
      'rejected' => (
        'Your ID was not approved${check.reason != null ? ': ${check.reason}' : '.'} Send a clearer photo or another ID.',
        StatusTone.rose,
      ),
      _ => (
        'Verify your government ID before your first order. You can browse and fill your cart meanwhile.',
        StatusTone.blue,
      ),
    };
    return MessageBanner(
      message: message,
      tone: tone,
      icon: LucideIcons.idCard,
    );
  }
}
