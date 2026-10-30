import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/account_actions.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';

/// More: deliveries, riders, messages and the account. Office work stays on the website, and these link there.
class HubMoreScreen extends ConsumerWidget {
  const HubMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(hubUnreadProvider).value ?? 0;
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.lg),
        children: [
          LinkList(
            children: [
              LinkTile(
                icon: LucideIcons.packagePlus,
                title: 'Parcel intake',
                subtitle: 'Expected and received today',
                onTap: () => context.push(LogisticsPaths.hubIntake),
              ),
              LinkTile(
                icon: LucideIcons.truck,
                title: 'Deliveries',
                subtitle: 'On the road, and failed deliveries',
                onTap: () => context.push(LogisticsPaths.hubDeliveries),
              ),
              LinkTile(
                icon: LucideIcons.bike,
                title: 'Riders',
                subtitle: 'Applications and delivery areas',
                onTap: () => context.push(LogisticsPaths.hubRiders),
              ),
              LinkTile(
                icon: LucideIcons.messageCircle,
                title: 'Messages',
                subtitle: 'Your riders and your courier',
                badge: unread,
                onTap: () async {
                  await context.push(LogisticsPaths.hubChats);
                  if (context.mounted) {
                    await ref.read(hubUnreadProvider.notifier).refresh();
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Account'),
          RiderCard(
            child: _HubAccount(
              name: user?.fullName ?? '',
              email: user?.email ?? '',
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('On the website'),
          const LinkList(
            children: [
              WebsiteTile(
                icon: LucideIcons.chartColumn,
                title: 'Reports',
                path: LogisticsPaths.webHubReports,
              ),
              WebsiteTile(
                icon: LucideIcons.wallet,
                title: 'Earnings',
                path: LogisticsPaths.webHubEarnings,
              ),
              WebsiteTile(
                icon: LucideIcons.settings,
                title: 'Settings',
                path: LogisticsPaths.webHubSettings,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const HomeSwitchList(),
          const SizedBox(height: AppSpace.md),
          const Center(child: SignOutButton()),
        ],
      ),
    );
  }
}

class _HubAccount extends ConsumerStatefulWidget {
  const _HubAccount({required this.name, required this.email});

  final String name;
  final String email;

  @override
  ConsumerState<_HubAccount> createState() => _HubAccountState();
}

class _HubAccountState extends ConsumerState<_HubAccount> {
  HubProfile? _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final profile = await ref.read(hubApiProvider).profile();
      if (mounted) setState(() => _profile = profile);
    } catch (_) {
      // Who is signed in still shows; the hub's details come back with the next visit.
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.name, style: RiderText.name),
        Text(widget.email, style: RiderText.body),
        if (profile != null) ...[
          const Divider(height: AppSpace.xl),
          FactRow('Hub', profile.hubName),
          FactRow('Address', profile.address),
          FactRow(
            'Coverage',
            '${profile.coverageCount} barangay${profile.coverageCount == 1 ? '' : 's'}',
          ),
          if (profile.courierName != null)
            FactRow(
              'Your courier',
              [
                profile.courierName!,
                ?profile.courierPhone,
                ?profile.courierEmail,
              ].join(' · '),
            ),
          const Text(
            'Your courier approves these details, so ask them to change any of it.',
            style: TextStyle(fontSize: 13, color: AppColors.gray600),
          ),
        ],
      ],
    );
  }
}
