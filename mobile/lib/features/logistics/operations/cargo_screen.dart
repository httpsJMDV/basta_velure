import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/theme/app_colors.dart';
import 'portal_api.dart';
import 'portal_widgets.dart';

class CargoScreen extends ConsumerStatefulWidget {
  const CargoScreen({super.key, this.scope = 'logistics'});
  final String scope;
  @override
  ConsumerState<CargoScreen> createState() => _CargoScreenState();
}

class _CargoScreenState extends ConsumerState<CargoScreen> {
  final _view = GlobalKey<LoadViewState<Json>>();
  final _search = TextEditingController();
  int? _selected;
  Json? _capacity;
  bool _busy = false;
  String? _error;
  PortalApi get _api => ref.read(portalApiProvider);
  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _find() {
    setState(() {
      _selected = null;
      _capacity = null;
    });
    _view.currentState?.reload();
  }

  Future<void> _choose(int id) async {
    setState(() {
      _selected = id;
      _busy = true;
      _error = null;
      _capacity = null;
    });
    try {
      final result = await _api.get('/${widget.scope}/cargo/riders/$id');
      if (mounted) setState(() => _capacity = asJson(result['data']));
    } on ApiFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _measure(String kind) async {
    await openPortal(
      context,
      PortalForm(
        title: 'Packed package measurements',
        description:
            '${kind == 'parcel' ? 'Use the parcel tracking number' : 'Use the buyer return pickup code'}. Weigh the complete package with its packaging. This reserves rider load; shipping charges stay unchanged.',
        fields: [
          EntryField(
            'code',
            kind == 'parcel' ? 'Parcel tracking number' : 'Return pickup code',
          ),
          const EntryField('weight_kg', 'Packed weight (kg)', number: true),
          const EntryField('length_cm', 'Packed length (cm)', number: true),
          const EntryField('width_cm', 'Packed width (cm)', number: true),
          const EntryField('height_cm', 'Packed height (cm)', number: true),
        ],
        save: (values, _) async {
          await _api.call(
            'POST',
            '/${widget.scope}/cargo/measurements',
            data: {
              'kind': kind,
              'code': values['code'],
              for (final key in [
                'weight_kg',
                'length_cm',
                'width_cm',
                'height_cm',
              ])
                key: double.tryParse('${values[key]}'),
            },
          );
          return 'Packed measurements recorded.';
        },
      ),
    );
    if (_selected != null) await _choose(_selected!);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.gray50,
    appBar: AppBar(title: const Text('Cargo allowance')),
    body: LoadView<Json>(
      key: _view,
      load: () => _api.get(
        widget.scope == 'rider'
            ? '/rider/cargo'
            : '/${widget.scope}/cargo/riders',
        query: widget.scope == 'rider' ? null : {'search': _search.text.trim()},
      ),
      builder: (_, result) {
        final readonly = widget.scope == 'rider';
        final riders = readonly ? <Json>[] : asJsonList(result['data']);
        final capacity = readonly ? asJson(result['data']) : _capacity;
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const PortalHeader(
              title: 'Weight, space and safe handling',
              subtitle: 'Vehicle-specific allowances need courier review. There is no universal motorcycle kg limit in this app.',
              icon: Icons.scale_outlined,
            ),
            if (!readonly)
              PortalCard(
                child: TextField(
                  controller: _search,
                  maxLength: 100,
                  enabled: !_busy,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _find(),
                  decoration: InputDecoration(
                    labelText: 'Find rider by name or plate',
                    helperText: 'Newest 100 matches. Search the full network.',
                    counterText: '',
                    suffixIcon: IconButton(
                      tooltip: 'Search riders',
                      onPressed: _busy ? null : _find,
                      icon: const Icon(Icons.search),
                    ),
                  ),
                ),
              ),
            if (!readonly)
              PortalCard(
                child: DropdownButtonFormField<int>(
                  key: ValueKey(_selected),
                  initialValue: _selected,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Rider and vehicle',
                  ),
                  items: [
                    for (final rider in riders)
                      DropdownMenuItem(
                        value: asInt(rider['id']),
                        child: Text(
                          '${text(rider, 'name')} · ${text(rider, 'vehicle_type')} ${text(rider, 'plate_number')}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: _busy
                      ? null
                      : (id) {
                          if (id != null) _choose(id);
                        },
                ),
              ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.brandRed),
                ),
              ),
            if (capacity != null)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      capacity['mode'] == 'weight'
                          ? 'Reviewed cargo allowance'
                          : 'Courier review required',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      '${capacity['reserved_kg'] ?? 0} / ${capacity['capacity_kg'] ?? '—'} kg reserved',
                      style: const TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brandRed,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${capacity['active_jobs'] ?? 0} assigned parcels · ${capacity['unmeasured_jobs'] ?? 0} need measurement',
                    ),
                    if (capacity['mode'] == 'weight')
                      Text(
                        '${capacity['reserved_litres']} / ${capacity['capacity_litres']} litres reserved',
                      ),
                    const SizedBox(height: 12),
                    Text(
                      text(capacity, 'notice'),
                      style: const TextStyle(
                        fontSize: 12,
                        height: 1.6,
                        color: AppColors.stone500,
                      ),
                    ),
                    if (widget.scope == 'logistics')
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: FilledButton.icon(
                          onPressed: _busy
                              ? null
                              : () async {
                                  await openPortal(
                                    context,
                                    CargoReviewScreen(
                                      riderId: _selected!,
                                      configuration: asJson(
                                        capacity['configuration'],
                                      ),
                                    ),
                                  );
                                  if (_selected != null) {
                                    await _choose(_selected!);
                                  }
                                  await _view.currentState?.reload();
                                },
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('Review vehicle documents'),
                        ),
                      ),
                  ],
                ),
              ),
            if (widget.scope == 'hub')
              const PortalCard(
                child: Text(
                  'Only courier-company staff can approve or increase the vehicle allowance. Hub staff can record packed measurements below.',
                  style: TextStyle(height: 1.6),
                ),
              ),
            if (!readonly)
              PortalCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Record packed measurements',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Measure weight and all three package dimensions. Unmeasured packages cannot enter a kg-based load. These values do not change shipping charges.',
                      style: TextStyle(height: 1.6, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _measure('parcel'),
                      icon: const Icon(Icons.inventory_2_outlined),
                      label: const Text('Seller / delivery parcel'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : () => _measure('return'),
                      icon: const Icon(Icons.assignment_return_outlined),
                      label: const Text('Buyer return pickup'),
                    ),
                  ],
                ),
              ),
            const PortalCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Road safety before parcel count',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  SizedBox(height: 12),
                  Text(
                    'The three-job pickup setting is an app restriction, not a Philippine legal or safe-weight rating. Until the courier reviews this vehicle, its existing offer restriction stays in place.\n\nReviewed vehicles reserve weight and space at assignment, including pickups, deliveries and returns. More than three small parcels may fit; overweight, oversized or unmeasured jobs wait for another rider or vehicle. A plate or vehicle change requires review again.\n\nVolume checks cannot prove a stable stack or perfect packing. Always check physical fit, secure mounting, road visibility, lights, plate and controls. Do not tape oversized cargo around a motorcycle to bypass the allowance. Split the load or use a suitable larger vehicle.\n\nRA 4136 prohibits exceeding registered carrying capacity. LTO guidance for custom motorcycle top boxes includes a 2 ft (60.96 cm) limit per side and applicable inspection/registration. Staff review is not LTO certification.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.7,
                      color: AppColors.stone600,
                    ),
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

