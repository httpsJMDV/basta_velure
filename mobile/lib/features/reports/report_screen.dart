import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_failure.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/widgets.dart';
import '../buyer/widgets/buyer_widgets.dart';
import 'report_data.dart';

/// Opens the report of [kind] over the whole app, from the hub's or courier's More screen or the rider's account.
Future<void> openReport(BuildContext context, ReportKind kind) => Navigator.of(
  context,
  rootNavigator: true,
).push(MaterialPageRoute<void>(builder: (_) => ReportScreen(kind: kind)));

/// A hub's, courier network's or rider's report over 7, 30 or 90 days: the key figures, then each table, and the
/// same report as Excel or PDF. The files are made by the server and open in the phone's browser, which saves them
/// to Downloads. They match the website's.
class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({super.key, required this.kind});

  final ReportKind kind;

  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  static const _presets = [7, 30, 90];

  /// The screen lists this many rows of a table; the files have them all.
  static const _shownRows = 30;

  int _days = 30;
  ReportDoc? _doc;
  ApiFailure? _failure;
  bool _loading = false;
  String? _downloading;

  @override
  void initState() {
    super.initState();
    _load();
  }

  ({String from, String to}) get _range {
    // Philippine days, like the server (UTC+8, no daylight saving).
    final today = DateTime.now().toUtc().add(const Duration(hours: 8));
    final day = DateFormat('yyyy-MM-dd');
    return (
      from: day.format(today.subtract(Duration(days: _days - 1))),
      to: day.format(today),
    );
  }

  Future<void> _load() async {
    final range = _range;
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final doc = await ref
          .read(reportApiProvider)
          .document(widget.kind, from: range.from, to: range.to);
      if (mounted) setState(() => _doc = doc);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _download(String format) async {
    final doc = _doc;
    if (doc == null || _downloading != null) return;
    setState(() => _downloading = format);
    try {
      final link = await ref
          .read(reportApiProvider)
          .fileLink(widget.kind, format, from: doc.from, to: doc.to);
      final opened = await launchUrl(
        link,
        mode: LaunchMode.externalApplication,
      );
      if (!mounted) return;
      showSnack(
        context,
        opened
            ? 'Your ${format == 'xlsx' ? 'Excel file' : 'PDF'} is downloading. Find it in Downloads.'
            : "Couldn't open the browser to download it.",
        error: !opened,
      );
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    } finally {
      if (mounted) setState(() => _downloading = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = _doc;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(
        title: Text(widget.kind.title),
        backgroundColor: AppColors.gray50,
      ),
      bottomNavigationBar: _DownloadBar(
        busy: _downloading,
        enabled: doc != null && !_loading,
        onExcel: () => _download('xlsx'),
        onPdf: () => _download('pdf'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.xs,
            AppSpace.lg,
            AppSpace.xl,
          ),
          children: [
            SegmentedButton<int>(
              segments: [
                for (final d in _presets)
                  ButtonSegment(value: d, label: Text('$d days')),
              ],
              selected: {_days},
              showSelectedIcon: false,
              onSelectionChanged: (picked) {
                setState(() => _days = picked.first);
                _load();
              },
            ),
            const SizedBox(height: AppSpace.lg),
            if (_failure != null && doc == null)
              ErrorRetry(failure: _failure!, onRetry: _load)
            else if (doc == null)
              const SizedBox(height: 480, child: SkeletonList(count: 5))
            else
              AnimatedOpacity(
                opacity: _loading ? 0.55 : 1,
                duration: const Duration(milliseconds: 150),
                child: _Report(doc: doc, shownRows: _shownRows),
              ),
          ],
        ),
      ),
    );
  }
}

class _Report extends StatelessWidget {
  const _Report({required this.doc, required this.shownRows});

