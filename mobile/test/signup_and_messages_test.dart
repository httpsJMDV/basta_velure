import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:loved_it/core/media/photo_picker.dart';
import 'package:loved_it/core/widgets/widgets.dart';
import 'package:loved_it/features/buyer/account/complete_profile_screen.dart';
import 'package:loved_it/features/buyer/account/id_upload.dart';
import 'package:loved_it/features/buyer/addresses/place_picker.dart';
import 'package:loved_it/features/buyer/data/account.dart';
import 'package:loved_it/features/buyer/messages/messages_screen.dart';
import 'package:loved_it/features/rider/apply/hub_search.dart';
import 'package:loved_it/features/rider/apply/rider_apply_screen.dart';

import 'support/fakes.dart';

/// The sign-up fixes of Nov 8: Complete profile sends its address with the PSGC codes and finishes, the rider form
/// finds a hub among thousands by searching, a failed photo pick says why, and the Messages tab counts unread
/// chats per inbox like the website.
void main() {
  late FakeApi api;

  Future<void> openScreen(
    WidgetTester tester,
    Widget screen,
    Map<String, FakeHandler> routes,
  ) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    api = FakeApi(routes);
    final container = containerWith(api, MemoryTokenStore());
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(home: screen),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> press(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  group('Complete profile', () {
    final next = find.widgetWithText(FilledButton, 'Continue');

    testWidgets('Finish sends the address with its codes and the ID', (
      tester,
    ) async {
      await openScreen(tester, const CompleteProfileScreen(), {
        ...placeRoutes,
        'POST /auth/complete-profile': (_) =>
            jsonBody(200, {'data': userJson()}),
      });

      await press(tester, find.byType(DateOfBirthField));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await press(tester, find.byType(AppSelectField<String>));
      await tester.tap(find.text('Female').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Mobile number'),
        '09171234567',
      );
      await tester.pump();
      await press(tester, next);

      await press(tester, find.widgetWithText(PlaceField, 'Region'));
      await tester.tap(find.text('National Capital Region (NCR)'));
      await tester.pumpAndSettle();
      await press(
        tester,
        find.widgetWithText(PlaceField, 'City or municipality'),
      );
      await tester.tap(find.text('City of Pasig'));
      await tester.pumpAndSettle();
      await press(tester, find.widgetWithText(PlaceField, 'Barangay'));
      await tester.tap(find.text('Ugong'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Street, house or building'),
        '5 Meralco Ave',
      );
      await tester.pump();
      await press(tester, next);

      // The ID step: a passport needs the front only. The photos come in as the picker would hand them over.
      final upload = tester.widget<IdUpload>(find.byType(IdUpload));
      upload.onType(GovernmentId.passport);
      await tester.pump();
      tester
          .widget<IdUpload>(find.byType(IdUpload))
          .onFront(
            PickedPhoto(bytes: _png, filename: 'front.png', subtype: 'png'),
          );
      await tester.pumpAndSettle();
      expect(find.text('Front of your ID'), findsOneWidget);
      expect(find.text('Retake'), findsOneWidget);

      await press(tester, find.widgetWithText(FilledButton, 'Finish'));

      final sent = api.requests.singleWhere(
        (r) => r.path == '/auth/complete-profile',
      );
      final fields = Map.fromEntries((sent.data as FormData).fields);
      expect(fields, containsPair('region_code', '130000000'));
      expect(fields, containsPair('province', 'Metro Manila'));
      expect(fields, containsPair('city_municipality', 'City of Pasig'));
      expect(fields, containsPair('city_code', '137403000'));
      expect(fields, containsPair('barangay', 'Ugong'));
      expect(fields, containsPair('barangay_code', '137403027'));
      expect(fields, containsPair('street_address', '5 Meralco Ave'));
      expect(fields, containsPair('government_id_type', 'passport'));
      final files = (sent.data as FormData).files.map((f) => f.key).toList();
      expect(files, ['government_id_image']);
    });

    testWidgets('the first step offers a profile photo', (tester) async {
      await openScreen(tester, const CompleteProfileScreen(), {});
      // No Google picture on this account, so it offers to add one.
      expect(find.text('No profile photo yet (optional)'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Add'), findsOneWidget);
    });
  });

  group('Become a rider', () {
    testWidgets('the hub is found by searching the place, among thousands', (
      tester,
    ) async {
      await openScreen(tester, const RiderApplyScreen(), {
        'GET /logistics/hubs': (request) => jsonBody(200, {
          'data': request.queryParameters['search'] == 'Pasig'
              ? [
                  {
                    'id': 4101,
                    'hub_name': 'J&T Express Pasig Hub',
                    'address_city': 'Pasig',
                    'address_province': 'Metro Manila',
                    'courier': {'id': 1, 'name': 'J&T Express', 'code': 'JNT'},
                  },
                ]
              : [],
        }),
      });
      // Nothing is loaded before the person searches.
      expect(api.requests, isEmpty);

      await press(tester, find.byType(HubField));
      expect(find.text('Search by place'), findsOneWidget);
      await tester.enterText(find.byType(TextField).last, 'Pasig');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();

      final search = api.requests.single;
      expect(search.queryParameters['search'], 'Pasig');
      expect(search.queryParameters['limit'], 50);
      expect(find.text('Pasig, Metro Manila · J&T Express'), findsOneWidget);

      await tester.tap(find.text('J&T Express Pasig Hub'));
      await tester.pumpAndSettle();
      expect(find.text('J&T Express Pasig Hub'), findsOneWidget);
      expect(find.text('Search by place'), findsNothing);
    });

    testWidgets('a place with no hub says so', (tester) async {
      await openScreen(tester, const RiderApplyScreen(), {
        'GET /logistics/hubs': (_) => jsonBody(200, {'data': []}),
      });
      await press(tester, find.byType(HubField));
      await tester.enterText(find.byType(TextField).last, 'Atlantis');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('No hub found for "Atlantis"'), findsOneWidget);
    });
  });

  group('Messages', () {
    Map<String, dynamic> chat(int id, String type, int unread, String title) =>
        {
          'id': id,
          'type': type,
          'recipient': {'shop_name': title},
          'unread': unread,
          'can_send': true,
          'last_message': {'body': 'Hello'},
          'last_message_at': '2026-11-08T02:00:00+00:00',
        };

    testWidgets('each inbox shows how many of its chats are unread', (
      tester,
    ) async {
      var shopUnread = 2;
      await openScreen(tester, const MessagesScreen(), {
        'GET /conversations': (_) => jsonBody(200, {
          'data': [
            chat(1, 'buyer_seller', shopUnread, 'Maria Shop'),
            chat(2, 'buyer_seller', 0, 'Pedro Hardware'),
            chat(3, 'rider_buyer', 1, 'Rider Juan'),
            chat(4, 'buyer_admin', 0, 'Loved-IT Support'),
          ],
        }),
      });

      Finder pill(String label) => find.bySemanticsLabel(label);
      expect(pill('All, 2 unread'), findsOneWidget);
      expect(pill('Shops, 1 unread'), findsOneWidget);
      expect(pill('Delivery, 1 unread'), findsOneWidget);
      expect(pill('Support'), findsOneWidget);

      await tester.tap(pill('Delivery, 1 unread'));
      await tester.pumpAndSettle();
      expect(find.text('Rider Juan'), findsOneWidget);
      expect(find.text('Maria Shop'), findsNothing);

      // A new message arrives while the tab is open: the next check shows it, with no pull to refresh.
      shopUnread = 3;
      final before = api.requests.length;
      await tester.pump(MessagesScreen.pollEvery);
      await tester.pumpAndSettle();
      expect(api.requests.length, before + 1);
      await tester.tap(find.bySemanticsLabel('All, 2 unread'));
      await tester.pumpAndSettle();
      expect(find.text('3'), findsOneWidget);

      await tester.pumpWidget(const SizedBox());
    });
  });

  group('Photo picker', () {
    test('a refused camera or a cloud photo says what to do', () {
      expect(
        PhotoPicker.pickerMessage('camera_access_denied', ImageSource.camera),
        contains('Settings'),
      );
      expect(
        PhotoPicker.pickerMessage('no_available_camera', ImageSource.camera),
        contains('gallery'),
      );
      expect(
        PhotoPicker.pickerMessage(
          'missing_valid_image_uri',
          ImageSource.gallery,
        ),
        contains('download it first'),
      );
      expect(
        PhotoPicker.pickerMessage('something_new', ImageSource.gallery),
        contains("couldn't be opened"),
      );
    });

    testWidgets('when the phone cannot make a JPEG, Flutter redraws a PNG', (
      tester,
    ) async {
      await tester.runAsync(() async {
        final big = await _photo(2400, 1200);
        final png = await PhotoPicker.redrawAsPng(big, maxBytes: 5 << 20);
        expect(png, isNotNull);
        final decoded = await ui.instantiateImageCodec(png!);
        final frame = (await decoded.getNextFrame()).image;
        // The long side is brought down to 1600.
        expect([frame.width, frame.height], [1600, 800]);
        frame.dispose();

        expect(
          await PhotoPicker.redrawAsPng(
            Uint8List.fromList([1, 2, 3, 4]),
            maxBytes: 5 << 20,
          ),
          isNull,
        );
      });
    });
  });
}

/// A 1 × 1 PNG.
final _png = Uint8List.fromList([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
  0x1F, 0x00, 0x05, 0x00, 0x01, 0xFF, 0x89, 0x99, 0x3D, 0x1D, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
]);

/// A plain photo of [width] × [height], as PNG bytes.
Future<Uint8List> _photo(int width, int height) async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawRect(
    ui.Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
    ui.Paint()..color = const ui.Color(0xFFC0001A),
  );
  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  return data!.buffer.asUint8List();
}
