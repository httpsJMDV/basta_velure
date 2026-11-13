import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/addresses/psgc.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class ShippingScreen extends ConsumerStatefulWidget {
  const ShippingScreen({super.key});
  @override
  ConsumerState<ShippingScreen> createState() => _ShippingScreenState();
}

class _ShippingScreenState extends ConsumerState<ShippingScreen> {
  final _view = GlobalKey<LoadViewState<Json>>();
  Future<void> _zone([Json? zone]) async {
    await openPortal(context, ZoneEditor(zone: zone));
    await _view.currentState?.reload();
  }

  Future<void> _rate(List<Json> zones, [Json? rate]) async {
    final from = rate == null
        ? await showAppSelect<int>(
            context,
            title: 'Pickup zone',
            options: [
              for (final z in zones) AppOption(asInt(z['id']), text(z, 'name')),
            ],
          )
        : asInt(rate['origin_zone_id']);
    if (from == null || !mounted) return;
    final to = rate == null
        ? await showAppSelect<int>(
            context,
            title: 'Delivery zone',
            options: [
              for (final z in zones) AppOption(asInt(z['id']), text(z, 'name')),
            ],
          )
        : asInt(rate['destination_zone_id']);
    if (to == null || !mounted) return;
    final fromName = text(zones.firstWhere((z) => z['id'] == from), 'name'),
        toName = text(zones.firstWhere((z) => z['id'] == to), 'name');
    await openPortal(
      context,
      PortalForm(
        title: 'Delivery rate',
        description:
            '$fromName → $toName\nNew checkout quotes use these rates. Existing orders keep their recorded fees.',
        fields: [
          EntryField(
            'first_kg',
            'First kilogram (PHP)',
            initial: '${rate?['first_kg'] ?? ''}',
            number: true,
          ),
          EntryField(
            'additional_kg',
            'Each additional kilogram (PHP)',
            initial: '${rate?['additional_kg'] ?? ''}',
            number: true,
          ),
          const EntryField(
            'reason',
            'Reason for changing the rate',
            required: false,
            lines: 2,
          ),
        ],
        save: (values, _) async {
          await ref
              .read(portalApiProvider)
              .call(
                'PUT',
                '/logistics/shipping/rates',
                data: {
                  ...values,
                  'origin_zone_id': from,
                  'destination_zone_id': to,
                },
              );
          return 'Delivery rate saved.';
        },
      ),
    );
    await _view.currentState?.reload();
  }

  Future<void> _remove(String kind, Json row) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Remove this ${kind == 'zones' ? 'zone' : 'rate'}?'),
        content: const Text(
          'New checkouts may no longer be serviceable on this route. Existing orders retain their recorded charges.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    try {
      await ref
          .read(portalApiProvider)
          .call('DELETE', '/logistics/shipping/$kind/${row['id']}');
      await _view.currentState?.reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(ApiFailure.from(e).message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Zones & delivery rates')),
    body: LoadView<Json>(
      key: _view,
      load: () async => asJson(
        (await ref.read(portalApiProvider).get('/logistics/shipping'))['data'],
      ),
      builder: (_, data) {
        final zones = asJsonList(data['zones']),
            names = {for (final z in zones) z['id']: text(z, 'name')};
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PortalHeader(
              title: 'Clear routes. Fair rates.',
              subtitle: 'Manage the areas your company serves and the rate for each parcel route.',
              icon: Icons.route_outlined,
            ),
            FilledButton.icon(
              onPressed: () => _zone(),
              icon: const Icon(Icons.add),
              label: const Text('Add delivery zone'),
            ),
            const SizedBox(height: 18),
            for (final zone in zones)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      text(zone, 'name'),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      asJsonList(zone['areas'])
                          .map(
                            (a) =>
                                '${asBool(a['excluded']) ? 'Excludes ' : ''}${text(a, 'name')}',
                          )
                          .join(' · '),
                    ),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => _zone(zone),
                          child: const Text('Edit zone'),
                        ),
                        TextButton(
                          onPressed: () => _remove('zones', zone),
                          child: const Text('Remove'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Route prices',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
              ),
            ),
            if (zones.isNotEmpty)
              OutlinedButton.icon(
                onPressed: () => _rate(zones),
                icon: const Icon(Icons.add),
                label: const Text('Add a route rate'),
              ),
            if (asJsonList(data['rates']).isEmpty)
              const PortalCard(
                child: Text(
                  'Add zones, then set a price between pickup and delivery zones.',
                ),
              ),
            for (final rate in asJsonList(data['rates']))
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${names[rate['origin_zone_id']] ?? 'Pickup zone'} → ${names[rate['destination_zone_id']] ?? 'Delivery zone'}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    InfoRow('First kg', formatPeso(asDouble(rate['first_kg']))),
                    InfoRow(
                      'Each extra kg',
                      formatPeso(asDouble(rate['additional_kg'])),
                    ),
                    Row(
                      children: [
                        TextButton(
                          onPressed: () => _rate(zones, rate),
                          child: const Text('Edit price'),
                        ),
                        TextButton(
                          onPressed: () => _remove('rates', rate),
                          child: const Text('Remove'),
                        ),
                      ],
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

class ZoneEditor extends ConsumerStatefulWidget {
  const ZoneEditor({super.key, this.zone});
  final Json? zone;
  @override
  ConsumerState<ZoneEditor> createState() => _ZoneEditorState();
}

class _ZoneEditorState extends ConsumerState<ZoneEditor> {
  late final _name = TextEditingController(
    text: widget.zone?['name'] as String? ?? '',
  );
  late final List<Json> _areas = asJsonList(widget.zone?['areas'])
      .map((a) => Map<String, dynamic>.from(a))
      .toList();
  final _form = GlobalKey<FormState>();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final area = await openPortal<Json>(context, const ZoneAreaPicker());
    if (mounted && area != null) {
      setState(() {
        if (!_areas.any(
          (a) =>
              a['level'] == area['level'] &&
              a['psgc_code'] == area['psgc_code'],
        )) {
          _areas.add(area);
        }
      });
    }
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (_areas.isEmpty) {
      setState(() => _error = 'Add at least one delivery area.');
      return;
    }
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Save delivery coverage?'),
        content: const Text(
          'These areas determine which new checkouts your company can serve.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Review'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(portalApiProvider)
          .call(
            widget.zone == null ? 'POST' : 'PATCH',
            '/logistics/shipping/zones${widget.zone == null ? '' : '/${widget.zone!['id']}'}',
            data: {
              'name': _name.text.trim(),
              'areas': [
                for (final a in _areas)
                  {
                    'level': a['level'],
                    'psgc_code': a['psgc_code'],
                    'name': a['name'],
                    'excluded': asBool(a['excluded']),
                  },
              ],
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = ApiFailure.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: const Text('Delivery zone')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PortalHeader(
              title: 'Where you deliver',
              subtitle: 'Choose named regions, provinces or cities. More specific areas can be excluded from a wider zone.',
              icon: Icons.location_on_outlined,
            ),
            TextFormField(
              controller: _name,
              enabled: !_busy,
              decoration: const InputDecoration(labelText: 'Zone name'),
              validator: (v) => (v?.trim().length ?? 0) < 2
                  ? 'Use at least two characters.'
                  : null,
            ),
            const SizedBox(height: 18),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: AppColors.brandRed)),
            for (final area in _areas)
              PortalCard(
                child: Column(
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(text(area, 'name')),
                      subtitle: Text(text(area, 'level')),
                      trailing: IconButton(
                        tooltip: 'Remove area',
                        onPressed: _busy
                            ? null
                            : () => setState(() => _areas.remove(area)),
                        icon: const Icon(Icons.close),
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Exclude this area'),
                      value: asBool(area['excluded']),
                      onChanged: _busy
                          ? null
                          : (v) => setState(() => area['excluded'] = v),
                    ),
                  ],
                ),
              ),
            OutlinedButton.icon(
              onPressed: _busy ? null : _add,
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Add an area'),
            ),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: Text(_busy ? 'Saving…' : 'Save delivery zone'),
            ),
          ],
        ),
      ),
    ),
  );
}

