import { localPhMobile } from '../../utils/accountRules';

interface PhoneInputProps {
  /** As typed, or the stored +639XXXXXXXXX (shown as 09XXXXXXXXX). */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  hint?: string;
}

/**
 * A Philippine mobile number, typed as 09XXXXXXXXX or +639XXXXXXXXX (A4). Nothing is stripped or cut while typing,
 * so what the person typed is what the server checks: a wrong length or letters get a message instead of a silently
 * changed number.
 */
export default function PhoneInput({ value, onChange, error, label, required, disabled, id = 'mobile-number', hint }: PhoneInputProps) {
  const shown = /^\+639\d{9}$/.test(value) ? localPhMobile(value) : value;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-brand-gray-mid">
          {label}{required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
      )}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="09171234567"
        value={shown}
        onChange={(e) => onChange(e.target.value)}
        maxLength={20}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={[
          'min-h-[44px] w-full rounded-lg border px-4 py-2.5 text-sm tabular-nums',
          'bg-white text-brand-black placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
          'transition-colors duration-150 disabled:bg-gray-50 disabled:text-gray-400',
          error ? 'border-red-500' : 'border-gray-300',
        ].join(' ')}
      />
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <p className="text-[11px] text-gray-400">{hint ?? 'Format: 09XXXXXXXXX or +639XXXXXXXXX'}</p>
      )}
    </div>
  );
}
