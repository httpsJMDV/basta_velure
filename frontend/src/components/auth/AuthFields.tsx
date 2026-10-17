// Form pieces shared by every sign-up and account-security form: a password field with the live A5 checklist, the
// Terms and Privacy consent, a 6-digit code input and a field-level error summary.
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, EyeOff } from 'lucide-react';
import { passwordRules } from '../../utils/accountRules';

export function PasswordField({ label, value, onChange, error, autoComplete = 'new-password', showRules = false, id }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
  showRules?: boolean;
  id: string;
}) {
  const [visible, setVisible] = useState(false);
  const rules = passwordRules(value);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-brand-gray-mid">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={[
            'min-h-[44px] w-full rounded-lg border pl-4 pr-11 py-2.5 text-sm bg-white text-brand-black placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent transition-colors',
            error ? 'border-red-500' : 'border-gray-300',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-stone-400 hover:text-stone-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {showRules && (
        <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
          {rules.map((r) => (
            <li key={r.key} className={`flex items-center gap-1.5 text-[11.5px] ${r.ok ? 'text-emerald-700' : 'text-stone-400'}`}>
              <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${r.ok ? 'bg-emerald-600 text-white' : 'border border-stone-300'}`}>
                {r.ok && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
              </span>
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TermsConsent({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors ${error ? 'border-red-400 bg-red-50/40' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-red focus:ring-brand-red"
        />
        <span className="text-[13px] leading-relaxed text-stone-700">
          I have read and agree to the{' '}
          <Link to="/terms-of-service" target="_blank" className="font-semibold text-brand-red hover:underline">Terms of Use</Link>
          {' '}and the{' '}
          <Link to="/privacy-policy" target="_blank" className="font-semibold text-brand-red hover:underline">Privacy Policy</Link>.
        </span>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Six boxes for a 6-digit code; paste fills all of them. Only digits are accepted. */
export function CodeInput({ value, onChange, error, disabled, autoFocus = true }: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(i: number, d: string) {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, 6));
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\s/g, '');
    if (!text) return;
    e.preventDefault();
    onChange(text.slice(0, 6));
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={d}
            disabled={disabled}
            onPaste={onPaste}
            onKeyDown={(e) => onKey(i, e)}
            onChange={(e) => {
              const ch = e.target.value.slice(-1);
              setAt(i, ch);
              if (ch && i < 5) refs.current[i + 1]?.focus();
            }}
            aria-label={`Digit ${i + 1}`}
            className={[
              'w-11 h-12 sm:w-12 sm:h-14 rounded-xl border text-center text-xl font-semibold tabular-nums text-stone-900 bg-white',
              'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent transition-colors',
              error ? 'border-red-400' : 'border-stone-300',
            ].join(' ')}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** A list of the fields that still need attention, shown above a long form after a failed submit. */
export function FormErrorSummary({ errors, labels, title = 'Please fix the highlighted fields' }: {
  errors: Record<string, string>;
  labels?: Record<string, string>;
  title?: string;
}) {
  const entries = Object.entries(errors);
  if (!entries.length) return null;
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-[13px] font-semibold text-red-800">{title} ({entries.length})</p>
      <ul className="mt-1.5 space-y-0.5">
        {entries.slice(0, 12).map(([k, msg]) => (
          <li key={k} className="text-[12.5px] text-red-700">
            {labels?.[k] ? <span className="font-medium">{labels[k]}: </span> : null}{msg}
          </li>
        ))}
        {entries.length > 12 && <li className="text-[12.5px] text-red-700">…and {entries.length - 12} more</li>}
      </ul>
    </div>
  );
}
