import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  error?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Show a filter box above the options. On by default for long lists (more than 15 options). */
  searchable?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  error,
  label,
  required,
  disabled = false,
  searchable,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const withSearch = searchable ?? options.length > 15;
  const q = query.trim().toLowerCase();
  // A long list shows the first 200 matches; typing narrows it down.
  const shown = (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options).slice(0, withSearch ? 200 : undefined);
  const [, setOpenUpward] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Position the portal dropdown relative to the trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = Math.min(240, options.length * 44) + (options.length > 15 ? 52 : 0);
    const openUpward = spaceBelow < dropHeight && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top }
        : { top: rect.bottom + 4 }),
    });
    setOpenUpward(openUpward);
  }, [options.length]);

  const toggle = () => {
    if (disabled) return;
    if (isOpen) { setIsOpen(false); return; }
    updatePosition();
    setQuery('');
    setIsOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-brand-gray-mid">
          {label}{required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={toggle}
          className={[
            'min-h-[44px] w-full px-4 py-2.5 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
            'text-left flex items-center justify-between transition-colors duration-150',
            'rounded-xl',
            disabled
              ? 'bg-gray-50 border border-gray-200 cursor-not-allowed'
              : 'bg-white cursor-pointer',
            !disabled && (error ? 'border border-red-500' : 'border border-gray-300'),
          ].join(' ')}
        >
          <span className={selectedOption ? 'text-brand-black' : 'text-gray-400'}>
            {selectedOption?.label || placeholder || 'Select...'}
          </span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </motion.div>
        </button>

        {isOpen && createPortal(
          <AnimatePresence>
            <motion.div
              ref={dropdownRef}
              style={dropdownStyle}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
            >
              {withSearch && (
                <label className="relative block border-b border-gray-100 p-2">
                  <span className="sr-only">Filter the list</span>
                  <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                  <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to filter"
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-red focus:bg-white" />
                </label>
              )}
              <div className="max-h-60 overflow-y-auto">
                {shown.length === 0 && <p className="px-4 py-3 text-[13px] text-gray-500">Nothing matches “{query}”.</p>}
                {shown.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => { onChange(option.value); setIsOpen(false); }}
                    className={[
                      'w-full px-4 py-3 text-sm text-left transition-colors',
                      option.value === value
                        ? 'bg-red-50 text-brand-red font-semibold'
                        : 'text-brand-black hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
