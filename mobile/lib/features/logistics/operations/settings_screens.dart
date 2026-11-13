import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../buyer/account/profile_screens.dart';
import '../courier/courier_hubs_screen.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class PortalSettingsScreen extends ConsumerStatefulWidget {
  const PortalSettingsScreen({super.key, this.courier = false});
  final bool courier;
  @override
  ConsumerState<PortalSettingsScreen> createState() =>
      _PortalSettingsScreenState();
}

class _PortalSettingsScreenState extends ConsumerState<PortalSettingsScreen> {
  final _view = GlobalKey<LoadViewState<List<Json>>>();
  String get _scope => widget.courier ? 'logistics' : 'hub';
  Future<void> _gcash(Json account) async {
    await openPortal(
      context,
      PortalForm(
        title: 'GCash account',
        description: 'Your company uses this account to send or receive payments. Check the name and number carefully.',
        fields: [
          EntryField(
            'gcash_number',
            'GCash mobile number',
            initial: text(account, 'gcash_number', ''),
            required: false,
          ),
          EntryField(
            'gcash_name',
            'Account name',
            initial: text(account, 'gcash_name', ''),
            required: false,
          ),
        ],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call('PATCH', '/$_scope/gcash', data: values);
          return 'GCash account saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  Future<void> _company(Json company) async {
    await openPortal(
      context,
      PortalForm(
        title: 'Company contact',
        description: 'Keep your public contact details current. Reviewed legal details remain protected.',
        fields: [
          EntryField(
            'contact_email',
            'Contact email',
            initial: text(company, 'contact_email', ''),
          ),
          EntryField(
            'contact_phone',
            'Contact mobile',
            initial: text(company, 'contact_phone', ''),
          ),
          EntryField(
            'description',
            'About the company',
            initial: text(company, 'description', ''),
            required: false,
            lines: 4,
          ),
        ],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call('PATCH', '/logistics/company', data: values);
          return 'Company details saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  Future<void> _logo() async {
    await openPortal(
      context,
      PortalForm(
        title: 'Company logo',
        description: 'Use a clear company logo. JPG or PNG, up to 5 MB.',
        fields: const [],
        photoLabel: 'Logo image',
        photoRequired: true,
        save: (_, photo) async {
          await ref
              .read(portalApiProvider)
              .call(
                'POST',
                '/logistics/company/logo',
                data: FormData.fromMap({'logo': photo!.toMultipart()}),
              );
          return 'Company logo saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(
      title: Text(widget.courier ? 'Company settings' : 'Hub settings'),
    ),
    body: LoadView<List<Json>>(
      key: _view,
      load: () => Future.wait([
        ref
            .read(portalApiProvider)
            .get(widget.courier ? '/logistics/me' : '/hub/profile'),
        ref.read(portalApiProvider).get('/$_scope/gcash'),
      ]),
      builder: (_, results) {
        final company = asJson(results[0]['data']),
            gcash = asJson(results[1]['data']);
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            PortalHeader(
              title: text(
                company,
                widget.courier ? 'name' : 'hub_name',
                widget.courier ? 'Your company' : 'Your hub',
              ),
              subtitle: 'Your team, your contact details and a secure payout account.',
              icon: Icons.business_outlined,
            ),
            PortalCard(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: const Text('Your profile'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPortal(context, const ProfileScreen()),
                  ),
                  ListTile(
                    leading: const Icon(Icons.lock_outline),
                    title: const Text('Change password'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () =>
                        openPortal(context, const ChangePasswordScreen()),
                  ),
                  ListTile(
                    leading: const Icon(Icons.email_outlined),
                    title: const Text('Change email'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPortal(context, const ChangeEmailScreen()),
                  ),
                  ListTile(
                    leading: const Icon(Icons.phone_outlined),
                    title: const Text('Change mobile number'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPortal(context, const ChangePhoneScreen()),
                  ),
                ],
              ),
            ),
            PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'GCash account',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(text(gcash, 'gcash_name', 'No account configured')),
                  SelectableText(text(gcash, 'gcash_number', '')),
                  OutlinedButton(
                    onPressed: () => _gcash(gcash),
                    child: const Text('Edit GCash account'),
                  ),
                ],
              ),
            ),
            if (widget.courier)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Public company details',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${text(company, 'contact_email')}\n${text(company, 'contact_phone')}',
                    ),
                    Text(text(company, 'description', '')),
                    OutlinedButton(
                      onPressed: () => _company(company),
                      child: const Text('Edit contact details'),
                    ),
                    TextButton(
                      onPressed: _logo,
                      child: const Text('Update logo'),
                    ),
                  ],
                ),
              ),
            if (!widget.courier)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Hub details',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    for (final key in [
                      'address_street',
                      'address_barangay',
                      'address_city',
                      'address_province',
                    ])
                      if (company[key] != null) Text(text(company, key)),
                    const SizedBox(height: 8),
                    const Text(
                      'Reviewed hub details are managed through Loved-IT support.',
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

class TruckPlanningScreen extends ConsumerStatefulWidget {
  const TruckPlanningScreen({super.key});
  @override
  ConsumerState<TruckPlanningScreen> createState() =>
      _TruckPlanningScreenState();
}

class _TruckPlanningScreenState extends ConsumerState<TruckPlanningScreen> {
  final _view = GlobalKey<LoadViewState<List<Json>>>();
  Future<void> _edit(Json settings) async {
    await openPortal(
      context,
      PortalForm(
        title: 'Truck planning',
        description: 'Set realistic parcel capacity and shift hours. The planner recalculates the driver requirement.',
        fields: [
          EntryField(
            'capacity',
            'Parcels per truck',
            initial: '${settings['capacity'] ?? 100}',
            number: true,
          ),
          EntryField(
            'shift_hours',
            'Hours per shift',
            initial: '${settings['shift_hours'] ?? 8}',
            number: true,
          ),
        ],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call('PUT', '/logistics/truck-planner', data: values);
          return 'Truck planning saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  Future<void> _rate(Object? rate) async {
    await openPortal(
      context,
      PortalForm(
        title: 'Trip pay',
        description: 'New trips use this amount. Existing trips retain their recorded pay.',
        fields: [
          EntryField(
            'rate',
            'Pay per completed trip (PHP)',
            initial: '${rate ?? 800}',
            number: true,
          ),
        ],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call('PUT', '/logistics/truck-rate', data: values);
          return 'Trip pay saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Truck planning')),
    body: LoadView<List<Json>>(
      key: _view,
      load: () => Future.wait([
        ref.read(portalApiProvider).get('/logistics/truck-planner'),
        ref.read(portalApiProvider).get('/logistics/truck-drivers'),
      ]),
      builder: (_, results) {
        final plan = asJson(results[0]['data']),
            settings = asJson(plan['settings']);
        final drivers = results[1];
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            PortalHeader(
              title:
                  '${asJson(plan['needed'])['recommended'] ?? 0} drivers recommended',
              subtitle: text(
                plan,
                'message',
                'A route-by-route plan based on current demand.',
              ),
              icon: Icons.local_shipping_outlined,
            ),
            PortalCard(
              child: Column(
                children: [
                  InfoRow(
                    'Parcels per truck',
                    '${settings['capacity'] ?? '—'}',
                  ),
                  InfoRow(
                    'Hours per shift',
                    '${settings['shift_hours'] ?? '—'}',
                  ),
                  FilledButton(
                    onPressed: () => _edit(settings),
                    child: const Text('Edit planning settings'),
                  ),
                ],
              ),
            ),
            PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Trip pay',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text('Paid per completed trip, not per parcel.'),
                  OutlinedButton(
                    onPressed: () => _rate(asJson(drivers['summary'])['rate']),
                    child: const Text('Edit trip pay'),
                  ),
                ],
              ),
            ),
            for (final route in asJsonList(plan['routes']))
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${text(asJson(route['from']), 'name', 'Pickup hub')} → ${text(asJson(route['to']), 'name', 'Delivery hub')}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    for (final key in [
                      'parcels_last_7_days',
                      'waiting_now',
                      'trips_per_day',
                      'driver_hours',
                    ])
                      if (route[key] != null)
                        InfoRow(key.replaceAll('_', ' '), '${route[key]}'),
                  ],
                ),
              ),
          ],
        );
      },
    ),
  );
}

