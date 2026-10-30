import 'package:flutter/services.dart';

/// The same rules as backend/app/Support/Validation.php and the website's utils/accountRules.ts, with the same
/// messages. Every form uses these; no screen writes its own regex. The server checks again every time, and when a
/// rule here and the server disagree, the server is right: fix this file.
///
/// Each check returns null when the value is fine, or the message to show under the field.
abstract final class Rules {
  static final _name = RegExp(r"^\p{L}[\p{L}\p{M} .'\-]*$", unicode: true);
  static final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static final _words = RegExp(r'(?:\p{L}.*){3}', unicode: true, dotAll: true);
  static final _accountName = RegExp(
    r"^\p{L}[\p{L}\p{M} .,'&()\-]*$",
    unicode: true,
  );
  static final _spacesAndDashes = RegExp(r'[\s-]+');
  static final _manyspaces = RegExp(r'\s+');

  static const mobileMessage =
      'Enter a valid Philippine mobile number: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.';

  /// Trims and collapses runs of spaces, the way the server stores text.
  static String squish(String? value) =>
      (value ?? '').trim().replaceAll(_manyspaces, ' ');

  static String? required(String? value, String label) =>
      squish(value).isEmpty ? '$label is required.' : null;

  /// First, middle and last names: 2 to 50 characters, starting with a letter; letters (ñ and accents too), spaces,
  /// hyphens, apostrophes and periods.
  static String? name(String? value, String label, {bool required = true}) {
    final s = squish(value);
    if (s.isEmpty) return required ? '$label is required.' : null;
    if (s.length < 2 || s.length > 50) {
      return '$label must be 2 to 50 characters.';
    }
    if (!_name.hasMatch(s)) {
      return '$label may contain letters only (spaces, hyphens, apostrophes and periods are allowed).';
    }
    return null;
  }

