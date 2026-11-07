import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/returns/return_pickups.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/rider_widgets.dart';

const _missed = [
  'Nobody was home.',
  'The buyer did not answer calls or texts.',
  'The buyer was not ready to hand it over.',
];

/// Return pickups given to this rider: collect the returned item from the buyer (camera photo) or record a missed
/// visit, then hand it to the shop. Three missed visits cancel the pickup.
class ReturnPickupsScreen extends ConsumerStatefulWidget {
  const ReturnPickupsScreen({super.key});

  @override
  ConsumerState<ReturnPickupsScreen> createState() =>
      _ReturnPickupsScreenState();
}

class _ReturnPickupsScreenState extends ConsumerState<ReturnPickupsScreen> {
  final _picker = PhotoPicker();
  List<ReturnPickup>? _jobs;
  ApiFailure? _failure;
  int? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (jobs, _) = await ref.read(returnPickupApiProvider).list('rider');
      if (!mounted) return;
      setState(() {
        _jobs = jobs
            .where((j) => j.status == 'assigned' || j.status == 'collected')
            .toList();
        _failure = null;
      });
    } catch (error) {
      if (mounted && _jobs == null) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  Future<void> _run(int id, Future<String> Function() work) async {
    setState(() => _busy = id);
    try {
      final message = await work();
      if (!mounted) return;
      showRiderMessage(context, message);
      await _load();
    } on ApiFailure catch (failure) {
      if (mounted) showRiderMessage(context, failure.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _collect(ReturnPickup job) async {
    final photo = await _picker.takePhoto(
      context,
      reason: 'Take a photo of the returned item as you collect it.',
      kind: UploadKind.proofPhoto,
    );
    if (photo == null || !mounted) return;
    await _run(
      job.id,
      () => ref.read(returnPickupApiProvider).collected(job.id, photo),
    );
  }

  Future<void> _missedVisit(ReturnPickup job) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.lg,
                0,
                AppSpace.lg,
                AppSpace.sm,
              ),
              child: Text(
                "Why couldn't you collect it?",
                style: RiderText.name,
              ),
            ),
            for (final m in _missed)
              ListTile(
                title: Text(m, style: RiderText.body),
                onTap: () => Navigator.of(sheet).pop(m),
              ),
            const SizedBox(height: AppSpace.md),
          ],
        ),
      ),
    );
    if (reason == null || !mounted) return;
    await _run(
      job.id,
      () => ref.read(returnPickupApiProvider).failed(job.id, reason),
    );
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _jobs;
    return Scaffold(
      appBar: AppBar(title: const Text('Return pickups')),
      body: jobs == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 2))
          : RefreshIndicator(
              onRefresh: _load,
              child: jobs.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 80),
                        EmptyState(
                          icon: LucideIcons.undo2,
                          title: 'No return pickups',
                          message: 'When your hub gives you a returned item to collect, it shows here.',
                        ),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      children: [
                        for (final job in jobs) ...[
                          _JobCard(
                            job: job,
                            busy: _busy == job.id,
                            onCollect: () => _collect(job),
                            onMissed: () => _missedVisit(job),
                            onDelivered: () => _run(
                              job.id,
                              () => ref
                                  .read(returnPickupApiProvider)
                                  .delivered(job.id),
                            ),
                          ),
                          const SizedBox(height: AppSpace.md),
                        ],
                      ],
                    ),
            ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({
    required this.job,
    required this.busy,
    required this.onCollect,
    required this.onMissed,
    required this.onDelivered,
  });

  final ReturnPickup job;
  final bool busy;
  final VoidCallback onCollect;
  final VoidCallback onMissed;
  final VoidCallback onDelivered;

  @override
  Widget build(BuildContext context) {
    final collected = job.status == 'collected';
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${job.code} · ${job.orderNumber ?? ''}',
            style: RiderText.label,
          ),
          const SizedBox(height: AppSpace.sm),
          _Stop(
            icon: LucideIcons.userRound,
            title: job.buyerName ?? 'Buyer',
            address: job.buyerAddress ?? '',
            phone: collected ? null : job.buyerPhone,
            dim: collected,
          ),
          const SizedBox(height: AppSpace.sm),
          _Stop(
            icon: LucideIcons.store,
            title: job.shopName ?? 'Shop',
            address: job.shopAddress ?? '',
            phone: collected ? job.shopPhone : null,
            dim: !collected,
          ),
          if (job.attempts > 0 && !collected) ...[
            const SizedBox(height: AppSpace.sm),
            Text(
              'Missed visit ${job.attempts} of ${job.maxAttempts}${job.lastFailure != null ? ': ${job.lastFailure}' : ''}',
              style: TextStyle(
                fontSize: 14,
                color: StatusTone.amber.foreground,
              ),
            ),
          ],
          const SizedBox(height: AppSpace.lg),
          if (collected)
            FilledButton.icon(
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: busy ? null : onDelivered,
              icon: const Icon(LucideIcons.package),
              label: Text(busy ? 'Saving…' : 'Handed to the shop'),
            )
          else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                    ),
                    onPressed: busy ? null : onMissed,
                    child: const Text("Couldn't collect"),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(52),
                    ),
                    onPressed: busy ? null : onCollect,
                    icon: const Icon(LucideIcons.camera),
                    label: Text(busy ? 'Saving…' : 'Collected'),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _Stop extends StatelessWidget {
  const _Stop({
    required this.icon,
    required this.title,
    required this.address,
    required this.dim,
    this.phone,
  });

  final IconData icon;
  final String title;
  final String address;
  final String? phone;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: dim ? 0.55 : 1,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.stone600),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: RiderText.name),
                if (address.isNotEmpty) Text(address, style: RiderText.body),
              ],
            ),
          ),
          if (phone != null && phone!.isNotEmpty) CallButton(phone: phone!),
        ],
      ),
    );
  }
}
