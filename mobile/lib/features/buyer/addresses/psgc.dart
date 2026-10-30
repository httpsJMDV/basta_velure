import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';

/// A place in the Philippine Standard Geographic Code list. The code is a string: leading zeros matter.
class PsgcPlace {
  const PsgcPlace(this.code, this.name);

  final String code;
  final String name;
}

/// The 17 regions with their PSGC codes, the same list as the website (`data/ph-regions.ts`) and the server
/// (`App\Support\PhRegions`).
const phRegions = [
  PsgcPlace('130000000', 'National Capital Region (NCR)'),
  PsgcPlace('140000000', 'Cordillera Administrative Region (CAR)'),
  PsgcPlace('010000000', 'Region I (Ilocos Region)'),
  PsgcPlace('020000000', 'Region II (Cagayan Valley)'),
  PsgcPlace('030000000', 'Region III (Central Luzon)'),
  PsgcPlace('040000000', 'Region IV-A (CALABARZON)'),
  PsgcPlace('170000000', 'MIMAROPA Region'),
  PsgcPlace('050000000', 'Region V (Bicol Region)'),
  PsgcPlace('060000000', 'Region VI (Western Visayas)'),
  PsgcPlace('070000000', 'Region VII (Central Visayas)'),
  PsgcPlace('080000000', 'Region VIII (Eastern Visayas)'),
  PsgcPlace('090000000', 'Region IX (Zamboanga Peninsula)'),
  PsgcPlace('100000000', 'Region X (Northern Mindanao)'),
  PsgcPlace('110000000', 'Region XI (Davao Region)'),
  PsgcPlace('120000000', 'Region XII (SOCCSKSARGEN)'),
  PsgcPlace('160000000', 'Region XIII (Caraga)'),
  PsgcPlace(
    '150000000',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
  ),
];

/// NCR has no provinces: the server stores "Metro Manila" with the region's code as the province (amaru.md B7).
const ncrCode = '130000000';
const ncrProvinceName = 'Metro Manila';

final psgcProvider = Provider<Psgc>((ref) {
  final psgc = Psgc();
  ref.onDispose(psgc.close);
  return psgc;
});

/// The free PSGC list the website uses (`https://psgc.gitlab.io/api`). Its own client, so the Loved-IT sign-in
/// token is never sent to another site. Lists are kept for the session: places don't change.
class Psgc {
  final _dio = Dio(
    BaseOptions(
      baseUrl: 'https://psgc.gitlab.io/api',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  final _cache = <String, List<PsgcPlace>>{};
  final _names = <String, String>{};
  final _cities = <String, String?>{};

  Future<List<PsgcPlace>> provinces(String regionCode) =>
      _list('/regions/$regionCode/provinces/');

  /// The cities and municipalities of a province, or of NCR straight from the region.
  Future<List<PsgcPlace>> cities({
    required String regionCode,
    required String provinceCode,
  }) => regionCode == ncrCode || provinceCode == ncrCode
      ? _list('/regions/$ncrCode/cities-municipalities/')
      : _list('/provinces/$provinceCode/cities-municipalities/');

  Future<List<PsgcPlace>> barangays(String cityCode) =>
      _list('/cities-municipalities/$cityCode/barangays/');

  /// Names for barangay codes ("137403017" → "Rosario, Pasig"), for what the server stores only as codes (hub coverage,
  /// rider areas). A few at a time, like the website's `usePlaceNames`. A code it can't name is left out: show the code.
  Future<Map<String, String>> barangayNames(Iterable<String> codes) async {
    final queue = codes.where((code) => !_names.containsKey(code)).toList();
    Future<void> worker() async {
      while (queue.isNotEmpty) {
        final code = queue.removeLast();
        final name = await _barangayName(code);
        if (name != null) _names[code] = name;
      }
    }

    await Future.wait(List.generate(6, (_) => worker()));
    return {
      for (final code in codes)
        if (_names.containsKey(code)) code: _names[code]!,
    };
  }

  Future<String?> _barangayName(String code) async {
    final barangay = await _object('/barangays/$code/');
    final name = asString(barangay?['name']);
    if (name == null) return null;
    final cityCode =
        asString(barangay?['cityCode']) ??
        asString(barangay?['municipalityCode']);
    final city = cityCode == null ? null : await _cityName(cityCode);
    return city == null ? name : '$name, $city';
  }

  Future<String?> _cityName(String code) async {
    if (_cities.containsKey(code)) return _cities[code];
    final name = asString(
      (await _object('/cities-municipalities/$code/'))?['name'],
    );
    // "City of Pasig" reads as "Pasig"; a municipality keeps its name.
    return _cities[code] = name
        ?.replaceFirst(RegExp(r'^City of\s+', caseSensitive: false), '')
        .replaceFirst(RegExp(r'\s+City$', caseSensitive: false), '');
  }

  Future<Json?> _object(String path) async {
    try {
      return asJson((await _dio.get<Object?>(path)).data);
    } on DioException {
      return null;
    }
  }

  Future<List<PsgcPlace>> _list(String path) async {
    final cached = _cache[path];
    if (cached != null) return cached;
    try {
      final response = await _dio.get<List<dynamic>>(path);
      final places =
          asJsonList(response.data)
              .map(
                (json) => PsgcPlace(
                  asString(json['code']) ?? '',
                  asString(json['name']) ?? '',
                ),
              )
              .where((place) => place.code.isNotEmpty)
              .toList()
            ..sort((a, b) => a.name.compareTo(b.name));
      return _cache[path] = places;
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  void close() => _dio.close();
}