  /// Sent trimmed and in lowercase ([normalizeEmail]); the server lowercases it too.
  static String? email(String? value) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return 'Email is required.';
    if (!_email.hasMatch(s)) {
      return 'Enter a valid email address, for example name@example.com.';
    }
    if (s.length > 100) return 'Email must be 100 characters or fewer.';
    return null;
  }

  static String normalizeEmail(String value) => value.trim().toLowerCase();

  /// `09XXXXXXXXX` or `+639XXXXXXXXX`; spaces and dashes between digits are ignored.
  static String? mobile(String? value, {bool required = true}) {
    if ((value ?? '').trim().isEmpty) {
      return required ? 'Mobile number is required.' : null;
    }
    return normalizeMobile(value!) == null ? mobileMessage : null;
  }

  /// "0917 123 4567", "0917-123-4567" or "+639171234567" → "+639171234567"; anything else → null.
  static String? normalizeMobile(String value) {
    final compact = value.trim().replaceAll(_spacesAndDashes, '');
    final local = RegExp(r'^09(\d{9})$').firstMatch(compact);
    if (local != null) return '+639${local.group(1)}';
    return RegExp(r'^\+639\d{9}$').hasMatch(compact) ? compact : null;
  }

  /// The live checklist under a new password. Each entry is shown ticked or not.
  static List<PasswordCheck> passwordChecks(String password) => [
    PasswordCheck('At least 8 characters', password.length >= 8),
    PasswordCheck(
      'An uppercase letter',
      RegExp(r'\p{Lu}', unicode: true).hasMatch(password),
    ),
    PasswordCheck(
      'A lowercase letter',
      RegExp(r'\p{Ll}', unicode: true).hasMatch(password),
    ),
    PasswordCheck('A number', RegExp(r'\d').hasMatch(password)),
    PasswordCheck(
      'A symbol',
      RegExp(r'[^\p{L}\d]', unicode: true).hasMatch(password),
    ),
  ];

  /// A new password. Never trimmed or changed: what was typed is what is sent.
  static String? password(String? value) {
    final s = value ?? '';
    if (s.isEmpty) return 'Password is required.';
    if (passwordChecks(s).any((check) => !check.ok)) {
      return 'Use 8 or more characters with an uppercase letter, a lowercase letter, a number and a symbol.';
    }
    return null;
  }

  static String? passwordConfirmation(String? password, String? confirmation) {
    if ((confirmation ?? '').isEmpty) return 'Please confirm your password.';
    return password == confirmation ? null : 'The passwords do not match.';
  }

  /// Today's date in the Philippines (UTC+8, no daylight saving), whatever the phone's time zone is.
  static DateTime manilaToday([DateTime? now]) {
    final manila = (now ?? DateTime.now()).toUtc().add(
      const Duration(hours: 8),
    );
    return DateTime(manila.year, manila.month, manila.day);
  }

  /// The latest birthday the date picker allows: 18 years before today in the Philippines.
  static DateTime latestBirthDate([DateTime? now]) {
    final today = manilaToday(now);
    final sameDay = DateTime(today.year - 18, today.month, today.day);
    // On Feb 29 the same day 18 years back does not exist: the last allowed birthday is Feb 28.
    return sameDay.month == today.month
        ? sameDay
        : DateTime(today.year - 18, today.month + 1, 0);
  }

  /// A date of birth picked from the date picker: not in the future, and 18 or older today (Manila).
  static String? dateOfBirth(
    DateTime? value, {
    bool required = true,
    DateTime? now,
  }) {
    if (value == null) return required ? 'Date of birth is required.' : null;
    final today = manilaToday(now);
    final born = DateTime(value.year, value.month, value.day);
    if (born.isAfter(today)) {
      return 'The date of birth cannot be in the future.';
    }
    // The server's check: the birthday plus 18 years (Feb 29 rolls to Mar 1, as Carbon does) is not after today.
    if (DateTime(born.year + 18, born.month, born.day).isAfter(today)) {
      return 'You must be at least 18 years old to register.';
    }
    return null;
  }

  /// `2001-04-09`, the format every date field is sent in.
  static String ymd(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  /// The 6-digit email code.
  static String? emailCode(String? value) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return 'Enter the 6-digit code from your email.';
    return RegExp(r'^\d{6}$').hasMatch(s) ? null : 'The code is 6 digits.';
  }

  static String? postalCode(String? value) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return 'Postal code is required.';
    return RegExp(r'^\d{4}$').hasMatch(s)
        ? null
        : 'Enter a 4-digit postal code.';
  }

  /// A quantity box: 1 or more. Use [clampQuantity] to bring a typed number within stock and the purchase limit.
  static String? quantity(String? value) {
    final n = int.tryParse((value ?? '').trim());
    if (n == null || n < 1) return 'Enter a quantity of 1 or more.';
    return null;
  }

  /// What the quantity box becomes: at least 1, and above the stock or purchase limit it becomes the most allowed.
  static int clampQuantity(String value, {required int max}) {
    final n = int.tryParse(value.trim()) ?? 1;
    final ceiling = max < 1 ? 1 : max;
    return n < 1 ? 1 : (n > ceiling ? ceiling : n);
  }

  /// Price filters: each is optional, and the minimum can't be above the maximum.
  static String? priceRange(String? min, String? max) {
    final low = double.tryParse((min ?? '').trim());
    final high = double.tryParse((max ?? '').trim());
    if (low != null && high != null && low > high) {
      return "The minimum price can't be above the maximum.";
    }
    return null;
  }

  /// A GCash reference: exactly 13 digits once spaces are taken out.
  static String? gcashReference(String? value) {
    final digits = (value ?? '').replaceAll(_manyspaces, '');
    if (digits.isEmpty) return 'Enter the 13-digit GCash reference number.';
    return RegExp(r'^\d{13}$').hasMatch(digits)
        ? null
        : 'The GCash reference number is 13 digits. Copy it from your GCash receipt.';
  }

  /// Words someone else will read, such as a cancel reason or a return description: [min] to [max] characters and
  /// written in words (at least three letters), not "..." or "123".
  static String? words(
    String? value,
    String label, {
    int min = 10,
    int max = 500,
    bool required = true,
  }) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return required ? '$label is required.' : null;
    if (s.length < min) return '$label must be at least $min characters.';
    if (s.length > max) return '$label may not be longer than $max characters.';
    if (!_words.hasMatch(s)) return '$label must be written in words.';
    return null;
  }

  /// Optional free text with only a length limit (a review, a street).
  static String? maxLength(String? value, String label, int max) =>
      (value ?? '').trim().length > max
      ? '$label may not be longer than $max characters.'
      : null;

  /// Review stars: 1 to 5, required.
  static String? stars(int? value) =>
      value == null || value < 1 || value > 5 ? 'Choose 1 to 5 stars.' : null;

  /// The recipient on an address: 2 to 100 characters.
  static String? addressFullName(String? value) {
    final s = squish(value);
    if (s.isEmpty) return 'Full name is required.';
    if (s.length < 2 || s.length > 100) {
      return 'Full name must be 2 to 100 characters.';
    }
    return null;
  }

  /// A search box: trimmed, and null (never sent) when empty.
  static String? searchQuery(String? value) {
    final s = squish(value);
    return s.isEmpty ? null : s;
  }

  /// Loved-IT tracking numbers: `LIT-YYMMDD-XXXXXX`. Typed without dashes or in small letters, they are tidied first.
  static String normalizeTrackingNumber(String value) {
    final v = value.trim().toUpperCase().replaceAll(_manyspaces, '');
    final compact = RegExp(r'^LIT(\d{6})([A-Z0-9]{6})$').firstMatch(v);
    return compact == null ? v : 'LIT-${compact.group(1)}-${compact.group(2)}';
  }

  static String? trackingNumber(String? value) {
    final v = normalizeTrackingNumber(value ?? '');
    if (v.isEmpty) return 'Type or scan a tracking number.';
    return RegExp(r'^LIT-\d{6}-[A-Z0-9]{6}$').hasMatch(v)
        ? null
        : 'That is not a Loved-IT tracking number. It looks like LIT-261017-AB12CD.';
  }

  /// A GCash number written as 09…, 9…, 63 9… or +63 9…, with spaces or dashes → "09171234567"; anything else → null.
  static String? normalizeGcashNumber(String value) {
    if (RegExp(r'[^0-9+\s-]').hasMatch(value)) return null;
    var digits = value.replaceAll(RegExp(r'\D+'), '');
    if (digits.startsWith('63') && digits.length == 12) {
      digits = '0${digits.substring(2)}';
    }
    if (digits.length == 10 && digits.startsWith('9')) digits = '0$digits';
    return RegExp(r'^09\d{9}$').hasMatch(digits) ? digits : null;
  }

  static String? gcashNumber(String? value, {bool required = true}) {
    if ((value ?? '').trim().isEmpty) {
      return required ? 'Enter the GCash mobile number.' : null;
    }
    return normalizeGcashNumber(value!) == null
        ? 'Enter the 11-digit mobile number of the GCash account, like 0917 123 4567.'
        : null;
  }

  /// The name on a GCash account, a person's or a business's: 2 to 120 characters, starting with a letter.
  static String? gcashAccountName(String? value, {bool required = true}) {
    final s = squish(value);
    if (s.isEmpty) {
      return required ? 'Enter the name on the GCash account.' : null;
    }
    if (s.length < 2 || s.length > 120) {
      return 'Enter the full name on the GCash account (2 to 120 characters).';
    }
    if (!_accountName.hasMatch(s)) {
      return "Enter the name exactly as GCash shows it: letters, spaces and . , ' & ( ) - only.";
    }
    return null;
  }

  // Rider (king.md, Part C) -------------------------------------------------

  /// An LTO driver's license number, `A00-00-000000`, sent without spaces and in capitals.
  static String normalizeLicenseNumber(String value) =>
      value.replaceAll(_manyspaces, '').toUpperCase();

  static String? licenseNumber(String? value) {
    final v = normalizeLicenseNumber(value ?? '');
    if (v.isEmpty) return "Driver's license number is required.";
    return RegExp(r'^[A-Z]\d{2}-\d{2}-\d{6}$').hasMatch(v)
        ? null
        : 'Enter the license number in the LTO format A00-00-000000 (1 letter and 11 digits).';
  }

  /// A license expiry picked from the date picker: today or later in the Philippines.
  static String? licenseExpiry(DateTime? value, {DateTime? now}) {
    if (value == null) return 'License expiry date is required.';
    final day = DateTime(value.year, value.month, value.day);
    return day.isBefore(manilaToday(now))
        ? 'The license has expired. Enter a license that is still valid.'
        : null;
  }

  /// A plate number: 2 to 10 letters and digits once spaces and dashes are taken out, in capitals.
  static String normalizePlateNumber(String value) =>
      value.replaceAll(_spacesAndDashes, '').toUpperCase();

  static String? plateNumber(String? value) {
    final v = normalizePlateNumber(value ?? '');
    if (v.isEmpty) return 'Plate number is required.';
    return RegExp(r'^[A-Z0-9]{2,10}$').hasMatch(v)
        ? null
        : 'Enter the plate number with letters and numbers only, for example 123ABC or NBC1234.';
  }

  static const vehicleTypes = ['Motorcycle', 'Tricycle', 'Car', 'Van'];

  static String? vehicleType(String? value) =>
      vehicleTypes.contains(value) ? null : 'Choose the vehicle type.';

  /// The cash a rider collected: exactly the order's COD amount, to the centavo.
  static String? codCollected(String? value, num expected) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return 'Enter the cash you collected.';
    if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(s)) {
      return 'Enter the cash you collected in pesos and centavos, like 500 or 500.00.';
    }
    final cents = (double.parse(s) * 100).round();
    if (cents != (expected * 100).round()) {
      return "The cash must be exactly ₱${expected.toStringAsFixed(2)}, the order's COD amount.";
    }
    return null;
  }

  /// A cash remittance: above ₱0, at most 2 decimals, and no more than the rider holds.
  static String? remittanceAmount(String? value, {num? max}) {
    final s = (value ?? '').trim();
    if (s.isEmpty) return 'Enter the amount you are handing over.';
    if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(s)) {
      return 'The amount can have at most 2 decimal places.';
    }
    final amount = double.parse(s);
    if (amount <= 0) return 'Enter an amount above ₱0.';
    if (max != null && (amount * 100).round() > (max * 100).round()) {
      return 'That is more than the ₱${max.toStringAsFixed(2)} you can hand over.';
    }
    return null;
  }

  /// An optional transfer reference, as the receipt shows it: 4 to 40 letters and numbers.
  static String? paymentReference(String? value) {
    final s = squish(value);
    if (s.isEmpty) return null;
    if (s.length < 4 ||
        s.length > 40 ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9 #/\-]*$').hasMatch(s) ||
        !RegExp(r'\d').hasMatch(s)) {
      return 'Enter the reference as the receipt shows it: 4 to 40 letters and numbers, like 1234 567 890123.';
    }
    return null;
  }
}

