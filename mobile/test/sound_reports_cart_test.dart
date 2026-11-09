import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/sound/notification_sound.dart';
import 'package:loved_it/features/buyer/cart/big_purchase_sheet.dart';
import 'package:loved_it/features/buyer/data/badges.dart';
import 'package:loved_it/features/buyer/data/cart.dart';
import 'package:loved_it/features/reports/report_data.dart';
import 'package:loved_it/features/reports/report_screen.dart';
import 'package:loved_it/features/settings/notification_sound_screen.dart';
import 'package:loved_it/sound_watcher.dart';

import 'support/fakes.dart';

class MemorySoundStore implements SoundStore {
  MemorySoundStore([this.saved]);

  String? saved;

  @override
  Future<String?> read() async => saved;

  @override
  Future<void> write(String id) async => saved = id;
}

/// The Nov 9 additions: notification sounds and their setting, the hub, courier and rider reports with Excel and PDF
/// downloads, and the big-purchase notice after Add to cart.
void main() {
  const soundChannel = MethodChannel('shop.lovedit/sound');
  const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
  final played = <({String name, Uint8List bytes})>[];
  final launched = <String>[];

  setUp(() {
    played.clear();
    launched.clear();
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(soundChannel, (call) async {
      final args = call.arguments as Map;
      played.add((
        name: args['name'] as String,
        bytes: args['bytes'] as Uint8List,
      ));
      return true;
    });
    messenger.setMockMethodCallHandler(launcherChannel, (call) async {
      launched.add((call.arguments as Map)['url'] as String);
      return true;
    });
  });

  tearDown(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(soundChannel, null);
    messenger.setMockMethodCallHandler(launcherChannel, null);
  });

  group('Notification sound', () {
    testWidgets('every sound in the list is in the app, as a WAV', (
      tester,
    ) async {
      await tester.runAsync(() async {
        for (final sound in NotificationSound.all.where((s) => !s.isOff)) {
          final data = await rootBundle.load('assets/sounds/${sound.id}.wav');
          final head = String.fromCharCodes(data.buffer.asUint8List(0, 4));
          expect(head, 'RIFF', reason: sound.id);
        }
      });
      expect(NotificationSound.all, hasLength(9));
    });

    testWidgets(
      'one sound for things that arrive together; a preview always plays',
      (tester) async {
        final player = SoundPlayer();
        await tester.runAsync(() async {
          expect(await player.play('chime'), isTrue);
          expect(await player.play('chime'), isFalse);
          expect(await player.play('glass', preview: true), isTrue);
          expect(await player.play('off', preview: true), isFalse);
        });
        expect(played.map((p) => p.name), ['chime', 'glass']);
        expect(String.fromCharCodes(played.first.bytes.take(4)), 'RIFF');
      },
    );

    testWidgets(
      'the setting plays the sound tapped and keeps it on the phone',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.75;
        addTearDown(tester.view.reset);
        final store = MemorySoundStore('pulse');
        final container = ProviderContainer(
          overrides: [soundStoreProvider.overrideWithValue(store)],
        );
        addTearDown(container.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(home: NotificationSoundScreen()),
          ),
        );
        await tester.pumpAndSettle();
        // The saved choice is read on start.
        expect(container.read(notificationSoundProvider), 'pulse');
        expect(find.text('Marimba'), findsOneWidget);
        expect(find.text('No sound'), findsOneWidget);

        await tester.runAsync(() async {
          await tester.tap(find.text('Marimba'));
          await Future<void>.delayed(const Duration(milliseconds: 50));
        });
        await tester.pumpAndSettle();
        expect(container.read(notificationSoundProvider), 'marimba');
        expect(store.saved, 'marimba');
        expect(played.map((p) => p.name), ['marimba']);
      },
    );

    testWidgets(
      'a rising count plays the chosen sound; a falling one stays quiet',
      (tester) async {
        var unread = 1;
        final api = FakeApi({
          'GET /auth/me': (_) => jsonBody(200, {'data': userJson()}),
          'GET /notifications/unread-count': (_) => jsonBody(200, {
            'data': {'unread': unread},
          }),
          'GET /conversations/unread-count': (_) => jsonBody(200, {
            'data': {'unread_count': 0},
          }),
        });
        final container = containerWith(api, MemoryTokenStore('t'));
        final player = SoundPlayer(quietGap: Duration.zero);
        final scope = ProviderContainer(
          parent: container,
          overrides: [
            soundPlayerProvider.overrideWithValue(player),
            soundStoreProvider.overrideWithValue(MemorySoundStore('ding')),
            // In this scope, so it reads the store above.
            notificationSoundProvider.overrideWith(NotificationSoundChoice.new),
          ],
        );
        await tester.runAsync(() => settled(scope));
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: scope,
            child: const NotificationSoundWatcher(child: SizedBox()),
          ),
        );
        // The first count (1) arrives: it is only remembered.
        await tester.runAsync(
          () => scope.read(unreadNotificationsProvider.notifier).refresh(),
        );
        await tester.pumpAndSettle();
        expect(
          player.played,
          isEmpty,
          reason: 'the first count after signing in is quiet',
        );

        unread = 3;
        await tester.runAsync(
          () => scope.read(unreadNotificationsProvider.notifier).refresh(),
        );
        await tester.pumpAndSettle();
        expect(player.played, ['ding']);

        unread = 0;
        await tester.runAsync(
          () => scope.read(unreadNotificationsProvider.notifier).refresh(),
        );
        await tester.pumpAndSettle();
        expect(player.played, ['ding']);

        await tester.pumpWidget(const SizedBox());
        scope.dispose();
        container.dispose();
      },
    );
  });

  group('Reports', () {
    Map<String, dynamic> document() => {
      'kind': 'hub',
      'title': 'Hub report',
      'owner': 'J&T Express Santa Cruz Hub',
      'range': {
        'from': '2026-10-11',
        'to': '2026-11-09',
        'days': 30,
        'label': 'Oct 11 to Nov 9, 2026',
      },
      'kpis': [
        {
          'label': 'Received',
          'type': 'int',
          'value': 1234,
          'hint': 'Parcels scanned in',
          'display': '1,234',
        },
        {
          'label': 'Hub earnings',
          'type': 'money',
          'value': 7.5,
          'hint': null,
          'display': '₱7.50',
        },
      ],
      'sections': [
        {
          'title': 'By day',
          'columns': [
            {'label': 'Date', 'type': 'date'},
            {'label': 'Received', 'type': 'int'},
            {'label': 'Success', 'type': 'percent'},
          ],
          'rows': [
            ['2026-11-07', 5, 0.5],
            ['2026-11-08', 2, null],
          ],
          'total_rows': 2,
          'total': ['Total', 7, 0.5],
          'note': null,
          'empty': 'Nothing in this period.',
        },
        {
          'title': 'Riders',
          'columns': [
            {'label': 'Rider', 'type': 'text'},
          ],
          'rows': [],
          'total_rows': 0,
          'total': null,
          'note': null,
          'empty': 'No riders yet.',
        },
      ],
      'notes': ['Days are Philippine time.'],
    };

    testWidgets(
      'shows the figures and tables, and downloads as PDF in the browser',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 2.75;
        addTearDown(tester.view.reset);
        final api = FakeApi({
          'GET /hub/reports/document': (_) =>
              jsonBody(200, {'data': document()}),
          'POST /hub/reports/link': (request) => jsonBody(200, {
            'data': {
              'url':
                  'https://api.loved-it.shop/api/v1/reports/files/hub?format=${(request.data as Map)['format']}&signature=abc',
              'format': (request.data as Map)['format'],
            },
          }),
        });
        final container = containerWith(api, MemoryTokenStore());
        addTearDown(container.dispose);
        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: const MaterialApp(home: ReportScreen(kind: ReportKind.hub)),
          ),
        );
        await tester.pumpAndSettle();

        final asked = api.requests.singleWhere(
          (r) => r.path == '/hub/reports/document',
        );
        expect(asked.queryParameters.keys, containsAll(['from', 'to']));
        expect(find.text('J&T Express Santa Cruz Hub'), findsOneWidget);
        expect(
          find.text('Oct 11 to Nov 9, 2026 · Philippine time'),
          findsOneWidget,
        );
        expect(find.text('1,234'), findsOneWidget);
        expect(find.text('₱7.50'), findsOneWidget);
        expect(find.text('Nov 7, 2026'), findsOneWidget);
        expect(find.text('50%'), findsNWidgets(2));
        expect(find.text('—'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('No riders yet.'),
          300,
          scrollable: find.byType(Scrollable).first,
        );

        await tester.runAsync(() async {
          await tester.tap(find.text('PDF'));
          await Future<void>.delayed(const Duration(milliseconds: 50));
        });
        await tester.pumpAndSettle();
        final link = api.requests.singleWhere(
          (r) => r.path == '/hub/reports/link',
        );
        expect((link.data as Map)['format'], 'pdf');
        expect((link.data as Map)['from'], '2026-10-11');
        expect(launched.single, contains('/reports/files/hub?format=pdf'));
        expect(find.textContaining('Find it in Downloads'), findsOneWidget);
      },
    );

    test('cells read the same as on the website and in the files', () {
      expect(displayReportCell(ReportCell.money, 1250.5), '₱1,250.50');
      expect(displayReportCell(ReportCell.int, 12000), '12,000');
      expect(displayReportCell(ReportCell.percent, 0.925), '93%');
      expect(displayReportCell(ReportCell.hours, 5.25), '5.3 h');
      expect(displayReportCell(ReportCell.hours, 2), '2 h');
      expect(displayReportCell(ReportCell.percent, null), '—');
      expect(
        displayReportCell(ReportCell.datetime, '2026-11-07T07:00:00+00:00'),
        'Nov 7, 2026 3:00 PM',
      );
      expect(displayReportCell(ReportCell.date, 'Total'), 'Total');
      expect(displayReportCell(ReportCell.int, '12 jobs'), '12 jobs');
    });
  });

  group('Big purchase', () {
    final notice = BigPurchaseNotice.fromJson({
      'kind': 'big_purchase',
      'title': 'This is a big purchase',
      'points': [
        'Your cart is now ₱55,000. For orders of ₱50,000 or more, you confirm at checkout …',
        "Cash on delivery is only for up to ₱50,000 per shop … Pay Big Ticket's order of ₱55,000 by GCash.",
        'You can still ask for a return within 7 days of delivery if something is wrong.',
      ],
      'cart_total': 55000,
      'agreement': true,
      'no_cod': true,
    });

    test('the add to cart passes the notice on', () async {
      final api = FakeApi({
        'GET /cart': (_) => jsonBody(200, {
          'data': {'stores': [], 'summary': {}},
        }),
        'POST /cart/items': (_) => jsonBody(201, {
          'message': 'Added to your cart.',
          'data': {'stores': [], 'summary': {}},
          'notice': {
            'title': 'This is a big purchase',
            'points': ['a', 'b'],
            'cart_total': 55000,
            'agreement': true,
            'no_cod': false,
          },
        }),
      });
      final container = containerWith(api, MemoryTokenStore());
      addTearDown(container.dispose);
      final added = await container.read(cartProvider.notifier).add(4, 1);
      expect(added.message, 'Added to your cart.');
      expect(added.notice?.points, ['a', 'b']);
      expect(added.notice?.agreement, isTrue);
      expect(added.notice?.noCod, isFalse);
    });

    testWidgets('says the total and every point, and View cart answers true', (
      tester,
    ) async {
      bool? answer;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async =>
                    answer = await showBigPurchaseSheet(context, notice),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('This is a big purchase'), findsOneWidget);
      expect(find.text('₱55,000.00'), findsOneWidget);
      expect(find.textContaining('by GCash'), findsOneWidget);
      expect(find.textContaining('7 days'), findsOneWidget);
      await tester.tap(find.text('View cart'));
      await tester.pumpAndSettle();
      expect(answer, isTrue);
    });
  });
}
