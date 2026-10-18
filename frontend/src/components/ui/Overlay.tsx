// A side panel and a centred dialog, both closing on Escape and on the backdrop, with focus moved inside on open. Both
// render into <body>, so a transformed or clipped page around them cannot shrink them to the page's box.
// ReasonDialog is the shared "give a reason" step (10 to 300 characters, A25) for reject, suspend, cancel and override.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
}

export function SidePanel({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
        className={`relative h-full w-full ${width} bg-white shadow-2xl flex flex-col focus:outline-none`}>
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-stone-900 truncate">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-stone-500">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-stone-200 bg-stone-50">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

export function Dialog({ open, onClose, title, children, footer, size = 'max-w-md' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-stone-900/45" onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
        className={`relative w-full ${size} rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl focus:outline-none max-h-[92vh] flex flex-col`}>
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-stone-100 flex flex-wrap justify-end gap-2">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

const BTN = 'min-h-10 px-4 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50';
export const BUTTON = {
  primary: `${BTN} bg-brand-red text-white hover:bg-brand-red-dark`,
  dark: `${BTN} bg-stone-900 text-white hover:bg-stone-800`,
  ghost: `${BTN} border border-stone-300 bg-white text-stone-800 hover:border-stone-900`,
  danger: `${BTN} bg-red-700 text-white hover:bg-red-800`,
  quiet: `${BTN} text-stone-600 hover:text-stone-900`,
};

/**
 * Asks for a reason before a decision. The reason must be 10 to 300 characters (A25); quick picks fill the box. The
 * confirm button stays disabled until the reason is long enough, and the server checks it again.
 */
export function ReasonDialog({ open, onClose, onConfirm, title, intro, label = 'Reason', confirmLabel, tone = 'danger', quickPicks, min = 10, max = 300, busy, error }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  intro?: ReactNode;
  label?: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary' | 'dark';
  quickPicks?: string[];
  min?: number;
  max?: number;
  busy?: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const length = reason.trim().length;
  const tooShort = length < min;

  return (
    <Dialog open={open} onClose={onClose} title={title}
      footer={(
        <>
          <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BUTTON[tone]} disabled={busy || tooShort || length > max} onClick={() => onConfirm(reason.trim())}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      )}
    >
      {intro && <div className="text-[13.5px] leading-relaxed text-stone-600 mb-3">{intro}</div>}
      {quickPicks && quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickPicks.map((q) => (
            <button key={q} type="button" onClick={() => setReason(q)}
              className={`px-2.5 py-1 rounded-full border text-[12px] ${reason === q ? 'border-brand-red bg-red-50 text-brand-red' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}>
              {q}
            </button>
          ))}
        </div>
      )}
      <label className="block text-[13px] font-medium text-stone-700" htmlFor="reason-box">{label}</label>
      <textarea id="reason-box" rows={4} value={reason} maxLength={max + 50} onChange={(e) => setReason(e.target.value)}
        className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent ${error ? 'border-red-400' : 'border-stone-300'}`} />
      <div className="mt-1 flex items-center justify-between text-[11.5px]">
        <span className={error ? 'text-red-600' : tooShort && length > 0 ? 'text-amber-700' : 'text-stone-400'}>
          {error ?? (tooShort ? `At least ${min} characters` : length > max ? `At most ${max} characters` : 'Looks good')}
        </span>
        <span className={`tabular-nums ${length > max ? 'text-red-600' : 'text-stone-400'}`}>{length}/{max}</span>
      </div>
    </Dialog>
  );
}
