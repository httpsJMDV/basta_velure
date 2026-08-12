import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

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
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
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
    const dropHeight = Math.min(240, options.length * 44);
    const openUpward = spaceBelow < dropHeight && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [options.length]);

  const toggle = () => {
    if (disabled) return;
    if (isOpen) { setIsOpen(false); return; }
    updatePosition();
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
            'min-h-[44px] w-full px-4 py-2.5 rounded-lg text-sm',
            'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
            'text-left flex items-center justify-between transition-colors duration-150',
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
              <div className="max-h-60 overflow-y-auto">
                {options.map((option) => (
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
