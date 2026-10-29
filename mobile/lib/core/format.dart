import 'package:intl/intl.dart';

/// Dates and counts the way the website shows them. Times are always Philippine time (UTC+8, no daylight saving),
/// whatever the phone's own time zone is.
abstract final class Fmt {
  static final _date = DateFormat('MMM d, y');
  static final _dateTime = DateFormat('MMM d, y, h:mm a');
  static final _time = DateFormat('h:mm a');

  static DateTime manila(DateTime value) =>
      value.toUtc().add(const Duration(hours: 8));

  /// "Oct 28, 2026"
  static String date(DateTime? value) =>
      value == null ? '—' : _date.format(manila(value));

  /// "Oct 28, 2026, 3:15 PM"
  static String dateTime(DateTime? value) =>
      value == null ? '—' : _dateTime.format(manila(value));

  /// "3:15 PM" today, "Oct 27" before, for chat lists and notifications.
  static String shortWhen(DateTime? value, {DateTime? now}) {
    if (value == null) return '';
    final at = manila(value);
    final today = manila(now ?? DateTime.now());
    if (at.year == today.year &&
        at.month == today.month &&
        at.day == today.day) {
      return _time.format(at);
    }
    return DateFormat(at.year == today.year ? 'MMM d' : 'MMM d, y').format(at);
  }

  /// "950 sold", "1.2K sold", like the website's product cards. Null for nothing sold.
  static String? sold(int units) {
    if (units <= 0) return null;
    if (units < 1000) return '$units sold';
    final thousands = (units / 1000).toStringAsFixed(units >= 10000 ? 0 : 1);
    return '${thousands.replaceFirst(RegExp(r'\.0$'), '')}K sold';
  }

  /// The sale percentage the website shows, from the price and the struck-through price.
  static int discountPercent(num price, num? original) {
    if (original == null || original <= 0 || original <= price) return 0;
    return ((original - price) / original * 100).round();
  }

  /// "2d 04:12:09" until [end], for flash sale countdowns. "Ended" once it has passed.
  static String countdown(DateTime end, {DateTime? now}) {
    final left = end.difference(now ?? DateTime.now());
    if (left.isNegative) return 'Ended';
    String two(int n) => n.toString().padLeft(2, '0');
    final clock =
        '${two(left.inHours % 24)}:${two(left.inMinutes % 60)}:${two(left.inSeconds % 60)}';
    return left.inDays > 0 ? '${left.inDays}d $clock' : clock;
  }
}
