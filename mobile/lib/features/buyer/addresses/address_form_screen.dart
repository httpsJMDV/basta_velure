import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../data/account.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_widgets.dart';
import 'psgc.dart';

/// Adds or edits an address (B7). Places come from pickers only, never typed, and both the names and the PSGC
/// codes are sent; screens always show the names.
class AddressFormScreen extends ConsumerStatefulWidget {
  const AddressFormScreen({super.key, this.address});

  final Address? address;

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: widget.address?.fullName ?? '',
  );
  late final _phone = TextEditingController(text: widget.address?.phone ?? '');
  late final _street = TextEditingController(
    text: widget.address?.street ?? '',
  );
  late final _floor = TextEditingController(
    text: widget.address?.floorUnit ?? '',
  );
  late String _label = widget.address?.label ?? 'home';
  late bool _isDefault = widget.address?.isDefault ?? false;

  PsgcPlace? _region;
  PsgcPlace? _province;
  PsgcPlace? _city;
  PsgcPlace? _barangay;
  bool _showPlaceErrors = false;
  ApiFailure? _failure;

  bool get _isNcr => _region?.code == ncrCode;

  @override
  void initState() {
    super.initState();
    final address = widget.address;
    if (address == null || address.needsUpdate) return;
    final regionCode = address.regionCode ?? _regionOf(address.provinceCode);
    _region = phRegions.where((r) => r.code == regionCode).firstOrNull;
    if (address.provinceCode.isNotEmpty) {
      _province = PsgcPlace(address.provinceCode, address.province);
    }
    if (address.cityCode.isNotEmpty) {
      _city = PsgcPlace(address.cityCode, address.city);
    }
    if (address.barangayCode.isNotEmpty) {
      _barangay = PsgcPlace(address.barangayCode, address.barangay);
    }
  }

  /// A PSGC province code starts with its region's two digits (`043400000` is in `040000000`).
  static String? _regionOf(String provinceCode) {
    if (provinceCode.length < 2) return null;
    return provinceCode
        .substring(0, 2)
        .padRight(provinceCode.length == 10 ? 10 : 9, '0');
  }

  @override
  void dispose() {
    for (final box in [_name, _phone, _street, _floor]) {
      box.dispose();
    }
    super.dispose();
  }

  Future<void> _pick({
    required String title,
    required Future<List<PsgcPlace>> Function() load,
    required ValueChanged<PsgcPlace> onPicked,
  }) async {
    final picked = await showModalBottomSheet<PsgcPlace>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PlaceSheet(title: title, load: load),
    );
    if (picked != null && mounted) setState(() => onPicked(picked));
  }

  void _pickRegion() => _pick(
    title: 'Region',
    load: () async => phRegions,
    onPicked: (region) {
      if (region.code == _region?.code) return;
      _region = region;
      _province = region.code == ncrCode
          ? const PsgcPlace(ncrCode, ncrProvinceName)
          : null;
      _city = null;
      _barangay = null;
    },
  );

  void _pickProvince() => _pick(
    title: 'Province',
    load: () => ref.read(psgcProvider).provinces(_region!.code),
    onPicked: (province) {
      if (province.code == _province?.code) return;
      _province = province;
      _city = null;
      _barangay = null;
    },
  );

  void _pickCity() => _pick(
    title: 'City or municipality',
    load: () => ref
        .read(psgcProvider)
        .cities(regionCode: _region!.code, provinceCode: _province!.code),
    onPicked: (city) {
      if (city.code == _city?.code) return;
      _city = city;
      _barangay = null;
    },
  );

  void _pickBarangay() => _pick(
    title: 'Barangay',
    load: () => ref.read(psgcProvider).barangays(_city!.code),
    onPicked: (barangay) => _barangay = barangay,
  );

  Future<void> _save() async {
    setState(() {
      _showPlaceErrors = true;
      _failure = null;
    });
    final fieldsOk = _form.currentState!.validate();
    if (!fieldsOk ||
        _region == null ||
        _province == null ||
        _city == null ||
        _barangay == null) {
      return;
    }

    final phone = Rules.normalizeMobile(_phone.text) ?? _phone.text.trim();
    try {
      final saved = await ref.read(buyerApiProvider).saveAddress({
        'full_name': Rules.squish(_name.text),
        'phone': phone,
        'address': _street.text.trim(),
        'floor_unit': _floor.text.trim().isEmpty ? null : _floor.text.trim(),
        'region': _region!.name,
        'region_code': _region!.code,
        'province': _province!.name,
        'province_code': _province!.code,
        'district': _city!.name,
        'city_code': _city!.code,
        'ward': _barangay!.name,
        'barangay_code': _barangay!.code,
        'label': _label,
        'is_default': _isDefault,
      }, id: widget.address?.id);
      ref.invalidate(addressesProvider);
      if (!mounted) return;
      showSnack(
        context,
        widget.address == null ? 'Address added.' : 'Address saved.',
      );
      context.pop(saved);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final placeError =
        _failure?.errorFor('barangay_code') ??
        _failure?.errorFor('city_code') ??
        _failure?.errorFor('province_code');
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.address == null ? 'New address' : 'Edit address'),
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(AppSpace.lg),
          children: [
            if (_failure != null && _failure!.fieldErrors.isEmpty) ...[
              MessageBanner(message: _failure!.message),
              const SizedBox(height: AppSpace.lg),
            ],
            if (widget.address?.needsUpdate ?? false) ...[
              const MessageBanner(
                message: 'Pick the region, city and barangay again so the courier can find this address.',
                tone: StatusTone.amber,
              ),
              const SizedBox(height: AppSpace.lg),
            ],
            AppTextField(
              label: 'Full name',
              controller: _name,
              keyboardType: TextInputType.name,
              textCapitalization: TextCapitalization.words,
              maxLength: 100,
              validator: Rules.addressFullName,
              serverError: _failure?.errorFor('full_name'),
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Mobile number',
              controller: _phone,
              hint: '09XXXXXXXXX',
              keyboardType: TextInputType.phone,
              inputFormatters: [Only.mobileChars, Only.max(13)],
              validator: Rules.mobile,
              serverError: _failure?.errorFor('phone'),
            ),
            const SizedBox(height: AppSpace.lg),
            _PlaceField(
              label: 'Region',
              value: _region?.name,
              error: _showPlaceErrors && _region == null
                  ? 'Choose the region.'
                  : null,
              onTap: _pickRegion,
            ),
            if (!_isNcr)
              _PlaceField(
                label: 'Province',
                value: _province?.name,
                enabled: _region != null,
                error: _showPlaceErrors && _region != null && _province == null
                    ? 'Choose the province.'
                    : null,
                onTap: _pickProvince,
              ),
            _PlaceField(
              label: 'City or municipality',
              value: _city?.name,
              enabled: _province != null,
              error: _showPlaceErrors && _province != null && _city == null
                  ? 'Choose the city or municipality.'
                  : null,
              onTap: _pickCity,
            ),
            _PlaceField(
              label: 'Barangay',
              value: _barangay?.name,
              enabled: _city != null,
              error:
                  placeError ??
                  (_showPlaceErrors && _city != null && _barangay == null
                      ? 'Choose the barangay.'
                      : null),
              onTap: _pickBarangay,
            ),
            const SizedBox(height: AppSpace.sm),
            AppTextField(
              label: 'Street, house or building',
              controller: _street,
              maxLength: 255,
              textCapitalization: TextCapitalization.words,
              validator: (value) => (value ?? '').trim().isEmpty
                  ? 'Enter the street, house or building.'
                  : Rules.maxLength(value, 'Street', 255),
              serverError: _failure?.errorFor('address'),
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Floor or unit (optional)',
              controller: _floor,
              maxLength: 100,
              validator: (value) =>
                  Rules.maxLength(value, 'Floor or unit', 100),
              serverError: _failure?.errorFor('floor_unit'),
            ),
            const SizedBox(height: AppSpace.lg),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'home',
                  label: Text('Home'),
                  icon: Icon(LucideIcons.house, size: 16),
                ),
                ButtonSegment(
                  value: 'office',
                  label: Text('Office'),
                  icon: Icon(LucideIcons.building2, size: 16),
                ),
              ],
              selected: {_label},
              onSelectionChanged: (picked) =>
                  setState(() => _label = picked.first),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Use as my default address'),
              value: _isDefault,
              onChanged: (on) => setState(() => _isDefault = on),
            ),
            const SizedBox(height: AppSpace.lg),
            SubmitButton(
              label: 'Save address',
              busyLabel: 'Saving…',
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}

