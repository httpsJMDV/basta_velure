import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';

import '../theme/app_theme.dart';
import 'permissions.dart';

/// The server's limits for each kind of upload. Photos leave the phone as JPEG (PNG when the phone's JPEG encoder
/// can't read one), which every kind accepts.
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
  const PickedPhoto({
    required this.bytes,
    required this.filename,
    this.subtype = 'jpeg',
  });

  final List<int> bytes;
  final String filename;

  /// `jpeg`, or `png` when the phone's JPEG encoder failed and Flutter's own encoder made the file.
  final String subtype;

  int get length => bytes.length;

  MultipartFile toMultipart() => MultipartFile.fromBytes(
    bytes,
    filename: filename,
    contentType: DioMediaType('image', subtype),
  );
}

/// Photos picked together, and why one was left out (the first refusal), if any.
class PickedPhotos {
  const PickedPhotos(this.photos, {this.rejected});

  final List<PickedPhoto> photos;
  final String? rejected;
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

  final ImagePicker _picker;

  /// One photo from the camera or the gallery. The picker's own errors (camera refused, no camera, a cloud photo
  /// that couldn't be downloaded) become a [PhotoRejected] with words to act on, instead of failing silently.
  Future<XFile?> _pickOne(ImageSource source) async {
    try {
      return await _picker.pickImage(
        source: source,
        requestFullMetadata: false,
      );
    } on PlatformException catch (error) {
      throw PhotoRejected(pickerMessage(error.code, source));
    }
  }

