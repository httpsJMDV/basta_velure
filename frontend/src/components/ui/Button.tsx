import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:   'bg-brand-red text-brand-white hover:bg-brand-red-dark active:bg-brand-red-dark',
  secondary: 'bg-brand-black text-brand-white hover:bg-brand-gray-mid',
  ghost:     'bg-transparent text-brand-red border border-brand-red hover:bg-brand-red hover:text-white',
  danger:    'bg-red-700 text-white hover:bg-red-800',
};

export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={[
        'min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-lg font-semibold text-sm',
        'transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading…
        </span>
      ) : children}
    </button>
  );
}
