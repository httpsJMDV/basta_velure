import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/account_actions.dart';
import '../../reports/report_data.dart';
import '../../reports/report_screen.dart';
import '../../settings/notification_sound_screen.dart';
import '../../buyer/widgets/buyer_theme.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../data/logistics_state.dart';
import '../logistics_paths.dart';
import '../widgets/logistics_widgets.dart';
import 'courier_kit.dart';

/// More: dispatch, hub scanning, COD, messages, the network report and the account. Office work (zones and rates,
/// settlements, payouts, exports, company settings) stays on the website, and these link there.
class CourierMoreScreen extends ConsumerWidget {
  const CourierMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(courierUnreadProvider).value ?? 0;
    final user = ref.watch(currentUserProvider);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.sm,
          AppSpace.lg,
          AppSpace.lg + dockInset(context),
        ),
        children: [
          _CourierAccount(
            name: user?.fullName ?? '',
            email: user?.email ?? '',
            role: user?.logisticsCompany?.memberRole,
          ),
          const SizedBox(height: AppSpace.xl),
          const HubSection(title: 'Your work'),
          StatGrid(
            children: [
              CourierWorkTile(
                icon: LucideIcons.navigation,
                title: 'Dispatch',
                subtitle: 'Unassigned and offered pickups',
                onTap: () => context.push(LogisticsPaths.courierDispatch),
              ),
              CourierWorkTile(
                icon: LucideIcons.scanLine,
                title: 'Hub scanning',
                subtitle: 'Inbound, sort, outbound',
                onTap: () => context.push(LogisticsPaths.courierScan),
              ),
              CourierWorkTile(
                icon: LucideIcons.history,
                title: 'Activity log',
                subtitle: 'Returns, cancellations, every step',
                onTap: () => context.push(LogisticsPaths.courierActivity),
              ),
              CourierWorkTile(
                icon: LucideIcons.container,
                title: 'Truck drivers',
                subtitle: 'Trips between hubs, trip pay',
                onTap: () => context.push(LogisticsPaths.courierTrucks),
              ),
              CourierWorkTile(
                icon: LucideIcons.coins,
                title: 'COD',
                subtitle: 'Collections and remittances',
                onTap: () => context.push(LogisticsPaths.courierCod),
              ),
              CourierWorkTile(
                icon: LucideIcons.messageCircle,
                title: 'Messages',
                subtitle: 'Your hubs',
                badge: unread,
                onTap: () async {
                  await context.push(LogisticsPaths.courierChats);
                  if (context.mounted) {
                    await ref.read(courierUnreadProvider.notifier).refresh();
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          LinkList(
            children: [
              LinkTile(
                icon: LucideIcons.chartColumn,
                title: 'Network report',
                subtitle: 'Every hub with parcels, by day · Excel or PDF',
                onTap: () => openReport(context, ReportKind.courier),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xl),
          const HubSection(
            title: 'Manage your network',
            note: 'Operations, money and settings, all in one place.',
          ),
          LinkList(
            children: [
              LinkTile(
                icon: LucideIcons.map,
                title: 'Zones and rates',
                onTap: () => context.push(LogisticsPaths.courierShipping),
              ),
              LinkTile(
                icon: LucideIcons.banknote,
                title: 'Settlements and pay',
                onTap: () => context.push(LogisticsPaths.courierMoney),
              ),
              LinkTile(
                icon: LucideIcons.undo2,
                title: 'Return to sender',
                onTap: () => context.push(LogisticsPaths.courierReturns),
              ),
              LinkTile(
                icon: LucideIcons.chartColumn,
                title: 'Reports and exports',
                onTap: () => openReport(context, ReportKind.courier),
              ),
              LinkTile(
                icon: LucideIcons.settings,
                title: 'Company settings',
                onTap: () => context.push(LogisticsPaths.courierSettings),
              ),
              LinkTile(
                icon: LucideIcons.mapPin,
                title: 'Network coverage',
                onTap: () => context.push(LogisticsPaths.courierCoverage),
              ),
              LinkTile(
                icon: LucideIcons.truck,
                title: 'Truck planning',
                onTap: () => context.push(LogisticsPaths.courierPlanning),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xl),
          const HubSection(title: 'On this phone'),
          const LinkList(
            children: [NotificationSoundTile(color: AppColors.gray900)],
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

class _CourierAccount extends ConsumerStatefulWidget {
  const _CourierAccount({required this.name, required this.email, this.role});

  final String name;
  final String email;
  final String? role;

  @override
  ConsumerState<_CourierAccount> createState() => _CourierAccountState();
}

class _CourierAccountState extends ConsumerState<_CourierAccount> {
  CourierCompany? _company;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final company = await ref.read(courierApiProvider).company();
      if (mounted) setState(() => _company = company);
    } catch (_) {
      // Who is signed in still shows; the company's details come back with the next visit.
    }
  }

  @override
  Widget build(BuildContext context) {
    final company = _company;
    final dim = AppColors.white.withValues(alpha: 0.72);
    final role = widget.role;
    final contact = company == null
        ? ''
        : [?company.contactPhone, ?company.contactEmail].join(' · ');
    return Container(
      padding: const EdgeInsets.all(AppSpace.lg),
      decoration: BoxDecoration(
        color: AppColors.gray900,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (company != null) ...[
            Text(
              [company.name, ?company.code].join(' · '),
              style: BuyerText.section.copyWith(
                fontSize: 18,
                height: 1.25,
                color: AppColors.white,
              ),
            ),
            if (contact.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(contact, style: TextStyle(fontSize: 13, color: dim)),
            ],
            Divider(
              height: AppSpace.xl,
              color: AppColors.white.withValues(alpha: 0.14),
            ),
          ],
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.name,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.white,
                      ),
                    ),
                    Text(
                      widget.email,
                      style: TextStyle(fontSize: 13, color: dim),
                    ),
                  ],
                ),
              ),
              if (role != null && role.isNotEmpty) ...[
                const SizedBox(width: AppSpace.sm),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    role[0].toUpperCase() + role.substring(1),
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.white,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
