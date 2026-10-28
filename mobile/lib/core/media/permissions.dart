import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../widgets/states.dart';

/// Asks for a permission only when it is needed, after saying why in one sentence. If it was turned off for good,
/// offers the phone's Settings instead of asking again. Returns true when the app may go ahead.
///
/// ```dart
/// if (!await askPermission(context, Permission.camera,
///     title: 'Use the camera?', reason: 'Take a photo of the front of your ID.')) return;
/// ```
Future<bool> askPermission(
  BuildContext context,
  Permission permission, {
  required String title,
  required String reason,
}) async {
  var status = await permission.status;
  if (status.isGranted || status.isLimited) return true;
  if (!context.mounted) return false;

  if (status.isPermanentlyDenied || status.isRestricted) {
    final openSettings = await confirmAction(
      context,
      title: title,
      message: '$reason It is turned off for Loved-IT. Turn it on in Settings.',
      confirmLabel: 'Open Settings',
      cancelLabel: 'Not now',
    );
    if (openSettings) await openAppSettings();
    return false;
  }

  final proceed = await confirmAction(
    context,
    title: title,
    message: reason,
    confirmLabel: 'Continue',
    cancelLabel: 'Not now',
  );
  if (!proceed) return false;
  status = await permission.request();
  return status.isGranted || status.isLimited;
}
