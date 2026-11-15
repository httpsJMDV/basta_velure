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
/// the wording against the current API and workflow implementation: older documentation can lag behind the app.
class RiderGuideScreen extends ConsumerStatefulWidget {
  const RiderGuideScreen({super.key});

  @override
  ConsumerState<RiderGuideScreen> createState() => _RiderGuideScreenState();
}

class _RiderGuideScreenState extends ConsumerState<RiderGuideScreen> {
  RiderRates? _rates;
  bool _loadFailed = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _loadFailed = false;
      });
    }
    try {
      final summary = await ref
          .read(riderApiProvider)
          .earningsSummary(EarningsPeriod.day);
      if (mounted) {
        setState(() {
          _rates = summary.rates;
          _loadFailed = summary.rates == null;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _rates = null;
          _loadFailed = true;
          _loading = false;
        });
      }
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
                        amount: rates == null
                            ? '—'
                            : rates.percentagePay
                            ? '${rates.pickupPercent}%'
                            : formatPeso(rates.pickup),
                        label: 'each pickup',
                      ),
                    ),
                    Expanded(
                      child: _PayFigure(
                        amount: rates == null
                            ? '—'
                            : rates.percentagePay
                            ? '${rates.deliveryPercent}%'
                            : formatPeso(rates.delivery),
                        label: 'each delivery',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpace.md),
                Text(
                  rates == null
                      ? 'Check Earnings for the amounts recorded on your actual jobs. Current pay and limits are shown here only after they load from the server. A failed delivery attempt earns no delivery pay.'
                      : rates.percentagePay
                      ? 'New orders pay ${rates.pickupPercent}% of the courier fee for pickup and ${rates.deliveryPercent}% for successful delivery. One rider doing both legs earns both. Pickup pay is recorded when collection is completed; delivery pay when the parcel is marked delivered. Previous orders keep their saved pay; Earnings shows the actual amounts. A failed delivery attempt earns no delivery pay.'
                      : 'The current pickup rate is ${formatPeso(rates.pickup)} and successful delivery rate is ${formatPeso(rates.delivery)}. One rider doing both legs earns both. Existing jobs keep their saved amounts. A failed delivery attempt earns no delivery pay.',
                  style: _body,
                ),
                if (_loadFailed)
                  TextButton.icon(
                    onPressed: _loading ? null : _load,
                    icon: const Icon(LucideIcons.refreshCw, size: 16),
                    label: const Text('Pay and limits could not load. Retry'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Pickup and delivery work'),
          const _Steps(
            steps: [
              (
                'Go online',
                'Switch on at the top of Home when you are ready to work. Online status and available cargo capacity are checked for pickup offers and assignments. Keep your work screens open so your availability stays current.',
              ),
              (
                'Answer a pickup offer',
                'When your courier or hub enables automatic pickups, an offer lasts 60 seconds. If you decline or it expires, it goes to the next rider. In manual mode, staff assign the pickup and it appears in your jobs.',
              ),
              (
                'Collect from the shop',
                'Scan or type each tracking number at the shop and confirm collection, then bring the parcels to your hub. Pickup pay is recorded for completed collection, not just accepting an offer. Tap Hub route on a parcel to see its way, hub by hub.',
              ),
              (
                'Collect at the hub',
                'Parcels for another hub travel through the courier network before local delivery. When your hub gives you a delivery batch, scan or enter its handover code under Deliveries and confirm collection. Your stops then show on the route map.',
              ),
              (
                'Deliver',
                'Contact the buyer through the stop when needed. Take a proof photo with the camera at delivery; a second, different photo is optional. For cash on delivery, collect and enter exactly the COD amount shown. Do not collect COD for a prepaid GCash order.',
              ),
              (
                'Hand in the cash',
                'Give what you collected to your courier company under Cash on delivery. It stays Pending until they confirm it.',
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Requesting your payment'),
          const _Steps(
            steps: [
              (
                'Check your account and balance',
                'Save your GCash name and number under Account. Open Earnings, or Trips for truck drivers. Available to request includes unpaid earned pickup/delivery shares and finished trips in your courier network, excluding amounts already paid or reserved.',
              ),
              (
                'Request payment',
                'Tap Request payment and review the full available amount and GCash account. Only one request may be open at a time. New earnings stay separate while that request is being handled.',
              ),
              (
                'Your hub or courier processes it',
                'A staff member takes the request, sends the exact amount manually to your saved GCash, and records the receipt and 13-digit reference. Creating a request does not itself transfer money. A declined request shows a reason and releases the unpaid earnings so you can request again.',
              ),
              (
                'Confirm only when money arrives',
                'Open View receipt and check your GCash. Tap I received it only after the money arrives, or Payment not received to report a missing transfer. Reported payments stay open for review; they are not automatically marked received. COD cash you collected must still be remitted separately.',
              ),
            ],
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('If you cannot deliver'),
          RiderCard(
            child: Text(
              'Before choosing Recipient unavailable or Could not contact, call, text or message the buyer through that stop on this delivery attempt. Then tap Delivery failed and choose the accurate reason; Other needs a note. '
              '${rates == null ? 'The attempt limit could not be loaded; follow the options shown on the parcel.' : 'The current maximum is ${rates.maxDeliveryAttempts} delivery attempts.'} '
              'A refusal or the final failed attempt starts return to sender immediately. Otherwise the hub can arrange another attempt. Follow the return assignment and handover instructions; do not independently retry a parcel already returning.',
              style: _body,
            ),
          ),
          const SizedBox(height: AppSpace.lg),
          const RiderSectionTitle('Return jobs and truck trips'),
          const RiderCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Buyer return pickups', style: RiderText.name),
                SizedBox(height: AppSpace.sm),
                Text(
                  'For an approved buyer return, follow your assigned return pickup. Collect with a photo. Nearby returns may go straight to the shop; cross-hub returns must be dropped at the assigned hub, travel through the network, then go to the shop with a local rider. The shop confirms receipt. Do not assume a return earns the same pay as a new pickup or delivery; request only the earnings actually recorded.',
                  style: _body,
                ),
                SizedBox(height: AppSpace.md),
                Text('Truck drivers', style: RiderText.name),
                SizedBox(height: AppSpace.sm),
                Text(
                  'Use Trips for hub-to-hub work instead of the pickup/delivery screens. Check the manifest, return-parcel labels, receiving-hub address and phone, any dispatch ETA, and the expected trip pay. At the receiving hub tap the arrival button, then hand over the parcels for hub scans. Arrival alone does not complete the trip: all parcels must be scanned, or the courier closes a trip with missing parcels after review. Report trip issue notifies both hubs and your courier without changing pay or completion. Finished unpaid trip pay can be requested from Trips. Use the amount shown; a transport pool shared across route legs does not mean every driver receives the full pool.',
                  style: _body,
                ),
              ],
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
                      '${rates == null ? 'Check the order and Account for the current parcel limits; they could not be loaded here.' : 'The order limit is ${_kg(rates.maxParcelKg)} kg per shop parcel.'} This is not a motorcycle carrying allowance. Check Account → Cargo allowance for your courier-reviewed weight and space limit. Each stop shows its declared weight. '
                      'If a parcel is not safe on your vehicle, message the hub before you leave.',
                ),
                const SizedBox(height: AppSpace.md),
                _Fact(
                  icon: LucideIcons.banknote,
                  text: rates == null
                      ? 'The current COD limit could not be loaded. Follow the payment method and exact COD amount shown on each order; do not collect cash for an order marked prepaid.'
                      : 'New cash on delivery orders stop at ${formatPeso(rates.codMax)} per shop. Above that, checkout requires a supported prepaid method. Collect only the payment and exact COD amount shown on your assigned parcel.',
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
                  text: 'For assigned pickup and delivery parcels, the app requests location sharing while you are on the way to collect or carrying them. Check the location bar; sharing stops when the server reports no matching parcels remain. Truck trips and return jobs do not start this location sharing by themselves.',
                ),
                SizedBox(height: AppSpace.md),
                _Fact(
                  icon: LucideIcons.shieldAlert,
                  text: 'Use a buyer\'s name, phone and address only for your assigned work. Do not post these details or share them outside the job with unauthorized people. Use the chat in the app for job communication.',
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
