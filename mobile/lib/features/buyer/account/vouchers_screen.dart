import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/buyer_api.dart';
import '../data/catalog.dart';
import '../product/product_screen.dart' show VoucherTile;
import '../widgets/buyer_widgets.dart';

/// My vouchers (B13): the wallet, Loved-IT's vouchers to save, and saving one by its code.
class VouchersScreen extends ConsumerStatefulWidget {
  const VouchersScreen({super.key});

  @override
  ConsumerState<VouchersScreen> createState() => _VouchersScreenState();
}

class _VouchersScreenState extends ConsumerState<VouchersScreen> {
  late Future<(List<Voucher>, List<Voucher>)> _data = _load();
  final _code = TextEditingController();
  final _claiming = <int>{};
  ApiFailure? _codeFailure;

  Future<(List<Voucher>, List<Voucher>)> _load() async {
    final api = ref.read(buyerApiProvider);
    final results = await Future.wait([
      api.myVouchers(),
      api.platformVouchers(),
    ]);
    return (results[0], results[1]);
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _claim({int? id, String? code}) async {
    if (id != null) setState(() => _claiming.add(id));
    setState(() => _codeFailure = null);
    try {
      final message = await ref
          .read(buyerApiProvider)
          .claimVoucher(id: id, code: code);
      if (!mounted) return;
      showSnack(context, message);
      _code.clear();
      setState(() => _data = _load());
    } catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.from(error);
      if (code != null) {
        setState(() => _codeFailure = failure);
      } else {
        showSnack(context, failure.message, error: true);
      }
    } finally {
      if (mounted && id != null) setState(() => _claiming.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('My vouchers')),
      body: FutureBuilder<(List<Voucher>, List<Voucher>)>(
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return ErrorRetry(
              failure: ApiFailure.from(snapshot.error!),
              onRetry: () => setState(() => _data = _load()),
            );
          }
          if (!snapshot.hasData) return const SkeletonList(count: 4);
          final (wallet, platform) = snapshot.data!;
          final toSave = platform
              .where((voucher) => !voucher.claimed && voucher.status != 'ended')
              .toList();
          return RefreshIndicator(
            onRefresh: () async {
              setState(() => _data = _load());
              await _data;
            },
            child: ListView(
              padding: const EdgeInsets.all(AppSpace.lg),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: AppTextField(
                        label: 'Voucher code',
                        controller: _code,
                        maxLength: 20,
                        textCapitalization: TextCapitalization.characters,
                        serverError:
                            _codeFailure?.errorFor('code') ??
                            _codeFailure?.message,
                      ),
                    ),
                    const SizedBox(width: AppSpace.sm),
                    SizedBox(
                      height: 56,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brandRed,
                        ),
                        onPressed: () {
                          final code = _code.text.trim().toUpperCase();
                          if (code.isNotEmpty) _claim(code: code);
                        },
                        child: const Text('Save'),
                      ),
                    ),
                  ],
                ),
                if (toSave.isNotEmpty) ...[
                  const SizedBox(height: AppSpace.lg),
                  const Text(
                    'From Loved-IT',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  for (final voucher in toSave)
                    VoucherTile(
                      voucher: voucher,
                      busy: _claiming.contains(voucher.id),
                      onClaim: () => _claim(id: voucher.id),
                    ),
                ],
                const SizedBox(height: AppSpace.lg),
                const Text(
                  'Saved',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                if (wallet.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpace.xl),
                    child: EmptyState(
                      icon: LucideIcons.ticket,
                      title: 'No saved vouchers',
                      message: 'Save vouchers from shop and product pages, then use them at checkout.',
                    ),
                  )
                else
                  for (final voucher in wallet) VoucherTile(voucher: voucher),
              ],
            ),
          );
        },
      ),
    );
  }
}
