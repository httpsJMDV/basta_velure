import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class CourierMoneyScreen extends ConsumerStatefulWidget {
  const CourierMoneyScreen({super.key});
  @override
  ConsumerState<CourierMoneyScreen> createState() => _CourierMoneyScreenState();
}

class _CourierMoneyScreenState extends ConsumerState<CourierMoneyScreen> {
  final _view = GlobalKey<LoadViewState<List<Json>>>();
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Money & settlements')),
    body: LoadView<List<Json>>(
      key: _view,
      load: () => Future.wait([
        ref.read(portalApiProvider).get('/logistics/payouts'),
        ref.read(portalApiProvider).get('/logistics/settlements'),
      ]),
      builder: (_, results) {
        final payees = asJson(results[0]['data']),
            statement = asJson(results[1]['data']);
        final totals = asJson(statement['totals']);
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PortalHeader(
              title: 'Every payment, accounted for',
              subtitle: 'Review team earnings and weekly shop statements. Record a transfer only after it has been sent.',
              icon: Icons.account_balance_wallet_outlined,
            ),
            PortalCard(
              child: Column(
                children: [
                  InfoRow(
                    'To receive from shops',
                    formatPeso(asDouble(totals['to_receive'])),
                  ),
                  InfoRow(
                    'To pay shops',
                    formatPeso(asDouble(totals['to_pay'])),
                  ),
                ],
              ),
            ),
            for (final kind in ['riders', 'hubs']) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  kind == 'riders' ? 'Rider pay' : 'Hub pay',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (asJsonList(payees[kind]).isEmpty)
                const PortalCard(child: Text('No earnings records yet.')),
              for (final row in asJsonList(payees[kind]))
                PortalCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      text(row, 'name'),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${row['unpaid_count'] ?? 0} unpaid jobs · ${formatPeso(asDouble(row['unpaid']))}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await openPortal(
                        context,
                        PayeeScreen(kind: kind, payee: row),
                      );
                      await _view.currentState?.reload();
                    },
                  ),
                ),
            ],
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Weekly shop statements',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
            ),
            if (asJsonList(statement['weeks']).isEmpty)
              const PortalCard(
                child: Text(
                  'Statements appear after direct-payment deliveries.',
                ),
              ),
            for (final week in asJsonList(statement['weeks'])) ...[
              Text(
                '${text(week, 'start')} – ${text(week, 'end')}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              for (final line in asJsonList(week['lines']))
                PortalCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(text(asJson(line['seller']), 'shop_name')),
                    subtitle: Text(
                      '${line['direction'] == 'courier_pays'
                          ? 'You pay'
                          : line['direction'] == 'seller_pays'
                          ? 'Shop pays'
                          : 'Balanced'} · ${formatPeso(asDouble(line['net']))}\n${text(asJson(line['settlement']), 'state', 'Not recorded')}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await openPortal(
                        context,
                        SettlementScreen(line: line, week: text(week, 'start')),
                      );
                      await _view.currentState?.reload();
                    },
                  ),
                ),
            ],
          ],
        );
      },
    ),
  );
}

class PayeeScreen extends ConsumerStatefulWidget {
  const PayeeScreen({super.key, required this.kind, required this.payee});
  final String kind;
  final Json payee;
  @override
  ConsumerState<PayeeScreen> createState() => _PayeeScreenState();
}