  final ReportDoc doc;
  final int shownRows;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          doc.owner,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: AppColors.gray900,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          '${doc.periodLabel} · Philippine time',
          style: const TextStyle(fontSize: 13, color: AppColors.gray600),
        ),
        const SizedBox(height: AppSpace.md),
        LayoutBuilder(
          builder: (context, constraints) {
            const gap = AppSpace.sm;
            final width = (constraints.maxWidth - gap) / 2;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final kpi in doc.kpis)
                  SizedBox(
                    width: width,
                    child: _KpiCard(kpi: kpi),
                  ),
              ],
            );
          },
        ),
        for (final section in doc.sections) ...[
          const SizedBox(height: AppSpace.lg),
          _SectionCard(section: section, shownRows: shownRows),
        ],
        if (doc.notes.isNotEmpty) ...[
          const SizedBox(height: AppSpace.lg),
          for (final note in doc.notes)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.xs),
              child: Text(
                note,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: AppColors.gray600,
                ),
              ),
            ),
        ],
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.kpi});

  final ReportKpi kpi;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            kpi.label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: AppColors.gray600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            kpi.display,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              fontFeatures: [FontFeature.tabularFigures()],
              color: AppColors.gray900,
            ),
          ),
          if (kpi.hint != null) ...[
            const SizedBox(height: 2),
            Text(
              kpi.hint!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11.5,
                height: 1.3,
                color: AppColors.stone500,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.section, required this.shownRows});

  final ReportSection section;
  final int shownRows;

  /// Wide enough for the values, and for the header's words in one line.
  static double _width(ReportColumn column) {
    final base = switch (column.type) {
      ReportCell.text => 176.0,
      ReportCell.datetime => 182.0,
      ReportCell.date => 116.0,
      ReportCell.money => 112.0,
      _ => 92.0,
    };
    final header = column.label.length * 7.4 + 28;
    return header > base ? header : base;
  }

  @override
  Widget build(BuildContext context) {
    final rows = section.rows.take(shownRows).toList();
    final more = section.totalRows - rows.length;
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.gray200),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    section.title,
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w800,
                      color: AppColors.gray900,
                    ),
                  ),
                ),
                Text(
                  '${NumberFormat.decimalPattern().format(section.totalRows)} ${section.totalRows == 1 ? 'row' : 'rows'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.gray600,
                  ),
                ),
              ],
            ),
          ),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 22),
              child: Text(
                section.empty,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: AppColors.stone500),
              ),
            )
          else
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TableRow(
                    columns: section.columns,
                    values: [for (final c in section.columns) c.label],
                    widths: section.columns.map(_width).toList(),
                    style: _TableRowStyle.header,
                  ),
                  for (final row in rows)
                    _TableRow(
                      columns: section.columns,
                      values: row,
                      widths: section.columns.map(_width).toList(),
                      style: _TableRowStyle.body,
                    ),
                  if (section.total != null)
                    _TableRow(
                      columns: section.columns,
                      values: section.total!,
                      widths: section.columns.map(_width).toList(),
                      style: _TableRowStyle.total,
                    ),
                ],
              ),
            ),
          if (more > 0 || section.note != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              child: Text(
                [
                  if (more > 0)
                    'Showing the first ${rows.length}. The Excel and PDF files have all ${NumberFormat.decimalPattern().format(section.totalRows)}.',
                  ?section.note,
                ].join(' '),
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: AppColors.gray600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

enum _TableRowStyle { header, body, total }

class _TableRow extends StatelessWidget {
  const _TableRow({
    required this.columns,
    required this.values,
    required this.widths,
    required this.style,
  });

  final List<ReportColumn> columns;
  final List<Object?> values;
  final List<double> widths;
  final _TableRowStyle style;

  @override
  Widget build(BuildContext context) {
    final header = style == _TableRowStyle.header;
    final total = style == _TableRowStyle.total;
    return Container(
      decoration: BoxDecoration(
        color: header ? AppColors.gray100 : null,
        border: Border(
          top: total
              ? const BorderSide(color: AppColors.gray900)
              : BorderSide.none,
          bottom: header || total
              ? BorderSide.none
              : const BorderSide(color: AppColors.gray100),
        ),
      ),
      child: Row(
        children: [
          for (var i = 0; i < columns.length; i++)
            Container(
              width: widths[i],
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              alignment: _alignment(i),
              child: Text(
                header
                    ? '${values[i]}'
                    : displayReportCell(
                        columns[i].type,
                        i < values.length ? values[i] : null,
                      ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: header ? 11.5 : 13,
                  fontWeight: header || total
                      ? FontWeight.w700
                      : i == 0
                      ? FontWeight.w600
                      : FontWeight.w400,
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: header ? AppColors.gray600 : AppColors.gray900,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Alignment _alignment(int i) {
    if (!columns[i].numeric) return Alignment.centerLeft;
    // A label in a total row ("Total") lines up with the text, not the numbers.
    final value = i < values.length ? values[i] : null;
    if (style == _TableRowStyle.total &&
        value is String &&
        num.tryParse(value) == null) {
      return Alignment.centerLeft;
    }
    return Alignment.centerRight;
  }
}

class _DownloadBar extends StatelessWidget {
  const _DownloadBar({
    required this.busy,
    required this.enabled,
    required this.onExcel,
    required this.onPdf,
  });

  final String? busy;
  final bool enabled;
  final VoidCallback onExcel;
  final VoidCallback onPdf;

  @override
  Widget build(BuildContext context) {
    Widget spinner(Color color) => SizedBox.square(
      dimension: 16,
      child: CircularProgressIndicator(strokeWidth: 2, color: color),
    );
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.white,
        border: Border(top: BorderSide(color: AppColors.gray200)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpace.lg,
            AppSpace.md,
            AppSpace.lg,
            AppSpace.md,
          ),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    foregroundColor: AppColors.gray900,
                    side: const BorderSide(color: AppColors.gray200),
                  ),
                  onPressed: enabled && busy == null ? onExcel : null,
                  icon: busy == 'xlsx'
                      ? spinner(AppColors.gray900)
                      : Icon(
                          LucideIcons.fileSpreadsheet,
                          size: 18,
                          color: StatusTone.emerald.foreground,
                        ),
                  label: const Text('Excel'),
                ),
              ),
              const SizedBox(width: AppSpace.md),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    backgroundColor: AppColors.gray900,
                  ),
                  onPressed: enabled && busy == null ? onPdf : null,
                  icon: busy == 'pdf'
                      ? spinner(AppColors.white)
                      : const Icon(LucideIcons.fileText, size: 18),
                  label: const Text('PDF'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
