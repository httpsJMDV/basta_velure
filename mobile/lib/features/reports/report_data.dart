import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_failure.dart';
import '../../core/api/json.dart';

/// Whose report: the hub's, the courier network's or the rider's (docs/api/logistics-rider-reports.md).
enum ReportKind {
  hub('/hub/reports', 'Hub report'),
  courier('/logistics/reports', 'Network report'),
  rider('/rider/reports', 'Rider report');

  const ReportKind(this.base, this.title);

  final String base;
  final String title;
}

/// A cell type, the same as the server's ReportDocument.
enum ReportCell { text, int, money, percent, hours, date, datetime }

ReportCell _cell(String? type) =>
    ReportCell.values.where((c) => c.name == type).firstOrNull ??
    ReportCell.text;

class ReportKpi {
  const ReportKpi(this.label, this.display, this.hint);

  final String label;
  final String display;
  final String? hint;
}

class ReportColumn {
  const ReportColumn(this.label, this.type);

  final String label;
  final ReportCell type;

  bool get numeric => const {
    ReportCell.int,
    ReportCell.money,
    ReportCell.percent,
    ReportCell.hours,
  }.contains(type);
}

class ReportSection {
  const ReportSection({
    required this.title,
    required this.columns,
    required this.rows,
    required this.totalRows,
    required this.total,
    required this.note,
    required this.empty,
  });

  final String title;
  final List<ReportColumn> columns;
  final List<List<Object?>> rows;

  /// Rows in the files; the screen has at most the first 100.
  final int totalRows;
  final List<Object?>? total;
  final String? note;
  final String empty;
}

/// `GET /{hub|logistics|rider}/reports/document`.
class ReportDoc {
  const ReportDoc({
    required this.title,
    required this.owner,
    required this.from,
    required this.to,
    required this.periodLabel,
    required this.kpis,
    required this.sections,
    required this.notes,
  });

  final String title;
  final String owner;
  final String from;
  final String to;
  final String periodLabel;
  final List<ReportKpi> kpis;
  final List<ReportSection> sections;
  final List<String> notes;

  factory ReportDoc.fromJson(Json json) {
    final range = asJson(json['range']);
    List<Object?> list(Object? value) => value is List ? value : const [];
    return ReportDoc(
      title: asString(json['title']) ?? 'Report',
      owner: asString(json['owner']) ?? '',
      from: asString(range['from']) ?? '',
      to: asString(range['to']) ?? '',
      periodLabel: asString(range['label']) ?? '',
      kpis: asJsonList(json['kpis'])
          .map(
            (k) => ReportKpi(
              asString(k['label']) ?? '',
              asString(k['display']) ?? '—',
              asString(k['hint']),
            ),
          )
          .toList(),
      sections: asJsonList(json['sections']).map((s) {
        final total = s['total'];
        return ReportSection(
          title: asString(s['title']) ?? '',
          columns: asJsonList(s['columns'])
              .map(
                (c) => ReportColumn(
                  asString(c['label']) ?? '',
                  _cell(asString(c['type'])),
                ),
              )
              .toList(),
          rows: list(s['rows']).map(list).toList(),
          totalRows: asInt(s['total_rows']),
          total: total is List ? total : null,
          note: asString(s['note']),
          empty: asString(s['empty']) ?? 'Nothing in this period.',
        );
      }).toList(),
      notes: asStringList(json['notes']),
    );
  }
}

/// How a cell reads, the same words as the server's ReportDocument::display. A label in a total row ("Total")
/// reads as text whatever its column holds.
String displayReportCell(ReportCell type, Object? value) {
  if (value == null || value == '') return type == ReportCell.text ? '' : '—';
  if (value is String && type != ReportCell.text) {
    final fits = type == ReportCell.date || type == ReportCell.datetime
        ? RegExp(r'^\d{4}-\d{2}-\d{2}').hasMatch(value)
        : num.tryParse(value) != null;
    if (!fits) return value;
  }
  final number = value is num ? value : num.tryParse('$value') ?? 0;
  switch (type) {
    case ReportCell.int:
      return NumberFormat.decimalPattern().format(number.round());
    case ReportCell.money:
      return '₱${NumberFormat('#,##0.00').format(number)}';
    case ReportCell.percent:
      return '${(number * 100).round()}%';
    case ReportCell.hours:
      final h = (number * 10).round() / 10;
      return '${h == h.roundToDouble() ? h.toInt() : h} h';
    case ReportCell.date:
      return DateFormat('MMM d, y').format(DateTime.parse('$value'));
    case ReportCell.datetime:
      // Shown in Philippine time (UTC+8, no daylight saving), like the files.
      final at = DateTime.parse('$value').toUtc().add(const Duration(hours: 8));
      return DateFormat('MMM d, y h:mm a').format(at);
    case ReportCell.text:
      return '$value';
  }
}

final reportApiProvider = Provider<ReportApi>(
  (ref) => ReportApi(ref.watch(dioProvider)),
);

class ReportApi {
  ReportApi(this._dio);

  final Dio _dio;

  Future<ReportDoc> document(
    ReportKind kind, {
    required String from,
    required String to,
  }) async {
    try {
      final response = await _dio.get<Object?>(
        '${kind.base}/document',
        queryParameters: {'from': from, 'to': to},
      );
      return ReportDoc.fromJson(asJson(asJson(response.data)['data']));
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  /// A link to the file that works for 10 minutes without the sign-in token, for the phone's browser.
  Future<Uri> fileLink(
    ReportKind kind,
    String format, {
    required String from,
    required String to,
  }) async {
    try {
      final response = await _dio.post<Object?>(
        '${kind.base}/link',
        data: {'format': format, 'from': from, 'to': to},
      );
      final url = asString(asJson(asJson(response.data)['data'])['url']);
      if (url == null) {
        throw const ApiFailure(FailureKind.server, ApiMessages.somethingWrong);
      }
      return Uri.parse(url);
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }
}