class _PayeeScreenState extends ConsumerState<PayeeScreen> {
  final _history = GlobalKey<PagedListState<Json>>();
  bool _paid = false;
  Future<void> _pay() async {
    final ok = await openPortal<bool>(
      context,
      PortalForm(
        title: 'Record payment',
        financial: true,
        description:
            'Send ${formatPeso(asDouble(widget.payee['unpaid']))} to ${text(widget.payee, 'name')} first. This marks every currently unpaid job as paid.',
        fields: const [EntryField('reference', '13-digit GCash reference')],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call(
                'POST',
                '/logistics/payouts/${widget.kind}/${widget.payee['id']}',
                data: values,
              );
          return 'Payment recorded.';
        },
      ),
    );
    if (ok == true && mounted) {
      setState(() => _paid = true);
      await _history.currentState?.refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final gcash = asJson(widget.payee['gcash']);
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: Text(text(widget.payee, 'name'))),
      body: PagedList<Json>(
        key: _history,
        load: (page) async => ApiPage.from(
          await ref
              .read(portalApiProvider)
              .get(
                '/logistics/payouts/${widget.kind}/${widget.payee['id']}/history',
                query: {'page': page},
              ),
          (row) => row,
        ),
        header: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                children: [
                  PortalHeader(
                    title: _paid
                        ? 'Payment recorded'
                        : formatPeso(asDouble(widget.payee['unpaid'])),
                    subtitle:
                        '${widget.payee['unpaid_count'] ?? 0} jobs in the last loaded balance. Pull to refresh the history.',
                    icon: Icons.receipt_long_outlined,
                  ),
                  PortalCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'GCash · ${text(gcash, 'name', 'No account on file')}',
                        ),
                        SelectableText(text(gcash, 'number', '')),
                        if (!_paid && asDouble(widget.payee['unpaid']) > 0)
                          FilledButton(
                            onPressed: _pay,
                            child: const Text('Record payment'),
                          ),
                      ],
                    ),
                  ),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Job & payment history',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        itemBuilder: (_, row) => PortalCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text(row, 'tracking_number', 'Earning'),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              InfoRow(
                text(row, 'kind', 'Hub share'),
                formatPeso(asDouble(row['amount'])),
              ),
              Text(
                'Earned ${displayDate(row, 'earned_at')}\n${row['paid_at'] == null ? 'Unpaid' : 'Paid ${displayDate(row, 'paid_at')}'}',
              ),
              if (row['paid_reference'] != null)
                SelectableText('Reference ${row['paid_reference']}'),
            ],
          ),
        ),
        empty: const EmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'No jobs recorded',
        ),
      ),
    );
  }
}

class SettlementScreen extends ConsumerStatefulWidget {
  const SettlementScreen({super.key, required this.line, required this.week});
  final Json line;
  final String week;
  @override
  ConsumerState<SettlementScreen> createState() => _SettlementScreenState();
}

class _SettlementScreenState extends ConsumerState<SettlementScreen> {
  late Json _settlement = asJson(widget.line['settlement']);
  bool get _weekClosed {
    final start = DateTime.tryParse('${widget.week}T00:00:00Z');
    return start != null &&
        !DateTime.now()
            .toUtc()
            .add(const Duration(hours: 8))
            .isBefore(start.add(const Duration(days: 7)));
  }

  Future<void> _action(String action) async {
    final pay = action == 'pay',
        dispute = action == 'dispute',
        attach = action == 'receipt';
    await openPortal(
      context,
      PortalForm(
        title: pay
            ? 'Record shop payment'
            : dispute
            ? 'Report a payment problem'
            : attach
            ? 'Attach receipt'
            : 'Confirm payment received',
        description:
            '${text(asJson(widget.line['seller']), 'shop_name')} · Week of ${widget.week}\n${formatPeso(asDouble(widget.line['net']))}',
        financial: true,
        photoLabel: pay || attach ? 'GCash receipt' : null,
        photoRequired: attach,
        fields: pay
            ? const [EntryField('reference', '13-digit GCash reference')]
            : dispute
            ? const [EntryField('reason', 'What went wrong?', lines: 3)]
            : const [],
        save: (values, photo) async {
          final route = pay
              ? '/logistics/settlements'
              : '/logistics/settlements/${_settlement['id']}/$action';
          final Json fields = {
            ...values,
            if (pay) 'seller_id': asJson(widget.line['seller'])['id'],
            if (pay) 'week_start': widget.week,
          };
          final result = await ref
              .read(portalApiProvider)
              .call(
                'POST',
                route,
                data: photo == null
                    ? fields
                    : FormData.fromMap({
                        ...fields,
                        'receipt': photo.toMultipart(),
                      }),
              );
          if (mounted) setState(() => _settlement = asJson(result['data']));
          return 'Settlement updated.';
        },
      ),
    );
  }

  Future<void> _receipt() async {
    await openPortal(context, _ReceiptScreen(id: asInt(_settlement['id'])));
  }