  /// What to say when the phone's picker refused, by its error code.
  @visibleForTesting
  static String pickerMessage(String code, ImageSource source) {
    final camera = source == ImageSource.camera;
    return switch (code) {
      'camera_access_denied' => 'Loved-IT is not allowed to use the camera. Turn it on in Settings, or choose a photo from the gallery.',
      'photo_access_denied' => 'Loved-IT is not allowed to open your photos. Turn it on in Settings, or take a photo instead.',
      'no_available_camera' => 'No camera is available on this phone. Choose a photo from the gallery instead.',
      'already_active' => 'The camera is already open. Try again.',
      'missing_valid_image_uri' || 'invalid_image' => "That photo couldn't be opened. If it is only in the cloud, download it first, or take a new photo.",
      _ =>
        camera
            ? "The camera couldn't be opened. Try again, or choose a photo from the gallery."
            : "Your photos couldn't be opened. Try again, or take a photo instead.",
    };
  }

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
    final file = await _pickOne(ImageSource.camera);
    return file == null ? null : prepare(file, kind);
  }

  /// The phone's photo picker (no storage permission needed on current Android).
  Future<PickedPhoto?> chooseFromGallery({
    UploadKind kind = UploadKind.image,
  }) async {
    final file = await _pickOne(ImageSource.gallery);
    return file == null ? null : prepare(file, kind);
  }

  /// Up to [max] photos at once from the phone's photo picker. Each is prepared like [chooseFromGallery]; one that
  /// can't be used is left out and named in [PickedPhotos.rejected], and the rest still come back.
  Future<PickedPhotos> chooseSeveralFromGallery({
    required int max,
    UploadKind kind = UploadKind.image,
  }) async {
    if (max <= 0) return const PickedPhotos([]);
    final List<XFile> files;
    try {
      files = max == 1
          ? [?await _pickOne(ImageSource.gallery)]
          : await _picker.pickMultiImage(
              limit: max,
              requestFullMetadata: false,
            );
    } on PlatformException catch (error) {
      return PickedPhotos(
        const [],
        rejected: pickerMessage(error.code, ImageSource.gallery),
      );
    } on PhotoRejected catch (error) {
      return PickedPhotos(const [], rejected: error.message);
    }
    final photos = <PickedPhoto>[];
    String? rejected;
    // Every picked file is prepared (and so deleted from the cache), even past the limit or after a refusal.
    for (final file in files) {
      try {
        final photo = await prepare(file, kind);
        if (photos.length < max) photos.add(photo);
      } on PhotoRejected catch (error) {
        rejected ??= error.message;
      }
    }
    return PickedPhotos(photos, rejected: rejected);
  }

  /// "Take photo" or "Choose from gallery" (several at once, up to [max]) in a bottom sheet.
  Future<PickedPhotos> pickSeveral(
    BuildContext context, {
    required String reason,
    required int max,
    UploadKind kind = UploadKind.image,
  }) async {
    final source = await _askSource(context, several: max > 1);
    if (source == null || !context.mounted) return const PickedPhotos([]);
    if (source == ImageSource.gallery) {
      return chooseSeveralFromGallery(max: max, kind: kind);
    }
    try {
      final photo = await takePhoto(context, reason: reason, kind: kind);
      return PickedPhotos([?photo]);
    } on PhotoRejected catch (error) {
      return PickedPhotos(const [], rejected: error.message);
    }
  }

  Future<ImageSource?> _askSource(
    BuildContext context, {
    bool several = false,
  }) => showModalBottomSheet<ImageSource>(
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
              title: Text(several ? 'Choose photos' : 'Choose from gallery'),
              onTap: () => Navigator.of(context).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    ),
  );

  /// "Take photo" or "Choose from gallery" in a bottom sheet.
  Future<PickedPhoto?> pick(
    BuildContext context, {
    required String reason,
    UploadKind kind = UploadKind.image,
  }) async {
    final source = await _askSource(context);
    if (source == null || !context.mounted) return null;
    return source == ImageSource.camera
        ? takePhoto(context, reason: reason, kind: kind)
        : chooseFromGallery(kind: kind);
  }

  /// Checks the type, shrinks the long side to [maxSide], re-encodes as JPEG at [quality] (which drops EXIF and GPS)
  /// and refuses anything still over the limit. The picked original is deleted from the app's cache.
  ///
  /// Some phones' JPEG encoder fails on some photos (HEIC from newer cameras, odd sizes). Then Flutter decodes and
  /// re-draws the photo itself and sends a PNG, which also carries no hidden data. Only a photo neither can open is
  /// refused, whatever its file name says.
  Future<PickedPhoto> prepare(XFile file, UploadKind kind) async {
    try {
      final stamp = DateTime.now().millisecondsSinceEpoch;
      final jpeg = await _jpeg(file.path);
      if (jpeg != null && jpeg.length <= kind.maxBytes) {
        return PickedPhoto(bytes: jpeg, filename: 'photo-$stamp.jpg');
      }
      final png = await redrawAsPng(
        await File(file.path).readAsBytes(),
        maxBytes: kind.maxBytes,
      );
      if (png != null) {
        return PickedPhoto(
          bytes: png,
          filename: 'photo-$stamp.png',
          subtype: 'png',
        );
      }
      if (jpeg != null) {
        throw PhotoRejected(
          'This photo is still larger than ${kind.limitLabel} after shrinking. Try another photo.',
        );
      }
      throw PhotoRejected(
        "This photo couldn't be opened. Choose a ${kind.types.replaceAll(', PDF', '')} photo, or take a new one.",
      );
    } on FileSystemException {
      throw const PhotoRejected(
        "This photo couldn't be read. Try again, or take a new photo.",
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

  /// The phone's own JPEG encoder, or null when it can't read this photo.
  static Future<List<int>?> _jpeg(String path) async {
    try {
      final target = await _targetShortSide(path);
      final bytes = await FlutterImageCompress.compressWithFile(
        path,
        minWidth: target,
        minHeight: target,
        quality: quality,
        format: CompressFormat.jpeg,
        keepExif: false,
      );
      return bytes == null || bytes.isEmpty ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  /// Decodes [bytes] with Flutter, scales the long side to [maxSide] (then smaller, until it fits [maxBytes]) and
  /// encodes a PNG. Null when Flutter can't decode it either.
  @visibleForTesting
  static Future<Uint8List?> redrawAsPng(
    Uint8List bytes, {
    required int maxBytes,
  }) async {
    for (final side in const [maxSide, 1200, 900]) {
      ui.Codec? codec;
      ui.Image? image;
      try {
        final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
        codec = await ui.instantiateImageCodecWithSize(
          buffer,
          getTargetSize: (width, height) {
            final long = math.max(width, height);
            if (long <= side) {
              return ui.TargetImageSize(width: width, height: height);
            }
            final scale = side / long;
            return ui.TargetImageSize(
              width: math.max((width * scale).round(), 1),
              height: math.max((height * scale).round(), 1),
            );
          },
        );
        image = (await codec.getNextFrame()).image;
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        if (data == null) return null;
        final png = data.buffer.asUint8List();
        if (png.length <= maxBytes) return png;
      } catch (_) {
        return null;
      } finally {
        image?.dispose();
        codec?.dispose();
      }
    }
    return null;
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
