import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';

/// Saved addresses (B7), up to 10. With [picking], tapping one sends it back to checkout.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key, this.picking = false});

  final bool picking;

  static const max = 10;

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    Address address,
  ) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete this address?',
      message: address.oneLine,
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed) return;
    try {
      await ref.read(buyerApiProvider).deleteAddress(address.id);
      ref.invalidate(addressesProvider);
      if (context.mounted) showSnack(context, 'Address deleted.');
    } catch (error) {
      if (context.mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  Future<void> _makeDefault(
    BuildContext context,
    WidgetRef ref,
    Address address,
  ) async {
    try {
      await ref.read(buyerApiProvider).makeDefaultAddress(address.id);
      ref.invalidate(addressesProvider);
    } catch (error) {
      if (context.mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressesProvider);
    final count = addresses.value?.length ?? 0;
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: Text(picking ? 'Deliver to' : 'My addresses')),
      body: addresses.when(
        loading: () => const SkeletonList(count: 3),
        error: (error, _) => ErrorRetry(
          failure: ApiFailure.from(error),
          onRetry: () => ref.invalidate(addressesProvider),
        ),
        data: (list) => list.isEmpty
            ? EmptyState(
                icon: LucideIcons.mapPin,
                title: 'No addresses yet',
                message: 'Add where your orders should go.',
                actionLabel: 'Add address',
                onAction: () => context.push(BuyerPaths.newAddress),
              )
            : RefreshIndicator(
                onRefresh: () => ref.refresh(addressesProvider.future),
                child: ListView(
                  padding: const EdgeInsets.only(top: AppSpace.md, bottom: 96),
                  children: [
                    for (final address in list)
                      BlockCard(
                        padding: EdgeInsets.zero,
                        child: InkWell(
                          borderRadius: AppRadius.cardAll,
                          onTap: picking
                              ? (address.needsUpdate
                                    ? () => context.push(
                                        BuyerPaths.editAddress,
                                        extra: address,
                                      )
                                    : () => context.pop(address))
                              : () => context.push(
                                  BuyerPaths.editAddress,
                                  extra: address,
                                ),
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpace.lg),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        '${address.fullName} · ${address.phone}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    StatusChip(
                                      label: address.label == 'office'
                                          ? 'Office'
                                          : 'Home',
                                      tone: StatusTone.gray,
                                    ),
                                    if (address.isDefault) ...[
                                      const SizedBox(width: 6),
                                      const StatusChip(
                                        label: 'Default',
                                        tone: StatusTone.emerald,
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  address.oneLine,
                                  style: const TextStyle(
                                    color: AppColors.stone600,
                                  ),
                                ),
                                if (address.needsUpdate) ...[
                                  const SizedBox(height: AppSpace.sm),
                                  const MessageBanner(
                                    message: 'Pick this address\'s barangay again before ordering to it.',
                                    tone: StatusTone.amber,
                                  ),
                                ],
                                if (!picking)
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (!address.isDefault)
                                        TextButton(
                                          onPressed: () => _makeDefault(
                                            context,
                                            ref,
                                            address,
                                          ),
                                          child: const Text('Make default'),
                                        ),
                                      TextButton(
                                        style: TextButton.styleFrom(
                                          foregroundColor:
                                              StatusTone.rose.foreground,
                                        ),
                                        onPressed: () =>
                                            _delete(context, ref, address),
                                        child: const Text('Delete'),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
      floatingActionButton: count >= max || addresses.isLoading
          ? null
          : FloatingActionButton.extended(
              backgroundColor: AppColors.brandRed,
              foregroundColor: AppColors.white,
              onPressed: () => context.push(BuyerPaths.newAddress),
              icon: const Icon(LucideIcons.plus),
              label: const Text('Add address'),
            ),
      bottomNavigationBar: count >= max
          ? const SafeArea(
              child: Padding(
                padding: EdgeInsets.all(AppSpace.lg),
                child: MessageBanner(
                  message: 'You can save up to 10 addresses. Delete one to add another.',
                  tone: StatusTone.amber,
                ),
              ),
            )
          : null,
    );
  }
}
