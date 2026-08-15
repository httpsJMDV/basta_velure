import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');
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
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
