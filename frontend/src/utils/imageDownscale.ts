export interface DownscaleResult {
  /** The file to upload: the shrunken JPEG, or the original if the browser could not (or need not) shrink it. */
  file: File;
  /** True when `file` is a newly encoded, smaller JPEG. */
  downscaled: boolean;
}

/** Longest edge, in pixels, of a proof photo before upload. */
export const PROOF_MAX_EDGE = 1600;
export const PROOF_JPEG_QUALITY = 0.8;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    // 'from-image' applies the camera's EXIF rotation so portrait photos are not drawn sideways.
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Shrinks a photo in the browser before it is uploaded: draws it onto a canvas with the long edge at
 * most `maxEdge` px and exports a JPEG. If anything about that is unsupported or fails, the original
 * file is returned untouched, so uploading never gets worse than it was. No dependency is needed.
 */
export async function downscaleImage(
  file: File,
  maxEdge: number = PROOF_MAX_EDGE,
  quality: number = PROOF_JPEG_QUALITY
): Promise<DownscaleResult> {
  const original: DownscaleResult = { file, downscaled: false };

  try {
    const bitmap = await loadBitmap(file);
    const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
    const height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
    if (!width || !height) return original;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    // JPEG has no transparency; paint white first so a transparent PNG does not turn black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if ('close' in bitmap) bitmap.close();

    const blob = await toJpegBlob(canvas, quality);
    if (!blob || blob.size === 0) return original;

    // Already small and already a JPEG: re-encoding would only lose quality.
    if (scale === 1 && file.type === 'image/jpeg' && blob.size >= file.size) return original;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'proof';
    return { file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }), downscaled: true };
  } catch {
    return original;
  }
}

/** "412 KB" / "4.1 MB" for showing a file size to the rider. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
