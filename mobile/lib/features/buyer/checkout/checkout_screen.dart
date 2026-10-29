import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../data/cart.dart';
import '../data/checkout.dart';
import '../widgets/buyer_widgets.dart';
import 'voucher_picker.dart';

/// Checkout (B8): cash on delivery or GCash only. The server prices everything; the app sends item ids, quantities,
/// the address id and voucher codes, and shows the totals it gets back. Each shop becomes its own order.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.request});

  final CheckoutRequest request;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  Address? _address;
  CheckoutQuote? _quote;
  ApiFailure? _loadFailure;
  ApiFailure? _placeFailure;
  bool _quoting = true;
  int _quoteGeneration = 0;

  String _payment = 'cod';
  final _storeVouchers = <int, String>{};
  String? _platformVoucher;
  String? _shippingVoucher;

  final _gcashForm = GlobalKey<FormState>();
  final _references = <int, TextEditingController>{};
  final _receipts = <int, PickedPhoto>{};
  List<ShopGcash> _gcashShops = const [];
  int _sent = 0;
  int _total = 0;
  bool _uploading = false;

  /// One key per attempt: kept when a network error forces a retry, so a retry never makes a second order, and
  /// replaced whenever what is being ordered changes.
  String _idempotencyKey = const Uuid().v4();

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    for (final box in _references.values) {
      box.dispose();
    }
    super.dispose();
  }

  BuyerApi get _api => ref.read(buyerApiProvider);

  Future<void> _start() async {
    setState(() {
      _loadFailure = null;
      _quoting = true;
    });
    try {
      final addresses = await ref.read(addressesProvider.future);
      _address ??=
          addresses.where((a) => a.isDefault).firstOrNull ??
          addresses.firstOrNull;
      await _requote();
    } catch (error) {
      if (mounted) {
        setState(() {
          _loadFailure = ApiFailure.from(error);
          _quoting = false;
        });
      }
    }
  }

  Future<void> _requote() async {
    final generation = ++_quoteGeneration;
    _idempotencyKey = const Uuid().v4();
    setState(() {
      _quoting = true;
      _placeFailure = null;
    });
    try {
      final quote = await _api.quote(
        widget.request,
        addressId: _address?.id,
        storeVouchers: _storeVouchers,
        platformVoucher: _platformVoucher,
        shippingVoucher: _shippingVoucher,
      );
      if (!mounted || generation != _quoteGeneration) return;
      if (!quote.gcashPossible && _payment == 'gcash') _payment = 'cod';
      setState(() {
        _quote = quote;
        _quoting = false;
        _loadFailure = null;
      });
    } catch (error) {
      if (!mounted || generation != _quoteGeneration) return;
      setState(() {
        _quoting = false;
        if (_quote == null) {
          _loadFailure = ApiFailure.from(error);
        } else {
          _placeFailure = ApiFailure.from(error);
        }
      });
    }
  }

  Future<void> _pickAddress() async {
    final picked = await context.push<Address>(
      '${BuyerPaths.addresses}?pick=1',
    );
    if (picked != null && mounted) {
      setState(() => _address = picked);
      await _requote();
    }
  }

  Future<void> _choosePayment(String method) async {
    if (method == _payment) return;
    setState(() {
      _payment = method;
      _idempotencyKey = const Uuid().v4();
    });
    if (method == 'gcash' && _quote != null) {
      try {
        final shops = await _api.checkoutShops(
          _quote!.stores.map((s) => s.seller.id).toList(),
        );
        if (mounted) setState(() => _gcashShops = shops);
      } catch (error) {
        if (mounted) {
          showSnack(context, ApiFailure.from(error).message, error: true);
        }
      }
    }
  }

  Future<void> _pickReceipt(int sellerId) async {
    try {
      final photo = await PhotoPicker().pick(
        context,
        reason: 'Take a photo of your GCash receipt so the shop can check your payment.',
      );
      if (photo != null && mounted) setState(() => _receipts[sellerId] = photo);
    } on PhotoRejected catch (rejected) {
      if (mounted) showSnack(context, rejected.message, error: true);
    }
  }

  Future<void> _place() async {
    final quote = _quote;
    final address = _address;
    if (quote == null || address == null) return;
    if (_payment == 'gcash') {
      final formOk = _gcashForm.currentState?.validate() ?? false;
      final missing = quote.stores.where(
        (store) => !_receipts.containsKey(store.seller.id),
      );
      if (!formOk || missing.isNotEmpty) {
        if (missing.isNotEmpty) {
          showSnack(
            context,
            'Add the GCash receipt for ${missing.first.seller.shopName}.',
            error: true,
          );
        }
        return;
      }
    }
    setState(() {
      _placeFailure = null;
      _uploading = _payment == 'gcash';
    });
    try {
      final message = await _api.placeOrder(
        widget.request,
        idempotencyKey: _idempotencyKey,
        paymentMethod: _payment,
        addressId: address.id,
        expectedTotal: quote.total,
        storeVouchers: _storeVouchers,
        platformVoucher: _platformVoucher,
        shippingVoucher: _shippingVoucher,
        gcashReferences: {
          for (final entry in _references.entries)
            entry.key: entry.value.text.replaceAll(RegExp(r'\s'), ''),
        },
        gcashProofs: _receipts,
        onSendProgress: (sent, total) {
          if (!mounted) return;
          setState(() {
            _sent = sent;
            _total = total;
          });
        },
      );
      if (!mounted) return;
      ref.invalidate(cartProvider);
      showSnack(context, message);
      context.go(BuyerPaths.account);
      context.push(
        BuyerPaths.ordersTab(_payment == 'gcash' ? 'to_pay' : 'to_ship'),
      );
    } catch (error) {
      if (!mounted) return;
      final failure = ApiFailure.from(error);
      setState(() => _placeFailure = failure);
      // A changed total, a voucher that stopped working or a sold-out item: show the new prices and ask again.
      if (failure.kind == FailureKind.conflict ||
          failure.kind == FailureKind.validation) {
        await _requote();
        if (mounted) setState(() => _placeFailure = failure);
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final idCheck = ref.watch(idVerificationProvider);
    final canOrder = idCheck.value?.canOrder ?? false;
    final quote = _quote;

    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Checkout')),
      body: _loadFailure != null
          ? ErrorRetry(failure: _loadFailure!, onRetry: _start)
          : quote == null
          ? const SkeletonList(count: 4)
          : Form(
              key: _gcashForm,
              child: ListView(
                padding: const EdgeInsets.only(
                  top: AppSpace.md,
                  bottom: AppSpace.xl,
                ),
                children: [
                  if (idCheck.hasValue && !canOrder)
                    _IdNotice(status: idCheck.value!),
                  _AddressCard(address: _address, onTap: _pickAddress),
                  if (_placeFailure != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.lg,
                        0,
                        AppSpace.lg,
                        AppSpace.md,
                      ),
                      child: MessageBanner(message: _placeFailure!.message),
                    ),
                  for (final problem in quote.problems)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpace.lg,
                        0,
                        AppSpace.lg,
                        AppSpace.md,
                      ),
                      child: MessageBanner(
                        message: problem.message,
                        tone: StatusTone.amber,
                      ),
                    ),
                  for (final store in quote.stores) _storeBlock(quote, store),
                  _platformVouchers(quote),
                  _paymentBlock(quote),
                  _totals(quote),
                ],
              ),
            ),
      bottomNavigationBar: quote == null
          ? null
          : Container(
              decoration: const BoxDecoration(
                color: AppColors.white,
                boxShadow: AppShadow.soft,
              ),
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.lg,
                AppSpace.sm,
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_uploading) ...[
                      UploadProgress(sent: _sent, total: _total),
                      const SizedBox(height: AppSpace.sm),
                    ],
                    Row(
                      children: [
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Total',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.stone500,
                              ),
                            ),
                            PesoText(
                              quote.total,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                color: AppColors.brandRed,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: AppSpace.lg),
                        Expanded(
                          child: SubmitButton(
                            label: 'Place order',
                            busyLabel: 'Placing order…',
                            onPressed:
                                _quoting ||
                                    !quote.canPlace ||
                                    !canOrder ||
                                    _address == null
                                ? null
                                : _place,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _storeBlock(CheckoutQuote quote, QuoteStore store) {
    final sellerId = store.seller.id;
    final storeOptions = quote.wallet
        .where(
          (option) => option.scope == 'store' && option.sellerId == sellerId,
        )
        .toList();
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                LucideIcons.store,
                size: 18,
                color: AppColors.stone700,
              ),
              const SizedBox(width: AppSpace.sm),
              Expanded(
                child: Text(
                  store.seller.shopName,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.md),
          for (final line in store.lines)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  NetImage(line.imageUrl, width: 56, height: 56, radius: 8),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          line.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (line.variantLabel != null)
                          Text(
                            line.variantLabel!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        if (line.message != null)
                          Text(
                            line.message!,
                            style: TextStyle(
                              fontSize: 12,
                              color: StatusTone.rose.foreground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      PesoText(line.unitPrice),
                      Text(
                        '×${line.quantity}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.stone500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          VoucherField(
            label: 'Shop voucher',
            applied: store.storeVoucher,
            options: storeOptions,
            onChanged: (code) {
              setState(
                () => code == null
                    ? _storeVouchers.remove(sellerId)
                    : _storeVouchers[sellerId] = code,
              );
              _requote();
            },
          ),
          const Divider(height: AppSpace.xl),
          InfoRow('Items', formatPeso(store.merchandise)),
          if (store.promoDiscount > 0)
            InfoRow(
              'Shop promotion',
              '-${formatPeso(store.promoDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          if (store.storeDiscount > 0)
            InfoRow(
              'Shop voucher',
              '-${formatPeso(store.storeDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          InfoRow(
            'Delivery fee',
            store.freeDelivery ? 'Free' : formatPeso(store.shippingFee),
          ),
          if (!store.serviceable)
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.sm),
              child: MessageBanner(
                message: store.shippingMessage ?? 'We cannot deliver to this address yet. Choose another address.',
              ),
            ),
          InfoRow('Order total', formatPeso(store.total), strong: true),
          if (_payment == 'gcash') _gcashFor(store),
        ],
      ),
    );
  }

  Widget _gcashFor(QuoteStore store) {
    final sellerId = store.seller.id;
    final shop = _gcashShops.where((s) => s.sellerId == sellerId).firstOrNull;
    final reference = _references.putIfAbsent(
      sellerId,
      TextEditingController.new,
    );
    final receipt = _receipts[sellerId];
    return Container(
      margin: const EdgeInsets.only(top: AppSpace.md),
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: StatusTone.blue.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: StatusTone.blue.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Pay ${formatPeso(store.total)} to ${store.seller.shopName} in GCash',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: StatusTone.blue.foreground,
            ),
          ),
          const SizedBox(height: 4),
          if (shop?.number != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${shop!.number}${shop.accountName != null ? ' · ${shop.accountName}' : ''}',
                  ),
                ),
                IconButton(
                  tooltip: 'Copy GCash number',
                  icon: const Icon(LucideIcons.copy, size: 18),
                  onPressed: () => copyText(
                    context,
                    shop.number!.replaceAll(' ', ''),
                    'GCash number',
                  ),
                ),
              ],
            )
          else
            const Text(
              'Loading the shop’s GCash…',
              style: TextStyle(fontSize: 13),
            ),
          const SizedBox(height: AppSpace.sm),
          AppTextField(
            label: 'GCash reference number',
            controller: reference,
            keyboardType: TextInputType.number,
            inputFormatters: [Only.digits, Only.max(13)],
            validator: Rules.gcashReference,
            serverError: _placeFailure?.errorFor('gcash.$sellerId.reference'),
            helper: '13 digits, from your GCash receipt',
          ),
          const SizedBox(height: AppSpace.sm),
          OutlinedButton.icon(
            onPressed: () => _pickReceipt(sellerId),
            icon: Icon(
              receipt == null ? LucideIcons.imagePlus : LucideIcons.circleCheck,
              size: 18,
            ),
            label: Text(
              receipt == null ? 'Add receipt photo' : 'Receipt added · change',
            ),
          ),
          if (_placeFailure?.errorFor('gcash_proof.$sellerId') != null)
            Text(
              _placeFailure!.errorFor('gcash_proof.$sellerId')!,
              style: TextStyle(fontSize: 12, color: StatusTone.rose.foreground),
            ),
        ],
      ),
    );
  }

  Widget _platformVouchers(CheckoutQuote quote) {
    return BlockCard(
      child: Column(
        children: [
          VoucherField(
            label: 'Loved-IT voucher',
            applied: quote.platformVoucher,
            options: quote.wallet
                .where((option) => option.scope == 'platform')
                .toList(),
            onChanged: (code) {
              setState(() => _platformVoucher = code);
              _requote();
            },
          ),
          const SizedBox(height: AppSpace.sm),
          VoucherField(
            label: 'Free delivery voucher',
            applied: quote.shippingVoucher,
            options: quote.wallet
                .where((option) => option.scope == 'shipping')
                .toList(),
            onChanged: (code) {
              setState(() => _shippingVoucher = code);
              _requote();
            },
          ),
        ],
      ),
    );
  }

  Widget _paymentBlock(CheckoutQuote quote) {
    return BlockCard(
      padding: const EdgeInsets.symmetric(vertical: AppSpace.sm),
      child: RadioGroup<String>(
        groupValue: _payment,
        onChanged: (method) {
          if (method != null) _choosePayment(method);
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                AppSpace.sm,
                AppSpace.lg,
                0,
              ),
              child: Text(
                'Payment',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            const RadioListTile<String>(
              value: 'cod',
              title: Text('Cash on delivery'),
              subtitle: Text(
                'Pay the rider the exact amount when your order arrives.',
              ),
            ),
            RadioListTile<String>(
              value: 'gcash',
              enabled: quote.gcashPossible,
              title: const Text('GCash'),
              subtitle: Text(
                quote.gcashPossible
                    ? 'Pay each shop in the GCash app, then enter the reference and add the receipt.'
                    : 'Not available: a shop in this order has no GCash.',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _totals(CheckoutQuote quote) {
    return BlockCard(
      child: Column(
        children: [
          InfoRow('Items', formatPeso(quote.merchandise)),
          if (quote.promoDiscount > 0)
            InfoRow(
              'Shop promotions',
              '-${formatPeso(quote.promoDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          if (quote.storeDiscount > 0)
            InfoRow(
              'Shop vouchers',
              '-${formatPeso(quote.storeDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          if (quote.platformDiscount > 0)
            InfoRow(
              'Loved-IT voucher',
              '-${formatPeso(quote.platformDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          InfoRow('Delivery', formatPeso(quote.shipping)),
          if (quote.shippingDiscount > 0)
            InfoRow(
              'Delivery voucher',
              '-${formatPeso(quote.shippingDiscount)}',
              valueColor: AppColors.brandRed,
            ),
          const Divider(height: AppSpace.xl),
          InfoRow(
            'Total',
            formatPeso(quote.total),
            strong: true,
            valueColor: AppColors.brandRed,
          ),
          if (quote.stores.length > 1)
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.sm),
              child: Text(
                'This becomes ${quote.stores.length} orders, one per shop, each with its own delivery.',
                style: const TextStyle(fontSize: 12, color: AppColors.stone500),
              ),
            ),
        ],
      ),
    );
  }
}

class _IdNotice extends StatelessWidget {
  const _IdNotice({required this.status});

  final IdVerification status;

  @override
  Widget build(BuildContext context) {
    final message = switch (status.status) {
      'pending' =>
        'Your ID is being checked. You can order once it is approved.',
      'rejected' =>
        'Your ID was not approved${status.reason != null ? ': ${status.reason}' : '.'} Send it again to order.',
      _ => 'Verify your government ID before your first order. You can still browse and fill your cart.',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MessageBanner(
            message: message,
            tone: StatusTone.amber,
            icon: LucideIcons.idCard,
          ),
          if (status.status != 'pending')
            TextButton.icon(
              onPressed: () => context.push(BuyerPaths.idVerification),
              icon: const Icon(LucideIcons.shieldCheck, size: 18),
              label: const Text('Verify my ID'),
            ),
        ],
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.address, required this.onTap});

  final Address? address;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final address = this.address;
    return BlockCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        onTap: onTap,
        minTileHeight: 64,
        leading: const Icon(LucideIcons.mapPin, color: AppColors.brandRed),
        title: Text(
          address == null
              ? 'Add a delivery address'
              : '${address.fullName} · ${address.phone}',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: address == null ? null : Text(address.oneLine),
        trailing: const Icon(LucideIcons.chevronRight, size: 18),
      ),
    );
  }
}
