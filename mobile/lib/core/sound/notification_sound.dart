import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// One notification sound. The ids match the website's (`frontend/src/lib/notificationSound.ts`) and the files in
/// `assets/sounds`, made by `setup/make-notification-sounds.mjs`.
class NotificationSound {
  const NotificationSound(this.id, this.name, this.hint);

  final String id;
  final String name;
  final String hint;

  bool get isOff => id == off;

  static const off = 'off';
  static const fallback = 'chime';

  static const all = [
    NotificationSound('chime', 'Chime', 'Two soft rising notes'),
    NotificationSound('ding', 'Ding', 'One small bell'),
    NotificationSound('glass', 'Glass', 'A clear, high ping'),
    NotificationSound('marimba', 'Marimba', 'Three wooden notes'),
    NotificationSound('bloom', 'Bloom', 'A gentle four-note rise'),
    NotificationSound('pulse', 'Pulse', 'Two short beeps'),
    NotificationSound('pop', 'Pop', 'A round bubble pop'),
    NotificationSound('twinkle', 'Twinkle', 'A bright little lift'),
    NotificationSound(off, 'No sound', 'Notifications stay silent'),
  ];

  static NotificationSound byId(String? id) =>
      all.where((s) => s.id == id).firstOrNull ?? all.first;
}

/// Where the chosen sound is kept on the phone. Tests use a memory store.
abstract class SoundStore {
  Future<String?> read();
  Future<void> write(String id);
}

class SecureSoundStore implements SoundStore {
  SecureSoundStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'notification_sound';
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() async {
    try {
      return await _storage.read(key: _key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String id) async {
    try {
      await _storage.write(key: _key, value: id);
    } catch (_) {
      // Not saved: the choice lasts until the app closes.
    }
  }
}

final soundStoreProvider = Provider<SoundStore>((ref) => SecureSoundStore());

/// The chosen sound's id. Starts on the default and switches to the saved one as soon as it is read.
final notificationSoundProvider =
    NotifierProvider<NotificationSoundChoice, String>(
      NotificationSoundChoice.new,
    );

class NotificationSoundChoice extends Notifier<String> {
  bool _changed = false;

  @override
  String build() {
    ref.read(soundStoreProvider).read().then((saved) {
      if (!_changed && saved != null) {
        state = NotificationSound.byId(saved).id;
      }
    });
    return NotificationSound.fallback;
  }

  void choose(String id) {
    _changed = true;
    state = NotificationSound.byId(id).id;
    ref.read(soundStoreProvider).write(state);
  }
}

final soundPlayerProvider = Provider<SoundPlayer>((ref) => SoundPlayer());

/// Plays a sound through MainActivity's `shop.lovedit/sound` channel (Android's notification volume, so silent and
/// Do Not Disturb keep it quiet). Several things arriving together make one sound.
class SoundPlayer {
  SoundPlayer({
    AssetBundle? bundle,
    this.quietGap = const Duration(milliseconds: 2500),
  }) : _bundle = bundle ?? rootBundle;

  final AssetBundle _bundle;
  final Duration quietGap;
  final _bytes = <String, Uint8List>{};
  DateTime? _last;

  static const _channel = MethodChannel('shop.lovedit/sound');

  /// How many sounds were asked for and played, for tests.
  @visibleForTesting
  final played = <String>[];

  /// Plays [id]. A [preview] (the settings list) ignores the quiet gap. Returns false when nothing played.
  Future<bool> play(String id, {bool preview = false}) async {
    if (id == NotificationSound.off) return false;
    final now = DateTime.now();
    if (!preview && _last != null && now.difference(_last!) < quietGap) {
      return false;
    }
    _last = now;
    played.add(id);
    try {
      final bytes = _bytes[id] ??= (await _bundle.load('assets/sounds/$id.wav'))
          .buffer
          .asUint8List();
      await _channel.invokeMethod<bool>('play', {'name': id, 'bytes': bytes});
      return true;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    } on FlutterError {
      // The file is missing from this build.
      return false;
    }
  }
}
