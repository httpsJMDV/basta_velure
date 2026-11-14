import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../logistics_paths.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class PickupControlScreen extends ConsumerStatefulWidget {
  const PickupControlScreen({super.key, this.courier = false});
  final bool courier;
  @override
  ConsumerState<PickupControlScreen> createState() =>
      _PickupControlScreenState();
}

class _PickupControlScreenState extends ConsumerState<PickupControlScreen> {
  final _view = GlobalKey<LoadViewState<List<Json>>>();
  bool _busy = false;
  String get _base => '/${widget.courier ? 'logistics' : 'hub'}/pickup-control';
  PortalApi get _api => ref.read(portalApiProvider);

  Future<void> _save(Json settings, String field, bool? value) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _api.call(
        'PATCH',
        _base,
        data: {
          for (final entry in settings.entries)
            entry.key: entry.key == field
                ? value
                : asJson(entry.value)['value'],
        },
      );
      await _view.currentState?.reload();
    } on ApiFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _assign(Json job) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final riders = asJsonList(
        (await _api.get(
          '$_base/riders',
          query: {'parcel_id': job['id']},
        ))['data'],
      );
      if (!mounted) return;
      final rider = await showModalBottomSheet<Json>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (sheet) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(sheet).height * .65,
            child: Column(
              children: [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text(
                    'Choose a pickup rider',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                ),
                Expanded(
                  child: ListView(
                    children: [
                      if (riders.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'No eligible rider is online. Ask a rider to go online or finish a current job, then try again.',
                          ),
                        ),
                      for (final rider in riders)
                        ListTile(
                          leading: const Icon(Icons.two_wheeler),
                          title: Text(text(rider, 'name')),
                          subtitle: Text(
                            '${rider['jobs']} active parcels · ${text(rider, 'distance')}',
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.pop(sheet, rider),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (rider == null || !mounted) return;
      final confirmed = await confirmAction(
        context,
        title: 'Assign ${text(rider, 'name')}?',
        message:
            '${text(job, 'tracking_number')}: this replaces any unaccepted offer or previous pickup rider. The rider still confirms collection at the shop.',
        confirmLabel: 'Assign rider',
      );
      if (!confirmed) return;
      await _api.call(
        'POST',
        '$_base/assign',
        data: {'parcel_id': job['id'], 'rider_id': rider['id']},
      );
      await _view.currentState?.reload();
    } on ApiFailure catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _mode(
    Json settings,
    String field,
    String title,
    String description,
    String timing,
    IconData icon,
  ) {
    final setting = asJson(settings[field]);
    final enabled = asBool(setting['effective']);
    return PortalCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.brandRed),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Switch(
                value: enabled,
                onChanged: _busy
                    ? null
                    : (value) => _save(settings, field, value),
              ),
            ],
          ),
          Text(
            '${setting['value'] == null ? 'Following company default' : 'Custom preference'} · ${enabled ? 'Automatic' : 'Manual'}',
            style: const TextStyle(fontSize: 12, color: AppColors.stone500),
          ),
          const SizedBox(height: 14),
          Text(description, style: const TextStyle(height: 1.55)),
          const SizedBox(height: 12),
          Text(
            timing,
            style: const TextStyle(
              fontSize: 12,
              height: 1.5,
              color: AppColors.stone500,
            ),
          ),
          if (!widget.courier)
            TextButton(
              onPressed: _busy || setting['value'] == null
                  ? null
                  : () => _save(settings, field, null),
              child: Text(
                'Use company default (${asBool(setting['company_default']) ? 'automatic' : 'manual'})',
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(
      title: const Text('Pickup control'),
      actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _busy ? null : () => _view.currentState?.reload(),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: LoadView<List<Json>>(
      key: _view,
      load: () => Future.wait([_api.get(_base), _api.get('$_base/jobs')]),
      builder: (_, results) {
        final control = asJson(results[0]['data']);
        final settings = asJson(control['settings']);
        final jobs = asJsonList(results[1]['data']);
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            PortalHeader(
              title: 'You control assignment',
              subtitle:
                  '${text(control, 'name')}\nBooking, assigning a rider, and collecting an item are separate steps.',
              icon: Icons.tune,
            ),
            _mode(
              settings,
              'auto_seller_pickups',
              'Seller pickups',
              'Automatic mode offers new ready parcels to the nearest eligible online rider for 60 seconds, trying up to three riders. Turn it off to have staff choose the rider below.',
              'Switching off closes unaccepted offers. Assigned jobs stay with their riders. Switching on applies to new and scheduled jobs; courier Dispatch can retry waiting jobs with Run auto-assign.',
              Icons.inventory_2_outlined,
            ),
            _mode(
              settings,
              'auto_return_pickups',
              'Buyer returns',
              'An approved return can book a pickup without choosing a rider. Automatic mode assigns an available rider at the responsible hub, including the final trip back to the shop. Turn it off to assign riders in Return pickups.',
              'Automatic returns run each minute and when staff open the return queue. If no eligible local rider is available, the return stays waiting. Existing assignments stay unchanged.',
              Icons.assignment_return_outlined,
            ),
            PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Manual seller pickup assignment',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.courier
                        ? 'Ready pickups in your courier network. Up to 200 jobs.'
                        : 'Pickups in your hub’s origin coverage. Choose one of your own riders. Up to 200 jobs.',
                  ),
                  if (jobs.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Text('No ready seller pickups in this queue.'),
                    ),
                  for (final job in jobs)
                    Padding(
                      padding: const EdgeInsets.only(top: 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            text(job, 'tracking_number'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(text(job, 'shop')),
                          Text(
                            text(job, 'address'),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                          Text(
                            job['rider'] == null
                                ? 'Waiting · ${text(job, 'state')}'
                                : 'Assigned to ${job['rider']}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          if (job['pickup_date'] != null)
                            Text(
                              'Pickup ${text(job, 'pickup_date').split('T').first} · ${text(job, 'pickup_window')}',
                              style: const TextStyle(fontSize: 12),
                            ),
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _assign(job),
                            icon: const Icon(Icons.person_add_alt),
                            label: Text(
                              job['rider'] == null
                                  ? 'Assign rider'
                                  : 'Reassign rider',
                            ),
                          ),
                          const Divider(),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'How it works',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Staff can assign manually in either mode. Seller pickup riders must be active, online, and eligible under the reviewed cargo allowance (or the existing three-job restriction while awaiting review). Hubs assign their own riders; courier staff manage their network. The rider confirms physical collection in the app.\n\nBuyer returns start at the hub that delivered the order. Distant returns travel through hubs; the shop’s hub assigns the final rider. Regular delivery dispatch and truck trips remain staff-managed.',
                    style: TextStyle(height: 1.6),
                  ),
                  TextButton.icon(
                    onPressed: () => context.push(
                      widget.courier
                          ? LogisticsPaths.courierReturns
                          : LogisticsPaths.hubReturnPickups,
                    ),
                    icon: const Icon(Icons.assignment_return_outlined),
                    label: const Text('Open return pickups'),
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
