import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_failure.dart';
import '../../../core/api/json.dart';

final portalApiProvider = Provider((ref) => PortalApi(ref.watch(dioProvider)));

/// Existing, server-authorized portal operations. Amounts and eligibility come from the API.
class PortalApi {
  PortalApi(this._dio);
  final Dio _dio;
  Future<Json> get(String path, {Json? query}) =>
      call('GET', path, query: query);
  Future<Json> call(
    String method,
    String path, {
    Object? data,
    Json? query,
  }) async {
    try {
      return asJson(
        (await _dio.request<Object?>(
          path,
          data: data,
          queryParameters: query,
          options: Options(method: method),
        )).data,
      );
    } on DioException catch (e) {
      throw ApiFailure.fromDio(e);
    }
  }

  Future<List<int>> bytes(String path) async {
    try {
      return (await _dio.get<List<int>>(
            path,
            options: Options(responseType: ResponseType.bytes),
          )).data ??
          [];
    } on DioException catch (e) {
      throw ApiFailure.fromDio(e);
    }
  }
}
