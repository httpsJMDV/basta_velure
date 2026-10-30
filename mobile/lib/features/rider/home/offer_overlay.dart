import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_models.dart';
import '../data/rider_state.dart';
import '../location/location_beacon.dart';
import '../widgets/rider_widgets.dart';

/// A job offer over the whole screen (C3): a 60-second ring, the shop and the area, what it pays, and two big
/// buttons. It goes away by itself when the time runs out; the job then goes to the next rider.
class OfferOverlay extends ConsumerStatefulWidget {
  const OfferOverlay({super.key, required this.offer, this.more = 0});

  final RiderOffer offer;

  /// Other offers waiting behind this one.
  final int more;

  @override
  ConsumerState<OfferOverlay> createState() => _OfferOverlayState();
}

class _OfferOverlayState extends ConsumerState<OfferOverlay> {
  Timer? _tick;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didUpdateWidget(OfferOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.offer.id != widget.offer.id) _error = null;
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _answer(bool accept) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final message = await ref
          .read(riderOffersProvider.notifier)
          .answer(widget.offer, accept: accept);
      if (accept) {
        unawaited(ref.read(locationBeaconProvider.notifier).refresh());
      }
      if (mounted) showRiderMessage(context, message);
    } on ApiFailure catch (failure) {
      // Still shown (a network error): say why under the buttons. Gone: the next offer or nothing replaces it.
      if (mounted) setState(() => _error = failure.message);
      if (mounted && !failure.canRetry) {
        showRiderMessage(context, failure.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    final left = offer.leftAt(DateTime.now());
    final fraction = (left.inMilliseconds / RiderOffer.lifetime.inMilliseconds)
        .clamp(0.0, 1.0);
    final seconds = (left.inMilliseconds / 1000).ceil();

    return Positioned.fill(
      child: Material(
        color: AppColors.gray900.withValues(alpha: 0.6),
        child: SafeArea(
          child: Align(
            alignment: Alignment.bottomCenter,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpace.md),
              child: Container(
                padding: const EdgeInsets.all(AppSpace.xl),
                decoration: BoxDecoration(
                  color: AppColors.white,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'New pickup job',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: AppColors.gray900,
                            ),
                          ),
                        ),
                        _CountdownRing(fraction: fraction, seconds: seconds),
                      ],
                    ),
                    if (widget.more > 0)
                      Text(
                        '${widget.more} more waiting',
                        style: RiderText.label,
                      ),
                    const SizedBox(height: AppSpace.lg),
                    _Line(
                      icon: LucideIcons.store,
                      label: 'Pick up from',
                      value: offer.shopName,
                      detail: offer.pickupAddress,
                    ),
                    const SizedBox(height: AppSpace.md),
                    _Line(
                      icon: LucideIcons.mapPin,
                      label: 'Deliver to area',
                      value: offer.dropoffArea.isEmpty
                          ? '—'
                          : offer.dropoffArea,
                    ),
                    const SizedBox(height: AppSpace.md),
                    Row(
                      children: [
                        Expanded(
                          child: _Stat(
                            label: 'This job pays',
                            value: formatPeso(offer.pay),
                          ),
                        ),
                        if (offer.weightKg != null)
                          Expanded(
                            child: _Stat(
                              label: 'Weight',
                              value: '${offer.weightKg!.toStringAsFixed(1)} kg',
                            ),
                          ),
                      ],
                    ),
                    if (offer.codAmount != null) ...[
                      const SizedBox(height: AppSpace.md),
                      CodBlock(amount: offer.codAmount!, prefix: 'Buyer pays'),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: AppSpace.md),
                      MessageBanner(message: _error!),
                    ],
                    const SizedBox(height: AppSpace.xl),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(56),
                            ),
                            onPressed: _busy ? null : () => _answer(false),
                            child: const Text('Decline'),
                          ),
                        ),
                        const SizedBox(width: AppSpace.md),
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(56),
                              textStyle: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            onPressed: _busy ? null : () => _answer(true),
                            child: _busy
                                ? const SizedBox.square(
                                    dimension: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.4,
                                      color: AppColors.white,
                                    ),
                                  )
                                : const Text('Accept'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CountdownRing extends StatelessWidget {
  const _CountdownRing({required this.fraction, required this.seconds});

  final double fraction;
  final int seconds;

  @override
  Widget build(BuildContext context) {
    final urgent = seconds <= 10;
    final color = urgent ? AppColors.brandRed : const Color(0xFF047857);
    return Semantics(
      label: '$seconds seconds left',
      excludeSemantics: true,
      child: SizedBox.square(
        dimension: 64,
        child: CustomPaint(
          painter: _RingPainter(fraction: fraction, color: color),
          child: Center(
            child: Text(
              '$seconds',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 6.0;
    final rect = Offset.zero & size;
    final ring = rect.deflate(stroke / 2);
    canvas.drawArc(
      ring,
      0,
      math.pi * 2,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = AppColors.gray100,
    );
    canvas.drawArc(
      ring,
      -math.pi / 2,
      math.pi * 2 * fraction,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.fraction != fraction || old.color != color;
}

class _Line extends StatelessWidget {
  const _Line({
    required this.icon,
    required this.label,
    required this.value,
    this.detail,
  });

  final IconData icon;
  final String label;
  final String value;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 22, color: AppColors.brandRed),
        const SizedBox(width: AppSpace.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: RiderText.label),
              Text(value, style: RiderText.name),
              if (detail != null && detail!.isNotEmpty)
                Text(detail!, style: RiderText.body),
            ],
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: RiderText.label),
        Text(
          value,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: AppColors.gray900,
          ),
        ),
      ],
    );
  }
}
