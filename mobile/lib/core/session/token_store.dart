import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the sign-in token lives. Only ever secure storage (the Android Keystore): never SharedPreferences, a file,
/// a log or a crash report.
abstract interface class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'token';
  final FlutterSecureStorage _storage;

  // Every request reads the token; the Keystore is slow, so it is read once and kept in memory.
  String? _cached;
  bool _loaded = false;

  @override
  Future<String?> read() async {
    if (_loaded) return _cached;
    try {
      _cached = await _storage.read(key: _key);
    } on PlatformException {
      // The Keystore entry can't be decrypted (for example after a device restore): start signed out.
      await _storage.delete(key: _key).catchError((_) {});
      _cached = null;
    }
    _loaded = true;
    return _cached;
  }

  @override
  Future<void> write(String token) async {
    _cached = token;
    _loaded = true;
    await _storage.write(key: _key, value: token);
  }

  @override
  Future<void> clear() async {
    _cached = null;
    _loaded = true;
    await _storage.delete(key: _key);
  }
}