  @override
  Widget build(BuildContext context) {
    final line = widget.line,
        seller = asJson(line['seller']),
        gcash = asJson(seller['gcash']);
    final state = text(_settlement, 'state', 'not_recorded');
    final courierPays = line['direction'] == 'courier_pays';
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Shop statement')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          PortalHeader(
            title: text(seller, 'shop_name'),
            subtitle:
                'Week of ${widget.week} · ${line['direction'] == 'none'
                    ? 'No transfer due'
                    : courierPays
                    ? 'You pay the shop'
                    : 'The shop pays you'}',
            icon: Icons.receipt_long_outlined,
          ),
          PortalCard(
            child: Column(
              children: [
                InfoRow('Orders', '${line['orders_count'] ?? 0}'),
                InfoRow(
                  'COD collected',
                  formatPeso(asDouble(line['cod_collected'])),
                ),
                InfoRow(
                  'Courier fees',
                  formatPeso(asDouble(line['courier_fees'])),
                ),
                InfoRow(
                  'Net payment',
                  formatPeso(asDouble(line['net'])),
                  strong: true,
                ),
                InfoRow('Status', state.replaceAll('_', ' ')),
              ],
            ),
          ),
          PortalCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Shop GCash · ${text(gcash, 'name', 'Not provided')}'),
                SelectableText(text(gcash, 'number', '')),
                if (_settlement['reference'] != null)
                  SelectableText('Reference ${_settlement['reference']}'),
                if (_settlement['dispute'] != null)
                  Text(
                    'Issue: ${text(asJson(_settlement['dispute']), 'reason')}',
                  ),
                if (_settlement['resolution'] != null)
                  Text(
                    'Resolution: ${text(asJson(_settlement['resolution']), 'note')}',
                  ),
              ],
            ),
          ),
          if (asBool(_settlement['has_receipt']))
            OutlinedButton.icon(
              onPressed: _receipt,
              icon: const Icon(Icons.image_outlined),
              label: const Text('View receipt'),
            ),
          if (courierPays &&
              _weekClosed &&
              (_settlement.isEmpty || state == 'pay_again'))
            FilledButton(
              onPressed: () => _action('pay'),
              child: const Text('Record payment sent'),
            ),
          if (courierPays && !_weekClosed && _settlement.isEmpty)
            const PortalCard(
              child: Text('This week can be settled after it ends.'),
            ),
          if (!courierPays && state == 'sent') ...[
            FilledButton(
              onPressed: () => _action('confirm'),
              child: const Text('Confirm money received'),
            ),
            OutlinedButton(
              onPressed: () => _action('dispute'),
              child: const Text('Report payment problem'),
            ),
          ],
          if (courierPays &&
              _settlement.isNotEmpty &&
              !asBool(_settlement['has_receipt']))
            OutlinedButton(
              onPressed: () => _action('receipt'),
              child: const Text('Attach receipt'),
            ),
        ],
      ),
    );
  }
}

class _ReceiptScreen extends ConsumerWidget {
  const _ReceiptScreen({required this.id});
  final int id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Payment receipt')),
    body: FutureBuilder<List<int>>(
      future: ref.read(portalApiProvider).bytes('/settlements/$id/receipt'),
      builder: (_, snapshot) => snapshot.hasError
          ? const Center(
              child: Text(
                'The receipt could not be loaded. Reopen it to try again.',
              ),
            )
          : !snapshot.hasData
          ? const Center(child: CircularProgressIndicator())
          : InteractiveViewer(
              child: Center(
                child: Image.memory(Uint8List.fromList(snapshot.data!)),
              ),
            ),
    ),
  );
}

class HubEarningsScreen extends ConsumerWidget {
  const HubEarningsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Hub earnings')),
    body: LoadView<Json>(
      load: () async => asJson(
        (await ref.read(portalApiProvider).get('/hub/earnings'))['data'],
      ),
      builder: (_, data) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          PortalHeader(
            title: formatPeso(asDouble(data['unpaid_total'])),
            subtitle: 'Waiting for payment from your courier company. Amounts are recorded by the server.',
            icon: Icons.account_balance_wallet_outlined,
          ),
          PortalCard(
            child: Column(
              children: [
                for (final period in ['today', 'week', 'month', 'lifetime'])
                  InfoRow(
                    period == 'lifetime'
                        ? 'All time'
                        : period[0].toUpperCase() + period.substring(1),
                    formatPeso(asDouble(asJson(data[period])['total'])),
                  ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Recent delivery earnings',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ),
          if (asJsonList(data['recent']).isEmpty)
            const PortalCard(child: Text('No delivered-parcel earnings yet.')),
          for (final row in asJsonList(data['recent']))
            PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  InfoRow(
                    text(row, 'tracking_number'),
                    formatPeso(asDouble(row['amount'])),
                    strong: true,
                  ),
                  Text(
                    '${displayDate(row, 'earned_at')}\n${row['paid_at'] == null ? 'Unpaid' : 'Paid ${displayDate(row, 'paid_at')}'}',
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}
