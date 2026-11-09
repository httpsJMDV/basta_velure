import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';

/// The hub a rider applies to. Looks like a select box; tapping it opens [showHubSearch], because there are
/// thousands of hubs (one per city for each courier) and only a search finds the right one.
class HubField extends StatelessWidget {
  const HubField({
    super.key,
    required this.hub,
    required this.onTap,
    this.error,
  });

  final PublicHub? hub;
  final VoidCallback onTap;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final picked = hub;
    return Semantics(
      button: true,
      label: 'Hub you want to ride for',
      value: picked?.name,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: AppRadius.cardAll,
        onTap: onTap,
        child: InputDecorator(
          isEmpty: picked == null,
          decoration: InputDecoration(
            labelText: 'Hub you want to ride for',
            hintText: 'Search your city or town',
            errorText: error,
            prefixIcon: const Icon(
              LucideIcons.warehouse,
              size: 18,
              color: AppColors.stone500,
            ),
            suffixIcon: const Icon(
              LucideIcons.search,
              size: 18,
              color: AppColors.stone600,
            ),
          ),
          child: picked == null
              ? const SizedBox.shrink()
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      picked.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        color: AppColors.stone900,
                      ),
                    ),
                    if (_detail(picked).isNotEmpty)
                      Text(
                        _detail(picked),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.stone500,
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

String _detail(PublicHub hub) =>
    [if (hub.place.isNotEmpty) hub.place, ?hub.courier].join(' · ');

/// Searches every approved hub on the server as the person types (their city, town or province), and returns the
/// one tapped.
Future<PublicHub?> showHubSearch(BuildContext context, {PublicHub? selected}) {
  HapticFeedback.selectionClick();
  return showModalBottomSheet<PublicHub>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _HubSearchSheet(selected: selected),
  );
}

class _HubSearchSheet extends ConsumerStatefulWidget {
  const _HubSearchSheet({this.selected});

  final PublicHub? selected;

  @override
  ConsumerState<_HubSearchSheet> createState() => _HubSearchSheetState();
}

class _HubSearchSheetState extends ConsumerState<_HubSearchSheet> {
  Timer? _debounce;
  String _query = '';
  List<PublicHub>? _results;
  ApiFailure? _failure;
  bool _loading = false;

  /// Bumped on every search, so a slow answer to an older query is thrown away.
  int _generation = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _changed(String value) {
    _debounce?.cancel();
    final query = value.trim();
    setState(() => _query = query);
    if (query.length < 2) {
      _generation++;
      setState(() {
        _results = null;
        _failure = null;
        _loading = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(query));
  }

  Future<void> _search(String query) async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final hubs = await ref.read(riderApiProvider).hubs(search: query);
      if (!mounted || generation != _generation) return;
      setState(() {
        _results = hubs;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _failure = ApiFailure.from(error);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.82 - keyboard * 0.5,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.xl,
                0,
                AppSpace.xl,
                AppSpace.xs,
              ),
              child: Text(
                'Choose a hub',
                style: TextStyle(
                  fontFamily: 'NotoSerif',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                  color: AppColors.ink,
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpace.xl,
                0,
                AppSpace.xl,
                AppSpace.md,
              ),
              child: Text(
                'Every city and town has a hub for each courier. Pick the one nearest where you will ride.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  color: AppColors.stone500,
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
                autofocus: true,
                textInputAction: TextInputAction.search,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'City, town or province, e.g. Santa Cruz',
                  prefixIcon: Icon(LucideIcons.search, size: 18),
                  fillColor: AppColors.stone50,
                  isDense: true,
                ),
                onChanged: _changed,
                onSubmitted: (value) {
                  _debounce?.cancel();
                  if (value.trim().length >= 2) _search(value.trim());
                },
              ),
            ),
            SizedBox(
              height: 2,
              child: _loading
                  ? const LinearProgressIndicator(
                      color: AppColors.brandRed,
                      backgroundColor: AppColors.stone100,
                    )
                  : null,
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_failure != null) {
      return ErrorRetry(failure: _failure!, onRetry: () => _search(_query));
    }
    final results = _results;
    if (results == null) {
      return const _Hint(
        icon: LucideIcons.mapPin,
        title: 'Search by place',
        message: 'Type at least two letters of your city, town or province.',
      );
    }
    if (results.isEmpty) {
      return _Hint(
        icon: LucideIcons.searchX,
        title: 'No hub found for "$_query"',
        message: 'Check the spelling, or try the province instead.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(
        AppSpace.md,
        AppSpace.xs,
        AppSpace.md,
        AppSpace.lg,
      ),
      itemCount: results.length,
      separatorBuilder: (_, _) => const SizedBox(height: 2),
      itemBuilder: (context, index) {
        final hub = results[index];
        final picked = hub.id == widget.selected?.id;
        return ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          selected: picked,
          selectedTileColor: AppColors.brandRedTint,
          selectedColor: AppColors.brandRedDark,
          leading: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: picked ? AppColors.white : AppColors.stone100,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              LucideIcons.warehouse,
              size: 18,
              color: picked ? AppColors.brandRed : AppColors.stone600,
            ),
          ),
          title: Text(
            hub.name,
            style: TextStyle(
              fontSize: 15,
              fontWeight: picked ? FontWeight.w700 : FontWeight.w600,
              color: picked ? AppColors.brandRedDark : AppColors.stone900,
            ),
          ),
          subtitle: _detail(hub).isEmpty
              ? null
              : Text(
                  _detail(hub),
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.stone500,
                  ),
                ),
          trailing: picked
              ? const Icon(
                  LucideIcons.check,
                  size: 18,
                  color: AppColors.brandRed,
                )
              : null,
          onTap: () => Navigator.of(context).pop(hub),
        );
      },
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.icon, required this.title, required this.message});

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: const Alignment(0, -0.5),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 28, color: AppColors.stone400),
            const SizedBox(height: AppSpace.sm),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.stone800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.stone500),
            ),
          ],
        ),
      ),
    );
  }
}
