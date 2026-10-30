import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/account_actions.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../rider_paths.dart';
import '../widgets/rider_app_bar.dart';
import '../widgets/rider_widgets.dart';

/// Account (C8): who the rider is, their hub and company, vehicle, license and documents, the GCash for payouts,
/// their areas, and sign out.
class RiderAccountScreen extends ConsumerStatefulWidget {
  const RiderAccountScreen({super.key});

  @override
  ConsumerState<RiderAccountScreen> createState() => _RiderAccountScreenState();
}

class _RiderAccountScreenState extends ConsumerState<RiderAccountScreen> {
  RiderProfile? _profile;
  GcashAccount? _gcash;
  ApiFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(riderApiProvider);
    try {
      final results = await Future.wait<Object>([api.me(), api.gcash()]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as RiderProfile;
        _gcash = results[1] as GcashAccount;
        _failure = null;
      });
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  Future<void> _open(String path, {Object? extra}) async {
    await context.push(path, extra: extra);
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: const RiderAppBar(title: 'Account'),
      body: profile == null
          ? (_failure != null
                // Switching home and signing out work with no internet, so they stay reachable.
                ? ListView(
                    padding: const EdgeInsets.all(AppSpace.lg),
                    children: [
                      SizedBox(
                        height: 320,
                        child: ErrorRetry(failure: _failure!, onRetry: _load),
                      ),
                      const HomeSwitchList(),
                      const SizedBox(height: AppSpace.md),
                      const Center(child: SignOutButton()),
                    ],
                  )
                : const SkeletonList(count: 4))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpace.lg),
                children: [
                  _Header(profile: profile),
                  const SizedBox(height: AppSpace.md),
                  ..._notices(profile),
                  const RiderSectionTitle('Vehicle and license'),
                  _Tiles(
                    children: [
                      _Tile(
                        icon: LucideIcons.bike,
                        title:
                            '${profile.vehicleType} · ${profile.plateNumber}',
                        subtitle: 'Change vehicle or plate',
                        onTap: () => _open(RiderPaths.vehicle, extra: profile),
                      ),
                      _Tile(
                        icon: LucideIcons.idCard,
                        title: profile.licenseNumber ?? 'Driver\'s license',
                        subtitle: profile.licenseExpiryDate == null
                            ? 'Add your license'
                            : 'Expires ${Fmt.date(DateTime.utc(profile.licenseExpiryDate!.year, profile.licenseExpiryDate!.month, profile.licenseExpiryDate!.day))}',
                        onTap: () => _open(RiderPaths.license, extra: profile),
                      ),
                      for (final doc in profile.documents)
                        _Tile(
                          icon: LucideIcons.fileText,
                          title: doc.label,
                          subtitle: 'View the document you sent',
                          onTap: () => context.push(
                            RiderPaths.document(doc.key),
                            extra: doc.label,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: AppSpace.lg),
                  const RiderSectionTitle('Payouts'),
                  _Tiles(
                    children: [
                      _Tile(
                        icon: LucideIcons.wallet,
                        title: _gcash?.isSet == true
                            ? 'GCash ${_gcash!.number}'
                            : 'Add your GCash',
                        subtitle: _gcash?.isSet == true
                            ? _gcash!.name ?? ''
                            : 'Your courier company pays your earnings here.',
                        onTap: () => _open(RiderPaths.gcash, extra: _gcash),
                      ),
                    ],
                  ),
                  if (profile.activeAreas.isNotEmpty) ...[
                    const SizedBox(height: AppSpace.lg),
                    const RiderSectionTitle('Your areas'),
                    RiderCard(
                      child: Wrap(
                        spacing: AppSpace.sm,
                        runSpacing: AppSpace.sm,
                        children: [
                          for (final area in profile.activeAreas)
                            StatusChip(label: area, tone: StatusTone.blue),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpace.lg),
                  const HomeSwitchList(),
                  const SizedBox(height: AppSpace.md),
                  const Center(child: SignOutButton()),
                ],
              ),
            ),
    );
  }

  List<Widget> _notices(RiderProfile profile) {
    final expiry = profile.licenseExpiryDate;
    final today = Rules.manilaToday();
    final daysLeft = expiry == null
        ? null
        : DateTime(
            expiry.year,
            expiry.month,
            expiry.day,
          ).difference(today).inDays;
    return [
      if (profile.isSuspended)
        MessageBanner(
          message: profile.suspensionReason == null
              ? 'Your rider account is suspended. Your courier company can tell you why.'
              : 'Your rider account is suspended: ${profile.suspensionReason}',
        ),
      if (daysLeft != null && daysLeft < 0)
        const MessageBanner(
          message: 'Your driver\'s license has expired. Update it to go Online again.',
        )
      else if (daysLeft != null && daysLeft <= 30)
        MessageBanner(
          tone: StatusTone.amber,
          message:
              'Your driver\'s license expires in $daysLeft day${daysLeft == 1 ? '' : 's'}. Renew it and update it here.',
        ),
      if (profile.needsReverification)
        const MessageBanner(
          tone: StatusTone.amber,
          message:
              'Your courier company is checking the documents you changed.',
        ),
    ].expand((w) => [w, const SizedBox(height: AppSpace.md)]).toList();
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});

  final RiderProfile profile;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(profile.fullName, style: RiderText.name)),
              StatusChip(
                label: profile.isSuspended ? 'Suspended' : 'Active',
                tone: profile.isSuspended
                    ? StatusTone.rose
                    : StatusTone.emerald,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
          Text(profile.email, style: RiderText.body),
          if (profile.phone.isNotEmpty)
            Text(profile.phone, style: RiderText.body),
          const Divider(height: AppSpace.xl),
          if (profile.hubName != null)
            InfoRow(
              icon: LucideIcons.warehouse,
              text: [
                profile.hubName!,
                if (profile.hubCity?.isNotEmpty == true) profile.hubCity!,
              ].join(', '),
            ),
          if (profile.companyName != null) ...[
            const SizedBox(height: AppSpace.xs),
            InfoRow(icon: LucideIcons.truck, text: profile.companyName!),
          ],
        ],
      ),
    );
  }
}

class _Tiles extends StatelessWidget {
  const _Tiles({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              const Divider(indent: AppSpace.lg, endIndent: AppSpace.lg),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 64,
      leading: Icon(icon, color: AppColors.gray900),
      title: Text(
        title,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: AppColors.gray900,
        ),
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(
              subtitle,
              style: const TextStyle(fontSize: 14, color: AppColors.gray600),
            ),
      trailing: const Icon(LucideIcons.chevronRight, color: AppColors.gray600),
      onTap: onTap,
    );
  }
}
