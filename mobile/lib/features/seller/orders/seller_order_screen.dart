import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/web_links.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/widgets/buyer_widgets.dart';
import '../data/seller_api.dart';
import '../data/seller_models.dart';

const _cancelReasons = [
  'Out of stock',
  'Buyer asked to cancel',
  'Cannot ship to this address',
  'Pricing error',
  'Other',
];

/// A pickup time the shop can ask for: today (if the window has not nearly ended) up to 3 days ahead, morning or
/// afternoon, in Philippine time. The server checks the same rules.
List<({String date, String window, String label})> _pickupChoices() {
  final now = DateTime.now().toUtc().add(const Duration(hours: 8));
  final hour = now.hour + now.minute / 60;
  const windows = [
    ('morning', 12.0, '9 AM – 12 NN'),
    ('afternoon', 17.0, '1 – 5 PM'),
  ];
  final out = <({String date, String window, String label})>[];
  for (var d = 0; d <= 3; d++) {
    final day = DateTime.utc(
      now.year,
      now.month,
      now.day,
    ).add(Duration(days: d));
    final ymd =
        '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    final name = d == 0 ? 'Today' : (d == 1 ? 'Tomorrow' : Fmt.date(day));
    for (final (key, end, label) in windows) {
      if (d == 0 && end - 0.5 <= hour) continue;
      out.add((date: ymd, window: key, label: '$name, $label'));
    }
  }
  return out;
}

/// One order for the shop, with what it can do next: accept it (after checking a GCash payment), pack it, mark it
/// ready with a pickup time, cancel it, answer a return, confirm a returned item arrived, and send a refund.
class SellerOrderScreen extends ConsumerStatefulWidget {
  const SellerOrderScreen({super.key, required this.orderId});

  final int orderId;

  @override
  ConsumerState<SellerOrderScreen> createState() => _SellerOrderScreenState();
}

