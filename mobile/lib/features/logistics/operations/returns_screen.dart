import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../hub/hub_return_pickups_screen.dart';
import '../courier/courier_parcels_screen.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class CourierReturnsScreen extends StatelessWidget {
  const CourierReturnsScreen({super.key});
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Returns'),
        bottom: const TabBar(
          tabs: [
            Tab(text: 'Return to sender'),
            Tab(text: 'Buyer pickups'),
          ],
        ),
      ),
      body: const TabBarView(
        children: [
          _SenderReturns(),
          HubReturnPickupsScreen(scope: 'logistics', embedded: true),
        ],
      ),
    ),
  );
}

class _SenderReturns extends ConsumerStatefulWidget {
  const _SenderReturns();
  @override
  ConsumerState<_SenderReturns> createState() => _SenderReturnsState();
}

class _SenderReturnsState extends ConsumerState<_SenderReturns> {
  final _view = GlobalKey<LoadViewState<List<Json>>>();
  final _busy = <int>{};
  Future<void> _assign(Json parcel, List<Json> riders) async {
    final id = asInt(parcel['id']);
    if (_busy.contains(id)) return;
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
                  'Choose a return rider',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              Expanded(
                child: ListView(
                  children: riders.isEmpty
                      ? [
                          const ListTile(
                            title: Text(
                              'No rider is available. Ask a rider to go online.',
                            ),
                          ),
                        ]
                      : [
                          for (final rider in riders)
                            ListTile(
                              leading: const Icon(Icons.two_wheeler),
                              title: Text(text(rider, 'name')),
                              subtitle: Text(
                                '${rider['active_jobs'] ?? 0} active jobs',
                              ),
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Assign this return?'),
        content: Text(
          '${text(parcel, 'tracking_number')} will be assigned to ${text(rider, 'name')}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Assign rider'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy.add(id));
    try {
      final result = await ref
          .read(portalApiProvider)
          .call(
            'POST',
            '/logistics/returns/$id/assign',
            data: {'rider_id': rider['id']},
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(text(result, 'message', 'Rider assigned.'))),
      );
      await _view.currentState?.reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiFailure.from(e).message)));
      }
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: AppColors.gray50,
    child: LoadView<List<Json>>(
      key: _view,
      load: () => Future.wait([
        ref.read(portalApiProvider).get('/logistics/returns'),
        ref.read(portalApiProvider).get('/logistics/dispatch/riders'),
      ]),
      builder: (_, results) {
        final rows = asJsonList(results[0]['data']);
        final riders = asJsonList(results[1]['data'])
            .where((r) => asBool(r['assignable']))
            .toList();
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PortalHeader(
              title: 'Bring every parcel home',
              subtitle: 'Review failed deliveries and assign a rider when the parcel is back at its return hub.',
              icon: Icons.assignment_return_outlined,
            ),
            if (rows.isEmpty)
              const PortalCard(
                child: Text('No parcels are waiting to return to a shop.'),
              ),
            for (final row in rows)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      text(row, 'tracking_number'),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${text(row, 'shop', 'Shop')} · ${text(row, 'shop_area')}',
                    ),
                    Text(
                      row['rider'] != null
                          ? 'Assigned to ${text(asJson(row['rider']), 'name')}'
                          : asBool(row['travelling_back'])
                          ? 'Travelling back through the hub network'
                          : 'Waiting for a rider',
                    ),
                    for (final failure in asJsonList(row['failures']))
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Attempt ${failure['attempt'] ?? '—'} · ${text(failure, 'reason')}\n${text(failure, 'note', '')}',
                        ),
                      ),
                    if (!asBool(row['travelling_back']))
                      FilledButton(
                        onPressed: _busy.contains(asInt(row['id']))
                            ? null
                            : () => _assign(row, riders),
                        child: Text(
                          row['rider'] == null
                              ? 'Assign rider'
                              : 'Reassign rider',
                        ),
                      ),
                    TextButton(
                      onPressed: () => openPortal(
                        context,
                        CourierParcelScreen(parcelId: asInt(row['id'])),
                      ),
                      child: const Text('View parcel history'),
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
