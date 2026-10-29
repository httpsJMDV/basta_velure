/// Reading the API's JSON without crashing on a missing key or an unexpected type. Laravel sends amounts as numbers
/// or as strings ("1234.50") depending on the column, and leaves keys out when a relation is not loaded.
library;

typedef Json = Map<String, dynamic>;

Json asJson(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Json> asJsonList(Object? value) => value is List
    ? value.whereType<Map>().map(Map<String, dynamic>.from).toList()
    : const [];

int asInt(Object? value, [int fallback = 0]) => asIntOrNull(value) ?? fallback;

int? asIntOrNull(Object? value) => switch (value) {
  final num n => n.toInt(),
  final String s => int.tryParse(s.trim()) ?? double.tryParse(s)?.toInt(),
  _ => null,
};

double asDouble(Object? value, [double fallback = 0]) =>
    asDoubleOrNull(value) ?? fallback;

double? asDoubleOrNull(Object? value) => switch (value) {
  final num n => n.toDouble(),
  final String s => double.tryParse(s.trim()),
  _ => null,
};

/// A non-empty string, or null. Numbers come back as text (an order number sent as a number still reads).
String? asString(Object? value) => switch (value) {
  final String s when s.trim().isNotEmpty => s,
  final num n => '$n',
  _ => null,
};

bool asBool(Object? value) =>
    value == true || value == 1 || value == '1' || value == 'true';

DateTime? asDate(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;

List<String> asStringList(Object? value) =>
    value is List ? value.map(asString).whereType<String>().toList() : const [];

/// One page of a Laravel paginated list (`data` plus `meta.current_page`, `meta.last_page`, `meta.total`).
class ApiPage<T> {
  const ApiPage({
    required this.items,
    required this.currentPage,
    required this.lastPage,
    required this.total,
    this.meta = const {},
  });

  final List<T> items;
  final int currentPage;
  final int lastPage;
  final int total;

  /// The whole `meta` object, for extras such as `unread` or `avg_rating`.
  final Json meta;

  bool get hasMore => currentPage < lastPage;

  factory ApiPage.from(Object? body, T Function(Json json) parse) {
    final json = asJson(body);
    final meta = asJson(json['meta']);
    final items = asJsonList(json['data']).map(parse).toList();
    return ApiPage(
      items: items,
      currentPage: asInt(meta['current_page'], 1),
      lastPage: asInt(meta['last_page'], 1),
      total: asInt(meta['total'], items.length),
      meta: meta,
    );
  }

  /// A list endpoint that is not paginated: everything on one page.
  factory ApiPage.single(List<T> items) =>
      ApiPage(items: items, currentPage: 1, lastPage: 1, total: items.length);
}
