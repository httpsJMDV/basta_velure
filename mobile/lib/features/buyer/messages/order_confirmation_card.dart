import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/widgets/peso_text.dart' show formatPeso;
import '../../../core/theme/app_colors.dart';
import '../buyer_paths.dart';
import '../data/account.dart';

class OrderConfirmationCard extends StatefulWidget {
  const OrderConfirmationCard({
    super.key,
    required this.message,
    this.onConfirm,
  });
  final ChatMessage message;
  final Future<void> Function()? onConfirm;
  @override
  State<OrderConfirmationCard> createState() => _OrderConfirmationCardState();
}

class _OrderConfirmationCardState extends State<OrderConfirmationCard> {
  bool _busy = false;
  String? _error;
  Future<void> _confirm() async {
    if (_busy || widget.onConfirm == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onConfirm!();
    } catch (e) {
      if (mounted) setState(() => _error = ApiFailure.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.message.attachment;
    final confirmed = data['confirmed_at'] != null;
    final id = asIntOrNull(data['id']);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.stone200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Review delivery details',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.stone900,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            '${asString(data['items_summary']) ?? 'Your order'} · ${formatPeso(data['total'])}',
            style: const TextStyle(fontSize: 12, color: AppColors.stone600),
          ),
          const SizedBox(height: 10),
          Text(
            asString(data['recipient']) ?? '',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.stone900,
            ),
          ),
          Text(
            asString(data['phone']) ?? '',
            style: const TextStyle(fontSize: 12, color: AppColors.stone600),
          ),
          const SizedBox(height: 6),
          Text(
            asString(data['address']) ?? '',
            style: const TextStyle(
              fontSize: 12,
              height: 1.5,
              color: AppColors.stone600,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Optional check. Your order continues using the checkout address even if you do not confirm.',
            style: TextStyle(
              fontSize: 11,
              height: 1.5,
              color: AppColors.stone500,
            ),
          ),
          const SizedBox(height: 10),
          if (confirmed)
            const Text(
              '✓ Address confirmed',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: Color(0xFF047857),
              ),
            )
          else if (widget.onConfirm != null)
            FilledButton(
              onPressed: _busy ? null : _confirm,
              child: Text(_busy ? 'Confirming…' : 'Confirm address'),
            ),
          if (id != null)
            TextButton(
              onPressed: _busy
                  ? null
                  : () => context.push(BuyerPaths.order(id)),
              child: const Text('View or correct delivery details'),
            ),
          if (_error != null)
            Text(
              _error!,
              style: const TextStyle(fontSize: 12, color: AppColors.brandRed),
            ),
        ],
      ),
    );
  }
}
