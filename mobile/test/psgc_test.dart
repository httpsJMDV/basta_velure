import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/api/api_failure.dart';
import 'package:loved_it/features/buyer/addresses/psgc.dart';

import 'support/fakes.dart';

/// The place list labels its JSON as a web page (`Content-Type: text/html`), so these answer the way the real one does.
/// Reading that wrongly looked like having no internet, on the address form and everywhere places are named.
void main() {
  ResponseBody asTheRealServiceAnswers(String body, {int status = 200}) =>
      ResponseBody.fromString(
        body,
        status,
        headers: {
          Headers.contentTypeHeader: ['text/html; charset=utf-8'],
        },
      );

  test('reads a list labelled as a web page, in order', () async {
    final psgc = Psgc(
      adapter: FakeApi({
        'GET /regions/040000000/provinces/': (_) => asTheRealServiceAnswers(
          '[{"code":"045600000","name":"Quezon"},{"code":"043400000","name":"Laguna"}]',
        ),
      }),
    );

    final provinces = await psgc.provinces('040000000');

    expect(provinces.map((p) => p.name), ['Laguna', 'Quezon']);
    expect(provinces.first.code, '043400000');
    psgc.close();
  });

  test('names a barangay and its city', () async {
    final psgc = Psgc(
      adapter: FakeApi({
        'GET /barangays/043405001/': (_) => asTheRealServiceAnswers(
          '{"name":"Poblacion","cityCode":false,"municipalityCode":"043421000"}',
        ),
        'GET /cities-municipalities/043421000/': (_) =>
            asTheRealServiceAnswers('{"name":"Pila"}'),
      }),
    );

    expect(await psgc.barangayNames(['043405001']), {
      '043405001': 'Poblacion, Pila',
    });
    psgc.close();
  });

  test('a real lack of internet still says so', () async {
    final psgc = Psgc(adapter: FakeApi({}));

    await expectLater(
      psgc.provinces('040000000'),
      throwsA(
        isA<ApiFailure>().having((f) => f.kind, 'kind', FailureKind.network),
      ),
    );
    psgc.close();
  });

  test('an answer that isn\'t the list doesn\'t blame the internet', () async {
    final psgc = Psgc(
      adapter: FakeApi({
        'GET /regions/040000000/provinces/': (_) =>
            asTheRealServiceAnswers('<html>Maintenance</html>'),
      }),
    );

    await expectLater(
      psgc.provinces('040000000'),
      throwsA(
        isA<ApiFailure>().having((f) => f.kind, 'kind', FailureKind.server),
      ),
    );
    psgc.close();
  });
}
