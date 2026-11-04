import 'package:flutter/services.dart';

/// Android's share sheet for a line of text (MainActivity's `shop.lovedit/share` channel), so the app needs no share
/// package. Returns false when the sheet couldn't open (no app to share with, or a platform without the channel, like
/// tests); the caller then copies the text instead.
Future<bool> shareText(
  String text, {
  String? subject,
  String title = 'Share',
}) async {
  try {
    return await const MethodChannel('shop.lovedit/share').invokeMethod<bool>(
          'text',
          {'text': text, 'subject': subject, 'title': title},
        ) ??
        false;
  } on PlatformException {
    return false;
  } on MissingPluginException {
    return false;
  }
}
