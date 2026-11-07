import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// `hub`, `logistics` (the courier team) or `rider`: whose activity log to read.
typedef ActivityScope = String;

/// One line of an activity log: a parcel step from the order timeline, or a decision from the audit log.
class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.category,
    required this.title,
    required this.at,
    required this.actorRole,
    this.detail,
    this.actorName,
    this.trackingNumber,
    this.orderNumber,
  });

  final String id;
  final String category;
  final String title;
  final String? detail;
  final DateTime at;
  final String actorRole;
  final String? actorName;
  final String? trackingNumber;
  final String? orderNumber;

  factory ActivityEntry.fromJson(Json json) {
    final actor = asJson(json['actor']);
    return ActivityEntry(
      id: asString(json['id']) ?? '',
      category: asString(json['category']) ?? 'other',
      title: asString(json['title']) ?? '',
      detail: asString(json['detail']),
      at: asDate(json['at'])?.toLocal() ?? DateTime.now(),
      actorRole: asString(actor['role']) ?? '',
      actorName: asString(actor['name']),
      trackingNumber: asString(json['tracking_number']),
      orderNumber: asString(json['order_number']),
    );
  }
}

class ActivityPage {
  const ActivityPage({
    required this.entries,
    required this.nextBefore,
    required this.categories,
  });

  final List<ActivityEntry> entries;
  final String? nextBefore;
  final List<({String key, String label})> categories;
}

final activityApiProvider = Provider<ActivityApi>(
  (ref) => ActivityApi(ref.watch(dioProvider)),
);

/// `GET /{hub|logistics|rider}/activity`.
class ActivityApi {
  ActivityApi(this._dio);

  final Dio _dio;

  Future<ActivityPage> page(
    ActivityScope scope, {
    String? category,
    String? search,
    String? before,
  }) async {
    try {
      final body = asJson(
        (await _dio.get<Object?>(
          '/$scope/activity',
          queryParameters: {
            'category': ?category,
            'search': ?search,
            'before': ?before,
          },
        )).data,
      );
      final meta = asJson(body['meta']);
      return ActivityPage(
        entries: asJsonList(body['data']).map(ActivityEntry.fromJson).toList(),
        nextBefore: asString(meta['next_before']),
        categories: [
          for (final c in asJsonList(meta['categories']))
            (key: asString(c['key']) ?? '', label: asString(c['label']) ?? ''),
        ],
      );
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }
}

const _dots = <String, Color>{
  'pickups': Color(0xFF0EA5E9),
  'hub': Color(0xFF6B7280),
  'transfers': Color(0xFF8B5CF6),
  'deliveries': Color(0xFF10B981),
  'failed': Color(0xFFEF4444),
  'returns': Color(0xFFF59E0B),
  'cancellations': Color(0xFFFB7185),
  'team': Color(0xFF3B82F6),
  'money': Color(0xFF65A30D),
  'settings': Color(0xFFA8A29E),
};

/// The activity log of a hub, the courier team or a rider, newest first, grouped by day. Chips narrow it to one kind
/// (returns, cancellations, failed deliveries…); the search box to one tracking or order number.
class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({
    super.key,
    required this.scope,
    this.title = 'Activity log',
  });

  final ActivityScope scope;
  final String title;

  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  final _search = TextEditingController();
  List<ActivityEntry>? _entries;
  List<({String key, String label})> _categories = const [];
  String? _category;
  String? _next;
  ApiFailure? _failure;
  bool _loadingMore = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final term = _search.text.trim();
    try {
      final page = await ref
          .read(activityApiProvider)
          .page(
            widget.scope,
            category: _category,
            search: term.isEmpty ? null : term,
            before: more ? _next : null,
          );
      if (!mounted) return;
      setState(() {
        _entries = more ? [...?_entries, ...page.entries] : page.entries;
        _next = page.nextBefore;
        _categories = page.categories;
        _failure = null;
      });
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  void _pick(String? category) {
    setState(() {
      _category = category;
      _entries = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    return Scaffold(
      backgroundColor: AppColors.gray50,
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpace.lg,
              AppSpace.sm,
              AppSpace.lg,
              AppSpace.sm,
            ),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _pick(_category),
              decoration: InputDecoration(
                hintText: 'Tracking or order number',
                prefixIcon: const Icon(LucideIcons.search, size: 18),
                isDense: true,
                filled: true,
                fillColor: AppColors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.gray200),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: AppColors.gray200),
                ),
              ),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.lg),
              children: [
                _Chip(
                  label: 'Everything',
                  selected: _category == null,
                  onTap: () => _pick(null),
                ),
                for (final c in _categories)
                  _Chip(
                    label: c.label,
                    color: _dots[c.key],
                    selected: _category == c.key,
                    onTap: () => _pick(c.key),
                  ),
              ],
            ),
          ),
          Expanded(
            child: entries == null
                ? (_failure != null
                      ? ErrorRetry(failure: _failure!, onRetry: _load)
                      : const SkeletonList(count: 6))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: entries.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 80),
                              EmptyState(
                                icon: LucideIcons.history,
                                title: 'Nothing here yet',
                                message: 'Scans, trips, deliveries, returns and decisions show here as they happen.',
                              ),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.only(bottom: 96),
                            itemCount: entries.length + (_next != null ? 1 : 0),
                            itemBuilder: (context, i) {
                              if (i == entries.length) return _moreButton();
                              final e = entries[i];
                              final newDay =
                                  i == 0 ||
                                  !DateUtils.isSameDay(entries[i - 1].at, e.at);
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  if (newDay)
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(
                                        AppSpace.lg,
                                        AppSpace.lg,
                                        AppSpace.lg,
                                        AppSpace.xs,
                                      ),
                                      child: Text(
                                        Fmt.date(e.at).toUpperCase(),
                                        style: const TextStyle(
                                          fontSize: 11,
                                          letterSpacing: 0.8,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.gray600,
                                        ),
                                      ),
                                    ),
                                  _Row(entry: e),
                                ],
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _moreButton() => Padding(
    padding: const EdgeInsets.all(AppSpace.lg),
    child: Center(
      child: TextButton(
        onPressed: _loadingMore
            ? null
            : () async {
                setState(() => _loadingMore = true);
                await _load(more: true);
                if (mounted) setState(() => _loadingMore = false);
              },
        child: Text(_loadingMore ? 'Loading…' : 'Load older'),
      ),
    ),
  );
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: AppSpace.sm),
      child: ChoiceChip(
        selected: selected,
        onSelected: (_) => onTap(),
        showCheckmark: false,
        selectedColor: AppColors.gray900,
        backgroundColor: AppColors.white,
        side: BorderSide(
          color: selected ? AppColors.gray900 : AppColors.gray200,
        ),
        label: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (color != null) ...[
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.white : AppColors.gray900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    final who = e.actorName != null
        ? '${e.actorName} · ${e.actorRole}'
        : e.actorRole;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpace.lg, vertical: 3),
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFEFEFF1)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 52,
            child: Text(
              TimeOfDay.fromDateTime(e.at).format(context),
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.gray600,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 6, right: AppSpace.sm),
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: _dots[e.category] ?? AppColors.stone300,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  e.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.gray900,
                  ),
                ),
                if (e.detail != null && e.detail!.isNotEmpty)
                  Text(
                    e.detail!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.gray600,
                      height: 1.35,
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  [who, ?e.trackingNumber].join(' · '),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.stone500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
