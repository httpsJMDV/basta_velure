import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/features/buyer/data/checkout.dart';
import 'package:loved_it/features/buyer/data/orders.dart';
import 'package:loved_it/features/rider/data/rider_models.dart';

/// Refunds the shop sends by hand, the "Parcel not received" reason, cash on delivery after refused parcels, and the
/// rider's "contact the buyer first" rule, as the app reads them from the API (docs/api/refunds.md).
void main() {
  test('an order carries the refund the shop sends by hand', () {
    final order = Order.fromJson({
      'id': 7,
      'order_number': 'VEL-1',
      'status': 'CANCELLED',
      'payment_method': 'gcash',
      'payment_status': 'paid',
      'total': 500,
      'items': const [],
      'refund_status': 'pending',
      'refund': {
        'id': 3,
        'status': 'sent',
        'amount': 500,
        'gcash_number': '0917 123 4567',
        'gcash_name': 'Ana Buyer',
        'reference': '1234567890123',
        'has_receipt': true,
        'confirm_by': '2026-11-09T10:00:00+08:00',
        'can_confirm': true,
        'can_report': true,
        'can_set_account': false,
      },
    });

    final refund = order.refund!;
    expect(refund.status, 'sent');
    expect(refund.amount, 500);
    expect(refund.statusLabel, 'Sent, please check');
    expect(refund.canConfirm, isTrue);
    expect(refund.canReport, isTrue);
    expect(refund.hasReceipt, isTrue);
    expect(refund.done, isFalse);
    expect(refund.confirmBy, isNotNull);
  });

  test('an instant refund has no refund card', () {
    final order = Order.fromJson({
      'id': 8,
      'status': 'CANCELLED',
      'payment_method': 'card',
      'items': const [],
      'refund_status': 'refunded',
      'refund': null,
    });
    expect(order.refund, isNull);
    expect(order.refundStatus, 'refunded');
  });

  test('"Parcel not received" is one of the return reasons', () {
    expect(OrderReasons.returns, contains(OrderReasons.notReceived));
  });

  test('checkout says why cash on delivery is off after refused parcels', () {
    final quote = CheckoutQuote.fromJson({
      'limits': {
        'cod_max': 50000,
        'cod_available': false,
        'cod_blocked': true,
        'cod_blocked_reason': 'Cash on delivery is off for your account because 3 parcels were refused at the door.',
      },
    });
    expect(quote.codAvailable, isFalse);
    expect(quote.codBlockedReason, contains('refused at the door'));

    final normal = CheckoutQuote.fromJson({'limits': {'cod_available': true}});
    expect(normal.codBlockedReason, isNull);
  });

  test('a stop says whether the buyer was contacted on this trip', () {
    final fresh = DeliveryStop.fromJson({'tracking_number': 'LIT-1', 'recipient': const {}});
    expect(fresh.buyerContacted, isFalse);
    expect(fresh.contactFirstReasons, ['RECIPIENT_UNAVAILABLE', 'CANNOT_CONTACT']);

    final called = DeliveryStop.fromJson({
      'tracking_number': 'LIT-2',
      'recipient': const {},
      'buyer_contacted': true,
      'contact_first_reasons': ['CANNOT_CONTACT'],
    });
    expect(called.buyerContacted, isTrue);
    expect(called.contactFirstReasons, ['CANNOT_CONTACT']);
  });
}
