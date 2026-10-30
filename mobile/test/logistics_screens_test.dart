import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/app.dart';
import 'package:loved_it/core/theme/app_colors.dart';
import 'package:loved_it/router.dart';

import 'support/fakes.dart';

/// Part D end to end through the router: a signed-in hub and a signed-in courier team member on every screen, against
/// a fake server with the API's real shapes (read from the Laravel controllers). Checks what each screen shows and
/// exactly what it sends.
void main() {
  late ProviderContainer container;
  late FakeApi api;

  const received = 'LIT-261030-AAAAAA';
  const repeat = 'LIT-261030-BBBBBB';
  const foreign = 'LIT-261030-CCCCCC';
  const toSort = 'LIT-261030-DDDDDD';

  setUp(() {
    // No camera permission in tests: the scanner shows "Start camera" and "Type it instead" still works.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('flutter.baseflow.com/permissions/methods'),
          (call) async => call.method == 'checkPermissionStatus' ? 0 : null,
        );
  });

  ResponseBody page(List<Object> data, {Map<String, dynamic>? meta}) =>
      jsonBody(200, {
        'data': data,
        'meta': {
          'current_page': 1,
          'last_page': 1,
          'per_page': 20,
          'total': data.length,
          ...?meta,
        },
      });

  Map<String, dynamic> hubParcel(String tracking, {String? scannedAt}) => {
    'tracking_number': tracking,
    'order_number': 'VEL-1',
    'status': scannedAt == null ? 'PICKED_UP' : 'AT_SORTING_CENTER',
    'shop_name': "Maria's Shop",
    'destination_barangay': {'code': '043405001', 'name': 'Poblacion I'},
    'pickup_rider': {'name': 'Juan Rider', 'plate_number': 'AB6224'},
    'picked_up_at': '2026-10-30T01:00:00+00:00',
    'scanned_in_at': scannedAt,
  };

  Map<String, dynamic> hubRider() => {
    'id': 14,
    'user': {
      'id': 52,
      'first_name': 'Danilo',
      'middle_name': null,
      'last_name': 'Reyes',
      'email': 'danilo@example.com',
      'phone': '+639181234567',
      'date_of_birth': '1995-03-20',
    },
    'address': null,
    'vehicle_type': 'Motorcycle',
    'plate_number': 'ND1234',
    'status': 'PENDING',
    'applicant': true,
    'rejection_reason': null,
    'submitted_at': '2026-10-29T04:00:00+00:00',
    'license_number': 'N01-23-456789',
    'license_expiry': '2030-01-01',
    'documents': {
      'or_cr_url': 'http://x/api/v1/hub/riders/14/or-cr',
      'drivers_license_url': 'http://x/api/v1/hub/riders/14/license',
    },
    'area_assignments': [],
  };

  FakeApi hubServer() => FakeApi({
    'GET /auth/me': (_) => jsonBody(200, {
      'data': userJson(
        firstName: 'Liam',
        sortingCenter: {
          'id': 3,
          'hub_name': 'Santa Cruz Hub',
          'status': 'APPROVED',
        },
      ),
    }),
    'GET /hub/dashboard/metrics': (_) => jsonBody(200, {
      'data': {
        'inbound_today': 14,
        'in_sorting': 8,
        'active_riders': 3,
        'out_for_delivery': 5,
        'failed_deliveries': 2,
        'hub': {
          'id': 3,
          'hub_name': 'Santa Cruz Hub',
          'address_barangay': 'Poblacion I',
          'address_city': 'Santa Cruz',
          'address_province': 'Laguna',
        },
      },
    }),
    'GET /hub/intake/expected': (_) =>
        page([hubParcel(received)], meta: {'total': 6}),
    'GET /hub/intake/received-today': (_) =>
        page([hubParcel(repeat, scannedAt: '2026-10-30T03:00:00+00:00')]),
    'GET /hub/riders': (r) => jsonBody(200, {
      'data': [
        if (r.queryParameters['status'] == 'PENDING')
          {
            'id': 14,
            'user': {'first_name': 'Danilo', 'last_name': 'Reyes'},
            'vehicle_type': 'Motorcycle',
            'plate_number': 'ND1234',
            'status': 'PENDING',
            'applicant': true,
            'active_areas_count': 0,
            'submitted_at': '2026-10-29T04:00:00+00:00',
          },
      ],
      'counts': {'pending': 1, 'active': 12, 'disapproved': 2, 'all': 15},
      'meta': {'current_page': 1, 'last_page': 1, 'per_page': 20, 'total': 1},
    }),
    'GET /hub/riders/14': (_) => jsonBody(200, {'data': hubRider()}),
    'POST /hub/riders/14/approve': (_) => jsonBody(200, {
      'message': 'Application approved. We emailed danilo@example.com.',
      'data': {...hubRider(), 'status': 'PENDING_ACTIVATION'},
    }),
    'POST /hub/riders/14/disapprove': (_) => jsonBody(200, {
      'message': 'Application rejected.',
      'data': {...hubRider(), 'status': 'DISAPPROVED'},
    }),
    'GET /hub/riders/14/license': (_) => ResponseBody.fromBytes(
      Uint8List.fromList(utf8.encode('%PDF-1.4 fake')),
      200,
    ),
    'GET /hub/chat/threads': (_) => jsonBody(200, {
      'data': [
        {
          'id': 9,
          'recipient': {'name': 'Pedro Mendoza'},
          'parcel': {'tracking_number': received},
          'can_send': true,
          'unread': 1,
          'last_message': {'body': 'Nasa hub na po.'},
          'last_message_at': '2026-10-30T02:00:00+00:00',
        },
      ],
      'meta': {
        'current_page': 1,
        'last_page': 1,
        'total': 1,
        'unread_total': 1,
      },
    }),
    'GET /hub/courier-chat': (_) => jsonBody(200, {
      'data': {
        'id': 4,
        'unread': 0,
        'company': {'name': 'Demo Courier Co.'},
        'last_message': null,
        'meta': {'can_send': true},
      },
    }),
    'GET /hub/chat/threads/9/messages': (_) => jsonBody(200, {
      'data': [
        {
          'id': 1,
          'body': 'Nasa hub na po.',
          'sender_id': 99,
          'sender_role': 'rider',
          'sender_name': 'Pedro Mendoza',
          'created_at': '2026-10-30T02:00:00+00:00',
        },
      ],
      'meta': {'can_send': true},
    }),
    'POST /hub/chat/threads/9/messages': (r) => jsonBody(201, {
      'data': {
        'id': 2,
        'body': (r.data as Map)['body'],
        'sender_id': 7,
        'sender_role': 'hub',
        'sender_name': 'You',
        'created_at': '2026-10-30T02:01:00+00:00',
      },
    }),
    'POST /hub/chat/threads/9/read': (_) => jsonBody(200, {
      'data': {'marked': 1},
    }),
    'GET /hub/courier-chat/messages': (_) => jsonBody(200, {
      'data': [],
      'meta': {
        'is_closed': true,
        'can_send': false,
        'closed_message':
            'This hub is suspended, so the conversation is read-only.',
      },
    }),
    'POST /hub/courier-chat/read': (_) => jsonBody(200, {
      'data': {'unread': 0},
    }),
    'POST /hub/parcels/$received/receive': (_) => jsonBody(200, {
      'message': 'Parcel received.',
      'data': hubParcel(received, scannedAt: '2026-10-30T04:00:00+00:00'),
    }),
    'POST /hub/parcels/$repeat/receive': (_) => jsonBody(409, {
      'message': 'This parcel has already been received.',
      'scanned_in_at': '2026-10-28T06:15:00+00:00',
    }),
    'POST /hub/parcels/$foreign/receive': (_) =>
        jsonBody(404, {'message': 'Parcel not found for this hub.'}),
    'POST /hub/sorting/sort': (r) {
      final numbers = (r.data as Map)['tracking_numbers'] as List;
      if (numbers.first == foreign) {
        return jsonBody(422, {
          'message':
              'One or more parcels cannot be sorted. Nothing was changed.',
          'errors': {
            'tracking_numbers.0': ['Parcel not found for this hub.'],
          },
        });
      }
      return jsonBody(200, {
        'message': 'Parcels sorted.',
        'sorted_count': numbers.length,
        'barangay': {'code': '043405001', 'name': 'Poblacion I'},
      });
    },
    'GET /hub/sorting/groups': (_) => jsonBody(200, {
      'data': [
        {
          'barangay_code': '043405001',
          'barangay_name': 'Poblacion I',
          'city': 'Santa Cruz',
          'parcel_count': 2,
          'oldest_scanned_in_at': '2026-10-30T01:00:00+00:00',
          'in_coverage': true,
          'riders_covering': 2,
        },
        {
          'barangay_code': '043405002',
          'barangay_name': 'Bagumbayan',
          'city': 'Santa Cruz',
          'parcel_count': 1,
          'oldest_scanned_in_at': '2026-10-30T02:00:00+00:00',
          'in_coverage': false,
          'riders_covering': 0,
        },
      ],
      'meta': {'total_groups': 2, 'total_parcels': 3},
    }),
    'GET /hub/sorting/groups/043405001/parcels': (_) => page([
      {
        'tracking_number': toSort,
        'order_number': 'VEL-2',
        'scanned_in_at': '2026-10-30T01:00:00+00:00',
      },
      {
        'tracking_number': received,
        'order_number': 'VEL-3',
        'scanned_in_at': '2026-10-30T01:30:00+00:00',
      },
    ]),
    'GET /hub/dispatch/batches': (_) => jsonBody(200, {
      'data': [
        {
          'barangay_code': '043405001',
          'barangay_name': 'Poblacion I',
          'city': 'Santa Cruz',
          'parcel_count': 1,
          'oldest_sorted_at': '2026-10-30T01:00:00+00:00',
          'eligible_riders': 1,
        },
      ],
      'meta': {'total_batches': 1, 'total_parcels': 1},
    }),
    'GET /hub/dispatch/awaiting-pickup': (_) => jsonBody(200, {
      'data': [
        {
          'rider': {'id': 7, 'name': 'Pedro Mendoza'},
          'parcels': [
            {
              'tracking_number': repeat,
              'barangay': 'Anibong',
              'recipient_name': 'Ana Buyer',
              'assigned_at': '2026-10-30T02:00:00+00:00',
            },
          ],
        },
      ],
      'meta': {'parcel_count': 1},
    }),
    'GET /hub/dispatch/batches/043405001/parcels': (_) => page([
      {
        'tracking_number': toSort,
        'order_number': 'VEL-2',
        'sorted_at': '2026-10-30T01:00:00+00:00',
      },
    ]),
    'GET /hub/dispatch/batches/043405001/riders': (_) => jsonBody(200, {
      'data': [
        {
          'id': 7,
          'name': 'Juan Dela Cruz',
          'vehicle_type': 'Motorcycle',
          'plate_number': 'AB1234',
          'area_labels': ['North District'],
          'current_load': 3,
        },
      ],
    }),
    'POST /hub/dispatch/assign': (_) =>
        jsonBody(200, {'message': 'Parcels assigned.', 'assigned_count': 1}),
    'GET /hub/deliveries/out': (_) => jsonBody(200, {
      'data': [
        {
          'tracking_number': repeat,
          'rider': {
            'id': 7,
            'name': 'Juan Dela Cruz',
            'plate_number': 'AB1234',
          },
          'destination': {
            'barangay_code': '043405001',
            'barangay_name': 'Poblacion I',
            'city': 'Santa Cruz',
          },
          'recipient_name': 'Ana Buyer',
          'elapsed_minutes': 90,
        },
      ],
      'meta': {
        'total': 1,
        'truncated': false,
        'riders': [
          {'rider_id': 7, 'name': 'Juan Dela Cruz', 'count': 1},
        ],
      },
    }),
    'GET /hub/deliveries/failed': (_) => page(
      [
        {
          'tracking_number': received,
          'rider': {'id': 7, 'name': 'Juan Dela Cruz'},
          'destination': {
            'barangay_code': '043405001',
            'barangay_name': 'Poblacion I',
            'city': 'Santa Cruz',
          },
          'recipient_name': 'Ana Buyer',
          'failure_reason': {
            'code': 'RECIPIENT_UNAVAILABLE',
            'label': 'Recipient unavailable',
          },
          'failure_note': 'Gate locked.',
          'failed_at': '2026-10-30T02:00:00+00:00',
          'delivery_attempts': 2,
          'max_attempts': 3,
          'can_reschedule': true,
        },
        {
          'tracking_number': repeat,
          'destination': {
            'barangay_code': '043405001',
            'barangay_name': 'Poblacion I',
            'city': 'Santa Cruz',
          },
          'failure_reason': {'code': 'REFUSED', 'label': 'Refused'},
          'delivery_attempts': 3,
          'max_attempts': 3,
          'can_reschedule': false,
        },
      ],
      meta: {
        'reasons': [
          {
            'code': 'RECIPIENT_UNAVAILABLE',
            'label': 'Recipient unavailable',
            'requires_note': false,
          },
        ],
      },
    ),
    'POST /hub/deliveries/$received/reschedule': (_) =>
        jsonBody(200, {'message': 'Parcel rescheduled.'}),
    'POST /hub/deliveries/$received/return-to-seller': (_) =>
        jsonBody(200, {'message': 'Parcel returned to the seller.'}),
    'GET /hub/profile': (_) => jsonBody(200, {
      'data': {
        'hub_name': 'Santa Cruz Hub',
        'address_city': 'Santa Cruz',
        'coverage_barangays_count': 18,
        'courier': {'name': 'Demo Courier Co.'},
      },
    }),
  });

  Map<String, dynamic> courierParcelDetail({
    String status = 'DELIVERY_FAILED',
  }) => {
    'id': 50,
    'tracking_number': received,
    'status': status,
    'status_label': 'Delivery attempt failed',
    'order': {
      'id': 1,
      'order_number': 'VEL-1',
      'payment_method': 'cod',
      'total': 1250,
      'buyer': 'Ana Buyer',
    },
    'shop': {'shop_name': "Maria's Shop", 'full_address': 'Pagsanjan'},
    'recipient': {'name': 'Ana Buyer', 'full_address': 'Santa Cruz, Laguna'},
    'zone': 'Laguna',
    'weight_kg': 1.5,
    'cod_amount': 1250,
    'hub': 'Santa Cruz Hub',
    'riders': {'pickup': 'Juan', 'delivery': 'Pedro', 'return': null},
    'attempts': 1,
    'max_attempts': 3,
    'failures': [
      {
        'attempt': 1,
        'reason': 'Recipient unavailable',
        'note': 'Gate locked.',
        'at': '2026-10-30T02:00:00+00:00',
      },
    ],
    'exception': null,
    'override_targets': [
      {'value': 'DELIVERED', 'label': 'Delivered'},
    ],
    'can_mark_exception': true,
    'timeline': [
      {
        'status': 'DELIVERY_FAILED',
        'note': 'Delivery attempt failed',
        'actor': 'rider',
        'at': '2026-10-30T02:00:00+00:00',
      },
    ],
    'audit': [],
  };

  Map<String, dynamic> courierRider(String status, {bool applicant = false}) =>
      {
        'id': 7,
        'name': 'Pedro Mendoza',
        'email': 'pedro@example.com',
        'phone': '09171234567',
        'status': status,
        'online': status == 'ACTIVE',
        'active_jobs': 1,
        'delivered_today': 4,
        'vehicle_type': 'Motorcycle',
        'plate_number': 'NBC1234',
        'license_number': 'N01-23-456789',
        'license_expiry': '2030-01-01',
        'hub_id': 3,
        'hub_name': 'Santa Cruz Hub',
        'needs_reverification': false,
        'applicant': applicant,
        'documents': [
          {'key': 'license', 'label': "Driver's license"},
        ],
        'audit': [
          {
            'id': 1,
            'action': 'rider.approved',
            'reason': null,
            'actor': 'Liam',
            'created_at': '2026-10-30T02:00:00+00:00',
          },
        ],
      };

  FakeApi courierServer() => FakeApi({
    'GET /auth/me': (_) => jsonBody(200, {
      'data': userJson(
        firstName: 'Liam',
        logisticsCompany: {
          'id': 2,
          'name': 'Demo Courier Co.',
          'status': 'APPROVED',
          'role': 'owner',
        },
      ),
    }),
    'GET /logistics/dashboard': (_) => jsonBody(200, {
      'data': {
        'hubs': {'approved': 4, 'pending': 2, 'suspended': 0, 'rejected': 0},
        'riders': {'active': 10, 'pending': 1, 'online': 6},
        'parcels_now': {
          'awaiting_pickup': 12,
          'at_hubs': 30,
          'out_for_delivery': 18,
          'failed': 3,
        },
        'last_30_days': {'delivered': 100, 'returned': 2},
      },
    }),
    'GET /logistics/chat/unread': (_) => jsonBody(200, {
      'data': {'unread': 1},
    }),
    'GET /logistics/chat/hubs': (_) => jsonBody(200, {
      'data': [
        {
          'hub': {
            'id': 3,
            'name': 'Santa Cruz Hub',
            'place': 'Santa Cruz, Laguna',
            'status': 'APPROVED',
          },
          'thread_id': null,
          'unread': 0,
          'last_message': null,
        },
      ],
      'meta': {'unread': 0},
    }),
    'POST /logistics/chat/hubs/3/thread': (_) => jsonBody(201, {
      'data': {
        'id': 21,
        'unread': 0,
        'meta': {'can_send': true},
      },
    }),
    'GET /logistics/chat/threads/21/messages': (_) => jsonBody(200, {
      'data': [
        {
          'id': 1,
          'body': 'Kulang po kami ng rider.',
          'sender_id': 40,
          'sender_role': 'hub',
          'sender_name': 'Santa Cruz Hub',
          'created_at': '2026-10-30T02:00:00+00:00',
        },
        {
          'id': 2,
          'body': 'Sige, titingnan namin.',
          'sender_id': 41,
          'sender_role': 'courier',
          'sender_name': 'Demo Courier Co. · Amaru',
          'created_at': '2026-10-30T02:01:00+00:00',
        },
      ],
      'meta': {'can_send': true},
    }),
    'POST /logistics/chat/threads/21/read': (_) => jsonBody(200, {
      'data': {'unread': 0},
    }),
    'GET /logistics/network/hubs': (_) => jsonBody(200, {
      'data': [
        {
          'id': 3,
          'hub_name': 'Pagsanjan Hub',
          'status': 'PENDING',
          'city_province': 'Pagsanjan, Laguna',
          'coverage_count': 5,
          'active_riders': 0,
          'active_parcels': 0,
          'applicant_name': 'Ana Santos',
        },
        {
          'id': 4,
          'hub_name': 'Santa Cruz Hub',
          'status': 'APPROVED',
          'city_province': 'Santa Cruz, Laguna',
          'coverage_count': 18,
          'active_riders': 3,
          'active_parcels': 9,
          'applicant_name': 'Maria Cruz',
        },
      ],
    }),
    'GET /logistics/network/hubs/3': (_) => jsonBody(200, {
      'data': {
        'id': 3,
        'hub_name': 'Pagsanjan Hub',
        'status': 'PENDING',
        'address_street': '12 Rizal St',
        'address_city': 'Pagsanjan',
        'coverage_barangays': ['043405001'],
        'dti_permit_url': 'http://x/permit',
        'applicant': {
          'first_name': 'Ana',
          'last_name': 'Santos',
          'email': 'ana@example.com',
          'government_id_image_url': 'http://x/id',
          'government_id_type': 'PhilSys',
        },
        'created_at': '2026-10-29T00:00:00+00:00',
      },
    }),
    'POST /logistics/network/hubs/3/approve': (_) =>
        jsonBody(200, {'message': 'Hub approved.'}),
    'POST /logistics/network/hubs/3/reject': (_) =>
        jsonBody(200, {'message': 'Hub rejected.'}),
    'GET /logistics/parcels': (r) => page([
      {
        'id': 50,
        'tracking_number': received,
        'status': 'DELIVERY_FAILED',
        'order_number': 'VEL-1',
        'cod_amount': 1250,
        'hub_name': 'Santa Cruz Hub',
        'barangay': 'Poblacion I',
        'attempts': 1,
      },
    ]),
    'GET /logistics/parcels/50': (_) =>
        jsonBody(200, {'data': courierParcelDetail()}),
    'POST /logistics/parcels/50/override': (_) => jsonBody(200, {
      'message': 'Status set to Delivered. The change is in the audit log.',
    }),
    'POST /logistics/parcels/50/exception': (_) => jsonBody(200, {
      'message': 'Parcel marked lost. The buyer and the shop were told, and the order was cancelled.',
    }),
    'POST /logistics/parcels/50/reschedule': (_) => jsonBody(200, {
      'message': 'Rescheduled: attempt 2 of 3 with Pedro Mendoza.',
    }),
    'GET /logistics/riders': (_) => jsonBody(200, {
      'data': [courierRider('ACTIVE')],
      'summary': {
        'total': 1,
        'online': 1,
        'active': 1,
        'pending_activation': 0,
        'pending_verification': 0,
        'applications': 0,
        'suspended': 0,
        'max_active_jobs': 3,
      },
    }),
    'GET /logistics/riders/7': (_) =>
        jsonBody(200, {'data': courierRider('ACTIVE')}),
    'POST /logistics/riders/7/suspend': (_) =>
        jsonBody(200, {'message': 'Rider suspended.', 'released_jobs': 0}),
    'GET /logistics/hub-ops': (_) => jsonBody(200, {
      'data': {
        'hubs': [
          {'id': 3, 'name': 'Santa Cruz Hub', 'city': 'Santa Cruz'},
        ],
        'counts': {'incoming': 1, 'at_hub': 0, 'sorted': 1, 'outbound': 0},
      },
    }),
    'GET /logistics/hub-ops/zones': (_) => jsonBody(200, {
      'data': {
        'incoming': [
          {
            'id': 60,
            'tracking_number': toSort,
            'barangay': 'Poblacion I',
            'city': 'Santa Cruz',
            'shop': "Maria's Shop",
            'rider': 'Juan',
          },
        ],
        'to_sort': [],
        'zones': [
          {
            'zone': 'Laguna',
            'parcels': [
              {'id': 61, 'tracking_number': repeat, 'barangay': 'Bagumbayan'},
            ],
          },
        ],
      },
    }),
    'POST /logistics/hub-ops/inbound': (r) {
      final code = (r.data as Map)['tracking_number'];
      if (code == repeat) {
        return jsonBody(409, {
          'message':
              'Already received on Oct 28, 2:15 PM. Nothing was changed.',
        });
      }
      if (code == foreign) {
        return jsonBody(404, {
          'message': 'Parcel not found. Check the tracking number.',
        });
      }
      return jsonBody(200, {'message': 'Received at the hub.', 'data': {}});
    },
    'POST /logistics/hub-ops/outbound': (r) => jsonBody(200, {
      'message': 'Out to Pedro Mendoza. They mark it Out for Delivery when they leave.',
      'data': {},
    }),
    'GET /logistics/dispatch': (r) => jsonBody(200, {
      'data': [
        if (r.queryParameters['state'] == 'unassigned')
          {
            'id': 70,
            'tracking_number': received,
            'shop_name': "Maria's Shop",
            'pickup_area': 'Anibong, Pagsanjan',
            'dropoff_area': 'Poblacion I',
            'cod_amount': 1250,
            'ready_at': '2026-10-30T01:00:00+00:00',
            'state': 'unassigned',
            'attempts': 3,
            'max_attempts': 3,
            'rider': null,
            'offer': null,
          },
      ],
      'counts': {'unassigned': 1, 'offering': 0, 'assigned': 0},
    }),
    'GET /logistics/dispatch/riders': (_) => jsonBody(200, {
      'data': [
        {
          'id': 7,
          'name': 'Pedro Mendoza',
          'online': true,
          'active_jobs': 1,
          'assignable': true,
        },
      ],
      'unavailable': [
        {
          'id': 8,
          'name': 'Jose Offline',
          'online': false,
          'active_jobs': 0,
          'assignable': false,
          'problem': 'Offline',
        },
      ],
      'max_active_jobs': 3,
    }),
    'POST /logistics/dispatch/assign': (_) => jsonBody(200, {
      'message': 'Assigned to Pedro Mendoza.',
      'data': {
        'assigned': [received],
        'skipped': [],
      },
    }),
    'POST /logistics/dispatch/auto-assign': (_) => jsonBody(200, {
      'message': 'No eligible rider is Online right now. The jobs stay in the Unassigned queue.',
      'data': {'offered': 0, 'unassigned': 1},
    }),
    'GET /logistics/cod': (_) => jsonBody(200, {
      'data': {
        'date': '2026-10-30',
        'riders': [
          {
            'rider_id': 7,
            'rider': 'Pedro Mendoza',
            'collected': '1250.00',
            'remitted': '1000.00',
            'difference': '-250.00',
            'shortfall': true,
            'balance': '250.00',
          },
        ],
        'totals': {
          'collected': '1250.00',
          'remitted': '1000.00',
          'difference': '-250.00',
        },
        'pending': [
          {
            'id': 90,
            'rider_id': 7,
            'rider': 'Pedro Mendoza',
            'amount': '1000.00',
            'balance_at_submission': '1250.00',
            'shortfall': '250.00',
            'status': 'PENDING',
            'reference': 'REM-ABC123',
            'submitted_at': '2026-10-30T03:00:00+00:00',
          },
        ],
      },
    }),
    'POST /logistics/cod/remittances/90/confirm': (_) => jsonBody(200, {
      'message': "Remittance confirmed. The rider's balance is updated.",
      'data': {},
    }),
    'GET /logistics/me': (_) => jsonBody(200, {
      'data': {'name': 'Demo Courier Co.', 'code': 'DCC'},
    }),
  });

  /// Signs in and opens the app on a tall phone, so whole cards fit and taps land.
  Future<void> openApp(
    WidgetTester tester,
    FakeApi server, {
    Size size = const Size(1080, 2400),
    double ratio = 2.75,
  }) async {
    api = server;
    container = containerWith(api, MemoryTokenStore('t'));
    addTearDown(container.dispose);
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = ratio;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const LovedItApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Lets requests and animations run while a button's spinner keeps turning: a main button stays locked, and spinning,
  /// while its "are you sure?" dialog is open.
  Future<void> pumpFor(WidgetTester tester, [int frames = 10]) async {
    for (var i = 0; i < frames; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  /// Stops the screens' timers before the test ends.
  Future<void> closeApp(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  }

  List<RequestOptions> sent(String method, String path) =>
      api.requests.where((r) => r.method == method && r.path == path).toList();

  void go(String path) => container.read(routerProvider).push(path);

  /// Types one tracking number into the scanner.
  Future<void> typeCode(WidgetTester tester, String code) async {
    await tester.ensureVisible(find.text('Type it instead'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Type it instead'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Tracking number'),
      code,
    );
    await tester.tap(find.text('Scan it'));
    await tester.pumpAndSettle();
  }

  group('hub', () {
    testWidgets('Home: 4 numbers, alerts, and the hub bar with Scan', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      expect(find.text('Hub overview'), findsOneWidget);
      expect(find.text('Santa Cruz Hub'), findsOneWidget);

      expect(find.text('Expected'), findsOneWidget);
      expect(find.text('6'), findsOneWidget);
      expect(find.text('Received today'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
      expect(find.text('To sort'), findsOneWidget);
      expect(find.text('8'), findsOneWidget);
      expect(find.text('Out for delivery'), findsOneWidget);
      expect(find.text('5'), findsOneWidget);

      expect(find.text('2 failed deliveries'), findsOneWidget);
      expect(find.text('1 rider application'), findsOneWidget);
      expect(find.text('1 unread message'), findsOneWidget);

      for (final label in ['Home', 'Sorting', 'Scan', 'Dispatch', 'More']) {
        expect(find.text(label), findsOneWidget);
      }
      await closeApp(tester);
    });

    testWidgets('an alert opens the right screen', (tester) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('2 failed deliveries'));
      await tester.pumpAndSettle();
      expect(find.text('Recipient unavailable'), findsWidgets);
      expect(find.text('Attempt 2 of 3'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets(
      'Scan: stays open, a row per scan, each in its own words and colour',
      (tester) async {
        await openApp(tester, hubServer());
        await tester.tap(find.bySemanticsLabel('Scan parcels'));
        await tester.pumpAndSettle();
        expect(find.text('Scan parcels'), findsOneWidget);
        expect(find.text('Start camera'), findsOneWidget);
        // The camera box is dark gray, so the hub's dark gray button would vanish into it.
        final startCamera = tester.widget<FilledButton>(
          find.ancestor(
            of: find.text('Start camera'),
            matching: find.byWidgetPredicate((w) => w is FilledButton),
          ),
        );
        expect(
          startCamera.style?.backgroundColor?.resolve(const {}),
          AppColors.white,
        );
        expect(find.text('14'), findsOneWidget);

        await typeCode(tester, received);
        expect(sent('POST', '/hub/parcels/$received/receive'), hasLength(1));
        expect(find.text('Received'), findsOneWidget);
        expect(find.text("Poblacion I · Maria's Shop"), findsOneWidget);
        expect(find.text('15'), findsOneWidget);

        await typeCode(tester, repeat);
        expect(
          find.text('Already received on Oct 28, 2:15 PM'),
          findsOneWidget,
        );
        // A repeat doesn't count.
        expect(find.text('15'), findsOneWidget);

        // Typed without dashes is fine.
        await typeCode(tester, 'lit261030cccccc');
        expect(find.text("Not one of this hub's parcels"), findsOneWidget);

        // Still open, newest on top.
        expect(find.text('Scan parcels'), findsOneWidget);
        final top = tester.getTopLeft(
          find.text("Not one of this hub's parcels"),
        );
        final bottom = tester.getTopLeft(find.text('Received'));
        expect(top.dy, lessThan(bottom.dy));
        await closeApp(tester);
      },
    );

    testWidgets(
      'Scan: a code that is no tracking number is stopped on the phone',
      (tester) async {
        await openApp(tester, hubServer());
        await tester.tap(find.bySemanticsLabel('Scan parcels'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Type it instead'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Type it instead'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Tracking number'),
          'ABC',
        );
        await tester.tap(find.text('Scan it'));
        await tester.pumpAndSettle();
        expect(
          find.text(
            'That is not a Loved-IT tracking number. It looks like LIT-261017-AB12CD.',
          ),
          findsOneWidget,
        );
        expect(api.requests.where((r) => r.path.contains('receive')), isEmpty);
        await closeApp(tester);
      },
    );

    testWidgets('Scan in Sort mode sends one parcel and shows the barangay', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      await tester.tap(find.bySemanticsLabel('Scan parcels'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sort'));
      await tester.pumpAndSettle();

      await typeCode(tester, toSort);
      expect(sent('POST', '/hub/sorting/sort').single.data, {
        'tracking_numbers': [toSort],
      });
      expect(find.text('Sorted'), findsOneWidget);
      expect(find.text('Poblacion I'), findsOneWidget);

      await typeCode(tester, foreign);
      expect(find.text('Parcel not found for this hub.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Sorting: barangay names, never codes, and sort a group', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('Sorting'));
      await tester.pumpAndSettle();
      expect(find.text('Poblacion I'), findsOneWidget);
      expect(find.text('Bagumbayan'), findsOneWidget);
      expect(find.text('Outside your coverage'), findsOneWidget);
      expect(find.textContaining('043405001'), findsNothing);

      await tester.tap(find.text('Poblacion I'));
      await tester.pumpAndSettle();
      expect(find.text(toSort), findsOneWidget);
      expect(find.text('Sort 2 parcels'), findsOneWidget);

      // Leave one out.
      await tester.tap(find.byType(Checkbox).first);
      await tester.pumpAndSettle();
      expect(find.text('Sort 1 parcel'), findsOneWidget);

      await tester.tap(find.text('Sort 1 parcel'));
      await pumpFor(tester);
      expect(find.text('Sort 1 parcel?'), findsOneWidget);
      expect(sent('POST', '/hub/sorting/sort'), isEmpty);
      // On the hub's screens, brand red is kept for problems. The dialog wears the hub's colours too.
      expect(
        Theme.of(tester.element(find.text('Sort 1 parcel?')))
            .colorScheme
            .primary,
        AppColors.gray900,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sort'));
      await pumpFor(tester);
      expect(sent('POST', '/hub/sorting/sort').single.data, {
        'tracking_numbers': [received],
      });
      expect(find.text('Parcels sorted.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Dispatch: choose a rider, ask first, assign', (tester) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('Dispatch'));
      await tester.pumpAndSettle();
      expect(find.text('Waiting for riders to collect'), findsOneWidget);
      expect(find.text('Poblacion I'), findsOneWidget);
      expect(find.text('1 rider available'), findsOneWidget);

      await tester.tap(find.text('Poblacion I'));
      await tester.pumpAndSettle();
      expect(find.text('Juan Dela Cruz'), findsOneWidget);
      expect(find.textContaining('North District'), findsOneWidget);

      await tester.tap(find.text('Assign 1 to Juan Dela Cruz'));
      await pumpFor(tester);
      expect(find.text('Give 1 parcel to Juan Dela Cruz?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Assign'));
      await pumpFor(tester);
      expect(sent('POST', '/hub/dispatch/assign').single.data, {
        'rider_id': 7,
        'tracking_numbers': [toSort],
      });
      expect(find.text('Parcels assigned.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Waiting for riders lists each rider\'s parcels', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('Dispatch'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Waiting for riders to collect'));
      await tester.pumpAndSettle();
      expect(find.text('Pedro Mendoza (1)'), findsOneWidget);
      expect(find.text(repeat), findsOneWidget);
      expect(find.text('With rider'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Failed: reschedule asks first; used-up attempts can\'t be', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      go('/logistics/hub/deliveries?tab=failed');
      await tester.pumpAndSettle();
      expect(find.text('Gate locked.'), findsOneWidget);
      expect(
        find.text('All attempts are used. It can only go back to the seller.'),
        findsOneWidget,
      );
      // Filter chips come from the server's list.
      expect(find.text('All reasons'), findsOneWidget);

      final reschedule = find.widgetWithText(FilledButton, 'Reschedule');
      expect(tester.widget<FilledButton>(reschedule.last).onPressed, isNull);

      await tester.tap(reschedule.first);
      await tester.pumpAndSettle();
      expect(find.text('Reschedule delivery'), findsOneWidget);
      await tester.tap(find.text('Juan Dela Cruz').last);
      await tester.pumpAndSettle();
      expect(find.text('Reschedule with Juan Dela Cruz?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Reschedule').last);
      await tester.pumpAndSettle();
      expect(sent('POST', '/hub/deliveries/$received/reschedule').single.data, {
        'rider_id': 7,
      });
      await closeApp(tester);
    });

    testWidgets('Failed: return to seller checks the note and asks first', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      go('/logistics/hub/deliveries?tab=failed');
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(OutlinedButton, 'Return to seller').first,
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Note (optional)'),
        '12345',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Return to seller'));
      await tester.pumpAndSettle();
      expect(find.text('The note must be written in words.'), findsOneWidget);
      expect(
        sent('POST', '/hub/deliveries/$received/return-to-seller'),
        isEmpty,
      );

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Note (optional)'),
        'Refused twice by the buyer.',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Return to seller'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Send it back to the shop?'), findsOneWidget);
      await tester.tap(
        find.widgetWithText(FilledButton, 'Return to seller').last,
      );
      await tester.pumpAndSettle();
      expect(
        sent('POST', '/hub/deliveries/$received/return-to-seller').single.data,
        {'note': 'Refused twice by the buyer.'},
      );
      expect(find.text('Parcel returned to the seller.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets(
      'Riders: review an application, documents, approve asks first',
      (tester) async {
        await openApp(tester, hubServer());
        go('/logistics/hub/riders');
        await tester.pumpAndSettle();
        expect(find.text('Pending  1'), findsOneWidget);
        expect(find.text('Active  12'), findsOneWidget);
        expect(find.text('Danilo Reyes'), findsOneWidget);

        await tester.tap(find.text('Danilo Reyes'));
        await tester.pumpAndSettle();
        expect(find.text('N01-23-456789 · expires 2030-01-01'), findsOneWidget);
        expect(find.text("Driver's license"), findsOneWidget);
        expect(find.text('Vehicle OR/CR'), findsOneWidget);

        await tester.tap(find.text("Driver's license"));
        await tester.pumpAndSettle();
        expect(find.text('This document is a PDF'), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();

        await tester.tap(find.widgetWithText(FilledButton, 'Approve'));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text('Approve Danilo Reyes?'), findsOneWidget);
        expect(sent('POST', '/hub/riders/14/approve'), isEmpty);
        await tester.tap(find.widgetWithText(FilledButton, 'Approve').last);
        await tester.pumpAndSettle();
        expect(sent('POST', '/hub/riders/14/approve'), hasLength(1));
        await closeApp(tester);
      },
    );

    testWidgets('Riders: disapprove needs a reason in words', (tester) async {
      await openApp(tester, hubServer());
      go('/logistics/hub/riders/14');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Disapprove'));
      await tester.pumpAndSettle();

      final reason = find.widgetWithText(TextFormField, 'Reason');
      final submit = find.widgetWithText(FilledButton, 'Disapprove');
      await tester.enterText(reason, '1234567890');
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(
        find.text('The disapproval reason must be written in words.'),
        findsOneWidget,
      );

      await tester.enterText(reason, 'The license photo is blurry.');
      await tester.tap(submit);
      await pumpFor(tester);
      expect(find.text('Disapprove Danilo Reyes?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Disapprove').last);
      await pumpFor(tester);
      expect(sent('POST', '/hub/riders/14/disapprove').single.data, {
        'reason': 'The license photo is blurry.',
      });
      await closeApp(tester);
    });

    testWidgets('Messages: the courier pinned on top, then riders; a reply', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      go('/logistics/hub/messages');
      await tester.pumpAndSettle();
      expect(find.text('Demo Courier Co.'), findsOneWidget);
      expect(find.text('Pedro Mendoza'), findsOneWidget);

      await tester.tap(find.text('Pedro Mendoza'));
      await tester.pumpAndSettle();
      expect(find.text('Nasa hub na po.'), findsOneWidget);
      expect(sent('POST', '/hub/chat/threads/9/read'), isNotEmpty);

      await tester.enterText(find.byType(TextField), '  Salamat po.  ');
      await tester.tap(find.byTooltip('Send'));
      await tester.pumpAndSettle();
      expect(sent('POST', '/hub/chat/threads/9/messages').single.data, {
        'body': 'Salamat po.',
      });
      expect(find.text('Salamat po.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Rider areas: add one from the hub\'s coverage, by name', (
      tester,
    ) async {
      final server = hubServer();
      server.routes['GET /hub/riders/14/areas'] = (_) => jsonBody(200, {
        'data': [
          {
            'id': 2,
            'area_label': 'Area A',
            'coverage_barangays': ['043405001'],
            'is_active': true,
          },
        ],
      });
      server.routes['GET /hub/coverage-options'] = (_) => jsonBody(200, {
        'data': {
          'coverage_barangays': ['043405001', '043405002'],
        },
      });
      server.routes['POST /hub/riders/14/areas'] = (_) => jsonBody(201, {
        'message': 'Delivery area assigned successfully.',
        'data': {},
      });
      server.routes['DELETE /hub/riders/14/areas/2'] = (_) => jsonBody(200, {
        'message': 'Area assignment deactivated successfully.',
        'data': {},
      });
      await openApp(tester, server);
      go('/logistics/hub/riders/14/areas');
      await tester.pumpAndSettle();
      expect(find.text('Area A'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Add an area'));
      await tester.pumpAndSettle();

      // Nothing filled in: both are stopped on the phone.
      await tester.tap(find.widgetWithText(FilledButton, 'Save area'));
      await tester.pumpAndSettle();
      expect(find.text('Area name is required.'), findsOneWidget);
      expect(
        find.text(
          'At least one coverage barangay must be assigned to this area.',
        ),
        findsOneWidget,
      );
      expect(sent('POST', '/hub/riders/14/areas'), isEmpty);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Area name'),
        '  Zone  2 - Poblacion ',
      );
      await tester.tap(find.byType(CheckboxListTile).first);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Save area'));
      await tester.pumpAndSettle();
      expect(sent('POST', '/hub/riders/14/areas').single.data, {
        'area_label': 'Zone 2 - Poblacion',
        'coverage_barangays': ['043405001'],
      });
      expect(find.text('Delivery area assigned successfully.'), findsOneWidget);

      await tester.tap(find.text('Turn off'));
      await tester.pumpAndSettle();
      expect(find.text('Turn off Area A?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Turn off'));
      await tester.pumpAndSettle();
      expect(sent('DELETE', '/hub/riders/14/areas/2'), hasLength(1));
      await closeApp(tester);
    });

    testWidgets('A closed courier thread is readable but takes no messages', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      go('/logistics/hub/messages/courier');
      await tester.pumpAndSettle();
      expect(
        find.text('This hub is suspended, so the conversation is read-only.'),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNothing);
      await closeApp(tester);
    });

    testWidgets('More: office work links to the website; sign out is there', (
      tester,
    ) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      expect(find.text('Santa Cruz Hub'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Reports'), 300);
      expect(find.text('Earnings'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Sign out'), 300);
      expect(find.text('Sign out'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('No internet: Try again, no crash', (tester) async {
      await openApp(tester, hubServer());
      await tester.tap(find.text('Sorting'));
      await tester.pumpAndSettle();
      api.routes.remove('GET /hub/dispatch/batches');
      await tester.tap(find.text('Dispatch'));
      await tester.pumpAndSettle();
      expect(find.text('No connection'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets(
      'A counter tablet shows the list and the details side by side',
      (tester) async {
        await openApp(
          tester,
          hubServer(),
          size: const Size(1600, 1000),
          ratio: 1,
        );
        await tester.tap(find.text('Sorting'));
        await tester.pumpAndSettle();
        expect(
          find.text('Choose a barangay to see its parcels.'),
          findsOneWidget,
        );
        await tester.tap(find.text('Poblacion I'));
        await tester.pumpAndSettle();
        // The group opened next to the list; the list is still there.
        expect(find.text('Bagumbayan'), findsOneWidget);
        expect(find.text(toSort), findsOneWidget);
        await closeApp(tester);
      },
    );

    testWidgets('Nothing is cut off on a small phone with large text', (
      tester,
    ) async {
      await openApp(tester, hubServer(), size: const Size(720, 1280), ratio: 2);
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      // Keeps the whole report, so a failure names the widget that overflowed.
      final problems = <String>[];
      final report = FlutterError.onError;
      FlutterError.onError = (details) => problems.add(details.toString());
      await tester.pumpAndSettle();

      await tester.tap(find.bySemanticsLabel('Scan parcels'));
      await tester.pumpAndSettle();
      container.read(routerProvider).pop();
      await tester.pumpAndSettle();

      for (final tab in ['Sorting', 'Dispatch', 'More']) {
        await tester.tap(find.text(tab).last);
        await tester.pumpAndSettle();
      }
      FlutterError.onError = report;
      expect(problems, isEmpty);
      await closeApp(tester);
    });
  });

  group('courier team', () {
    testWidgets(
      'Home: the dark header\'s numbers, alerts and the courier bar',
      (tester) async {
        await openApp(tester, courierServer());
        expect(find.text('Demo Courier Co.'), findsOneWidget);
        expect(find.text('12'), findsOneWidget);
        expect(find.text('30'), findsOneWidget);
        expect(find.text('18'), findsOneWidget);
        expect(find.text('3'), findsOneWidget);
        expect(find.text('2 hub applications'), findsOneWidget);
        expect(find.text('3 failed deliveries'), findsOneWidget);
        expect(find.text('1 rider in review'), findsOneWidget);
        expect(find.text('1 unread message'), findsOneWidget);
        for (final label in ['Home', 'Hubs', 'Parcels', 'Riders', 'More']) {
          expect(find.text(label), findsOneWidget);
        }
        await closeApp(tester);
      },
    );

    testWidgets(
      'Hubs: applications first; reject needs a reason, approve asks',
      (tester) async {
        await openApp(tester, courierServer());
        await tester.tap(find.text('Hubs'));
        await tester.pumpAndSettle();
        expect(find.text('Applications  1'), findsOneWidget);
        expect(find.text('Active hubs  1'), findsOneWidget);
        expect(find.text('Pagsanjan Hub'), findsOneWidget);
        expect(find.text('Santa Cruz Hub'), findsNothing);

        await tester.tap(find.text('Pagsanjan Hub'));
        await tester.pumpAndSettle();
        expect(find.text('DTI permit'), findsOneWidget);
        expect(find.text('PhilSys'), findsOneWidget);
        // No name from the PSGC list in a test: the code shows rather than nothing.
        expect(find.text('043405001'), findsOneWidget);

        await tester.tap(find.text('Reject'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Reason'),
          'short',
        );
        await tester.tap(find.widgetWithText(FilledButton, 'Reject hub'));
        await pumpFor(tester);
        expect(
          find.text('The reason must be at least 10 characters.'),
          findsOneWidget,
        );
        expect(sent('POST', '/logistics/network/hubs/3/reject'), isEmpty);
        await tester.tapAt(const Offset(10, 10));
        await pumpFor(tester);

        await tester.tap(find.widgetWithText(FilledButton, 'Approve'));
        await pumpFor(tester);
        expect(find.text('Approve Pagsanjan Hub?'), findsOneWidget);
        await tester.tap(find.widgetWithText(FilledButton, 'Approve').last);
        await pumpFor(tester);
        expect(sent('POST', '/logistics/network/hubs/3/approve'), hasLength(1));
        await closeApp(tester);
      },
    );

    testWidgets('Parcels: find one, its timeline, and the fixes', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      await tester.tap(find.text('Parcels'));
      await tester.pumpAndSettle();
      expect(find.text(received), findsOneWidget);
      expect(find.text('Delivery failed'), findsOneWidget);
      expect(find.text('COD ₱1,250.00 · 1 attempt'), findsOneWidget);

      await tester.tap(find.text(received));
      await tester.pumpAndSettle();
      expect(find.text('Delivery attempt failed'), findsWidgets);
      expect(find.text('Reschedule'), findsOneWidget);
      expect(find.text('Override status'), findsOneWidget);
      expect(find.text('Mark damaged'), findsOneWidget);
      expect(find.text('Mark lost'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.textContaining('Gate locked.'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.scrollUntilVisible(
        find.text('No manual changes.'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await closeApp(tester);
    });

    testWidgets(
      'Parcels: override to the next step, with a reason, asks first',
      (tester) async {
        await openApp(tester, courierServer());
        go('/logistics/courier/parcels/50');
        await tester.pumpAndSettle();
        await tester.tap(find.text('Override status'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Delivered'));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Reason'),
          'Rider app offline, confirmed by phone.',
        );
        await tester.tap(find.widgetWithText(FilledButton, 'Set status'));
        await pumpFor(tester);
        expect(find.text('Set this parcel to Delivered?'), findsOneWidget);
        await tester.tap(find.widgetWithText(FilledButton, 'Set status').last);
        await pumpFor(tester);
        expect(sent('POST', '/logistics/parcels/50/override').single.data, {
          'status': 'DELIVERED',
          'reason': 'Rider app offline, confirmed by phone.',
        });
        await closeApp(tester);
      },
    );

    testWidgets('Parcels: Damaged needs a camera photo; Lost doesn\'t', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/parcels/50');
      await tester.pumpAndSettle();

      await tester.tap(find.text('Mark damaged'));
      await tester.pumpAndSettle();
      expect(
        find.text('From the camera only. JPG or PNG, up to 5 MB.'),
        findsOneWidget,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Reason'),
        'Box crushed during the trip.',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Mark damaged'));
      await pumpFor(tester);
      expect(find.text('Add a photo of the damage.'), findsOneWidget);
      expect(sent('POST', '/logistics/parcels/50/exception'), isEmpty);
      await tester.tapAt(const Offset(10, 10));
      await pumpFor(tester);

      await tester.tap(find.text('Mark lost'));
      await pumpFor(tester);
      expect(find.text('Take photo'), findsNothing);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Reason'),
        'Not found at the hub after the count.',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Mark lost'));
      await pumpFor(tester);
      expect(find.text('Mark the parcel lost?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Mark lost').last);
      await pumpFor(tester);
      final form =
          sent('POST', '/logistics/parcels/50/exception').single.data
              as FormData;
      expect(Map.fromEntries(form.fields), {
        'type': 'lost',
        'reason': 'Not found at the hub after the count.',
      });
      expect(form.files, isEmpty);
      await closeApp(tester);
    });

    testWidgets('Riders: who is Online and their jobs; suspend asks first', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      await tester.tap(find.text('Riders'));
      await tester.pumpAndSettle();
      expect(find.text('Pedro Mendoza'), findsOneWidget);
      expect(
        find.text('Online · 1/3 jobs · 4 delivered today'),
        findsOneWidget,
      );
      expect(find.text('Add rider'), findsOneWidget);

      await tester.tap(find.text('Pedro Mendoza'));
      await tester.pumpAndSettle();
      expect(find.text('Approved'), findsOneWidget);
      await tester.tap(find.text('Suspend'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Reason'),
        'Repeated late deliveries this month.',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Suspend'));
      await pumpFor(tester);
      expect(find.text('Suspend Pedro Mendoza?'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Suspend').last);
      await pumpFor(tester);
      expect(sent('POST', '/logistics/riders/7/suspend').single.data, {
        'reason': 'Repeated late deliveries this month.',
      });
      await closeApp(tester);
    });

    testWidgets('Add rider: every field is checked before anything is sent', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/riders/add');
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.widgetWithText(FilledButton, 'Add rider'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Add rider'));
      await tester.pumpAndSettle();
      expect(find.text("Add a photo of the driver's license."), findsOneWidget);
      // The messages made the form longer, so this one moved further down.
      await tester.scrollUntilVisible(
        find.text('Add a photo of the vehicle OR/CR.'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.scrollUntilVisible(
        find.text('First name is required.'),
        -300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(sent('POST', '/logistics/riders'), isEmpty);
      await closeApp(tester);
    });

    testWidgets('Dispatch: pick jobs, choose a rider who can take them', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/dispatch');
      await tester.pumpAndSettle();
      expect(find.text('Unassigned  1'), findsOneWidget);
      expect(find.text(received), findsOneWidget);

      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Assign 1 to a rider'));
      await pumpFor(tester);
      expect(find.text('Pedro Mendoza'), findsOneWidget);
      // Riders who can't take it say why, and can't be chosen.
      expect(find.text('0/3 jobs · Offline'), findsOneWidget);
      await tester.tap(find.text('Jose Offline'), warnIfMissed: false);
      await pumpFor(tester);
      expect(find.text('Pedro Mendoza'), findsOneWidget);

      await tester.tap(find.text('Pedro Mendoza'));
      await pumpFor(tester);
      expect(sent('POST', '/logistics/dispatch/assign').single.data, {
        'parcel_ids': [70],
        'rider_id': 7,
      });
      expect(find.text('Assigned to Pedro Mendoza.'), findsOneWidget);
      await closeApp(tester);
    });

    testWidgets('Dispatch: auto-assign shows the server\'s answer', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/dispatch');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Auto-assign'));
      await tester.pumpAndSettle();
      expect(sent('POST', '/logistics/dispatch/auto-assign'), hasLength(1));
      expect(
        find.text(
          'No eligible rider is Online right now. The jobs stay in the Unassigned queue.',
        ),
        findsOneWidget,
      );
      await closeApp(tester);
    });

    testWidgets('Hub scanning: inbound, a repeat, a stranger, outbound', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/scan');
      await tester.pumpAndSettle();
      expect(find.text('Waiting  1'), findsOneWidget);

      await typeCode(tester, toSort);
      expect(sent('POST', '/logistics/hub-ops/inbound').single.data, {
        'tracking_number': toSort,
      });
      expect(find.text('Received at the hub.'), findsOneWidget);

      await typeCode(tester, repeat);
      expect(
        find.text('Already received on Oct 28, 2:15 PM. Nothing was changed.'),
        findsOneWidget,
      );
      await typeCode(tester, foreign);
      expect(
        find.text('Parcel not found. Check the tracking number.'),
        findsOneWidget,
      );

      // Outbound needs a rider first, and sends nothing without one.
      await tester.ensureVisible(find.text('Outbound'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Outbound'));
      await tester.pumpAndSettle();
      await typeCode(tester, repeat);
      expect(find.text('Choose the delivery rider first.'), findsOneWidget);
      expect(sent('POST', '/logistics/hub-ops/outbound'), isEmpty);

      await tester.ensureVisible(find.text('Choose the delivery rider'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose the delivery rider'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pedro Mendoza'));
      await tester.pumpAndSettle();
      await typeCode(tester, repeat);
      expect(sent('POST', '/logistics/hub-ops/outbound').single.data, {
        'tracking_number': repeat,
        'rider_id': 7,
      });
      await closeApp(tester);
    });

    testWidgets('COD: a shortfall is flagged; confirming money asks first', (
      tester,
    ) async {
      await openApp(tester, courierServer());
      go('/logistics/courier/cod');
      await tester.pumpAndSettle();
      expect(find.text('Short by ₱250.00'), findsOneWidget);
      expect(find.text('Shortfall'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Confirm received'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Confirm you received ₱1,000.00?'), findsOneWidget);
      expect(sent('POST', '/logistics/cod/remittances/90/confirm'), isEmpty);
      await tester.tap(
        find.widgetWithText(FilledButton, 'Confirm received').last,
      );
      await tester.pumpAndSettle();
      expect(
        sent('POST', '/logistics/cod/remittances/90/confirm'),
        hasLength(1),
      );
      await closeApp(tester);
    });

    testWidgets(
      'Messages: opening a hub starts the thread; a teammate is ours',
      (tester) async {
        await openApp(tester, courierServer());
        go('/logistics/courier/messages');
        await tester.pumpAndSettle();
        await tester.tap(find.text('Santa Cruz Hub'));
        await tester.pumpAndSettle();
        expect(sent('POST', '/logistics/chat/hubs/3/thread'), hasLength(1));
        expect(find.text('Kulang po kami ng rider.'), findsOneWidget);
        expect(find.text('Demo Courier Co. · Amaru'), findsOneWidget);

        // Another team member's message sits on our side, to the right of the hub's.
        final theirs = tester
            .getTopLeft(find.text('Kulang po kami ng rider.'))
            .dx;
        final ours = tester.getTopLeft(find.text('Sige, titingnan namin.')).dx;
        expect(ours, greaterThan(theirs));
        await closeApp(tester);
      },
    );

    testWidgets('More: office work links to the website', (tester) async {
      await openApp(tester, courierServer());
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      expect(find.text('Dispatch'), findsOneWidget);
      expect(find.text('Hub scanning'), findsOneWidget);
      expect(find.text('COD'), findsOneWidget);
      expect(find.text('Messages'), findsOneWidget);
      expect(find.text('DCC', skipOffstage: false), findsNothing);
      expect(find.text('Demo Courier Co. · DCC'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Zones and rates'), 300);
      expect(find.text('Settlements and pay'), findsOneWidget);
      await closeApp(tester);
    });
  });
}
