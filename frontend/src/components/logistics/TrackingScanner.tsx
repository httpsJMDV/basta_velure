import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Camera, CameraOff, Keyboard, RefreshCw } from 'lucide-react';

// The BarcodeDetector API is not in the TypeScript DOM lib yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  return ctor ?? null;
}

/** Camera needs a secure context (HTTPS or localhost) and the BarcodeDetector API. */
function isCameraScanSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    getBarcodeDetector() !== null &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

const SCAN_INTERVAL_MS = 300;
const SAME_CODE_COOLDOWN_MS = 2500;

interface TrackingScannerProps {
  /** Called with the trimmed, uppercased code for each manual entry or camera scan. */
  onScan: (code: string) => void;
  /** Disables manual entry and ignores camera reads (e.g. while a request is in flight). */
  disabled?: boolean;
  label?: string;
}

/**
 * Tracking number input with optional camera scanning (Code 128 via BarcodeDetector).
 * Manual entry is always available; the camera is offered only where the browser supports it.
 * Reused by rider pickup (2.5) and hub intake (1.6).
 */
export default function TrackingScanner({
  onScan,
  disabled = false,
  label = 'Tracking number',
}: TrackingScannerProps) {
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const disabledRef = useRef(disabled);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const cameraSupported = isCameraScanSupported();

  useEffect(() => {
    onScanRef.current = onScan;
    disabledRef.current = disabled;
  }, [onScan, disabled]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    const Detector = getBarcodeDetector();
    if (!Detector) return;

    setCameraError(null);
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);

      // The <video> element mounts once cameraOn is true; attach on the next frame.
      requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        video.srcObject = streamRef.current;
        try {
          await video.play();
        } catch {
          // Autoplay can be interrupted by a fast toggle; the stream stays attached.
        }

        const detector = new Detector({ formats: ['code_128'] });
        timerRef.current = setInterval(async () => {
          if (disabledRef.current || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue?.trim().toUpperCase();
            if (!raw) return;

            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.code === raw && now - last.at < SAME_CODE_COOLDOWN_MS) return;

            lastScanRef.current = { code: raw, at: now };
            onScanRef.current(raw);
          } catch {
            // A single failed frame is not worth surfacing.
          }
        }, SCAN_INTERVAL_MS);
      });
    } catch (err: unknown) {
      stopCamera();
      setCameraOn(false);
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      setCameraError(
        denied
          ? 'Camera permission was denied. Allow camera access in your browser, or type the tracking number.'
          : 'Could not start the camera. Type the tracking number instead.'
      );
    } finally {
      setCameraStarting(false);
    }
  };

  const toggleCamera = () => {
    if (cameraOn) {
      stopCamera();
      setCameraOn(false);
    } else {
      void startCamera();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = manual.trim().toUpperCase();
    if (!code || disabled) return;
    onScan(code);
    setManual('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      {cameraSupported && (
        <div className="space-y-2">
          {cameraOn && (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                aria-label="Camera preview for scanning the parcel barcode"
              />
              <div
                className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-24 rounded-xl border-2 border-white/80 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          )}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={cameraStarting}
            className="w-full min-h-12 inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            {cameraStarting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : cameraOn ? (
              <CameraOff className="w-4 h-4" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>{cameraOn ? 'Stop camera' : cameraStarting ? 'Starting camera...' : 'Scan with camera'}</span>
          </button>
        </div>
      )}

      {cameraError && (
        <p role="alert" className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {cameraError}
        </p>
      )}

      {!cameraSupported && (
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <Keyboard className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Camera scanning is not available in this browser or connection. Type the tracking number below.</span>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="tracking-scanner-input" className="block text-xs font-bold text-gray-700">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            id="tracking-scanner-input"
            ref={inputRef}
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            disabled={disabled}
            placeholder="LIT-YYMMDD-XXXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            className="flex-1 min-w-0 min-h-12 px-3 rounded-xl border border-gray-300 bg-white font-mono text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled || manual.trim() === ''}
            className="min-h-12 px-5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
