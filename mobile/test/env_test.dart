import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/env.dart';

void main() {
  group('Env.mediaUrlFor', () {
    const emulatorApi = 'http://10.0.2.2:8000/api/v1';

    test('moves a localhost photo link to the API host', () {
      expect(
        Env.mediaUrlFor(
          'http://localhost:8000/storage/products/a.jpg',
          emulatorApi,
        ),
        'http://10.0.2.2:8000/storage/products/a.jpg',
      );
      expect(
        Env.mediaUrlFor(
          'http://127.0.0.1:8000/storage/b.png?v=2',
          'http://192.168.1.5:8000/api/v1',
        ),
        'http://192.168.1.5:8000/storage/b.png?v=2',
      );
    });

    test('leaves other links alone', () {
      const live = 'https://api.loved-it.shop/storage/products/a.jpg';
      expect(Env.mediaUrlFor(live, emulatorApi), live);
      expect(Env.mediaUrlFor('', emulatorApi), '');
    });
  });
}
