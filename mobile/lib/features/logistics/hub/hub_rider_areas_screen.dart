import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../../buyer/addresses/psgc.dart';
import '../../rider/widgets/rider_widgets.dart';
import '../data/logistics_api.dart';
import '../data/logistics_models.dart';
import '../widgets/logistics_widgets.dart';

/// A rider's delivery areas (D6): named groups of barangays from the hub's coverage. The server stores codes, so names
/// come from the same public PSGC list the website uses; a code shows only when the list can't be reached.
class HubRiderAreasScreen extends ConsumerStatefulWidget {
  const HubRiderAreasScreen({super.key, required this.riderId, this.riderName});

  final int riderId;
  final String? riderName;

  @override
  ConsumerState<HubRiderAreasScreen> createState() =>
      _HubRiderAreasScreenState();
}

class _AreasData {
  const _AreasData({required this.areas, required this.coverage});

  final List<RiderArea> areas;
  final List<String> coverage;
}

class _HubRiderAreasScreenState extends ConsumerState<HubRiderAreasScreen> {
  final _view = GlobalKey<LoadViewState<_AreasData>>();
  Map<String, String> _names = const {};

  HubApi get _api => ref.read(hubApiProvider);

  Future<_AreasData> _load() async {
    final results = await Future.wait<Object>([
      _api.riderAreas(widget.riderId),
      _api.coverage(),
    ]);
    final data = _AreasData(
      areas: results[0] as List<RiderArea>,
      coverage: results[1] as List<String>,
    );
    _lookUpNames(data);
    return data;
  }

  Future<void> _lookUpNames(_AreasData data) async {
    final names = await ref.read(psgcProvider).barangayNames({
      ...data.coverage,
      for (final area in data.areas) ...area.barangays,
    });
    if (mounted) setState(() => _names = names);
  }

  String _name(String code) => _names[code] ?? code;

