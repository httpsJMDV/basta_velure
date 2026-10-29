import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/validation/rules.dart';

/// Every rule in "Validation rules for the app" (amaru.md): at least one value that passes and one that fails.
void main() {
  group('names', () {
    test(
      'accepts letters, ñ, accents, spaces, hyphens, apostrophes and periods',
      () {
        for (final ok in [
          'Ana',
          'Peña',
          'José Mari',
          "O'Brien",
          'Dela Cruz-Santos',
          'Ma. Luisa',
          'Ñino',
        ]) {
          expect(Rules.name(ok, 'First name'), isNull, reason: ok);
        }
      },
    );

    test(
      'refuses digits, symbols, a leading space-mark and the wrong length',
      () {
        expect(Rules.name('', 'First name'), 'First name is required.');
        expect(
          Rules.name('A', 'First name'),
          'First name must be 2 to 50 characters.',
        );
        expect(
          Rules.name('A' * 51, 'First name'),
          'First name must be 2 to 50 characters.',
        );
        expect(Rules.name('Ana1', 'First name'), contains('letters only'));
        expect(Rules.name('-Ana', 'First name'), contains('letters only'));
        expect(Rules.name('Ana@', 'First name'), contains('letters only'));
      },
    );

    test('middle name is optional', () {
      expect(Rules.name('', 'Middle name', required: false), isNull);
      expect(Rules.name('B', 'Middle name', required: false), isNotNull);
    });
  });

  group('email', () {
    test('passes a normal address and lowercases it for sending', () {
      expect(Rules.email('ana@example.com'), isNull);
      expect(Rules.normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
    });

    test('fails empty, malformed and too long', () {
      expect(Rules.email(''), 'Email is required.');
      expect(Rules.email('ana@example'), contains('valid email'));
      expect(Rules.email('ana example.com'), contains('valid email'));
      expect(
        Rules.email('${'a' * 95}@x.com'),
        'Email must be 100 characters or fewer.',
      );
    });
  });

  group('mobile number', () {
    test('09XXXXXXXXX and +639XXXXXXXXX are the same number', () {
      expect(Rules.mobile('09171234567'), isNull);
      expect(Rules.mobile('+639171234567'), isNull);
      expect(Rules.mobile('0917 123 4567'), isNull);
      expect(Rules.normalizeMobile('0917-123-4567'), '+639171234567');
      expect(Rules.normalizeMobile('+639171234567'), '+639171234567');
    });

    test('fails landlines, wrong lengths and letters', () {
      expect(Rules.mobile(''), 'Mobile number is required.');
      expect(Rules.mobile('0917123456'), Rules.mobileMessage);
      expect(Rules.mobile('028123456'), Rules.mobileMessage);
      expect(Rules.mobile('+63917123456a'), Rules.mobileMessage);
      expect(Rules.mobile('639171234567'), Rules.mobileMessage);
    });
  });

  group('password', () {
    test('needs 8+ with upper, lower, a number and a symbol', () {
      expect(Rules.password('Secret#12'), isNull);
      expect(Rules.password('Ñandú#2024'), isNull);
    });

    test('fails each missing part', () {
      expect(Rules.password(''), 'Password is required.');
      for (final weak in [
        'Sh#1a',
        'secret#12',
        'SECRET#12',
        'Secret#ab',
        'Secret123',
      ]) {
        expect(Rules.password(weak), isNotNull, reason: weak);
      }
    });

    test('the live checklist ticks what is there', () {
      final checks = Rules.passwordChecks('abc');
      expect(checks.where((c) => c.ok).map((c) => c.label), [
        'A lowercase letter',
      ]);
    });

    test('is never trimmed: a space counts as a symbol, and the confirmation must match exactly', () {
      expect(Rules.password('Secret 12'), isNull);
      expect(Rules.passwordConfirmation('Secret#12', 'Secret#12'), isNull);
      expect(
        Rules.passwordConfirmation('Secret#12', 'Secret#12 '),
        'The passwords do not match.',
      );
      expect(
        Rules.passwordConfirmation('Secret#12', ''),
        'Please confirm your password.',
      );
    });
  });

  group('date of birth (Philippine date)', () {
    // 2026-10-28 03:00 UTC is 11:00 in Manila.
    final now = DateTime.utc(2026, 10, 28, 3);

    test('18 today passes; a day short of 18 fails', () {
      expect(Rules.dateOfBirth(DateTime(2008, 10, 28), now: now), isNull);
      expect(
        Rules.dateOfBirth(DateTime(2008, 10, 29), now: now),
        'You must be at least 18 years old to register.',
      );
    });

    test('future dates and empty fail', () {
      expect(
        Rules.dateOfBirth(DateTime(2026, 10, 29), now: now),
        'The date of birth cannot be in the future.',
      );
      expect(Rules.dateOfBirth(null, now: now), 'Date of birth is required.');
    });

    test('uses Manila, not the phone: 17:00 UTC on Oct 27 is already Oct 28 in Manila', () {
      expect(
        Rules.manilaToday(DateTime.utc(2026, 10, 27, 17)),
        DateTime(2026, 10, 28),
      );
      expect(
        Rules.latestBirthDate(DateTime.utc(2026, 10, 27, 17)),
        DateTime(2008, 10, 28),
      );
    });

    test(
      'Feb 29: the picker stops at Feb 28 and the check matches the server',
      () {
        final leapDay = DateTime.utc(2028, 2, 29, 3);
        expect(Rules.latestBirthDate(leapDay), DateTime(2010, 2, 28));
        expect(
          Rules.dateOfBirth(DateTime(2010, 3, 1), now: leapDay),
          isNotNull,
        );
        expect(Rules.dateOfBirth(DateTime(2010, 2, 28), now: leapDay), isNull);
      },
    );

    test('is sent as YYYY-MM-DD', () {
      expect(Rules.ymd(DateTime(2001, 4, 9)), '2001-04-09');
    });
  });

  group('email code', () {
    test('exactly 6 digits', () {
      expect(Rules.emailCode('123456'), isNull);
      expect(Rules.emailCode(''), isNotNull);
      expect(Rules.emailCode('12345'), 'The code is 6 digits.');
      expect(Rules.emailCode('12345a'), 'The code is 6 digits.');
    });
  });

  group('postal code', () {
    test('exactly 4 digits', () {
      expect(Rules.postalCode('4009'), isNull);
      expect(Rules.postalCode('409'), 'Enter a 4-digit postal code.');
      expect(Rules.postalCode('40091'), 'Enter a 4-digit postal code.');
      expect(Rules.postalCode(''), 'Postal code is required.');
    });
  });

  group('quantity', () {
    test('1 or more', () {
      expect(Rules.quantity('1'), isNull);
      expect(Rules.quantity('0'), isNotNull);
      expect(Rules.quantity(''), isNotNull);
    });

    test('above the stock or purchase limit becomes the most allowed', () {
      expect(Rules.clampQuantity('50', max: 12), 12);
      expect(Rules.clampQuantity('3', max: 12), 3);
      expect(Rules.clampQuantity('0', max: 12), 1);
      expect(Rules.clampQuantity('', max: 12), 1);
    });
  });

  group('price filters', () {
    test('the minimum cannot be above the maximum', () {
      expect(Rules.priceRange('100', '500'), isNull);
      expect(Rules.priceRange('', '500'), isNull);
      expect(Rules.priceRange('600', '500'), isNotNull);
    });
  });

  group('GCash reference', () {
    test('exactly 13 digits, spaces ignored', () {
      expect(Rules.gcashReference('1234567890123'), isNull);
      expect(Rules.gcashReference('1234 567 890123'), isNull);
      expect(Rules.gcashReference('123456789012'), isNotNull);
      expect(Rules.gcashReference('12345678901ab'), isNotNull);
      expect(Rules.gcashReference(''), isNotNull);
    });
  });

  group('reasons written in words', () {
    test('cancel "Other": 10 to 300 characters, in words', () {
      expect(
        Rules.words('The seller is taking too long.', 'Reason', max: 300),
        isNull,
      );
      expect(
        Rules.words('Too slow', 'Reason', max: 300),
        'Reason must be at least 10 characters.',
      );
      expect(
        Rules.words('1234567890', 'Reason', max: 300),
        'Reason must be written in words.',
      );
      expect(
        Rules.words('..........', 'Reason', max: 300),
        'Reason must be written in words.',
      );
      expect(
        Rules.words('a' * 301, 'Reason', max: 300),
        'Reason may not be longer than 300 characters.',
      );
    });

    test('return description: 10 to 500 characters', () {
      expect(
        Rules.words('The left shoe is torn at the heel.', 'Description'),
        isNull,
      );
      expect(Rules.words('a' * 501, 'Description'), isNotNull);
    });
  });

  group('reviews', () {
    test('1 to 5 stars are required; text up to 500 characters', () {
      expect(Rules.stars(5), isNull);
      expect(Rules.stars(null), 'Choose 1 to 5 stars.');
      expect(Rules.stars(0), 'Choose 1 to 5 stars.');
      expect(Rules.maxLength('Great fit.', 'Review', 500), isNull);
      expect(Rules.maxLength('a' * 501, 'Review', 500), isNotNull);
    });
  });

  group('address', () {
    test(
      'full name 2 to 100 characters; street 255 and floor/unit 100 at most',
      () {
        expect(Rules.addressFullName('Ana Santos'), isNull);
        expect(Rules.addressFullName('A'), isNotNull);
        expect(Rules.addressFullName('a' * 101), isNotNull);
        expect(Rules.maxLength('123 Rizal St.', 'Street', 255), isNull);
        expect(Rules.maxLength('a' * 256, 'Street', 255), isNotNull);
        expect(Rules.maxLength('a' * 101, 'Floor / unit', 100), isNotNull);
      },
    );
  });

  group('search', () {
    test('trimmed, and never sent empty', () {
      expect(Rules.searchQuery('  rice   cooker '), 'rice cooker');
      expect(Rules.searchQuery('   '), isNull);
    });
  });

  group('shared with Parts C and D', () {
    test('tracking numbers, typed with or without dashes', () {
      expect(Rules.trackingNumber('LIT-261017-AB12CD'), isNull);
      expect(
        Rules.normalizeTrackingNumber('lit261017ab12cd'),
        'LIT-261017-AB12CD',
      );
      expect(Rules.trackingNumber('LIT-2610-AB12'), isNotNull);
      expect(Rules.trackingNumber(''), 'Type or scan a tracking number.');
    });

    test('GCash number and account name', () {
      expect(Rules.normalizeGcashNumber('+63 917 123 4567'), '09171234567');
      expect(Rules.gcashNumber('0917 123 4567'), isNull);
      expect(Rules.gcashNumber('0817 123 4567'), isNotNull);
      expect(Rules.gcashAccountName('Juan Dela Cruz'), isNull);
      expect(Rules.gcashAccountName('Santos & Sons, Inc.'), isNull);
      expect(Rules.gcashAccountName('J'), isNotNull);
      expect(Rules.gcashAccountName('123 Store'), isNotNull);
    });
  });

  group('input formatters', () {
    TextEditingValue type(
      TextInputFormatter formatter,
      String before,
      String after,
    ) => formatter.formatEditUpdate(
      TextEditingValue(text: before),
      TextEditingValue(text: after),
    );

    test('Only.pesos: digits and one dot, at most 2 decimals', () {
      expect(type(Only.pesos, '500', '500.5').text, '500.5');
      expect(type(Only.pesos, '500.50', '500.505').text, '500.50');
      expect(type(Only.pesos, '500', '500a').text, '500');
      expect(type(Only.pesos, '5.0', '5.0.').text, '5.0');
    });

    test('Only.nameChars keeps letters and name marks only', () {
      expect(type(Only.nameChars, '', 'Peña-Cruz1!').text, 'Peña-Cruz');
    });

    test('Only.mobileChars and Only.digits', () {
      expect(type(Only.mobileChars, '', '+63 917-123').text, '+63917123');
      expect(type(Only.digits, '', '12a3').text, '123');
    });

    test('Only.upper capitalises as people type', () {
      expect(type(Only.upper, '', 'lit-26').text, 'LIT-26');
    });
  });
}
