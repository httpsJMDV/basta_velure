import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../widgets/buyer_widgets.dart';
import '../data/orders.dart';

class GcashReceiptCard extends ConsumerStatefulWidget {
  const GcashReceiptCard({
    super.key,
    required this.order,
    required this.onDone,
  });
  final Order order;
  final VoidCallback onDone;
  @override
  ConsumerState<GcashReceiptCard> createState() => _GcashReceiptCardState();
}

class _GcashReceiptCardState extends ConsumerState<GcashReceiptCard> {
  late final _reference = TextEditingController(
    text: widget.order.paymentReference,
  );
  PickedPhoto? _photo;
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_photo == null || !RegExp(r'^\d{13}$').hasMatch(_reference.text)) {
      setState(
        () => _error =
            'Enter the 13-digit reference and attach the original receipt.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(dioProvider)
          .post<Object?>(
            '/buyer/orders/${widget.order.id}/gcash-receipt',
            data: FormData.fromMap({
              'reference': _reference.text,
              'receipt': _photo!.toMultipart(),
            }),
          );
      widget.onDone();
    } catch (e) {
      if (mounted) setState(() => _error = ApiFailure.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => BlockCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Correct your GCash receipt',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        const Text(
          'Update the original transfer’s reference and receipt. This corrects all orders in the same payment. Contact Loved-IT before sending more money.',
          style: TextStyle(fontSize: 13, height: 1.5),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _reference,
          keyboardType: TextInputType.number,
          maxLength: 13,
          decoration: const InputDecoration(
            labelText: 'GCash reference (13 digits)',
          ),
        ),
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () async {
                  try {
                    final p = await PhotoPicker().pick(
                      context,
                      reason: 'Attach the original GCash receipt for Loved-IT to review.',
                    );
                    if (p != null && mounted) setState(() => _photo = p);
                  } on PhotoRejected catch (e) {
                    if (mounted) setState(() => _error = e.message);
                  }
                },
          icon: Icon(
            _photo == null
                ? Icons.add_photo_alternate_outlined
                : Icons.check_circle_outline,
          ),
          label: Text(
            _photo == null
                ? 'Attach corrected receipt'
                : 'Receipt attached · change',
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              _error!,
              style: const TextStyle(color: Colors.red, fontSize: 12),
            ),
          ),
        FilledButton(
          onPressed: _busy ? null : _send,
          child: Text(_busy ? 'Submitting…' : 'Submit corrected receipt'),
        ),
      ],
    ),
  );
}
