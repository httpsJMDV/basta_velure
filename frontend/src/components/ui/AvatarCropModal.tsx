import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react';

interface AvatarCropModalProps {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export default function AvatarCropModal({ file, onConfirm, onCancel }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  const CANVAS_SIZE = 320;

  // Load image — revoke only after load/error, not in cleanup, to avoid
  // Strict Mode double-invoke revoking the URL before the image decodes.
  useEffect(() => {
    let url: string | null = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (url) { URL.revokeObjectURL(url); url = null; }
      setImgEl(img);
      const fit = CANVAS_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      setScale(fit);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
    img.src = url;
    return () => { if (url) { URL.revokeObjectURL(url); url = null; } };
  }, [file]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgEl) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const w = imgEl.naturalWidth * scale;
    const h = imgEl.naturalHeight * scale;
    const x = (CANVAS_SIZE - w) / 2 + offset.x;
    const y = (CANVAS_SIZE - h) / 2 + offset.y;

    ctx.drawImage(imgEl, x, y, w, h);

    // Dim overlay with circular cutout
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [imgEl, scale, offset]);

  useEffect(() => { draw(); }, [draw]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
      y: dragStart.current.oy + (e.clientY - dragStart.current.my),
    });
  };
  const onMouseUp = () => setDragging(false);

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setDragging(true);
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: offset.x, oy: offset.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    const t = e.touches[0];
    setOffset({
      x: dragStart.current.ox + (t.clientX - dragStart.current.mx),
      y: dragStart.current.oy + (t.clientY - dragStart.current.my),
    });
  };

  function handleConfirm() {
    if (!imgEl) return;
    // Re-draw directly from the source image (no overlay) so the output is clean.
    const CROP_RADIUS = CANVAS_SIZE / 2 - 8; // matches the circular cutout
    const out = document.createElement('canvas');
    out.width = 400;
    out.height = 400;
    const ctx = out.getContext('2d')!;

    // Map the visible circle region back to source image coordinates.
    const w = imgEl.naturalWidth * scale;
    const h = imgEl.naturalHeight * scale;
    // Top-left of the image on the preview canvas
    const imgX = (CANVAS_SIZE - w) / 2 + offset.x;
    const imgY = (CANVAS_SIZE - h) / 2 + offset.y;
    // Top-left of the crop circle on the preview canvas
    const circleLeft = CANVAS_SIZE / 2 - CROP_RADIUS;
    const circleTop  = CANVAS_SIZE / 2 - CROP_RADIUS;
    // Offset of the crop circle relative to the image
    const srcX = (circleLeft - imgX) / scale;
    const srcY = (circleTop  - imgY) / scale;
    const srcSize = (CROP_RADIUS * 2) / scale;

    ctx.drawImage(imgEl, srcX, srcY, srcSize, srcSize, 0, 0, 400, 400);
    out.toBlob((blob) => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.88);
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-brand-black">Crop Profile Photo</p>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-black hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-gray-400 text-center">Drag to reposition · Use the slider to zoom</p>

          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="rounded-xl cursor-grab active:cursor-grabbing touch-none"
            style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
          />

          {/* Zoom slider */}
          <div className="flex items-center gap-3 w-full">
            <button onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ZoomOut className="w-4 h-4 text-gray-500" />
            </button>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="flex-1 accent-brand-red"
            />
            <button onClick={() => setScale((s) => Math.min(3, s + 0.1))} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ZoomIn className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-red text-white text-sm font-semibold rounded-xl hover:bg-brand-red-dark transition-colors"
          >
            <Check className="w-4 h-4" /> Use Photo
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
