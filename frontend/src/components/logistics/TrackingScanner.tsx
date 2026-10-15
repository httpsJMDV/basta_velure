import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Camera, CameraOff, Keyboard, RefreshCw, ScanLine } from 'lucide-react';
// Chrome on Windows and Linux (and Firefox) have no built-in BarcodeDetector, so the page loads this ponyfill on
// demand. Its decoder is a small WebAssembly file that ships with the app, so scanning works without internet.
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

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

let detectorPromise: Promise<BarcodeDetectorConstructor> | null = null;

/** The browser's own BarcodeDetector when it has one, otherwise the bundled ponyfill (loaded once, on first use). */
function loadBarcodeDetector(): Promise<BarcodeDetectorConstructor> {
  const native = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (native) return Promise.resolve(native);

  detectorPromise ??= import('barcode-detector/ponyfill')
    .then((mod) => {
      mod.prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
        },
        fireImmediately: false,
      });
      return mod.BarcodeDetector as unknown as BarcodeDetectorConstructor;
    })
    .catch((err) => {
      detectorPromise = null; // let the next attempt try again
      throw err;
    });
  return detectorPromise;
}

/** The camera needs a secure context (HTTPS or localhost) and getUserMedia. */
function cameraBlockedReason(): string | null {
  if (typeof window === 'undefined') return 'This page has no camera access.';
  if (!window.isSecureContext) {
    return 'The camera only works on a secure connection (https:// or http://localhost). Open the app that way, or type the tracking number.';
  }
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return 'This browser cannot open the camera. Type the tracking number, or use a barcode scanner.';
  }
  return null;
}

const SCAN_INTERVAL_MS = 250;
const SAME_CODE_COOLDOWN_MS = 2500;

interface TrackingScannerProps {
  /** Called with the trimmed, uppercased code for each manual entry or camera scan. */
  onScan: (code: string) => void;
  /** Disables manual entry and ignores camera reads (e.g. while a request is in flight). */
  disabled?: boolean;
  label?: string;
  /** Focus the typing box on load, so a USB or Bluetooth barcode scanner (which types) works at once. */
  autoFocus?: boolean;
}

/**
 * Tracking number input with camera scanning (Code 128, which is what the waybill prints).
 * Typing is always available, and a hardware barcode scanner works through the same box. The camera is offered wherever
 * the page has a secure connection and the browser can open a camera.
 * Reused by rider pickup (2.5) and hub intake (1.6).
 */
export default function TrackingScanner({
  onScan,
  disabled = false,
  label = 'Tracking number',
  autoFocus = false,
}: TrackingScannerProps) {
  const [manual, setManual] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const disabledRef = useRef(disabled);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  const blockedReason = cameraBlockedReason();

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const startCamera = async () => {
    setCameraError(null);
    setCameraStarting(true);
    try {
      const Detector = await loadBarcodeDetector();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      // The scanner may have unmounted while the permission prompt was open.
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
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
        let busy = false;
        timerRef.current = setInterval(async () => {
          if (busy || disabledRef.current || video.readyState < 2) return;
          busy = true;
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue?.trim().toUpperCase();
            if (!raw) return;

            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.code === raw && now - last.at < SAME_CODE_COOLDOWN_MS) return;

            lastScanRef.current = { code: raw, at: now };
            setFlash(true);
            window.setTimeout(() => setFlash(false), 450);
            onScanRef.current(raw);
          } catch {
            // A single failed frame is not worth surfacing.
          } finally {
            busy = false;
          }
        }, SCAN_INTERVAL_MS);
      });
    } catch (err: unknown) {
      stopCamera();
      setCameraOn(false);
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      const noCamera = err instanceof DOMException && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError');
      setCameraError(
        denied
          ? 'Camera permission was denied. Allow camera access in your browser, or type the tracking number.'
          : noCamera
            ? 'No camera was found on this device. Type the tracking number, or use a barcode scanner.'
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
      {blockedReason === null && (
        <div className="space-y-2">
          {cameraOn ? (
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                aria-label="Camera preview for scanning the parcel barcode"
              />
              {/* Viewfinder: corner brackets and a sweeping line, green for a moment after a read */}
              <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-28 pointer-events-none" aria-hidden="true">
                {['top-0 left-0 border-t-4 border-l-4 rounded-tl-xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl'].map((c) => (
                  <span key={c} className={`absolute w-7 h-7 transition-colors ${flash ? 'border-emerald-400' : 'border-white/90'} ${c}`} />
                ))}
                <motion.span
                  className={`absolute left-2 right-2 h-0.5 rounded-full ${flash ? 'bg-emerald-400' : 'bg-brand-red'} shadow-[0_0_8px_rgba(192,0,26,0.9)]`}
                  animate={{ top: ['8%', '88%', '8%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
              <p className="absolute bottom-2 inset-x-0 text-center text-[11px] font-semibold text-white/90 drop-shadow">
                Hold the waybill barcode inside the frame
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 px-4 py-6 text-center border border-dashed border-gray-300 rounded-2xl bg-gray-50/70">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 text-brand-red">
                <ScanLine className="w-5 h-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold text-gray-900">Scan a waybill</p>
              <p className="text-xs text-gray-500">Point the camera at the barcode on the parcel.</p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCamera}
            disabled={cameraStarting}
            className={`w-full min-h-12 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              cameraOn ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'bg-brand-red text-white hover:bg-brand-red-dark'
            }`}
          >
            {cameraStarting ? (
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : cameraOn ? (
              <CameraOff className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Camera className="w-4 h-4" aria-hidden="true" />
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

      {blockedReason !== null && (
        <p className="flex items-start gap-2 text-xs text-gray-500">
          <Keyboard className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{blockedReason}</span>
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
            className="flex-1 min-w-0 min-h-12 px-3 rounded-xl border border-gray-300 bg-white font-mono text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-brand-red disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled || manual.trim() === ''}
            className="min-h-12 px-5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="text-[11px] text-gray-500">A USB or Bluetooth barcode scanner works here too: click the box and scan.</p>
      </form>
    </div>
  );
}
