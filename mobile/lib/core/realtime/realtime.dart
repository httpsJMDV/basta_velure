import 'dart:async';

import 'package:dart_pusher_channels/dart_pusher_channels.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../env.dart';
import '../session/session.dart';
import '../session/token_store.dart';

/// Live updates from Laravel Reverb, the same server and channels as the website's Echo. Null while signed out.
///
/// Screens never depend on it: when the connection drops they still work by refreshing, and lists that matter also
/// check every 30 seconds, as the website does.
final realtimeProvider = Provider<Realtime?>((ref) {
  final userId = ref.watch(currentUserProvider.select((user) => user?.id));
  if (userId == null) return null;
  final realtime = Realtime(
    userId: userId,
    tokenStore: ref.read(tokenStoreProvider),
  );
  ref.onDispose(realtime.dispose);
  return realtime;
});

class Realtime {
  Realtime({required this.userId, required this.tokenStore});

  /// Laravel's event name for a database notification pushed to the user's channel.
  static const notificationEvent =
      r'Illuminate\Notifications\Events\BroadcastNotificationCreated';

  final int userId;
  final TokenStore tokenStore;

  PusherChannelsClient? _client;
  StreamSubscription<void>? _connected;
  String? _token;
  Future<void>? _ready;
  bool _disposed = false;
  final _channels = <String, PrivateChannel>{};

  /// The bell: `private-App.Models.User.{id}`. Each event is the notification's data.
  Stream<Map<String, dynamic>> notifications() =>
      listen('App.Models.User.$userId', notificationEvent);

  /// The conversation list and unread count: `private-user.{id}.conversations`.
  Stream<Map<String, dynamic>> conversationUpdates() =>
      listen('user.$userId.conversations', 'ConversationUpdated');

  /// One open chat: `private-conversation.{id}`, events `MessageSent` and `MessageRead`.
  Stream<Map<String, dynamic>> conversationEvents(
    int conversationId,
    String event,
  ) => listen('conversation.$conversationId', event);

  /// Events named [event] on the private channel [channel] (written without the `private-` prefix).
  Stream<Map<String, dynamic>> listen(String channel, String event) async* {
    await (_ready ??= _connect());
    final client = _client;
    if (client == null || _disposed) return;
    final subscribed = _channels.putIfAbsent(channel, () {
      final created = client.privateChannel(
        'private-$channel',
        authorizationDelegate:
            EndpointAuthorizableChannelTokenAuthorizationDelegate.forPrivateChannel(
              authorizationEndpoint: Uri.parse(Env.broadcastAuthUrl),
              headers: {
                'Authorization': 'Bearer $_token',
                'Accept': 'application/json',
              },
              onAuthFailed: (error, trace) {
                if (kDebugMode) debugPrint('Realtime: could not join $channel');
              },
            ),
      );
      // Before the socket is up this only marks the channel pending; it joins when the connection is established.
      created.subscribe();
      return created;
    });
    yield* subscribed
        .bind(event)
        .map((e) => e.tryGetDataAsMap() ?? const <String, dynamic>{});
  }

  /// Stop listening to a channel, for example when a chat screen closes.
  void leave(String channel) => _channels.remove(channel)?.unsubscribe();

  Future<void> _connect() async {
    // Without a key (no dart_defines) live updates are simply off; screens refresh instead.
    if (Env.reverbKey.isEmpty) return;
    _token = await tokenStore.read();
    if (_token == null || _disposed) return;

    final client = PusherChannelsClient.websocket(
      options: PusherChannelsOptions.fromHost(
        scheme: Env.wsScheme == 'https' ? 'wss' : 'ws',
        host: Env.wsHost,
        port: Env.wsPort,
        key: Env.reverbKey,
        shouldSupplyMetadataQueries: true,
        metadata: PusherChannelsOptionsMetadata.byDefault(),
      ),
      // Lost connection: try again (the package waits between tries).
      connectionErrorHandler: (error, trace, refresh) => refresh(),
      minimumReconnectDelayDuration: const Duration(seconds: 3),
    );
    _client = client;
    _connected = client.onConnectionEstablished.listen((_) {
      for (final channel in _channels.values) {
        channel.subscribeIfNotUnsubscribed();
      }
    });
    unawaited(client.connect());
  }

  void dispose() {
    _disposed = true;
    _connected?.cancel();
    _channels.clear();
    _client?.dispose();
    _client = null;
  }
}
