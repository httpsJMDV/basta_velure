import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import 'psgc.dart';

/// The four places of a Philippine address, picked from the PSGC lists. NCR has no provinces, so picking it fills
/// the province with Metro Manila (amaru.md B7).
class PickedPlace {
  const PickedPlace({this.region, this.province, this.city, this.barangay});

  final PsgcPlace? region;
  final PsgcPlace? province;
  final PsgcPlace? city;
  final PsgcPlace? barangay;

  bool get isNcr => region?.code == ncrCode;
  bool get isComplete =>
      region != null && province != null && city != null && barangay != null;

  /// A new region clears everything under it; the same one keeps it.
  PickedPlace withRegion(PsgcPlace value) => value.code == region?.code
      ? this
      : PickedPlace(
          region: value,
          province: value.code == ncrCode
              ? const PsgcPlace(ncrCode, ncrProvinceName)
              : null,
        );

  PickedPlace withProvince(PsgcPlace value) => value.code == province?.code
      ? this
      : PickedPlace(region: region, province: value);

  PickedPlace withCity(PsgcPlace value) => value.code == city?.code
      ? this
      : PickedPlace(region: region, province: province, city: value);

  PickedPlace withBarangay(PsgcPlace value) => PickedPlace(
    region: region,
    province: province,
    city: city,
    barangay: value,
  );

  /// The names and codes, under the names `POST /auth/register` (`address.*`) and `/auth/complete-profile` use.
  Map<String, String> toFields() => {
    'region': region!.name,
    'region_code': region!.code,
    'province': province!.name,
    'province_code': province!.code,
    'city_municipality': city!.name,
    'city_code': city!.code,
    'barangay': barangay!.name,
    'barangay_code': barangay!.code,
  };
}

/// Region, province, city and barangay, each opening a searchable list. Each one waits for the one above it.
class PlaceFields extends ConsumerWidget {
  const PlaceFields({
    super.key,
    required this.value,
    required this.onChanged,
    this.showErrors = false,
    this.serverError,
  });

  final PickedPlace value;
  final ValueChanged<PickedPlace> onChanged;

  /// After the person tried to go on: name the first missing place.
  final bool showErrors;

  /// The server's message about the places, shown under the barangay.
  final String? serverError;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final psgc = ref.read(psgcProvider);
    String? missing(Object? above, Object? self, String message) =>
        showErrors && above != null && self == null ? message : null;

    Future<void> pick(
      String title,
      Future<List<PsgcPlace>> Function() load,
      PsgcPlace? current,
      PickedPlace Function(PsgcPlace) apply,
    ) async {
      final picked = await showPlaceSheet(
        context,
        title: title,
        load: load,
        selected: current,
      );
      if (picked != null) onChanged(apply(picked));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PlaceField(
          label: 'Region',
          icon: LucideIcons.map,
          value: value.region?.name,
          error: showErrors && value.region == null
              ? 'Choose the region.'
              : null,
          onTap: () => pick(
            'Region',
            () async => phRegions,
            value.region,
            value.withRegion,
          ),
        ),
        if (!value.isNcr)
          PlaceField(
            label: 'Province',
            icon: LucideIcons.mapPinned,
            value: value.province?.name,
            error: missing(
              value.region,
              value.province,
              'Choose the province.',
            ),
            onTap: value.region == null
                ? null
                : () => pick(
                    'Province',
                    () => psgc.provinces(value.region!.code),
                    value.province,
                    value.withProvince,
                  ),
          ),
        PlaceField(
          label: 'City or municipality',
          icon: LucideIcons.building2,
          value: value.city?.name,
          error: missing(
            value.province,
            value.city,
            'Choose the city or municipality.',
          ),
          onTap: value.province == null
              ? null
              : () => pick(
                  'City or municipality',
                  () => psgc.cities(
                    regionCode: value.region!.code,
                    provinceCode: value.province!.code,
                  ),
                  value.city,
                  value.withCity,
                ),
        ),
        PlaceField(
          label: 'Barangay',
          icon: LucideIcons.mapPin,
          value: value.barangay?.name,
          error:
              serverError ??
              missing(value.city, value.barangay, 'Choose the barangay.'),
          onTap: value.city == null
              ? null
              : () => pick(
                  'Barangay',
                  () => psgc.barangays(value.city!.code),
                  value.barangay,
                  value.withBarangay,
                ),
        ),
      ],
    );
  }
}

