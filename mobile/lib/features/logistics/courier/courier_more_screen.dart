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

/// More: dispatch, hub scanning, COD, messages and the account. Office work (zones and rates, settlements, payouts,
/// reports, exports, company settings) stays on the website, and these link there.
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
        padding: const EdgeInsets.all(AppSpace.lg),
        children: [
          LinkList(
            children: [
              LinkTile(
                icon: LucideIcons.navigation,
                title: 'Dispatch',
                subtitle: 'Unassigned and offered pickups',
                onTap: () => context.push(LogisticsPaths.courierDispatch),
              ),
              LinkTile(
                icon: LucideIcons.scanLine,
                title: 'Hub scanning',
                subtitle: 'Inbound, sort, outbound',
                onTap: () => context.push(LogisticsPaths.courierScan),
              ),
              LinkTile(
                icon: LucideIcons.coins,
                title: 'COD',
                subtitle: 'Collections and remittances',
                onTap: () => context.push(LogisticsPaths.courierCod),
              ),
              LinkTile(
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
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Account'),
          RiderCard(
            child: _CourierAccount(
              name: user?.fullName ?? '',
              email: user?.email ?? '',
              role: user?.logisticsCompany?.memberRole,
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('On the website'),
          const LinkList(
            children: [
              WebsiteTile(
                icon: LucideIcons.map,
                title: 'Zones and rates',
                path: LogisticsPaths.webCourierShipping,
              ),
              WebsiteTile(
                icon: LucideIcons.banknote,
                title: 'Settlements and pay',
                path: LogisticsPaths.webCourierMoney,
              ),
              WebsiteTile(
                icon: LucideIcons.undo2,
                title: 'Return to sender',
                path: LogisticsPaths.webCourierReturns,
              ),
              WebsiteTile(
                icon: LucideIcons.chartColumn,
                title: 'Reports and exports',
                path: LogisticsPaths.webCourierReports,
              ),
              WebsiteTile(
                icon: LucideIcons.settings,
                title: 'Company settings',
                path: LogisticsPaths.webCourierSettings,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(widget.name, style: RiderText.name),
        Text(widget.email, style: RiderText.body),
        if (company != null) ...[
          const Divider(height: AppSpace.xl),
          FactRow('Company', [company.name, ?company.code].join(' · ')),
          FactRow(
            'Contact',
            [?company.contactPhone, ?company.contactEmail].join(' · '),
          ),
        ],
      ],
    );
  }
}
