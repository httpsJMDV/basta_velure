import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/media/permissions.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/validation/rules.dart';
import '../../../core/widgets/widgets.dart';

/// What a scan turned out to be: null when it was ticked off, or the reason it wasn't ("Already ticked off").
typedef ScanHandler = Future<String?> Function(String trackingNumber);

/// The camera in a framed box with a torch button and "Type it instead" (C4, C5). It reads waybill barcodes
/// (Code 128) and the hub's handover QR codes. A good scan flashes green and buzzes once; a bad one shows the reason
/// in red. Only Loved-IT tracking numbers (`LIT-YYMMDD-XXXXXX`) are passed on.
class ParcelScanner extends StatefulWidget {
  const ParcelScanner({super.key, required this.onScan, this.enabled = true});

  final ScanHandler onScan;

  /// False while the screen is sending: scans are ignored.
  final bool enabled;

  @override
  State<ParcelScanner> createState() => _ParcelScannerState();
}

enum _Flash { none, good, bad }

class _ParcelScannerState extends State<ParcelScanner> {
  final _controller = MobileScannerController(
    autoStart: false,
    formats: const [BarcodeFormat.code128, BarcodeFormat.qrCode],
  );

  /// The same code seen again within this time is the same waybill still in front of the camera.
  static const _sameCodeWait = Duration(milliseconds: 2500);

  bool _cameraOn = false;
  bool _checking = false;
  String? _lastCode;
  DateTime? _lastAt;
  _Flash _flash = _Flash.none;
  String? _message;

  /// The message keeps its colour after the flash fades.
  bool _messageIsBad = false;
  Timer? _flashTimer;

  @override
  void initState() {
    super.initState();
    // Already allowed: open the camera at once. Otherwise wait for the rider to tap, and say why first.
    Permission.camera.status.then((status) {
      if (status.isGranted && mounted) _startCamera();
    });
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _askAndStart() async {
    final allowed = await askPermission(
      context,
      Permission.camera,
      title: 'Use the camera?',
      reason:
          'Scan the barcode on each waybill, or the QR code the hub shows you.',
    );
    if (allowed && mounted) await _startCamera();
  }

  Future<void> _startCamera() async {
    try {
      await _controller.start();
      if (mounted) setState(() => _cameraOn = true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _cameraOn = false;
          _show(
            _Flash.bad,
            "The camera couldn't start. Type the tracking number instead.",
          );
        });
      }
    }
  }

  void _onDetect(BarcodeCapture capture) {
    final raw = capture.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .firstOrNull;
    if (raw == null) return;
    final code = Rules.normalizeTrackingNumber(raw);
    final now = DateTime.now();
    if (code == _lastCode &&
        _lastAt != null &&
        now.difference(_lastAt!) < _sameCodeWait) {
      return;
    }
    _lastCode = code;
    _lastAt = now;
    _handle(code);
  }

  Future<void> _handle(String code) async {
    if (!widget.enabled || _checking) return;
    if (Rules.trackingNumber(code) != null) {
      _bad('That code is not a Loved-IT tracking number.');
      return;
    }
    setState(() => _checking = true);
    try {
      final problem = await widget.onScan(code);
      if (!mounted) return;
      if (problem == null) {
        HapticFeedback.mediumImpact();
        _show(_Flash.good, '$code ticked off.');
      } else {
        _bad(problem);
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  void _bad(String message) {
    HapticFeedback.heavyImpact();
    _show(_Flash.bad, message);
  }

  void _show(_Flash flash, String message) {
    _flashTimer?.cancel();
    setState(() {
      _flash = flash;
      _message = message;
      _messageIsBad = flash == _Flash.bad;
    });
    _flashTimer = Timer(const Duration(milliseconds: 600), () {
      if (mounted) setState(() => _flash = _Flash.none);
    });
  }

  Future<void> _typeInstead() async {
    final code = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (context) => const _TypeSheet(),
    );
    if (code != null && mounted) await _handle(code);
  }

  @override
  Widget build(BuildContext context) {
    final good = StatusTone.emerald.foreground;
    final bad = StatusTone.rose.foreground;
    final frameColor = switch (_flash) {
      _Flash.good => good,
      _Flash.bad => bad,
      _Flash.none => AppColors.white,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: AppColors.gray900),
                if (_cameraOn)
                  MobileScanner(controller: _controller, onDetect: _onDetect)
                else
                  Center(
                    child: FilledButton.icon(
                      onPressed: _askAndStart,
                      icon: const Icon(LucideIcons.scanLine),
                      label: const Text('Start camera'),
                    ),
                  ),
                if (_cameraOn) ...[
                  // The framed box to hold the barcode in.
                  Center(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      width: 260,
                      height: 150,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: frameColor, width: 3),
                        color: switch (_flash) {
                          _Flash.good => good.withValues(alpha: 0.25),
                          _Flash.bad => bad.withValues(alpha: 0.2),
                          _Flash.none => Colors.transparent,
                        },
                      ),
                    ),
                  ),
                  Positioned(
                    right: AppSpace.sm,
                    top: AppSpace.sm,
                    child: ValueListenableBuilder<MobileScannerState>(
                      valueListenable: _controller,
                      builder: (context, state, _) {
                        final on = state.torchState == TorchState.on;
                        return IconButton.filled(
                          style: IconButton.styleFrom(
                            backgroundColor: AppColors.gray900.withValues(
                              alpha: 0.6,
                            ),
                            foregroundColor: AppColors.white,
                          ),
                          tooltip: on
                              ? 'Turn the torch off'
                              : 'Turn the torch on',
                          onPressed: state.torchState == TorchState.unavailable
                              ? null
                              : _controller.toggleTorch,
                          icon: Icon(
                            on
                                ? LucideIcons.flashlightOff
                                : LucideIcons.flashlight,
                          ),
                        );
                      },
                    ),
                  ),
                ],
                if (_checking)
                  const Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: LinearProgressIndicator(minHeight: 4),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpace.sm),
        if (_message != null)
          Semantics(
            liveRegion: true,
            child: Row(
              children: [
                Icon(
                  _messageIsBad
                      ? LucideIcons.circleAlert
                      : LucideIcons.circleCheck,
                  size: 20,
                  color: _messageIsBad ? bad : good,
                ),
                const SizedBox(width: AppSpace.sm),
                Expanded(
                  child: Text(
                    _message!,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: _messageIsBad ? bad : good,
                    ),
                  ),
                ),
              ],
            ),
          ),
        TextButton.icon(
          onPressed: widget.enabled ? _typeInstead : null,
          icon: const Icon(LucideIcons.keyboard, size: 18),
          label: const Text('Type it instead'),
        ),
      ],
    );
  }
}

class _TypeSheet extends StatefulWidget {
  const _TypeSheet();

  @override
  State<_TypeSheet> createState() => _TypeSheetState();
}

class _TypeSheetState extends State<_TypeSheet> {
  final _form = GlobalKey<FormState>();
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    Navigator.of(context).pop(Rules.normalizeTrackingNumber(_code.text));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpace.lg,
        0,
        AppSpace.lg,
        AppSpace.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Type the tracking number',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: AppSpace.md),
            AppTextField(
              label: 'Tracking number',
              hint: 'LIT-261017-AB12CD',
              controller: _code,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [Only.trackingChars, Only.upper],
              maxLength: 20,
              validator: Rules.trackingNumber,
              textInputAction: TextInputAction.done,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpace.lg),
            FilledButton(
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: _submit,
              child: const Text('Tick it off'),
            ),
          ],
        ),
      ),
    );
  }
}
