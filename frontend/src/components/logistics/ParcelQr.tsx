import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface ParcelQrProps {
  /** What the QR carries: the parcel's tracking number, the same text the barcode on the waybill carries. */
  value: string;
  size?: number;
  className?: string;
}

/**
 * A QR code for one tracking number, drawn in the browser. The hub shows it on its screen at handover so a rider scans
 * it with the same scanner they use for the printed waybill. White margin and dark modules are kept on purpose: they
 * scan best that way even in dark mode.
 */
export default function ParcelQr({ value, size = 220, className = '' }: ParcelQrProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Drawn at 2x so it stays crisp on phone screens and when the hub PC is zoomed.
    void QRCode.toDataURL(value, { width: size * 2, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className={`rounded-xl bg-gray-100 animate-pulse ${className}`} aria-hidden="true" />;
  return <img src={src} width={size} height={size} alt={`QR code for ${value}`} className={`rounded-xl bg-white ${className}`} />;
}
