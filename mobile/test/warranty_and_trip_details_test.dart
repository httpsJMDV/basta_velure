import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/features/buyer/data/orders.dart';
import 'package:loved_it/features/seller/data/seller_models.dart';
import 'package:loved_it/features/rider/data/trip_models.dart';

void main() {
  test('seller warranty editor receives saved terms', () {
    final product = SellerProduct.fromJson({
      'id': 1,
      'name': 'Covered product',
      'warranty': '12-month seller warranty',
    });
    expect(product.warranty, '12-month seller warranty');
  });

  test(
    'order reads its purchase warranty without consulting the current product',
    () {
      final item = OrderItem.fromJson({
        'id': 1,
        'product_name': 'Covered product',
        'warranty': 'Original coverage',
      });
      expect(item.warranty, 'Original coverage');
      expect(OrderItem.fromJson({'id': 2}).warranty, isNull);
    },
  );

  test(
    'truck trip preserves hub contacts, ETA, issues and return manifest kind',
    () {
      final trip = TruckTrip.fromJson({
        'id': 3,
        'code': 'TRK-3',
        'status': 'on_the_way',
        'to_hub': {
          'name': 'Receiving hub',
          'address': '1 Main St',
          'phone': '09171234567',
        },
        'eta_at': '2026-11-16T12:00:00Z',
        'issues': [
          {'kind': 'delay', 'note': 'Traffic near the receiving hub.'},
        ],
        'parcels': [
          {
            'tracking_number': 'RTN-1',
            'kind': 'buyer_return',
            'received': false,
          },
        ],
      });
      expect(trip.toAddress, '1 Main St');
      expect(trip.toPhone, '09171234567');
      expect(trip.etaAt, DateTime.utc(2026, 11, 16, 12));
      expect(trip.issues.single.kind, 'delay');
      expect(trip.parcels.single.kind, 'buyer_return');
      expect(trip.parcels.single.received, isFalse);
    },
  );
}
