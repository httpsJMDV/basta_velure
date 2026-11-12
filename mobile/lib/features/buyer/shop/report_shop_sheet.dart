import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/api/api_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';
import '../buyer_paths.dart';
import '../data/buyer_api.dart';
import '../widgets/buyer_theme.dart';
import '../widgets/buyer_widgets.dart';

/// Why someone reports a shop, the same choices as the website's ReportShopDialog.
const shopReportReasons = <(String, String)>[
  ('Fake or counterfeit items', 'Sells copies sold as originals.'),
  ('Items not as described', 'Photos or details do not match what arrives.'),
  (
    'Scam or payment outside Loved-IT',
    'Asked to pay another way, or took payment and did not ship.',
  ),
  (
    'Selling banned items',
    'Medicine, supplements, weapons or anything not allowed.',
  ),
  ('Rude or abusive seller', 'Insults, threats or harassment in chat.'),
  ('Something else', 'Tell us what happened below.'),
];

/// Opens the report sheet; once the report is sent, the Loved-IT Support chat opens with it.
Future<void> showReportShopSheet(
  BuildContext context, {
  required String shopName,
  required String shopLink,
}) async {
  final chatId = await showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(BuyerRadius.sheet),
      ),
    ),
    builder: (_) => ReportShopSheet(shopName: shopName, shopLink: shopLink),
  );
  if (chatId != null && context.mounted) {
    showSnack(
      context,
      'Report sent. A Loved-IT team member will reply in your Support chat.',
    );
    context.push(BuyerPaths.chat(chatId));
  }
}

/// Reporting a shop: a reason, what happened (10 to 500 characters, in words) and a confirmation, before anything
/// is sent. Then the report goes to Loved-IT Support chat, where a person reads it.
class ReportShopSheet extends ConsumerStatefulWidget {
  const ReportShopSheet({
    super.key,
    required this.shopName,
    required this.shopLink,
  });

  final String shopName;
  final String shopLink;

  @override
  ConsumerState<ReportShopSheet> createState() => _ReportShopSheetState();
}

class _ReportShopSheetState extends ConsumerState<ReportShopSheet> {
  final _form = GlobalKey<FormState>();
  final _details = TextEditingController();
  String? _reason;
  bool _confirmed = false;
  bool _tried = false;
  ApiFailure? _failure;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _tried = true);
    final valid = _form.currentState!.validate();
    if (!valid || _reason == null || !_confirmed) {
      HapticFeedback.lightImpact();
      return;
    }
    setState(() => _failure = null);
    final details = Rules.squish(_details.text);
    try {
      final api = ref.read(buyerApiProvider);
      final chatId = await api.startChat();
      await api.sendMessage(
        chatId,
        body: [
          'Shop report: "${widget.shopName}" (${widget.shopLink})',
          'Reason: $_reason',
          'What happened: $details',
        ].join('\n'),
      );
      if (mounted) Navigator.of(context).pop(chatId);
    } catch (error) {
      if (mounted) setState(() => _failure = ApiFailure.from(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom +
            MediaQuery.paddingOf(context).bottom +
            AppSpace.lg,
      ),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: StatusTone.rose.background,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      LucideIcons.flag,
                      size: 18,
                      color: AppColors.brandRed,
                    ),
                  ),
                  const SizedBox(width: AppSpace.md),
                  Expanded(
                    child: Text(
                      'Report ${widget.shopName}',
                      style: BuyerText.section,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.sm),
              const Text(
                'A Loved-IT team member reads every report, may ask you for more details in chat, and decides what '
                'happens to the shop. The shop is not told who reported it.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  color: AppColors.stone500,
                ),
              ),
              if (_failure != null) ...[
                const SizedBox(height: AppSpace.md),
                MessageBanner(message: _failure!.message),
              ],
              const SizedBox(height: AppSpace.lg),
              const Text(
                'Why are you reporting this shop?',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpace.sm),
              for (final (label, hint) in shopReportReasons) ...[
                _ReasonTile(
                  label: label,
                  hint: hint,
                  selected: _reason == label,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _reason = label);
                  },
                ),
                const SizedBox(height: AppSpace.sm),
              ],
              if (_tried && _reason == null)
                const _ErrorText('Choose why you are reporting this shop.'),
              const SizedBox(height: AppSpace.md),
              AppTextField(
                label: 'What happened?',
                hint: 'For example: the item that arrived is a different model from the photos.',
                controller: _details,
                minLines: 3,
                maxLines: 5,
                maxLength: 500,
                showCounter: true,
                textCapitalization: TextCapitalization.sentences,
                validator: (value) =>
                    Rules.words(value, 'What happened', min: 10, max: 500),
              ),
              const SizedBox(height: AppSpace.sm),
              InkWell(
                borderRadius: BorderRadius.circular(BuyerRadius.field),
                onTap: () => setState(() => _confirmed = !_confirmed),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpace.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Checkbox(
                        value: _confirmed,
                        activeColor: AppColors.brandRed,
                        visualDensity: VisualDensity.compact,
                        onChanged: (v) =>
                            setState(() => _confirmed = v ?? false),
                      ),
                      const Expanded(
                        child: Padding(
                          padding: EdgeInsets.only(top: 10),
                          child: Text(
                            'I confirm this report is true to the best of my knowledge. False reports may lead to my '
                            'account being restricted.',
                            style: TextStyle(
                              fontSize: 12.5,
                              height: 1.4,
                              color: AppColors.stone700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_tried && !_confirmed)
                const _ErrorText('Tick the box to confirm the report.'),
              const SizedBox(height: AppSpace.lg),
              SubmitButton(
                label: 'Send report',
                busyLabel: 'Sending…',
                icon: LucideIcons.send,
                onPressed: _send,
              ),
              const SizedBox(height: AppSpace.xs),
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.stone500,
                ),
                child: const Text('Cancel'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One reason as a card: a radio mark, the reason and a short hint; the chosen one is outlined in brand red.
class _ReasonTile extends StatelessWidget {
  const _ReasonTile({
    required this.label,
    required this.hint,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      inMutuallyExclusiveGroup: true,
      button: true,
      label: '$label. $hint',
      excludeSemantics: true,
      child: Material(
        color: selected ? StatusTone.rose.background : Colors.white,
        borderRadius: BorderRadius.circular(BuyerRadius.field),
        child: InkWell(
          borderRadius: BorderRadius.circular(BuyerRadius.field),
          onTap: onTap,
          child: AnimatedContainer(
            duration: Motion.fast,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.md,
              vertical: 12,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(BuyerRadius.field),
              border: Border.all(
                color: selected ? AppColors.brandRed : AppColors.stone200,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Icon(
                    selected ? LucideIcons.circleDot : LucideIcons.circle,
                    size: 18,
                    color: selected ? AppColors.brandRed : AppColors.stone400,
                  ),
                ),
                const SizedBox(width: AppSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.stone900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        hint,
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.35,
                          color: AppColors.stone500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpace.xs),
    child: Text(
      message,
      style: TextStyle(fontSize: 12, color: StatusTone.rose.foreground),
    ),
  );
}
