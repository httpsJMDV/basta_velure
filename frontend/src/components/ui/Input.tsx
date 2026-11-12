import { forwardRef } from 'react';
import type { ChangeEvent, FocusEvent, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Text boxes that never start or end with a space (the server trims them too); passwords and numbers are left alone. */
const TRIMMED_TYPES = new Set(['text', 'email', 'search', 'tel', 'url']);

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', onChange, onBlur, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
    const trims = TRIMMED_TYPES.has(props.type ?? 'text');

    // A space typed before the first letter is dropped as it is typed; one left at the end goes when the box is left.
    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      if (trims && /^\s/.test(e.target.value)) e.target.value = e.target.value.replace(/^\s+/, '');
      onChange?.(e);
    }
    function handleBlur(e: FocusEvent<HTMLInputElement>) {
      if (trims && onChange && /\s$/.test(e.target.value)) {
        e.target.value = e.target.value.trimEnd();
        onChange(e as unknown as ChangeEvent<HTMLInputElement>);
      }
      onBlur?.(e);
    }
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium text-brand-gray-mid">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={[
            'min-h-[44px] w-full rounded-lg border px-4 py-2.5 text-sm',
            'bg-white text-brand-black placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
            'transition-colors duration-150',
            error ? 'border-red-500' : 'border-gray-300',
            props.disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : '',
            className,
          ].join(' ')}
          {...props}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
