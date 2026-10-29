import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/checkout.dart';

/// A voucher row at checkout: what is applied (or why it isn't), and a sheet to pick one from the wallet or type a
/// code. [onChanged] gets the code, or null to remove it; the checkout then asks the server for new totals.
class VoucherField extends StatelessWidget {
  const VoucherField({
    super.key,
    required this.label,
    required this.applied,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final QuoteVoucher? applied;
  final List<WalletOption> options;
  final ValueChanged<String?> onChanged;

  Future<void> _open(BuildContext context) async {
    final result = await showModalBottomSheet<_Pick>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          _VoucherSheet(label: label, options: options, current: applied?.code),
    );
    if (result != null) onChanged(result.code);
  }

  @override
  Widget build(BuildContext context) {
    final voucher = applied;
    final String status;
    final Color color;
    if (voucher == null) {
      status = options.isEmpty ? 'Enter a code' : '${options.length} available';
      color = AppColors.stone500;
    } else if (voucher.applied) {
      status = '${voucher.code} · -${formatPeso(voucher.discount)}';
      color = AppColors.brandRed;
    } else {
      status = voucher.message ?? '${voucher.code} can’t be used here';
      color = StatusTone.rose.foreground;
    }
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _open(context),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: kMinTap),
        child: Row(
          children: [
            const Icon(LucideIcons.ticket, size: 18, color: AppColors.brandRed),
            const SizedBox(width: AppSpace.sm),
            Text(label),
            const SizedBox(width: AppSpace.md),
            Expanded(
              child: Text(
                status,
                textAlign: TextAlign.right,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: color),
              ),
            ),
            const Icon(
              LucideIcons.chevronRight,
              size: 18,
              color: AppColors.stone400,
            ),
          ],
        ),
      ),
    );
  }
}

/// What the sheet returns: a code, or null code for "no voucher".
class _Pick {
  const _Pick(this.code);

  final String? code;
}

class _VoucherSheet extends StatefulWidget {
  const _VoucherSheet({
    required this.label,
    required this.options,
    this.current,
  });

  final String label;
  final List<WalletOption> options;
  final String? current;

  @override
  State<_VoucherSheet> createState() => _VoucherSheetState();
}

class _VoucherSheetState extends State<_VoucherSheet> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _useTyped() {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) return;
    Navigator.of(context).pop(_Pick(code));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        MediaQuery.viewInsetsOf(context).bottom + AppSpace.lg,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.8,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.label, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpace.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: AppTextField(
                    label: 'Voucher code',
                    controller: _code,
                    maxLength: 20,
                    textCapitalization: TextCapitalization.characters,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _useTyped(),
                  ),
                ),
                const SizedBox(width: AppSpace.sm),
                SizedBox(
                  height: 56,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandRed,
                    ),
                    onPressed: _useTyped,
                    child: const Text('Apply'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.md),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final option in widget.options)
                    Card(
                      child: ListTile(
                        enabled: option.applicable,
                        onTap: () =>
                            Navigator.of(context).pop(_Pick(option.code)),
                        title: Text(
                          option.label.isEmpty ? option.name : option.label,
                        ),
                        subtitle: Text(
                          option.applicable
                              ? option.code
                              : (option.message ??
                                    'Can’t be used for this order'),
                        ),
                        trailing: widget.current == option.code
                            ? const Icon(
                                LucideIcons.circleCheck,
                                color: AppColors.brandRed,
                              )
                            : null,
                      ),
                    ),
                  if (widget.options.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(AppSpace.lg),
                      child: Text(
                        'No saved vouchers for this. Save vouchers from shop and product pages, or type a code.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.stone500),
                      ),
                    ),
                ],
              ),
            ),
            if (widget.current != null)
              TextButton(
                onPressed: () => Navigator.of(context).pop(const _Pick(null)),
                child: const Text('Don’t use a voucher'),
              ),
          ],
        ),
      ),
    );
  }
}
