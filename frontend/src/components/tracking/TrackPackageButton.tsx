import { useState } from 'react';
import { MapPinned } from 'lucide-react';
import TrackingSheet from './TrackingSheet';

interface TrackPackageButtonProps {
  trackingNumber: string;
  /** `chip` is a small pill next to a tracking number; `button` is a full-size action. */
  variant?: 'chip' | 'button';
  label?: string;
  className?: string;
}

/** Opens "Track package" for one parcel. The sheet is mounted only while open, so it polls only while it is looked at. */
export default function TrackPackageButton({ trackingNumber, variant = 'chip', label = 'Track package', className = '' }: TrackPackageButtonProps) {
  const [open, setOpen] = useState(false);

  const style =
    variant === 'chip'
      ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-brand-red bg-red-50 border border-red-100 hover:bg-red-100'
      : 'inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl text-sm font-bold text-white bg-brand-red hover:bg-brand-red-dark';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${style} transition-colors ${className}`}>
        <MapPinned className={variant === 'chip' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
        {label}
      </button>
      {open && <TrackingSheet trackingNumber={trackingNumber} onClose={() => setOpen(false)} />}
    </>
  );
}
