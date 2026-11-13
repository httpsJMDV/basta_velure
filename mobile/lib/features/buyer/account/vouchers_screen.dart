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
import '../widgets/buyer_offers.dart';

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
  int _page = 1;
  bool _hasMore = false;
  bool _loadingMore = false;
  String? _moreError;
  int _loadVersion = 0;

  Future<(List<Voucher>, List<Voucher>)> _load() async {
    final version = ++_loadVersion;
    _page = 1;
    _moreError = null;
    final api = ref.read(buyerApiProvider);
    final results = await Future.wait([
      api.myVouchers(),
      api.discoverVouchers().then((page) {
        if (version == _loadVersion) _hasMore = page.hasMore;
        return page.items;
      }),
    ]);
    return (results[0], results[1]);
  }

  Future<void> _loadMore() async {
    if (_loadingMore) return;
    final current = _data;
    setState(() {
      _loadingMore = true;
      _moreError = null;
    });
    try {
      final (wallet, offers) = await current;
      final next = await ref
          .read(buyerApiProvider)
          .discoverVouchers(page: _page + 1);
      if (!mounted || !identical(_data, current)) return;
      setState(() {
        _page = next.currentPage;
        _hasMore = next.hasMore;
        _data = Future.value((wallet, [...offers, ...next.items]));
      });
    } catch (error) {
      if (mounted && identical(_data, current)) {
        setState(() => _moreError = ApiFailure.from(error).message);
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
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
      setState(() {
        _data = _load();
      });
      ref.invalidate(availableVouchersProvider);
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
      appBar: AppBar(title: const Text('Vouchers')),
      body: FutureBuilder<(List<Voucher>, List<Voucher>)>(
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return ErrorRetry(
              failure: ApiFailure.from(snapshot.error!),
              onRetry: () => setState(() {
                _data = _load();
              }),
            );
          }
          if (!snapshot.hasData) return const SkeletonList(count: 4);
          final (wallet, platform) = snapshot.data!;
          final toSave = platform
              .where(
                (voucher) =>
                    !voucher.claimed &&
                    !voucher.fullyUsed &&
                    voucher.status != 'ended',
              )
              .toList();
          return RefreshIndicator(
            onRefresh: () async {
              setState(() {
                _data = _load();
              });
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
                    'Available vouchers',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  for (final voucher in toSave)
                    VoucherTile(
                      voucher: voucher,
                      busy: _claiming.contains(voucher.id),
                      onClaim: () => _claim(id: voucher.id),
                    ),
                ],
                if (toSave.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpace.md),
                    child: Text(
                      'No new vouchers available right now. Shop and Loved-IT offers will appear here when published.',
                    ),
                  ),
                if (_moreError != null)
                  Text(
                    _moreError!,
                    style: const TextStyle(color: AppColors.brandRed),
                  ),
                if (_hasMore)
                  TextButton(
                    onPressed: _loadingMore ? null : _loadMore,
                    child: Text(
                      _loadingMore ? 'Loading…' : 'Load more vouchers',
                    ),
                  ),
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
