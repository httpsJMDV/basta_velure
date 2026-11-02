import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/features/rider/widgets/parcel_scanner.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// The phone's camera, without a phone. It behaves like the real one in the way that matters here: it only ever runs for
/// a scanner that is on screen, because `MobileScannerController.start()` gives up when its widget isn't built yet.
class _FakeCamera extends MobileScannerPlatform {
  final codes = StreamController<BarcodeCapture?>.broadcast();
  int started = 0;
  MobileScannerException? fails;

  @override
  Stream<BarcodeCapture?> get barcodesStream => codes.stream;

  @override
  Stream<TorchState> get torchStateStream => const Stream.empty();

  @override
  Stream<double> get zoomScaleStateStream => const Stream.empty();

  @override
  Widget buildCameraView() => const ColoredBox(color: Colors.black);

  @override
  Future<MobileScannerViewAttributes> start(StartOptions startOptions) async {
    if (fails != null) throw fails!;
    started++;
    return const MobileScannerViewAttributes(
      cameraDirection: CameraFacing.back,
      currentTorchMode: TorchState.off,
      numberOfCameras: 1,
      size: Size(1280, 720),
    );
  }

  @override
  Future<void> stop() async {}

  @override
  Future<void> dispose() async {}

  @override
  Future<void> updateScanWindow(Rect? window) async {}

  void show(String code) =>
      codes.add(BarcodeCapture(barcodes: [Barcode(rawValue: code)]));
}

void main() {
  const permissions = MethodChannel('flutter.baseflow.com/permissions/methods');
  const camera = 1; // Permission.camera
  const granted = 1;
  const denied = 0;

  late _FakeCamera phone;
  late int cameraStatus;
  late List<String> scanned;

  setUp(() {
    phone = _FakeCamera();
    MobileScannerPlatform.instance = phone;
    cameraStatus = granted;
    scanned = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissions, (call) async {
          if (call.method == 'checkPermissionStatus') return cameraStatus;
          if (call.method == 'requestPermissions') {
            cameraStatus = granted;
            return {camera: granted};
          }
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissions, null);
  });

  Future<void> openScanner(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ParcelScanner.session(
              cameraReason: 'Scan the barcode on each waybill.',
              onSessionScan: (code) async {
                scanned.add(code);
                return ScanTone.good;
              },
            ),
          ),
        ),
      ),
    );
    // Long enough for the start to give up, the way it does on a phone.
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  Future<void> closeScanner(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  }

  testWidgets('with permission already given, the camera opens by itself', (
    tester,
  ) async {
    await openScanner(tester);

    expect(phone.started, 1);
    expect(find.textContaining("couldn't start"), findsNothing);
    expect(find.text('Start camera'), findsNothing);
    expect(find.byType(MobileScanner), findsOneWidget);
    await closeScanner(tester);
  });

  testWidgets('without it, Start camera asks and then opens the camera', (
    tester,
  ) async {
    cameraStatus = denied;
    await openScanner(tester);
    expect(phone.started, 0);

    await tester.tap(find.text('Start camera'));
    await tester.pumpAndSettle();
    expect(find.text('Use the camera?'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(phone.started, 1);
    expect(find.byType(MobileScanner), findsOneWidget);
    expect(find.textContaining("couldn't start"), findsNothing);
    await closeScanner(tester);
  });

  testWidgets('a waybill in front of the camera is scanned once', (
    tester,
  ) async {
    await openScanner(tester);

    // The camera reports a code it can see about four times a second.
    for (var i = 0; i < 5; i++) {
      phone.show('LIT-261030-AAAAAA');
      await tester.pump(const Duration(milliseconds: 250));
    }

    expect(scanned, ['LIT-261030-AAAAAA']);
    await closeScanner(tester);
  });

  testWidgets('the next waybill is read straight after it', (tester) async {
    await openScanner(tester);

    phone.show('LIT-261030-AAAAAA');
    await tester.pump(const Duration(milliseconds: 250));
    // The compact form a barcode can carry reads the same as the printed one.
    phone.show('LIT261030BBBBBB');
    await tester.pump(const Duration(milliseconds: 250));

    expect(scanned, ['LIT-261030-AAAAAA', 'LIT-261030-BBBBBB']);
    await closeScanner(tester);
  });

  testWidgets('the same waybill counts again once it has left the camera', (
    tester,
  ) async {
    await openScanner(tester);

    phone.show('LIT-261030-AAAAAA');
    await tester.pump(const Duration(milliseconds: 250));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 2600)),
    );
    phone.show('LIT-261030-AAAAAA');
    await tester.pump(const Duration(milliseconds: 250));

    expect(scanned, hasLength(2));
    await closeScanner(tester);
  });

  testWidgets('a code seen while the last one is still sending is not lost', (
    tester,
  ) async {
    final answer = Completer<ScanTone>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ParcelScanner.session(
              cameraReason: 'Scan the barcode on each waybill.',
              onSessionScan: (code) {
                scanned.add(code);
                return scanned.length == 1
                    ? answer.future
                    : Future.value(ScanTone.good);
              },
            ),
          ),
        ),
      ),
    );
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    phone.show('LIT-261030-AAAAAA');
    await tester.pump(const Duration(milliseconds: 250));
    phone.show('LIT-261030-BBBBBB');
    await tester.pump(const Duration(milliseconds: 250));
    expect(scanned, ['LIT-261030-AAAAAA']);

    answer.complete(ScanTone.good);
    await tester.pump(const Duration(milliseconds: 250));
    phone.show('LIT-261030-BBBBBB');
    await tester.pump(const Duration(milliseconds: 250));

    expect(scanned, ['LIT-261030-AAAAAA', 'LIT-261030-BBBBBB']);
    await closeScanner(tester);
  });

  testWidgets('a camera that really can\'t start says what to do instead', (
    tester,
  ) async {
    phone.fails = const MobileScannerException(
      errorCode: MobileScannerErrorCode.genericError,
    );
    await openScanner(tester);

    expect(
      find.text("The camera couldn't start. Type the tracking number instead."),
      findsOneWidget,
    );
    expect(find.text('Type it instead'), findsOneWidget);
    await closeScanner(tester);
  });
}
