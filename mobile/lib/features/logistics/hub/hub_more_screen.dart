import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/account_actions.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'hub_kit.dart';

/// More: the hub's own card, deliveries, riders, messages and the account. Office work stays on the website, and these
/// link there.
class HubMoreScreen extends ConsumerWidget {
  const HubMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(hubUnreadProvider).value ?? 0;
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.xs,
          AppSpace.lg,
          AppSpace.lg + dockInset(context),
        ),
        children: [
          _HubCard(name: user?.fullName ?? '', email: user?.email ?? ''),
          const SizedBox(height: AppSpace.xl),
          const HubSection(title: 'Your work'),
          LinkList(
            children: [
              _WorkTile(
                icon: LucideIcons.packagePlus,
                title: 'Parcel intake',
                subtitle: 'Expected and received today',
                onTap: () => context.push(LogisticsPaths.hubIntake),
              ),
              _WorkTile(
                icon: LucideIcons.truck,
                title: 'Deliveries',
                subtitle: 'On the road, and failed deliveries',
                onTap: () => context.push(LogisticsPaths.hubDeliveries),
              ),
              _WorkTile(
                icon: LucideIcons.packageOpen,
                title: 'Return pickups',
                subtitle: 'Returned items to collect from buyers',
                onTap: () => context.push(LogisticsPaths.hubReturnPickups),
              ),
              _WorkTile(
                icon: LucideIcons.history,
                title: 'Activity log',
                subtitle: 'Scans, trucks, returns, cancellations',
                onTap: () => context.push(LogisticsPaths.hubActivity),
              ),
              _WorkTile(
                icon: LucideIcons.bike,
                title: 'Riders',
                subtitle: 'Applications and delivery areas',
                onTap: () => context.push(LogisticsPaths.hubRiders),
              ),
              _WorkTile(
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
          const SizedBox(height: AppSpace.xl),
          const HubSection(
            title: 'On the website',
            note: 'Office work, where a bigger screen helps.',
          ),
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
          const SignOutButton(),
        ],
      ),
    );
  }
}

class _WorkTile extends StatelessWidget {
  const _WorkTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 68,
      leading: RiderIconTile(
        icon: icon,
        size: 42,
        color: AppColors.gray900,
        background: AppColors.gray100,
      ),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 15.5,
          fontWeight: FontWeight.w600,
          color: AppColors.gray900,
        ),
      ),
      subtitle: Text(subtitle, style: HubText.small),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (badge > 0)
            Badge(
              backgroundColor: AppColors.brandRed,
              label: Text(badge > 99 ? '99+' : '$badge'),
            ),
          const SizedBox(width: AppSpace.xs),
          const Icon(
            LucideIcons.chevronRight,
            size: 18,
            color: AppColors.gray600,
          ),
        ],
      ),
      onTap: onTap,
    );
  }
}

/// Which hub this is, who is signed in, and who to ask to change any of it.
class _HubCard extends ConsumerStatefulWidget {
  const _HubCard({required this.name, required this.email});

  final String name;
  final String email;

  @override
  ConsumerState<_HubCard> createState() => _HubCardState();
}

class _HubCardState extends ConsumerState<_HubCard> {
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpace.lg),
          decoration: BoxDecoration(
            color: AppColors.gray900,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  LucideIcons.warehouse,
                  size: 26,
                  color: AppColors.white,
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile?.hubName ?? 'Your hub',
                      style: BuyerText.screenTitle.copyWith(
                        fontSize: 20,
                        color: AppColors.white,
                      ),
                    ),
                    if (widget.name.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        widget.name,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppColors.white.withValues(alpha: 0.85),
                        ),
                      ),
                    ],
                    Text(
                      widget.email,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.white.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (profile != null) ...[
          const SizedBox(height: AppSpace.md),
          RiderCard(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.sm,
              AppSpace.lg,
              AppSpace.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                HubFact(
                  icon: LucideIcons.mapPin,
                  label: 'Address',
                  value: profile.address,
                ),
                HubFact(
                  icon: LucideIcons.mapPinned,
                  label: 'Coverage',
                  value:
                      '${profile.coverageCount} barangay${profile.coverageCount == 1 ? '' : 's'}',
                ),
                if (profile.courierName != null)
                  HubFact(
                    icon: LucideIcons.building2,
                    label: 'Your courier',
                    value: [
                      profile.courierName!,
                      ?profile.courierPhone,
                      ?profile.courierEmail,
                    ].join(' · '),
                  ),
                const SizedBox(height: AppSpace.xs),
                const HubHint(
                  text: 'Your courier approves these details, so ask them to change any of it.',
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
