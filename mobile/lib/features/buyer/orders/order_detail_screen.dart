import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/returns/return_pickups.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';
import 'refund_card.dart';

final orderProvider = FutureProvider.autoDispose.family<Order, int>(
  (ref, id) => ref.watch(buyerApiProvider).order(id),
);

/// One order (B9): where it is, what is in it, what was paid, and what the buyer can do next. Every action asks
/// first, and the server decides whether it is still allowed.
class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final int orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Order details')),
      body: order.when(
        loading: () => const SkeletonList(count: 4),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(orderProvider(orderId)),
        ),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref.refresh(orderProvider(orderId).future),
          child: ListView(
            padding: const EdgeInsets.only(
              top: AppSpace.md,
              bottom: AppSpace.xl,
            ),
            children: [
              _StatusCard(order: order),
              if (order.canTrack) _TrackingCard(order: order),
              if (order.returnRequest != null) _ReturnCard(order: order),
              if (order.refund != null)
                RefundCard(
                  order: order,
                  onChanged: () => ref.invalidate(orderProvider(orderId)),
                ),
              if (order.deliveryProofCount > 0 && order.trackingNumber != null)
                _ProofCard(
                  trackingNumber: order.trackingNumber!,
                  count: order.deliveryProofCount,
                ),
              _AddressCard(order: order),
              _ItemsCard(order: order),
              _PaymentCard(order: order),
            ],
          ),
        ),
      ),
      bottomNavigationBar: order.hasValue
          ? _Actions(order: order.value!)
          : null,
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.order});

  final Order order;

  /// How far along the order is, for the progress bar. Null once it has left the usual path.
  int? get _step => switch (order.status) {
    OrderStatus.placed || OrderStatus.confirmed => 0,
    OrderStatus.preparing ||
    OrderStatus.readyForPickup ||
    OrderStatus.pickedUp => 1,
    OrderStatus.atSortingCenter ||
    OrderStatus.sorted ||
    OrderStatus.assignedToRider ||
    OrderStatus.outForDelivery ||
    OrderStatus.deliveryFailed => 2,
    OrderStatus.delivered || OrderStatus.completed => 3,
    _ => null,
  };

  String? get _note => switch (order.status) {
    OrderStatus.placed when order.paymentMethod == 'gcash' =>
      'The shop is checking your GCash payment.',
    OrderStatus.placed => 'Waiting for the shop to accept your order.',
    OrderStatus.confirmed ||
    OrderStatus.preparing => 'The shop is preparing your package.',
    OrderStatus.readyForPickup =>
      'Your package is packed and waiting for the courier.',
    OrderStatus.outForDelivery when order.paymentMethod == 'cod' =>
      'Your package is on the way. Prepare ${formatPeso(order.total)} in cash for the rider.',
    OrderStatus.outForDelivery => 'Your package is on the way.',
    OrderStatus.delivered =>
      'Tap Order received if everything is fine. Otherwise it completes by itself'
          '${order.autoCompleteAt != null ? ' on ${Fmt.date(order.autoCompleteAt)}' : ''}.',
    OrderStatus.deliveryFailed =>
      'The rider could not deliver it${order.failedAttempts != null ? ' (attempt ${order.failedAttempts} of ${order.maxAttempts})' : ''}. The hub will try again.',
    OrderStatus.cancelled =>
      order.cancelReason == null ? null : 'Reason: ${order.cancelReason}',
    OrderStatus.returned => 'The package went back to the shop.',
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  order.status.label,
                  style: BuyerText.screenTitle.copyWith(fontSize: 21),
                ),
              ),
              const SizedBox(width: AppSpace.sm),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  Fmt.date(order.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.stone500,
                  ),
                ),
              ),
            ],
          ),
          if (_step != null) ...[
            const SizedBox(height: AppSpace.md),
            _OrderProgress(step: _step!),
          ],
          if (_note != null) ...[
            const SizedBox(height: AppSpace.md),
            Text(
              _note!,
              style: const TextStyle(
                fontSize: 14,
                height: 1.45,
                color: AppColors.stone700,
              ),
            ),
          ],
          if (order.rejectionReason != null) ...[
            const SizedBox(height: AppSpace.md),
            MessageBanner(message: order.rejectionReason!),
          ],
          // A refund the shop sends by hand has its own card with the steps.
          if (order.refundStatus != null && order.refund == null) ...[
            const SizedBox(height: AppSpace.md),
            MessageBanner(
              message: order.refundStatus == 'refunded'
                  ? 'Your refund was sent.'
                  : 'Your refund is being processed.',
              tone: order.refundStatus == 'refunded'
                  ? StatusTone.emerald
                  : StatusTone.amber,
            ),
          ],
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Order ${order.orderNumber}',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.stone600,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Copy order number',
                icon: const Icon(LucideIcons.copy, size: 18),
                onPressed: () =>
                    copyText(context, order.orderNumber, 'Order number'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TrackingCard extends StatelessWidget {
  const _TrackingCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      padding: EdgeInsets.zero,
      child: MenuRow(
        icon: LucideIcons.truck,
        iconColor: AppColors.brandRed,
        iconBackground: AppColors.brandRedTint,
        title: order.trackingNumber!,
        subtitle: order.courierName ?? 'Courier',
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.ink,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: const Text(
            'Track',
            style: TextStyle(
              fontSize: 12.5,
              color: AppColors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        onTap: () => context.push(BuyerPaths.track(order.trackingNumber!)),
      ),
    );
  }
}

class _ReturnCard extends ConsumerWidget {
  const _ReturnCard({required this.order});

  final Order order;

  Future<void> _escalate(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Ask Loved-IT to review?',
      message: 'Loved-IT will look at your photos and the shop\'s answer and decide the return.',
      confirmLabel: 'Ask Loved-IT',
    );
    if (!confirmed) return;
    try {
      final message = await ref.read(buyerApiProvider).escalateReturn(order.id);
      ref.invalidate(orderProvider(order.id));
      if (context.mounted) showSnack(context, message);
    } catch (error) {
      if (context.mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = order.returnRequest!;
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: BlockTitle('Return request')),
              StatusChip(label: request.statusLabel, tone: StatusTone.amber),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          InfoRow('Reason', request.reason),
          const SizedBox(height: AppSpace.xs),
          Text(
            request.description,
            style: const TextStyle(color: AppColors.stone600, height: 1.4),
          ),
          if (request.respondBy != null && request.status == 'pending')
            InfoRow('Shop answers by', Fmt.dateTime(request.respondBy)),
          if (request.sellerReason != null) ...[
            const SizedBox(height: AppSpace.sm),
            MessageBanner(
              message: 'Shop: ${request.sellerReason}',
              tone: StatusTone.gray,
            ),
          ],
          if (request.refundAmount != null)
            InfoRow('Refund', formatPeso(request.refundAmount)),
          if (request.resolutionNote != null) ...[
            const SizedBox(height: AppSpace.sm),
            MessageBanner(
              message: 'Loved-IT: ${request.resolutionNote}',
              tone: StatusTone.blue,
            ),
          ],
          if (order.returnPickup != null) ...[
            const SizedBox(height: AppSpace.md),
            _PickupProgress(pickup: order.returnPickup!),
          ],
          if (request.canEscalate) ...[
            const SizedBox(height: AppSpace.md),
            OutlinedButton.icon(
              onPressed: () => _escalate(context, ref),
              icon: const Icon(LucideIcons.shieldCheck, size: 18),
              label: Text(
                request.escalateBy == null
                    ? 'Ask Loved-IT to review'
                    : 'Ask Loved-IT to review (until ${Fmt.date(request.escalateBy)})',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The rider's delivery photos. Private: fetched with the token and shown from memory only, never saved.
class _ProofCard extends ConsumerStatefulWidget {
  const _ProofCard({required this.trackingNumber, required this.count});

  final String trackingNumber;
  final int count;

  @override
  ConsumerState<_ProofCard> createState() => _ProofCardState();
}

class _ProofCardState extends ConsumerState<_ProofCard> {
  late final List<Future<List<int>>> _photos = [
    for (var i = 1; i <= widget.count.clamp(1, 2); i++)
      ref.read(buyerApiProvider).deliveryProof(widget.trackingNumber, photo: i),
  ];

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BlockTitle('Proof of delivery'),
          const SizedBox(height: AppSpace.md),
          Row(
            children: [
              for (final photo in _photos)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: AppSpace.sm),
                    child: AspectRatio(
                      aspectRatio: 1,
                      child: FutureBuilder<List<int>>(
                        future: photo,
                        builder: (context, snapshot) {
                          if (snapshot.hasError) {
                            return const ColoredBox(
                              color: AppColors.stone100,
                              child: Center(
                                child: Text(
                                  'Not available',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ),
                            );
                          }
                          if (!snapshot.hasData) {
                            return const Skeleton(
                              child: SkeletonBox(
                                height: double.infinity,
                                radius: 10,
                              ),
                            );
                          }
                          return ClipRRect(
                            borderRadius: BorderRadius.circular(
                              BuyerRadius.field,
                            ),
                            child: Image.memory(
                              Uint8List.fromList(snapshot.data!),
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          const Text(
            'The rider\'s photos, and for cash on delivery the exact cash, are the proof. There is no delivery code.',
            style: TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
        ],
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      padding: EdgeInsets.zero,
      child: MenuRow(
        icon: LucideIcons.mapPin,
        title: [
          order.shippingName,
          order.shippingPhone,
        ].whereType<String>().join(' · '),
        subtitle:
            order.shippingAddress != null && order.shippingAddress!.isNotEmpty
            ? order.shippingAddress
            : null,
        trailing: const SizedBox.shrink(),
        onTap: null,
      ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  const _ItemsCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BlockTitle(order.shopName ?? 'Shop'),
          const SizedBox(height: AppSpace.md),
          for (final item in order.items)
            InkWell(
              onTap: item.productId == null
                  ? null
                  : () => context.push(BuyerPaths.product(item.productId!)),
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpace.md),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    NetImage(
                      item.imageUrl,
                      width: 64,
                      height: 64,
                      radius: BuyerRadius.field,
                    ),
                    const SizedBox(width: AppSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.productName,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            [
                              if (item.variantLabel != null) item.variantLabel!,
                              '×${item.quantity}',
                              if (item.isGift) 'Free gift',
                            ].join(' · '),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    PesoText(item.subtotal),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        children: [
          InfoRow('Items', formatPeso(order.subtotal)),
          if (order.discount > 0)
            InfoRow(
              'Discounts',
              '-${formatPeso(order.discount)}',
              valueColor: AppColors.brandRed,
            ),
          InfoRow('Delivery fee', formatPeso(order.shippingFee)),
          const Divider(height: AppSpace.xl),
          InfoRow(
            'Total',
            formatPeso(order.total),
            strong: true,
            valueColor: AppColors.brandRed,
          ),
          const SizedBox(height: AppSpace.sm),
          InfoRow('Payment', order.paymentLabel),
          if (order.paymentReference != null)
            InfoRow('GCash reference', order.paymentReference!),
          if (order.deliveredAt != null)
            InfoRow('Delivered', Fmt.dateTime(order.deliveredAt)),
          if (order.completedAt != null)
            InfoRow('Completed', Fmt.dateTime(order.completedAt)),
        ],
      ),
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({required this.order});

  final Order order;

  Future<void> _confirmReceipt(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Order received?',
      message: 'Only tap this if you got every item and it is fine. Once you confirm, the shop gets paid.',
      confirmLabel: 'Yes, I received it',
    );
    if (!confirmed) return;
    try {
      final message = await ref.read(buyerApiProvider).confirmReceipt(order.id);
      ref.invalidate(orderProvider(order.id));
      if (context.mounted) showSnack(context, message);
    } catch (error) {
      ref.invalidate(orderProvider(order.id));
      if (context.mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final cancelled = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CancelSheet(orderId: order.id),
    );
    if (cancelled != null && context.mounted) {
      ref.invalidate(orderProvider(order.id));
      showSnack(context, cancelled);
    }
  }

  Future<void> _chat(BuildContext context, WidgetRef ref) async {
    if (order.sellerId == null) return;
    try {
      final id = await ref
          .read(buyerApiProvider)
          .startChat(sellerId: order.sellerId, orderId: order.id);
      if (context.mounted) context.push(BuyerPaths.chat(id));
    } catch (error) {
      if (context.mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final buttons = <Widget>[
      if (order.sellerId != null)
        OutlinedButton.icon(
          onPressed: () => _chat(context, ref),
          icon: const Icon(LucideIcons.messageCircle, size: 18),
          label: const Text('Chat shop'),
        ),
      if (order.canCancel)
        OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: StatusTone.rose.foreground,
          ),
          onPressed: () => _cancel(context, ref),
          child: const Text('Cancel order'),
        ),
      if (order.canReturn)
        OutlinedButton(
          onPressed: () async {
            final sent = await context.push<bool>(
              BuyerPaths.orderReturn(order.id),
            );
            if (sent == true) ref.invalidate(orderProvider(order.id));
          },
          child: const Text('Return / refund'),
        ),
      if (order.status == OrderStatus.completed)
        OutlinedButton(
          onPressed: () => context.push(BuyerPaths.reviews),
          child: const Text('Review'),
        ),
      if (order.canConfirmReceipt)
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.brandRed),
          onPressed: () => _confirmReceipt(context, ref),
          child: const Text('Order received'),
        ),
    ];
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Color(0x141E1B18),
            blurRadius: 24,
            offset: Offset(0, -6),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpace.lg,
        AppSpace.md,
        AppSpace.lg,
        AppSpace.md,
      ),
      child: SafeArea(
        top: false,
        child: Wrap(
          alignment: WrapAlignment.end,
          spacing: AppSpace.sm,
          runSpacing: AppSpace.sm,
          children: [
            for (final button in buttons) SizedBox(height: 48, child: button),
          ],
        ),
      ),
    );
  }
}

class _CancelSheet extends ConsumerStatefulWidget {
  const _CancelSheet({required this.orderId});

  final int orderId;

  @override
  ConsumerState<_CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends ConsumerState<_CancelSheet> {
  final _form = GlobalKey<FormState>();
  final _details = TextEditingController();
  String? _reason;
  ApiFailure? _failure;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_reason == null || !_form.currentState!.validate()) return;
    final confirmed = await confirmAction(
      context,
      title: 'Cancel this order?',
      message: 'The shop will stop preparing it. This can\'t be undone.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    );
    if (!confirmed) return;
    setState(() => _failure = null);
    try {
      final message = await ref
          .read(buyerApiProvider)
          .cancelOrder(
            widget.orderId,
            _reason!,
            _reason == 'Other' ? _details.text.trim() : null,
          );
      if (mounted) Navigator.of(context).pop(message);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom +
            MediaQuery.paddingOf(context).bottom +
            AppSpace.lg,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: RadioGroup<String>(
            groupValue: _reason,
            onChanged: (value) => setState(() => _reason = value),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Why are you cancelling?',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: AppSpace.sm),
                if (_failure != null) MessageBanner(message: _failure!.message),
                for (final reason in OrderReasons.cancel)
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: reason,
                    title: Text(reason),
                  ),
                if (_reason == 'Other')
                  AppTextField(
                    label: 'Tell us why',
                    controller: _details,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 300,
                    showCounter: true,
                    textCapitalization: TextCapitalization.sentences,
                    validator: (value) =>
                        Rules.words(value, 'The reason', min: 10, max: 300),
                    serverError: _failure?.errorFor('details'),
                  ),
                const SizedBox(height: AppSpace.lg),
                SubmitButton(
                  label: 'Cancel order',
                  busyLabel: 'Cancelling…',
                  color: StatusTone.rose.foreground,
                  onPressed: _reason == null ? null : _submit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Four segments that fill as the order moves along, with the step names under them.
class _OrderProgress extends StatelessWidget {
  const _OrderProgress({required this.step});

  static const _steps = ['Placed', 'Packed', 'On the way', 'Delivered'];

  final int step;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Step ${step + 1} of ${_steps.length}: ${_steps[step]}',
      excludeSemantics: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            if (i > 0) const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: i <= step ? 1 : 0),
                    duration: Duration(milliseconds: 380 + 120 * i),
                    curve: Motion.settle,
                    builder: (context, fill, _) => ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      child: LinearProgressIndicator(
                        value: fill,
                        minHeight: 5,
                        color: _color(step),
                        backgroundColor: AppColors.stone100,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _steps[i],
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: i == step ? FontWeight.w600 : FontWeight.w400,
                      color: i <= step
                          ? AppColors.stone800
                          : AppColors.stone400,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Green once delivered, brand red on the way there.
  static Color _color(int step) =>
      step == 3 ? StatusTone.emerald.foreground : AppColors.brandRed;
}

/// The rider collecting the returned item: booked, rider assigned, collected, back with the shop.
class _PickupProgress extends StatelessWidget {
  const _PickupProgress({required this.pickup});

  final ReturnPickup pickup;

  static const _steps = [
    'Booked',
    'Rider assigned',
    'Collected',
    'Back with the shop',
  ];

  @override
  Widget build(BuildContext context) {
    final cancelled = pickup.status == 'cancelled';
    final line = switch (pickup.status) {
      'requested' => 'Keep the item packed. A rider will come to collect it; we will tell you who.',
      'assigned' =>
        '${pickup.riderName ?? 'A rider'} will collect the item. Keep your phone on.',
      'collected' => 'The rider has the item and is taking it to the shop.',
      'delivered' => 'The rider handed the item to the shop.',
      'received' => 'The shop has the item back. This return is complete.',
      _ => pickup.cancelReason ?? 'The pickup was cancelled.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'Return pickup',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            StatusChip(
              label: pickup.statusLabel,
              tone: cancelled ? StatusTone.rose : StatusTone.blue,
            ),
          ],
        ),
        if (!cancelled) ...[
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              for (var i = 0; i < _steps.length; i++)
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(
                      right: i == _steps.length - 1 ? 0 : 4,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 4,
                          decoration: BoxDecoration(
                            color: i <= pickup.step
                                ? AppColors.ink
                                : AppColors.stone200,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _steps[i],
                          style: TextStyle(
                            fontSize: 11,
                            height: 1.2,
                            fontWeight: i <= pickup.step
                                ? FontWeight.w600
                                : FontWeight.w400,
                            color: i <= pickup.step
                                ? AppColors.ink
                                : AppColors.stone400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ],
        const SizedBox(height: AppSpace.sm),
        Text(
          line,
          style: const TextStyle(color: AppColors.stone600, height: 1.4),
        ),
        if (pickup.attempts > 0 && pickup.status == 'assigned')
          Text(
            'Missed visit ${pickup.attempts} of ${pickup.maxAttempts}${pickup.lastFailure != null ? ': ${pickup.lastFailure}' : ''}',
            style: TextStyle(fontSize: 13, color: StatusTone.amber.foreground),
          ),
      ],
    );
  }
}
