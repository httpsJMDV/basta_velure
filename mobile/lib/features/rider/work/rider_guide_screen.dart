import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/rider_api.dart';
import '../data/rider_models.dart';
import '../widgets/rider_widgets.dart';

/// How the job works, in one place. The pay and the limits come from the server, so a change there shows here. Check
/// the wording against HOW_IT_WORKS.md before changing it: a rider plans their day around these lines.
class RiderGuideScreen extends ConsumerStatefulWidget {
  const RiderGuideScreen({super.key});

  @override
  ConsumerState<RiderGuideScreen> createState() => _RiderGuideScreenState();
}

class _RiderGuideScreenState extends ConsumerState<RiderGuideScreen> {
  RiderRates? _rates;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final summary = await ref
          .read(riderApiProvider)
          .earningsSummary(EarningsPeriod.day);
      if (mounted) setState(() => _rates = summary.rates);
    } catch (_) {
      // The rest of the guide does not depend on the pay.
    }
  }

  @override
  Widget build(BuildContext context) {
    final rates = _rates;
    return Scaffold(
      appBar: AppBar(title: const Text('How it works')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpace.lg,
          AppSpace.sm,
          AppSpace.lg,
          AppSpace.xl,
        ),
        children: [
          const RiderSectionTitle('How you earn'),
          RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _PayFigure(
                        amount: rates == null ? '—' : formatPeso(rates.pickup),
                        label: 'each pickup',
                      ),
                    ),
                    Expanded(
                      child: _PayFigure(
                        amount: rates == null
                            ? '—'
                            : formatPeso(rates.delivery),
                        label: 'each delivery',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                const Text(
                  'You earn a set amount for each job, whatever the distance. '
                  'The rate is the same for every rider. Each job shows under '
                  'Earnings once it is done.',
                  style: _body,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Your day, step by step'),
          const _Steps(
            steps: [
              (
                'Go online',
                'Switch on at the top of Home when you are ready to work. Jobs only come while you are online.',
              ),
              (
                'Answer a pickup offer',
                'When your courier or hub enables automatic pickups, an offer lasts 60 seconds. If you decline or it expires, it goes to the next rider. In manual mode, staff assign the pickup and it appears in your jobs.',
              ),
              (
                'Collect from the shop',
                'Scan or type each tracking number at the shop, then bring the parcels to your hub. Tap Hub route on a parcel to see its way, hub by hub.',
              ),
              (
                'Collect at the hub',
                'Parcels for far barangays go on from your hub to the next one on the courier\'s truck, not with you. When the hub gives you parcels to deliver, scan its QR code under Deliveries. Your stops then show on the route map.',
              ),
              (
                'Deliver',
                'Take a photo at the door with the camera, and collect the exact cash if the order is cash on delivery.',
              ),
              (
                'Hand in the cash',
                'Give what you collected to your courier company under Cash on delivery. It stays Pending until they confirm it.',
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('If you cannot deliver'),
          RiderCard(
            child: Text(
              'Tap Delivery failed and choose the reason. The parcel can be tried '
              '${rates == null ? 'a few' : '${rates.maxDeliveryAttempts}'} times. After '
              'that it goes back to the seller, and the courier gives the return '
              'trip to a rider.',
              style: _body,
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Heavy parcels and big cash'),
          RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Fact(
                  icon: LucideIcons.weight,
                  text:
                      'The order limit is ${rates == null ? '50' : _kg(rates.maxParcelKg)} kg per shop parcel. This is not a motorcycle carrying allowance. Check Account → Cargo allowance for your courier-reviewed weight and space limit. Each stop shows its declared weight. '
                      'If a parcel is not safe on your vehicle, message the hub before you leave.',
                ),
                const SizedBox(height: AppSpace.md),
                _Fact(
                  icon: LucideIcons.banknote,
                  text:
                      'New cash on delivery orders stop at ${rates == null ? '₱50,000' : formatPeso(rates.codMax)} per shop. '
                      'Above that the buyer pays by GCash, so you are not carrying it.',
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Staying safe'),
          const RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Fact(
                  icon: LucideIcons.hardHat,
                  text: 'Wear your helmet, and stop somewhere safe before you use your phone.',
                ),
                SizedBox(height: AppSpace.md),
                _Fact(
                  icon: LucideIcons.locateFixed,
                  text: 'Your location is shared only while you have parcels to collect or carry. With none, nothing is sent.',
                ),
                SizedBox(height: AppSpace.md),
                _Fact(
                  icon: LucideIcons.shieldAlert,
                  text: 'Never share a buyer\'s name, phone or address with anyone. Use the chat in the app.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _kg(double kg) =>
      kg == kg.roundToDouble() ? kg.toStringAsFixed(0) : '$kg';
}

const _body = TextStyle(fontSize: 15, height: 1.5, color: AppColors.stone700);

class _PayFigure extends StatelessWidget {
  const _PayFigure({required this.amount, required this.label});

  final String amount;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          amount,
          style: const TextStyle(
            fontFamily: 'NotoSerif',
            fontSize: 26,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
        Text(label, style: RiderText.label),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.steps});

  final List<(String, String)> steps;

  @override
  Widget build(BuildContext context) {
    return RiderCard(
      child: Column(
        children: [
          for (final (index, step) in steps.indexed) ...[
            if (index > 0) const SizedBox(height: AppSpace.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StopBadge(number: index + 1),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(step.$1, style: RiderText.name),
                      const SizedBox(height: 2),
                      Text(step.$2, style: _body),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.stone700),
        const SizedBox(width: AppSpace.md),
        Expanded(child: Text(text, style: _body)),
      ],
    );
  }
}
