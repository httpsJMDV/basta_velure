import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Android renders one page at a time; document bytes never go to a public viewer or gallery.
class PrivatePdfView extends StatefulWidget {
  const PrivatePdfView({super.key, required this.bytes});
  final Uint8List bytes;
  @override
  State<PrivatePdfView> createState() => _PrivatePdfViewState();
}

class _PrivatePdfViewState extends State<PrivatePdfView> {
  static const _channel = MethodChannel('shop.lovedit/pdf');
  String? _handle;
  int _pages = 0, _page = 0;
  Uint8List? _image;
  String? _error;
  bool _busy = true;
  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      final doc = await _channel.invokeMapMethod<String, dynamic>('open', {
        'bytes': widget.bytes,
      });
      final handle = doc!['handle'] as String;
      if (!mounted) {
        await _channel.invokeMethod<void>('close', {'handle': handle});
        return;
      }
      _handle = handle;
      _pages = doc['pages'] as int;
      await _render(0);
    } on PlatformException catch (_) {
      if (mounted) {
        setState(() {
          _error = 'This PDF could not be opened. It may be damaged or password protected.';
          _busy = false;
        });
      }
    } on MissingPluginException catch (_) {
      if (mounted) {
        setState(() {
          _error = 'PDF viewing is available in the Android release.';
          _busy = false;
        });
      }
    }
  }

  Future<void> _render(int page) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final image = await _channel.invokeMethod<Uint8List>('render', {
        'handle': _handle,
        'page': page,
        'width': 1400,
      });
      if (mounted) {
        setState(() {
          _image = image;
          _page = page;
          _busy = false;
        });
      }
    } on PlatformException catch (_) {
      if (mounted) {
        setState(() {
          _error = 'This page could not be displayed. Try again.';
          _busy = false;
        });
      }
    }
  }

  @override
  void dispose() {
    if (_handle != null) {
      _channel.invokeMethod<void>('close', {'handle': _handle});
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Material(
        color: Colors.white,
        child: SafeArea(
          bottom: false,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                tooltip: 'Previous page',
                onPressed: !_busy && _page > 0
                    ? () => _render(_page - 1)
                    : null,
                icon: const Icon(Icons.chevron_left),
              ),
              Text(
                _pages == 0
                    ? 'Opening document…'
                    : 'Page ${_page + 1} of $_pages',
              ),
              IconButton(
                tooltip: 'Next page',
                onPressed: !_busy && _page + 1 < _pages
                    ? () => _render(_page + 1)
                    : null,
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ),
      ),
      Expanded(
        child: _busy
            ? const Center(child: CircularProgressIndicator())
            : _error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _error!,
                        style: const TextStyle(color: Colors.white),
                      ),
                      TextButton(
                        onPressed: _handle == null
                            ? _open
                            : () => _render(_page),
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              )
            : InteractiveViewer(
                key: ValueKey(_page),
                maxScale: 5,
                child: Center(
                  child: Image.memory(
                    _image!,
                    gaplessPlayback: true,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
      ),
    ],
  );
}