const cargoRatingFields = <String, String>{
  'registered_payload_kg': 'Registered total carrying allowance (kg)',
  'manufacturer_payload_kg': 'Manufacturer total payload (kg)',
  'rider_gear_kg': 'Rider and riding gear (kg)',
  'carrier_rating_kg': 'Lesser box / rack rating incl. empty box (kg)',
  'empty_carrier_kg': 'Empty box, rack and extra equipment (kg)',
  'length_cm': 'Usable cargo length (cm)',
  'width_cm': 'Usable cargo width (cm)',
  'height_cm': 'Usable cargo height (cm)',
};

class CargoReviewScreen extends ConsumerStatefulWidget {
  const CargoReviewScreen({
    super.key,
    required this.riderId,
    required this.configuration,
  });
  final int riderId;
  final Json configuration;
  @override
  ConsumerState<CargoReviewScreen> createState() => _CargoReviewScreenState();
}

class _CargoReviewScreenState extends ConsumerState<CargoReviewScreen> {
  final _form = GlobalKey<FormState>();
  late final _values = {
    for (final key in cargoRatingFields.keys)
      key: TextEditingController(
        text: widget.configuration[key]?.toString() ?? '',
      ),
  };
  late final _source = TextEditingController(
    text: widget.configuration['source_note']?.toString() ?? '',
  );
  late String _carrier =
      widget.configuration['carrier_type']?.toString() ?? 'manufacturer';
  bool _checked = false, _busy = false;
  String? _error;
  @override
  void dispose() {
    for (final controller in _values.values) {
      controller.dispose();
    }
    _source.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_checked || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(portalApiProvider)
          .call(
            'PATCH',
            '/logistics/cargo/riders/${widget.riderId}',
            data: {
              for (final entry in _values.entries)
                entry.key: double.tryParse(entry.value.text),
              'source_note': _source.text.trim(),
              'carrier_type': _carrier,
              'reviewed_documents_and_mounting': true,
            },
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiFailure catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Review vehicle allowance')),
    bottomNavigationBar: SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: !_checked || _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Approve reviewed allowance'),
        ),
      ),
    ),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const PortalHeader(
            title: 'Documented ratings only',
            subtitle: 'No guessed payloads. Registration allowance means gross loaded mass minus vehicle mass. The total allowance includes the rider and equipment.',
            icon: Icons.fact_check_outlined,
          ),
          for (final entry in cargoRatingFields.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                controller: _values[entry.key],
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(labelText: entry.value),
                validator: (v) {
                  final number = double.tryParse(v ?? '');
                  return number != null &&
                          number.isFinite &&
                          (entry.key == 'empty_carrier_kg'
                              ? number >= 0
                              : number > 0)
                      ? null
                      : 'Enter a valid documented value.';
                },
              ),
            ),
          const Text(
            'Carrier type',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (final entry in {
                'manufacturer': 'Manufacturer carrier',
                'custom': 'Custom top box',
                'vehicle_bay': 'Car / van cargo bay',
              }.entries)
                ChoiceChip(
                  label: Text(entry.value),
                  selected: _carrier == entry.key,
                  onSelected: _busy
                      ? null
                      : (_) => setState(() => _carrier = entry.key),
                ),
            ],
          ),
          const SizedBox(height: 18),
          TextFormField(
            controller: _source,
            maxLength: 1000,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Document references and inspection notes',
            ),
            validator: (v) => (v ?? '').trim().length >= 20 ? null : 'Record the document and inspection references (20+ characters).',
          ),
          const SizedBox(height: 12),
          const Text(
            'Net cargo is the lesser of the documented total allowances minus rider/gear/empty equipment, and the lesser box/rack allowance minus empty equipment. The server calculates the result. Custom motorcycle top boxes must meet the LTO 60.96 cm-per-side rule; verify external dimensions too.',
            style: TextStyle(fontSize: 12, height: 1.6),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _checked,
            onChanged: _busy
                ? null
                : (v) => setState(() => _checked = v ?? false),
            title: const Text(
              'I verified the documents, external dimensions, applicable registration/inspection, secure mounting and unobstructed lights, plate, mirrors and controls. This staff review is not LTO certification.',
              style: TextStyle(fontSize: 12, height: 1.5),
            ),
          ),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.brandRed)),
        ],
      ),
    ),
  );
}