/// Looks like a text box, opens a list to pick from. Disabled until the place above it is chosen.
class _PlaceField extends StatelessWidget {
  const _PlaceField({
    required this.label,
    required this.value,
    required this.onTap,
    this.enabled = true,
    this.error,
  });

  final String label;
  final String? value;
  final VoidCallback onTap;
  final bool enabled;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: InkWell(
        borderRadius: AppRadius.cardAll,
        onTap: enabled ? onTap : null,
        child: InputDecorator(
          isEmpty: value == null,
          decoration: InputDecoration(
            labelText: label,
            enabled: enabled,
            errorText: error,
            suffixIcon: const Icon(LucideIcons.chevronDown, size: 18),
          ),
          child: Text(value ?? '', style: const TextStyle(fontSize: 16)),
        ),
      ),
    );
  }
}

class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({required this.title, required this.load});

  final String title;
  final Future<List<PsgcPlace>> Function() load;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  late Future<List<PsgcPlace>> _places = widget.load();
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              0,
              AppSpace.lg,
              AppSpace.sm,
            ),
            child: TextField(
              autofocus: false,
              decoration: InputDecoration(
                hintText: 'Search ${widget.title.toLowerCase()}',
                prefixIcon: const Icon(LucideIcons.search, size: 18),
              ),
              onChanged: (value) =>
                  setState(() => _filter = value.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: FutureBuilder<List<PsgcPlace>>(
              future: _places,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return ErrorRetry(
                    failure: ApiFailure.from(snapshot.error!),
                    onRetry: () => setState(() => _places = widget.load()),
                  );
                }
                if (!snapshot.hasData) return const SkeletonList();
                final places = snapshot.data!
                    .where(
                      (place) =>
                          _filter.isEmpty ||
                          place.name.toLowerCase().contains(_filter),
                    )
                    .toList();
                if (places.isEmpty) {
                  return const EmptyState(
                    icon: LucideIcons.mapPin,
                    title: 'Nothing matches',
                  );
                }
                return ListView.builder(
                  itemCount: places.length,
                  itemBuilder: (context, index) => ListTile(
                    minTileHeight: 48,
                    title: Text(places[index].name),
                    onTap: () => Navigator.of(context).pop(places[index]),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: AppSpace.sm),
          Text(
            'Places from the Philippine Statistics Authority (PSGC).',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.stone500.withValues(alpha: 0.9),
            ),
          ),
          const SizedBox(height: AppSpace.sm),
        ],
      ),
    );
  }
}