/// One line of the live password checklist.
class PasswordCheck {
  const PasswordCheck(this.label, this.ok);
  final String label;
  final bool ok;
}

/// What each field lets people type at all, so wrong characters never appear in the box.
abstract final class Only {
  static final digits = FilteringTextInputFormatter.digitsOnly;
  static final nameChars = FilteringTextInputFormatter.allow(
    RegExp(r"[\p{L}\p{M} .'\-]", unicode: true),
  );
  static final mobileChars = FilteringTextInputFormatter.allow(
    RegExp(r'[0-9+]'),
  );
  static final noSpaces = FilteringTextInputFormatter.deny(RegExp(r'\s'));
  static final trackingChars = FilteringTextInputFormatter.allow(
    RegExp(r'[A-Za-z0-9\-]'),
  );
  static TextInputFormatter max(int n) => LengthLimitingTextInputFormatter(n);

  /// Plate numbers: letters and digits only.
  static final plateChars = FilteringTextInputFormatter.allow(
    RegExp(r'[A-Za-z0-9]'),
  );

  /// License numbers: letters, digits and dashes.
  static final licenseChars = FilteringTextInputFormatter.allow(
    RegExp(r'[A-Za-z0-9\-]'),
  );

  /// Transfer references: letters, digits, spaces, `#`, `/` and `-`.
  static final referenceChars = FilteringTextInputFormatter.allow(
    RegExp(r'[A-Za-z0-9 #/\-]'),
  );

  /// Pesos: digits and one dot, at most 2 decimals ("500", "500.5", "500.50").
  static final pesos = TextInputFormatter.withFunction(
    (oldValue, newValue) =>
        RegExp(r'^\d{0,9}(\.\d{0,2})?$').hasMatch(newValue.text)
        ? newValue
        : oldValue,
  );

  static final upper = TextInputFormatter.withFunction(
    (oldValue, newValue) =>
        newValue.copyWith(text: newValue.text.toUpperCase()),
  );
}
