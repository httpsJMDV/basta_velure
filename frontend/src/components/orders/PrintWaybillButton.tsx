import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Printer } from 'lucide-react';

interface PrintWaybillButtonProps {
  orderId: number;
  className?: string;
  children?: ReactNode;
  /** Called with the server's message when the waybill cannot be printed (for example, not ready for pickup yet). */
  onError?: (message: string) => void;
}

/**
 * Prints the A6 waybill right where you are: the waybill page loads in a hidden frame, opens the print dialog itself
 * (?print=1) and reports back when it is done or why it could not print. No new tab. The frame is same-origin, so it
 * uses the signed-in session from localStorage.
 */
export default function PrintWaybillButton({ orderId, className = '', children, onError }: PrintWaybillButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  function print() {
    if (busy) return;
    setBusy(true);
    setError('');

    const frame = document.createElement('iframe');
    frame.src = `/seller/orders/${orderId}/waybill?print=1`;
    frame.title = 'Waybill print preview';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Off screen but laid out at A6 size, so the page inside renders exactly as it prints.
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '105mm', height: '148mm', border: '0' });

    const finish = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      cleanupRef.current = null;
      // Let the print dialog let go of the frame before it is removed.
      window.setTimeout(() => frame.remove(), 1000);
      setBusy(false);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'waybill:printed') finish();
      if (event.data?.type === 'waybill:error') {
        const message = String(event.data.message || 'The waybill could not be printed.');
        if (onError) onError(message); else setError(message);
        finish();
      }
    };
    const timer = window.setTimeout(finish, 120_000);

    window.addEventListener('message', onMessage);
    cleanupRef.current = finish;
    document.body.appendChild(frame);
  }

  return (
    <>
      <button type="button" onClick={print} disabled={busy} className={className} aria-busy={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Printer className="w-3.5 h-3.5" aria-hidden="true" />}
        {children ?? 'Print waybill'}
      </button>
      {error && <span role="alert" className="block mt-1 text-[11px] text-red-600">{error}</span>}
    </>
  );
}