class _SellerOrderScreenState extends ConsumerState<SellerOrderScreen> {
  SellerOrder? _order;
  ApiFailure? _failure;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final order = await ref.read(sellerApiProvider).order(widget.orderId);
      if (mounted) {
        setState(() {
          _order = order;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  /// Runs an action, shows the server's message and the updated order.
  Future<void> _act(Future<(String, SellerOrder)> Function() action) async {
    setState(() => _busy = true);
    try {
      final (message, order) = await action();
      if (!mounted) return;
      setState(() => _order = order);
      showSnack(context, message);
    } on ApiFailure catch (failure) {
      if (mounted) showSnack(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _simple(Future<String> Function() action) async {
    setState(() => _busy = true);
    try {
      final message = await action();
      if (!mounted) return;
      showSnack(context, message);
      await _load();
    } on ApiFailure catch (failure) {
      if (mounted) showSnack(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _askReason({
    required String title,
    required String hint,
    int min = 10,
  }) async {
    final text = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: text,
          maxLength: 300,
          maxLines: 3,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (text.text.trim().length < min) return;
              Navigator.of(dialog).pop(text.text.trim());
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
    text.dispose();
    return result;
  }

  /// Ready for pickup, or a new pickup time: as soon as possible, or a window.
  Future<({String? date, String? window})?> _pickTime({
    required String title,
  }) => showModalBottomSheet<({String? date, String? window})>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              0,
              AppSpace.lg,
              AppSpace.sm,
            ),
            child: Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                ListTile(
                  leading: const Icon(LucideIcons.zap),
                  title: const Text('As soon as possible'),
                  onTap: () =>
                      Navigator.of(sheet).pop((date: null, window: null)),
                ),
                for (final c in _pickupChoices())
                  ListTile(
                    leading: const Icon(LucideIcons.calendarClock),
                    title: Text(c.label),
                    onTap: () =>
                        Navigator.of(sheet)
                            .pop((date: c.date, window: c.window)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.md),
        ],
      ),
    ),
  );

  Future<void> _ready(SellerOrder order) async {
    final time = await _pickTime(title: 'When can the rider come?');
    if (time == null || !mounted) return;
    await _act(
      () => ref
          .read(sellerApiProvider)
          .setStatus(
            order.id,
            'READY_FOR_PICKUP',
            pickupDate: time.date,
            pickupWindow: time.window,
          ),
    );
  }

  Future<void> _changeTime(SellerOrder order) async {
    final time = await _pickTime(title: 'New pickup time');
    if (time == null || !mounted) return;
    await _act(
      () => ref
          .read(sellerApiProvider)
          .setPickupSlot(order.id, date: time.date, window: time.window),
    );
  }

  Future<void> _cancel(SellerOrder order) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                0,
                AppSpace.lg,
                AppSpace.sm,
              ),
              child: Text(
                'Why are you cancelling?',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
            ),
            for (final r in _cancelReasons)
              ListTile(title: Text(r), onTap: () => Navigator.of(sheet).pop(r)),
          ],
        ),
      ),
    );
    if (reason == null || !mounted) return;
    String? details;
    if (reason == 'Other') {
      details = await _askReason(
        title: 'Tell the buyer why',
        hint: '10 to 300 characters',
      );
      if (details == null) return;
    }
    await _act(
      () => ref
          .read(sellerApiProvider)
          .cancel(order.id, reason, details: details),
    );
  }

  Future<void> _approveReturn(SellerOrder order) async {
    var returnItem = true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setDialog) => AlertDialog(
          title: const Text('Approve the return?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('The buyer is refunded ${formatPeso(order.total)}.'),
              const SizedBox(height: AppSpace.sm),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: returnItem,
                onChanged: (v) => setDialog(() => returnItem = v ?? true),
                title: const Text('Send a rider to bring the item back'),
                subtitle: const Text(
                  'Untick for cheap or broken items the buyer can keep.',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialog).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialog).pop(true),
              child: const Text('Approve'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    await _act(
      () => ref
          .read(sellerApiProvider)
          .respondReturn(order.id, approve: true, returnItem: returnItem),
    );
  }

  Future<void> _rejectReturn(SellerOrder order) async {
    final reason = await _askReason(
      title: 'Why are you rejecting it?',
      hint: 'The buyer reads this (10 to 300 characters)',
    );
    if (reason == null || !mounted) return;
    await _act(
      () => ref
          .read(sellerApiProvider)
          .respondReturn(order.id, approve: false, reason: reason),
    );
  }

  Future<void> _rejectPayment(SellerOrder order) async {
    final reason = await _askReason(
      title: 'Reject the GCash payment?',
      hint: 'What is wrong with the receipt (10 to 500 characters)',
    );
    if (reason == null || !mounted) return;
    await _act(
      () => ref.read(sellerApiProvider).rejectPayment(order.id, reason),
    );
  }

  Future<void> _sendRefund(SellerOrder order, SellerRefund refund) async {
    final reference = TextEditingController();
    PickedPhoto? receipt;
    final picker = PhotoPicker();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpace.lg,
            0,
            AppSpace.lg,
            AppSpace.lg + MediaQuery.viewInsetsOf(sheet).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Send ${formatPeso(refund.amount)} by GCash',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpace.sm),
              Text(
                'To ${refund.gcashName ?? 'the buyer'} · ${refund.gcashNumber ?? ''}',
              ),
              const SizedBox(height: AppSpace.md),
              TextField(
                controller: reference,
                keyboardType: TextInputType.number,
                maxLength: 20,
                decoration: const InputDecoration(
                  labelText: 'GCash reference number (13 digits)',
                ),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  final photo = await picker.chooseFromGallery();
                  if (photo != null) setSheet(() => receipt = photo);
                },
                icon: const Icon(LucideIcons.imagePlus),
                label: Text(
                  receipt == null
                      ? 'Add the GCash receipt'
                      : 'Receipt added · change',
                ),
              ),
              const SizedBox(height: AppSpace.md),
              FilledButton(
                onPressed: () {
                  if (reference.text.trim().isEmpty || receipt == null) return;
                  Navigator.of(sheet).pop(true);
                },
                child: const Text('Mark refund sent'),
              ),
            ],
          ),
        ),
      ),
    );
    final ref0 = reference.text.trim();
    reference.dispose();
    if (ok != true || receipt == null || !mounted) return;
    await _simple(
      () => ref
          .read(sellerApiProvider)
          .sendRefund(order.id, reference: ref0, receipt: receipt!),
    );
  }

  @override
  Widget build(BuildContext context) {
    final order = _order;
    return Scaffold(
      appBar: AppBar(title: Text(order?.orderNumber ?? 'Order')),
      body: order == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 3))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.lg),
                children: [
                  BlockCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: BlockTitle(order.statusLabel)),
                            Text(
                              formatPeso(order.total),
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpace.xs),
                        InfoRow('Payment', order.paymentMethod.toUpperCase()),
                        InfoRow('You earn', formatPeso(order.earnings)),
                        if (order.trackingNumber != null)
                          InfoRow('Tracking', order.trackingNumber!),
                        if (order.pickupSlotLabel != null)
                          InfoRow('Pickup time', order.pickupSlotLabel!),
                        if (order.createdAt != null)
                          InfoRow('Ordered', Fmt.dateTime(order.createdAt)),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                  ..._actions(order),
                  BlockCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const BlockTitle('Items'),
                        for (final item in order.items)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpace.sm),
                            child: Row(
                              children: [
                                NetImage(
                                  item.imageUrl,
                                  width: 48,
                                  height: 48,
                                  radius: 10,
                                ),
                                const SizedBox(width: AppSpace.md),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item.name,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        '${item.variant == 'Default' ? '' : '${item.variant} · '}x${item.quantity}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.stone600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Text(formatPeso(item.subtotal)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                  BlockCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const BlockTitle('Ship to'),
                        const SizedBox(height: AppSpace.xs),
                        Text(
                          order.buyerName,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(order.shippingPhone),
                        Text(
                          order.shippingAddress,
                          style: const TextStyle(color: AppColors.stone600),
                        ),
                        if (order.notes != null && order.notes!.isNotEmpty) ...[
                          const SizedBox(height: AppSpace.sm),
                          Text(
                            'Note: ${order.notes}',
                            style: const TextStyle(fontStyle: FontStyle.italic),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  /// The cards for what the shop can do now.
  List<Widget> _actions(SellerOrder order) {
    final api = ref.read(sellerApiProvider);
    final cards = <Widget>[];
    void add(Widget child) =>
        cards.addAll([child, const SizedBox(height: AppSpace.md)]);
    Widget button(
      String label,
      VoidCallback onPressed, {
      bool primary = true,
      IconData? icon,
    }) => SizedBox(
      width: double.infinity,
      height: 48,
      child: primary
          ? FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brandRed,
              ),
              onPressed: _busy ? null : onPressed,
              icon: Icon(icon ?? LucideIcons.check, size: 18),
              label: Text(label),
            )
          : OutlinedButton(
              onPressed: _busy ? null : onPressed,
              child: Text(label),
            ),
    );

    if (order.awaitingGcashCheck) {
      add(
        BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const BlockTitle('Check the GCash payment'),
              const SizedBox(height: AppSpace.sm),
              if (order.paymentProofUrl != null)
                NetImage(
                  order.paymentProofUrl,
                  height: 260,
                  fit: BoxFit.contain,
                  radius: 12,
                ),
              const SizedBox(height: AppSpace.md),
              button(
                'Payment received',
                () => _act(() => api.confirmPayment(order.id)),
              ),
              const SizedBox(height: AppSpace.sm),
              button(
                'Reject the payment',
                () => _rejectPayment(order),
                primary: false,
              ),
            ],
          ),
        ),
      );
    } else if (order.status == 'PLACED') {
      add(
        button(
          'Accept order',
          () => _act(() => api.setStatus(order.id, 'CONFIRMED')),
        ),
      );
    } else if (order.status == 'CONFIRMED') {
      add(
        button(
          'Start packing',
          () => _act(() => api.setStatus(order.id, 'PREPARING')),
          icon: LucideIcons.package,
        ),
      );
    } else if (order.status == 'PREPARING') {
      add(
        button(
          'Ready for pickup',
          () => _ready(order),
          icon: LucideIcons.truck,
        ),
      );
    } else if (order.status == 'READY_FOR_PICKUP') {
      add(
        BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const BlockTitle('Waiting for the rider'),
              const SizedBox(height: AppSpace.xs),
              Text(
                'Pickup time: ${order.pickupSlotLabel ?? 'as soon as possible'}',
              ),
              const SizedBox(height: AppSpace.md),
              button(
                'Change the pickup time',
                () => _changeTime(order),
                primary: false,
              ),
              const SizedBox(height: AppSpace.sm),
              button(
                'Print the waybill on the website',
                () => openWebsite('/seller/orders/${order.id}/waybill'),
                primary: false,
              ),
            ],
          ),
        ),
      );
    }

    final request = order.returnRequest;
    if (request != null) {
      add(
        BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              BlockTitle('Return request · ${request.reason}'),
              const SizedBox(height: AppSpace.xs),
              Text(request.description),
              if (request.photos.isNotEmpty) ...[
                const SizedBox(height: AppSpace.sm),
                SizedBox(
                  height: 72,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final p in request.photos)
                        Padding(
                          padding: const EdgeInsets.only(right: AppSpace.sm),
                          child: NetImage(p, width: 72, height: 72, radius: 10),
                        ),
                    ],
                  ),
                ),
              ],
              if (request.status == 'pending') ...[
                if (request.respondBy != null)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpace.sm),
                    child: Text(
                      'Answer by ${Fmt.dateTime(request.respondBy)}, or it is approved automatically.',
                      style: TextStyle(
                        fontSize: 13,
                        color: StatusTone.rose.foreground,
                      ),
                    ),
                  ),
                const SizedBox(height: AppSpace.md),
                button('Approve the return', () => _approveReturn(order)),
                const SizedBox(height: AppSpace.sm),
                button(
                  'Reject with a reason',
                  () => _rejectReturn(order),
                  primary: false,
                ),
              ] else
                Padding(
                  padding: const EdgeInsets.only(top: AppSpace.sm),
                  child: Text(switch (request.status) {
                    'approved' => 'Approved. The buyer was refunded.',
                    'rejected' =>
                      'You rejected it: ${request.sellerReason ?? ''} The buyer can escalate it to Loved-IT.',
                    'escalated' => 'Loved-IT is deciding this one.',
                    _ => request.status,
                  }),
                ),
            ],
          ),
        ),
      );
    }

    final pickup = order.returnPickup;
    if (pickup != null) {
      add(
        BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(child: BlockTitle('Return pickup')),
                  StatusChip(label: pickup.statusLabel, tone: StatusTone.blue),
                ],
              ),
              if (pickup.riderName != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('Rider: ${pickup.riderName}'),
                ),
              if (pickup.status == 'collected' ||
                  pickup.status == 'delivered') ...[
                const SizedBox(height: AppSpace.md),
                button(
                  'I received the item',
                  () => _simple(() => api.returnPickupReceived(order.id)),
                ),
              ],
            ],
          ),
        ),
      );
    }

    final refund = order.refund;
    if (refund != null) {
      add(
        BlockCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(child: BlockTitle('Refund')),
                  StatusChip(
                    label: refund.statusLabel,
                    tone: refund.overdue ? StatusTone.rose : StatusTone.amber,
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.xs),
              Text(
                '${formatPeso(refund.amount)}${refund.sendBy != null && refund.canSend ? ' · send by ${Fmt.dateTime(refund.sendBy)}' : ''}',
              ),
              if (refund.gcashNumber != null)
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'GCash ${refund.gcashNumber} · ${refund.gcashName ?? ''}',
                      ),
                    ),
                    IconButton(
                      tooltip: 'Copy number',
                      icon: const Icon(LucideIcons.copy, size: 18),
                      onPressed: () {
                        Clipboard.setData(
                          ClipboardData(
                            text: (refund.gcashNumber ?? '').replaceAll(
                              ' ',
                              '',
                            ),
                          ),
                        );
                        showSnack(context, 'GCash number copied.');
                      },
                    ),
                  ],
                ),
              if (refund.canSend) ...[
                const SizedBox(height: AppSpace.sm),
                button(
                  'I sent the refund',
                  () => _sendRefund(order, refund),
                  icon: LucideIcons.send,
                ),
              ],
            ],
          ),
        ),
      );
    }

    if (order.canCancel) {
      add(button('Cancel this order', () => _cancel(order), primary: false));
    }
    return cards;
  }
}