class CoverageScreen extends ConsumerWidget {
  const CoverageScreen({super.key, this.region, this.province, this.page = 1});
  final String? region, province;
  final int page;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Network coverage')),
    body: LoadView<List<Json>>(
      load: () => Future.wait([
        ref
            .read(portalApiProvider)
            .get('/logistics/coverage', query: {'region': ?region}),
        if (region != null)
          ref
              .read(portalApiProvider)
              .get(
                '/logistics/coverage/hubs',
                query: {'region': region, 'province': ?province, 'page': page},
              ),
      ]),
      builder: (_, results) {
        final data = asJson(results[0]['data']),
            regionData = asJson(data['region']);
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            PortalHeader(
              title: region == null
                  ? 'Your delivery network'
                  : text(regionData, 'name', 'Regional coverage'),
              subtitle: 'See where hubs, gateways and active riders can serve buyers.',
              icon: Icons.map_outlined,
            ),
            if (region == null) ...[
              PortalCard(
                child: Column(
                  children: [
                    for (final entry in asJson(data['totals']).entries)
                      InfoRow(entry.key.replaceAll('_', ' '), '${entry.value}'),
                  ],
                ),
              ),
              for (final island in asJsonList(data['islands']))
                PortalCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        text(island, 'name'),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      for (final r in asJsonList(island['regions']))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(text(r, 'name')),
                          subtitle: Text(
                            '${r['hubs'] ?? 0} hubs · ${r['riders'] ?? 0} riders',
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => openPortal(
                            context,
                            CoverageScreen(region: text(r, 'code')),
                          ),
                        ),
                    ],
                  ),
                ),
            ] else ...[
              if (province == null)
                for (final p in asJsonList(regionData['provinces']))
                  PortalCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(text(p, 'name')),
                      subtitle: Text(
                        '${p['hubs'] ?? 0} hubs · ${p['riders'] ?? 0} riders',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => openPortal(
                        context,
                        CoverageScreen(
                          region: region,
                          province: text(p, 'code'),
                        ),
                      ),
                    ),
                  ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Hubs serving this area',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
              ),
              if (asJsonList(results[1]['data']).isEmpty)
                const PortalCard(child: Text('No approved hubs in this area.')),
              for (final h in asJsonList(results[1]['data']))
                PortalCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(text(h, 'name', text(h, 'hub_name', 'Hub'))),
                    subtitle: Text('${h['riders'] ?? 0} riders'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPortal(
                      context,
                      CourierHubScreen(hubId: asInt(h['id'])),
                    ),
                  ),
                ),
              if (asInt(asJson(results[1]['meta'])['last_page'], 1) > page)
                OutlinedButton(
                  onPressed: () => openPortal(
                    context,
                    CoverageScreen(
                      region: region,
                      province: province,
                      page: page + 1,
                    ),
                  ),
                  child: const Text('Next page of hubs'),
                ),
            ],
          ],
        );
      },
    ),
  );
}
