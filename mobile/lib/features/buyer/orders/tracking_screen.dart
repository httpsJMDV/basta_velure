import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/env.dart';
import '../../../core/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../data/orders.dart';
import '../widgets/buyer_widgets.dart';

/// Track package (B9): the timeline, the route, and a map with the rider's last position while they carry the
/// parcel. Refreshes every 20 seconds while open.
class TrackingScreen extends ConsumerStatefulWidget {
  const TrackingScreen({super.key, required this.trackingNumber});

  final String trackingNumber;

  @override
  ConsumerState<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends ConsumerState<TrackingScreen> {
  ParcelTracking? _tracking;
  ApiFailure? _failure;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _load(quiet: true),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool quiet = false}) async {
    try {
      final tracking = await ref
          .read(buyerApiProvider)
          .tracking(widget.trackingNumber);
      if (!mounted) return;
      setState(() {
        _tracking = tracking;
        _failure = null;
      });
    } catch (error) {
      // A quiet refresh keeps the last good answer on screen.
      if (mounted && (!quiet || _tracking == null)) {
        setState(() => _failure = ApiFailure.from(error));
      }
    }
  }

  Future<void> _messageRider() async {
    try {
      final id = await ref
          .read(buyerApiProvider)
          .startRiderChat(widget.trackingNumber);
      if (mounted) context.push(BuyerPaths.chat(id));
    } catch (error) {
      if (mounted) {
        showSnack(context, ApiFailure.from(error).message, error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tracking = _tracking;
    return Scaffold(
      backgroundColor: AppColors.stone50,
      appBar: AppBar(title: const Text('Track package')),
      body: tracking == null
          ? (_failure != null
                ? ErrorRetry(failure: _failure!, onRetry: _load)
                : const SkeletonList(count: 4))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.only(
                  top: AppSpace.md,
                  bottom: AppSpace.xl,
                ),
                children: [
                  BlockCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                tracking.trackingNumber,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Copy tracking number',
                              icon: const Icon(LucideIcons.copy, size: 18),
                              onPressed: () => copyText(
                                context,
                                tracking.trackingNumber,
                                'Tracking number',
                              ),
                            ),
                          ],
                        ),
                        StatusChip(
                          label: tracking.status.label,
                          tone: tracking.status.tone,
                        ),
                        if (tracking.courierName != null) ...[
                          const SizedBox(height: AppSpace.md),
                          Row(
                            children: [
                              const Icon(
                                LucideIcons.bike,
                                size: 18,
                                color: AppColors.stone600,
                              ),
                              const SizedBox(width: AppSpace.sm),
                              Expanded(
                                child: Text(
                                  [
                                    tracking.courierName,
                                    tracking.vehicleType,
                                  ].whereType<String>().join(' · '),
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (tracking.canMessageRider) ...[
                          const SizedBox(height: AppSpace.md),
                          OutlinedButton.icon(
                            onPressed: _messageRider,
                            icon: const Icon(
                              LucideIcons.messageCircle,
                              size: 18,
                            ),
                            label: const Text('Message rider'),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (tracking.hasLocation) _RiderMap(tracking: tracking),
                  _Route(tracking: tracking),
                  _Timeline(events: tracking.events),
                ],
              ),
            ),
    );
  }
}

class _RiderMap extends StatelessWidget {
  const _RiderMap({required this.tracking});

  final ParcelTracking tracking;

  @override
  Widget build(BuildContext context) {
    final point = LatLng(tracking.latitude!, tracking.longitude!);
    return BlockCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadius.card),
            ),
            child: SizedBox(
              height: 220,
              child: FlutterMap(
                // A new position moves the map with it.
                key: ValueKey(point),
                options: MapOptions(initialCenter: point, initialZoom: 15),
                children: [
                  TileLayer(
                    urlTemplate: Env.mapTileUrl,
                    userAgentPackageName: 'shop.lovedit.loved_it',
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(
                        point: point,
                        width: 40,
                        height: 40,
                        child: Container(
                          decoration: const BoxDecoration(
                            color: AppColors.brandRed,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            LucideIcons.bike,
                            color: AppColors.white,
                            size: 20,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SimpleAttributionWidget(
                    source: Text('OpenStreetMap contributors'),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpace.md),
            child: Text(
              'Rider\'s last position, ${Fmt.shortWhen(tracking.locationAt)}',
              style: const TextStyle(fontSize: 12, color: AppColors.stone500),
            ),
          ),
        ],
      ),
    );
  }
}

class _Route extends StatelessWidget {
  const _Route({required this.tracking});

  final ParcelTracking tracking;

  @override
  Widget build(BuildContext context) {
    final stops = [
      if (tracking.origin != null)
        ('From', LucideIcons.store, tracking.origin!),
      if (tracking.hub != null) ('Hub', LucideIcons.warehouse, tracking.hub!),
      if (tracking.destination != null)
        ('To', LucideIcons.mapPin, tracking.destination!),
    ];
    if (stops.isEmpty) return const SizedBox.shrink();
    return BlockCard(
      child: Column(
        children: [
          for (final (label, icon, place) in stops)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 18, color: AppColors.stone600),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$label · ${place.name}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Text(
                          place.address,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.stone600,
                          ),
                        ),
                      ],
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

class _Timeline extends StatelessWidget {
  const _Timeline({required this.events});

  final List<TrackingEvent> events;

  @override
  Widget build(BuildContext context) {
    return BlockCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Updates', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: AppSpace.md),
          if (events.isEmpty)
            const Text(
              'No updates yet.',
              style: TextStyle(color: AppColors.stone500),
            ),
          for (var i = 0; i < events.length; i++)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        margin: const EdgeInsets.only(top: 4),
                        decoration: BoxDecoration(
                          color: i == 0
                              ? AppColors.brandRed
                              : AppColors.stone300,
                          shape: BoxShape.circle,
                        ),
                      ),
                      if (i < events.length - 1)
                        Expanded(
                          child: Container(width: 2, color: AppColors.stone200),
                        ),
                    ],
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: AppSpace.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            events[i].title,
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: i == 0
                                  ? AppColors.stone900
                                  : AppColors.stone600,
                            ),
                          ),
                          if (events[i].detail.isNotEmpty)
                            Text(
                              events[i].detail,
                              style: const TextStyle(
                                fontSize: 13,
                                color: AppColors.stone600,
                              ),
                            ),
                          Text(
                            Fmt.dateTime(events[i].at),
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.stone500,
                            ),
                          ),
                        ],
                      ),
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
