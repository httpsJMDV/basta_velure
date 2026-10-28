import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/app_colors.dart';

final _peso = NumberFormat.currency(
  locale: 'en',
  symbol: '₱',
  decimalDigits: 2,
);

/// `₱1,234.50`. The API sends amounts as numbers or as strings like "1234.50"; both work. Anything else shows "₱—".
String formatPeso(Object? amount) {
  final value = amount is num ? amount : num.tryParse('${amount ?? ''}'.trim());
  return value == null ? '₱—' : _peso.format(value);
}

/// An amount of money exactly as the server sent it. The app never works out what someone pays.
class PesoText extends StatelessWidget {
  const PesoText(this.amount, {super.key, this.style, this.struck = false});

  final Object? amount;
  final TextStyle? style;

  /// The old price next to a sale price.
  final bool struck;

  @override
  Widget build(BuildContext context) {
    final base = DefaultTextStyle.of(context).style.merge(style);
    return Text(
      formatPeso(amount),
      style: struck
          ? base.copyWith(
              decoration: TextDecoration.lineThrough,
              color: AppColors.stone400,
              fontWeight: FontWeight.w400,
            )
          : base.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
    );
  }
}
