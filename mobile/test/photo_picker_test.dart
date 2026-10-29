import 'package:flutter_test/flutter_test.dart';
import 'package:loved_it/core/media/photo_picker.dart';

/// Task A7: photos leave the phone with their long side at 1600 px at most, never enlarged.
void main() {
  test('a 12 MP photo is asked for at the short side that makes the long side 1600', () {
    // 4000 x 3000: flutter_image_compress divides by min(4000 / 1200, 3000 / 1200) = 2.5, giving 1600 x 1200.
    expect(PhotoPicker.shortSideFor(4000, 3000), 1200);
  });

  test('a small photo is left at its size', () {
    expect(PhotoPicker.shortSideFor(1200, 900), 900);
    expect(PhotoPicker.shortSideFor(1600, 1200), 1200);
  });

  test('upload limits match the server', () {
    expect(UploadKind.image.maxBytes, 5 * 1024 * 1024);
    expect(UploadKind.document.maxBytes, 5 * 1024 * 1024);
    expect(UploadKind.proofPhoto.maxBytes, 8 * 1024 * 1024);
  });
}
