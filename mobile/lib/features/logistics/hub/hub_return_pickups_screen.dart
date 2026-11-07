import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/returns/return_pickups.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// Return pickups in this hub's area: approved returns a rider collects from the buyer and takes to the shop. Give
/// each waiting one to a rider; one not collected yet can go to another rider.
class HubReturnPickupsScreen extends ConsumerStatefulWidget {
  const HubReturnPickupsScreen({super.key});

  @override
  ConsumerState<HubReturnPickupsScreen> createState() =>
      _HubReturnPickupsScreenState();
}

class _HubReturnPickupsScreenState
    extends ConsumerState<HubReturnPickupsScreen> {
  final _view =
      GlobalKey<LoadViewState<(List<ReturnPickup>, List<PickupRider>)>>();

  Future<void> _assign(ReturnPickup pickup, List<PickupRider> riders) async {
    final riderId = await showModalBottomSheet<int>(
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
                'Who collects ${pickup.code}?',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray900,
                ),
              ),
            ),
            if (riders.isEmpty)
              const Padding(
                padding: EdgeInsets.all(AppSpace.lg),
                child: Text('You have no active rider.'),
              ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final r in riders)
                    ListTile(
                      leading: Icon(
                        LucideIcons.bike,
                        color: r.online
                            ? StatusTone.emerald.foreground
                            : AppColors.stone400,
                      ),
                      title: Text(r.name),
                      subtitle: Text(r.online ? 'Online' : 'Offline'),
                      onTap: () => Navigator.of(sheet).pop(r.id),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.md),
          ],
        ),
      ),
    );
    if (riderId == null || !mounted) return;
    try {
      final message = await ref
          .read(returnPickupApiProvider)
          .assign(pickup.id, riderId);
      if (!mounted) return;
      showRiderMessage(context, message);
      await _view.currentState?.reload();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Return pickups')),
      body: LoadView<(List<ReturnPickup>, List<PickupRider>)>(
        key: _view,
        load: () => ref.read(returnPickupApiProvider).list('hub'),
        refreshEvery: const Duration(seconds: 30),
        builder: (context, data) {
          final (pickups, riders) = data;
          final open = pickups.where((p) => p.isOpen).toList();
          return ListView(
            padding: const EdgeInsets.all(AppSpace.lg),
            children: [
              if (open.isEmpty)
                const EmptyState(
                  icon: LucideIcons.undo2,
                  title: 'No return pickups',
                  message: 'When a shop approves a return in your area, it shows here for you to give to a rider.',
                )
              else ...[
                const HubSection(title: 'To collect from buyers'),
                for (final p in open) ...[
                  RiderCard(
                    padding: const EdgeInsets.all(AppSpace.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                p.code,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.gray900,
                                ),
                              ),
                            ),
                            StatusChip(
                              label: p.statusLabel,
                              tone: p.status == 'requested'
                                  ? StatusTone.amber
                                  : StatusTone.blue,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpace.xs),
                        Text(
                          'From ${p.buyerName ?? 'the buyer'} · ${p.buyerBarangay ?? ''}',
                          style: HubText.small,
                        ),
                        Text(
                          'To ${p.shopName ?? 'the shop'}',
                          style: HubText.small,
                        ),
                        if (p.assignedRider != null)
                          Text(
                            'Rider: ${p.assignedRider}',
                            style: HubText.small,
                          ),
                        if (p.attempts > 0)
                          Text(
                            'Missed ${p.attempts} of ${p.maxAttempts}',
                            style: TextStyle(
                              fontSize: 13,
                              color: StatusTone.amber.foreground,
                            ),
                          ),
                        if (p.status != 'collected') ...[
                          const SizedBox(height: AppSpace.sm),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: LogisticsLook.hubAction,
                              minimumSize: const Size.fromHeight(44),
                            ),
                            onPressed: () => _assign(p, riders),
                            child: Text(
                              p.assignedRider == null
                                  ? 'Give to a rider'
                                  : 'Change the rider',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpace.md),
                ],
              ],
            ],
          );
        },
      ),
    );
  }
}