  Future<void> _edit(_AreasData data, {RiderArea? area}) async {
    final message = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AreaSheet(
        area: area,
        coverage: data.coverage,
        nameOf: _name,
        onSave: (label, barangays) => area == null
            ? _api.addArea(widget.riderId, label: label, barangays: barangays)
            : _api.updateArea(
                widget.riderId,
                area.id,
                label: label,
                barangays: barangays,
              ),
      ),
    );
    if (message == null || !mounted) return;
    showRiderMessage(context, message);
    await _view.currentState?.reload();
  }

  Future<void> _deactivate(RiderArea area) async {
    final confirmed = await confirmAction(
      context,
      title: 'Turn off ${area.label}?',
      message: 'The rider stops getting parcels for these barangays. Delivery history is kept.',
      confirmLabel: 'Turn off',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    final ok = await runRiderAction(
      context,
      () => _api.deactivateArea(widget.riderId, area.id),
    );
    if (ok) await _view.currentState?.reload();
  }

  Future<void> _reactivate(RiderArea area) async {
    final ok = await runRiderAction(
      context,
      () => _api.updateArea(widget.riderId, area.id, isActive: true),
    );
    if (ok) await _view.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Delivery areas'),
            if (widget.riderName != null)
              Text(
                widget.riderName!,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.gray600,
                ),
              ),
          ],
        ),
      ),
      body: LoadView<_AreasData>(
        key: _view,
        load: _load,
        builder: (context, data) => Column(
          children: [
            Expanded(
              child: data.areas.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(
                          height: 360,
                          child: EmptyState(
                            icon: LucideIcons.mapPin,
                            title: 'No areas yet',
                            message: 'Add an area so this rider starts getting parcels.',
                          ),
                        ),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(AppSpace.lg),
                      itemCount: data.areas.length,
                      separatorBuilder: (_, _) =>
                          const SizedBox(height: AppSpace.sm),
                      itemBuilder: (context, index) => _AreaCard(
                        area: data.areas[index],
                        nameOf: _name,
                        onEdit: () => _edit(data, area: data.areas[index]),
                        onDeactivate: () => _deactivate(data.areas[index]),
                        onReactivate: () => _reactivate(data.areas[index]),
                      ),
                    ),
            ),
            BottomActions(
              children: [
                SheetButton(
                  label: 'Add an area',
                  icon: LucideIcons.plus,
                  onPressed: () => _edit(data),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AreaCard extends StatelessWidget {
  const _AreaCard({
    required this.area,
    required this.nameOf,
    required this.onEdit,
    required this.onDeactivate,
    required this.onReactivate,
  });

  final RiderArea area;
  final String Function(String code) nameOf;
  final VoidCallback onEdit;
  final VoidCallback onDeactivate;
  final VoidCallback onReactivate;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      muted: !area.isActive,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(area.label, style: RiderText.name)),
              StatusChip(
                label: area.isActive ? 'Active' : 'Inactive',
                tone: area.isActive ? StatusTone.emerald : StatusTone.gray,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Wrap(
            spacing: AppSpace.xs,
            runSpacing: AppSpace.xs,
            children: [
              for (final code in area.barangays)
                StatusChip(label: nameOf(code), tone: StatusTone.blue),
            ],
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (area.isActive) ...[
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: StatusTone.rose.foreground,
                  ),
                  onPressed: onDeactivate,
                  child: const Text('Turn off'),
                ),
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.gray900,
                  ),
                  onPressed: onEdit,
                  child: const Text('Edit'),
                ),
              ] else
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.gray900,
                  ),
                  onPressed: onReactivate,
                  child: const Text('Turn back on'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AreaSheet extends StatefulWidget {
  const _AreaSheet({
    required this.coverage,
    required this.nameOf,
    required this.onSave,
    this.area,
  });

  final RiderArea? area;
  final List<String> coverage;
  final String Function(String code) nameOf;
  final Future<String> Function(String label, List<String> barangays) onSave;

  @override
  State<_AreaSheet> createState() => _AreaSheetState();
}

class _AreaSheetState extends State<_AreaSheet> {
  final _form = GlobalKey<FormState>();
  late final _label = TextEditingController(text: widget.area?.label);
  late final _picked = <String>{...?widget.area?.barangays};
  ApiFailure? _failure;
  String? _pickError;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final ok = _form.currentState!.validate();
    setState(() {
      _failure = null;
      _pickError = _picked.isEmpty
          ? 'At least one coverage barangay must be assigned to this area.'
          : null;
    });
    if (!ok || _picked.isEmpty) return;
    try {
      final message = await widget.onSave(
        Rules.squish(_label.text),
        _picked.toList(),
      );
      if (mounted) Navigator.of(context).pop(message);
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _failure = failure;
          _pickError = failure.errorFor('coverage_barangays');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final failure = _failure;
    final showBanner =
        failure != null && failure.kind != FailureKind.validation;
    final codes = [...widget.coverage]
      ..sort((a, b) => widget.nameOf(a).compareTo(widget.nameOf(b)));
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, scroll) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                // Not a lazy list: the name field must stay mounted for validate() to check it.
                child: SingleChildScrollView(
                  controller: scroll,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        widget.area == null ? 'Add an area' : 'Edit the area',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: AppSpace.md),
                      if (showBanner) ...[
                        MessageBanner(message: failure.message),
                        const SizedBox(height: AppSpace.md),
                      ],
                      AppTextField(
                        label: 'Area name',
                        hint: 'Zone 2 - Poblacion',
                        controller: _label,
                        maxLength: 60,
                        showCounter: true,
                        validator: Rules.areaLabel,
                        serverError: failure?.errorFor('area_label'),
                      ),
                      const SizedBox(height: AppSpace.sm),
                      const Text('Barangays', style: RiderText.label),
                      if (_pickError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: AppSpace.xs),
                          child: Text(
                            _pickError!,
                            style: TextStyle(
                              color: StatusTone.rose.foreground,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      if (codes.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: AppSpace.sm),
                          child: MessageBanner(
                            tone: StatusTone.amber,
                            message: 'This hub has no coverage barangays yet.',
                          ),
                        ),
                      for (final code in codes)
                        CheckboxListTile(
                          value: _picked.contains(code),
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          title: Text(widget.nameOf(code)),
                          onChanged: (on) => setState(() {
                            on == true
                                ? _picked.add(code)
                                : _picked.remove(code);
                            if (_picked.isNotEmpty) _pickError = null;
                          }),
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpace.md),
                child: SubmitButton(
                  label: 'Save area',
                  busyLabel: 'Saving…',
                  color: LogisticsLook.hubAction,
                  onPressed: _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
