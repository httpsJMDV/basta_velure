import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';

import '../theme/app_theme.dart';
import 'permissions.dart';

/// The server's limits for each kind of upload. Photos always leave the phone as JPEG, which every kind accepts.
enum UploadKind {
  /// Avatars, GCash receipts, review and return photos: JPG or PNG, 5 MB (`Validation::image`).
  image(5 * 1024 * 1024, 'JPG or PNG', '5 MB'),

  /// IDs and documents: JPG, PNG or PDF, 5 MB (`Validation::document`). This picker sends photos; a PDF needs a file
  /// picker, which is not part of the app yet.
  document(5 * 1024 * 1024, 'JPG, PNG or PDF', '5 MB'),

  /// A rider's proof of delivery: JPG, PNG or WEBP, 8 MB.
  proofPhoto(8 * 1024 * 1024, 'JPG, PNG or WEBP', '8 MB');

  const UploadKind(this.maxBytes, this.types, this.limitLabel);

  final int maxBytes;
  final String types;
  final String limitLabel;
}

/// A photo ready to upload: shrunk, re-encoded as JPEG and stripped of its hidden data (EXIF, GPS location).
/// It lives in memory only, so nothing of an ID or receipt stays in the app's files after the upload.
class PickedPhoto {
  const PickedPhoto({required this.bytes, required this.filename});

  final List<int> bytes;
  final String filename;

  int get length => bytes.length;

  MultipartFile toMultipart() => MultipartFile.fromBytes(
    bytes,
    filename: filename,
    contentType: DioMediaType('image', 'jpeg'),
  );
}

/// A photo the app refused before uploading. Show [message] under the field.
class PhotoRejected implements Exception {
  const PhotoRejected(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Camera and gallery for every photo in the app (ID, GCash receipt, review and return photos, proof photos).
///
/// ```dart
/// try {
///   final photo = await PhotoPicker().takePhoto(context, reason: 'Take a photo of the front of your ID.');
///   if (photo == null) return; // cancelled
///   form.files.add(MapEntry('government_id_image', photo.toMultipart()));
/// } on PhotoRejected catch (e) {
///   setState(() => idError = e.message);
/// }
/// ```
class PhotoPicker {
  PhotoPicker({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  /// The long side of every photo after shrinking, and its JPEG quality.
  static const maxSide = 1600;
  static const quality = 80;

  static const _readable = {'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'};

  final ImagePicker _picker;

  /// Camera only, after saying why. Proof photos must come from here, never the gallery.
  Future<PickedPhoto?> takePhoto(
    BuildContext context, {
    required String reason,
    UploadKind kind = UploadKind.image,
  }) async {
    final allowed = await askPermission(
      context,
      Permission.camera,
      title: 'Use the camera?',
      reason: reason,
    );
    if (!allowed) return null;
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      requestFullMetadata: false,
    );
    return file == null ? null : prepare(file, kind);
  }

  /// The phone's photo picker (no storage permission needed on current Android).
  Future<PickedPhoto?> chooseFromGallery({
    UploadKind kind = UploadKind.image,
  }) async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      requestFullMetadata: false,
    );
    return file == null ? null : prepare(file, kind);
  }

  /// "Take photo" or "Choose from gallery" in a bottom sheet.
  Future<PickedPhoto?> pick(
    BuildContext context, {
    required String reason,
    UploadKind kind = UploadKind.image,
  }) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpace.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(LucideIcons.camera),
                title: const Text('Take photo'),
                onTap: () => Navigator.of(context).pop(ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(LucideIcons.image),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.of(context).pop(ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !context.mounted) return null;
    return source == ImageSource.camera
        ? takePhoto(context, reason: reason, kind: kind)
        : chooseFromGallery(kind: kind);
  }

  /// Checks the type, shrinks the long side to [maxSide], re-encodes as JPEG at [quality] (which drops EXIF and GPS)
  /// and refuses anything still over the limit. The picked original is deleted from the app's cache.
  Future<PickedPhoto> prepare(XFile file, UploadKind kind) async {
    try {
      final extension = file.path.split('.').last.toLowerCase();
      if (!_readable.contains(extension)) {
        throw PhotoRejected('Choose a photo (${kind.types}).');
      }

      final target = await _targetShortSide(file.path);
      final bytes = await FlutterImageCompress.compressWithFile(
        file.path,
        minWidth: target,
        minHeight: target,
        quality: quality,
        format: CompressFormat.jpeg,
        keepExif: false,
      );
      if (bytes == null || bytes.isEmpty) {
        throw const PhotoRejected(
          "This photo couldn't be opened. Try another one.",
        );
      }
      if (bytes.length > kind.maxBytes) {
        throw PhotoRejected(
          'This photo is still larger than ${kind.limitLabel} after shrinking. Try another photo.',
        );
      }
      return PickedPhoto(
        bytes: bytes,
        filename: 'photo-${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
    } finally {
      // image_picker copies the photo into the app's cache: don't keep it there.
      try {
        await File(file.path).delete();
      } on FileSystemException {
        // Already gone.
      }
    }
  }

  /// flutter_image_compress scales by `min(width / minWidth, height / minHeight)` and never enlarges. Giving both the
  /// short side the photo will have once its long side is [maxSide] makes the long side exactly [maxSide], whichever
  /// way the photo is turned.
  static Future<int> _targetShortSide(String path) async {
    try {
      final buffer = await ui.ImmutableBuffer.fromFilePath(path);
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      final long = math.max(descriptor.width, descriptor.height);
      final short = math.min(descriptor.width, descriptor.height);
      descriptor.dispose();
      buffer.dispose();
      return shortSideFor(long, short);
    } catch (_) {
      // Size unknown (some HEIC files): keep the short side at most maxSide.
      return maxSide;
    }
  }

  /// The short side to ask for, so the long side ends up at most [maxSide]. Small photos are left as they are.
  static int shortSideFor(int long, int short) {
    if (long <= maxSide || long <= 0) return math.max(short, 1);
    return math.max((maxSide * short / long).round(), 1);
  }
}