class ZoneAreaPicker extends ConsumerStatefulWidget {
  const ZoneAreaPicker({super.key});
  @override
  ConsumerState<ZoneAreaPicker> createState() => _ZoneAreaPickerState();
}

class _ZoneAreaPickerState extends ConsumerState<ZoneAreaPicker> {
  PsgcPlace? _region, _province;
  String _level = 'region';
  late Future<List<PsgcPlace>> _places = Future.value(phRegions);
  void _use(PsgcPlace place, String level) => Navigator.pop(context, {
    'level': level,
    'psgc_code': place.code,
    'name': place.name,
    'excluded': false,
  });
  void _drill(PsgcPlace place) {
    final psgc = ref.read(psgcProvider);
    setState(() {
      if (_level == 'region') {
        _region = place;
        if (place.code == ncrCode) {
          _level = 'city';
          _places = psgc.cities(regionCode: place.code, provinceCode: ncrCode);
        } else {
          _level = 'province';
          _places = psgc.provinces(place.code);
        }
      } else {
        _province = place;
        _level = 'city';
        _places = psgc.cities(
          regionCode: _region!.code,
          provinceCode: place.code,
        );
      }
    });
  }

  void _reset() => setState(() {
    _region = null;
    _province = null;
    _level = 'region';
    _places = Future.value(phRegions);
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Choose delivery area')),
    body: FutureBuilder<List<PsgcPlace>>(
      future: _places,
      builder: (_, snapshot) => snapshot.hasError
          ? Center(
              child: TextButton(
                onPressed: _reset,
                child: const Text('Could not load places. Start again'),
              ),
            )
          : !snapshot.hasData ||
                snapshot.connectionState == ConnectionState.waiting
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const PortalHeader(
                  title: 'Choose an area',
                  subtitle: 'Select the whole area, or open its provinces and cities for more precise coverage.',
                  icon: Icons.map_outlined,
                ),
                if (_region != null) ...[
                  TextButton(
                    onPressed: _reset,
                    child: const Text('Back to regions'),
                  ),
                  PortalCard(
                    child: ListTile(
                      title: Text(
                        'Use all of ${_province?.name ?? _region!.name}',
                      ),
                      onTap: () => _use(
                        _province ?? _region!,
                        _province == null ? 'region' : 'province',
                      ),
                    ),
                  ),
                ],
                for (final place in snapshot.data!)
                  PortalCard(
                    child: Row(
                      children: [
                        Expanded(
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(place.name),
                            onTap: () => _use(place, _level),
                          ),
                        ),
                        if (_level != 'city')
                          IconButton(
                            tooltip: _level == 'region'
                                ? 'Choose province or city'
                                : 'Choose city',
                            onPressed: () => _drill(place),
                            icon: const Icon(Icons.chevron_right),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
    ),
  );
}