/// Looks like a text box and opens a list to pick from. Disabled (null [onTap]) until the place above it is chosen.
class PlaceField extends StatelessWidget {
  const PlaceField({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
    this.icon,
    this.error,
  });

  final String label;
  final String? value;
  final VoidCallback? onTap;
  final IconData? icon;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpace.md),
      child: Semantics(
        button: true,
        enabled: enabled,
        label: label,
        value: value,
        child: InkWell(
          borderRadius: AppRadius.cardAll,
          onTap: onTap,
          child: InputDecorator(
            isEmpty: value == null,
            decoration: InputDecoration(
              labelText: label,
              enabled: enabled,
              errorText: error,
              prefixIcon: icon == null
                  ? null
                  : Icon(
                      icon,
                      size: 18,
                      color: enabled ? AppColors.stone500 : AppColors.stone300,
                    ),
              suffixIcon: Icon(
                LucideIcons.chevronDown,
                size: 18,
                color: enabled ? AppColors.stone600 : AppColors.stone300,
              ),
            ),
            child: Text(
              value ?? '',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 16, color: AppColors.stone900),
            ),
          ),
        ),
      ),
    );
  }
}

/// A list of places in a sheet from the bottom, with a search box. Returns the place tapped, or null.
Future<PsgcPlace?> showPlaceSheet(
  BuildContext context, {
  required String title,
  required Future<List<PsgcPlace>> Function() load,
  PsgcPlace? selected,
}) {
  FocusScope.of(context).unfocus();
  HapticFeedback.selectionClick();
  return showModalBottomSheet<PsgcPlace>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => PlaceSheet(title: title, load: load, selected: selected),
  );
}

class PlaceSheet extends StatefulWidget {
  const PlaceSheet({
    super.key,
    required this.title,
    required this.load,
    this.selected,
  });

  final String title;
  final Future<List<PsgcPlace>> Function() load;
  final PsgcPlace? selected;

  @override
  State<PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<PlaceSheet> {
  // Loaded once: a rebuild (the keyboard opening) must not start the download again.
  late Future<List<PsgcPlace>> _places = widget.load();
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.78 - keyboard * 0.5,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.xl,
                0,
                AppSpace.xl,
                AppSpace.md,
              ),
              child: Text(
                widget.title,
                style: const TextStyle(
                  fontFamily: 'NotoSerif',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                  color: AppColors.ink,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpace.lg,
                0,
                AppSpace.lg,
                AppSpace.sm,
              ),
              child: TextField(
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search ${widget.title.toLowerCase()}',
                  prefixIcon: const Icon(LucideIcons.search, size: 18),
                  fillColor: AppColors.stone50,
                  isDense: true,
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
                    return EmptyState(
                      icon: LucideIcons.mapPin,
                      title: 'Nothing matches',
                      message: 'Check the spelling, or clear the search.',
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpace.md,
                      0,
                      AppSpace.md,
                      AppSpace.md,
                    ),
                    itemCount: places.length,
                    itemBuilder: (context, index) {
                      final place = places[index];
                      final picked = place.code == widget.selected?.code;
                      return ListTile(
                        minTileHeight: 48,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        selected: picked,
                        selectedTileColor: AppColors.brandRedTint,
                        selectedColor: AppColors.brandRedDark,
                        title: Text(
                          place.name,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: picked
                                ? FontWeight.w600
                                : FontWeight.w500,
                          ),
                        ),
                        trailing: picked
                            ? const Icon(
                                LucideIcons.check,
                                size: 18,
                                color: AppColors.brandRed,
                              )
                            : null,
                        onTap: () => Navigator.of(context).pop(place),
                      );
                    },
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.sm),
              child: Text(
                'Places from the Philippine Statistics Authority (PSGC).',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.stone500.withValues(alpha: 0.9),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
