import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/validation/rules.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';

class DeliveryAddressSheet extends ConsumerStatefulWidget {
  const DeliveryAddressSheet({super.key, required this.order});
  final Order order;
  @override
  ConsumerState<DeliveryAddressSheet> createState() =>
      _DeliveryAddressSheetState();
}

class _DeliveryAddressSheetState extends ConsumerState<DeliveryAddressSheet> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.order.shippingName);
  late final _phone = TextEditingController(text: widget.order.shippingPhone);
  late final _street = TextEditingController(text: widget.order.shippingStreet);
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _street.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(buyerApiProvider)
          .correctDeliveryAddress(
            widget.order.id,
            name: _name.text.trim(),
            phone: _phone.text.trim(),
            street: _street.text.trim(),
            revision: widget.order.addressRevision,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Correct delivery details',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              const Text(
                'Update this order before a waybill is created. Your saved addresses stay unchanged.',
                style: TextStyle(height: 1.5, color: AppColors.stone500),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _name,
                maxLength: 150,
                decoration: const InputDecoration(labelText: 'Recipient'),
                validator: Rules.addressFullName,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Recipient mobile number',
                  hintText: '09XXXXXXXXX or +639XXXXXXXXX',
                ),
                validator: (v) =>
                    RegExp(r'^(09\d{9}|\+639\d{9})$')
                        .hasMatch((v ?? '').replaceAll(RegExp(r'[\s-]'), ''))
                    ? null
                    : 'Enter a valid Philippine mobile number.',
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _street,
                maxLines: 3,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'House, street, building and unit',
                ),
                validator: (v) => (v ?? '').trim().length >= 5
                    ? null
                    : 'Enter the complete street details.',
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.stone50,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  'Delivery area stays the same\n${widget.order.shippingArea ?? ''}\n\nFor a different barangay or city, cancel while eligible and place a new order to check delivery fees and coverage. Do not enter a different city in the street field.',
                  style: const TextStyle(fontSize: 12, height: 1.55),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: AppColors.brandRed),
                  ),
                ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy ? 'Saving…' : 'Save correction'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
