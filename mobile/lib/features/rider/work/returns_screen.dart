import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../location/location_beacon.dart';
import '../widgets/rider_widgets.dart';

/// Returns to the seller (C5): parcels that could not be delivered go back to the shop. The rider marks each one
/// handed back; the seller then confirms it arrived.
class ReturnsScreen extends ConsumerStatefulWidget {
  const ReturnsScreen({super.key});

  @override
  ConsumerState<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends ConsumerState<ReturnsScreen> {
  List<ReturnJob>? _jobs;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final jobs = await ref.read(riderApiProvider).returns();
      if (mounted) {
        setState(() {
          _jobs = jobs;
          _failure = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _returned(ReturnJob job) async {
    final confirmed = await confirmAction(
      context,
      title: 'Handed back to the seller?',
      message:
          'Only confirm once ${job.shopName} has the parcel ${job.trackingNumber}.',
      confirmLabel: 'Returned',
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(
      context,
      () => ref.read(riderApiProvider).returned(job.trackingNumber),
    );
    if (ok) {
      unawaited(ref.read(riderStatusProvider.notifier).refresh());
      unawaited(ref.read(locationBeaconProvider.notifier).refresh());
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _jobs;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Returns to the seller')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: jobs == null
            ? (_failure != null
                  ? ListView(
                      children: [
                        SizedBox(
                          height: 420,
                          child: ErrorRetry(failure: _failure!, onRetry: _load),
                        ),
                      ],
                    )
                  : const SkeletonList(count: 2))
            : jobs.isEmpty
            ? ListView(
                children: const [
                  SizedBox(
                    height: 420,
                    child: EmptyState(
                      icon: LucideIcons.undo2,
                      title: 'No returns',
                      message: 'Parcels the hub sends back to a shop with you show here.',
                    ),
                  ),
                ],
              )
            : ListView.separated(
                padding: const EdgeInsets.all(AppSpace.lg),
                itemCount: jobs.length,
                separatorBuilder: (_, _) => const SizedBox(height: AppSpace.md),
                itemBuilder: (context, index) => _ReturnCard(
                  job: jobs[index],
                  onReturned: () => _returned(jobs[index]),
                ),
              ),
      ),
    );
  }
}

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({required this.job, required this.onReturned});

  final ReturnJob job;
  final Future<void> Function() onReturned;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(job.shopName, style: RiderText.name),
          const SizedBox(height: AppSpace.sm),
          if (job.shopPhone != null)
            InfoRow(
              icon: LucideIcons.phone,
              text: job.shopPhone!,
              action: CallButton(phone: job.shopPhone!),
            ),
          if (job.address.isNotEmpty)
            InfoRow(
              icon: LucideIcons.mapPin,
              text: job.address,
              action: MapsButton(address: job.address),
            ),
          TrackingNumberText(job.trackingNumber),
          if (job.failures.isNotEmpty) ...[
            const SizedBox(height: AppSpace.xs),
            Text(
              'Why: ${job.failures.join(' · ')}',
              style: TextStyle(
                fontSize: 15,
                color: StatusTone.amber.foreground,
              ),
            ),
          ],
          const SizedBox(height: AppSpace.md),
          SubmitButton(
            label: 'Handed back to the seller',
            busyLabel: 'Sending…',
            icon: LucideIcons.packageCheck,
            onPressed: onReturned,
          ),
        ],
      ),
    );
  }
}
