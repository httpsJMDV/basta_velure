import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  required?: boolean;
  maxDate?: string;
  minDate?: string;
  placeholder?: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function parseDate(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplay(str: string): string {
  const d = parseDate(str);
  if (!d) return '';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function DatePicker({
  value, onChange, label, error, required, maxDate, minDate, placeholder = 'Select date…',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => {
    const d = parseDate(value);
    return d ? d.getFullYear() : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDate(value);
    return d ? d.getMonth() : new Date().getMonth();
  });
  const [mode, setMode] = useState<'day' | 'month' | 'year'>('day');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = parseDate(value);
  const minD = parseDate(minDate ?? '');
  const maxD = parseDate(maxDate ?? '');

  function isDisabled(d: Date) {
    if (minD && d < minD) return true;
    if (maxD && d > maxD) return true;
    return false;
  }

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
  }

  function selectDay(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    if (!isDisabled(d)) {
      onChange(toYMD(d));
      setOpen(false);
    }
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const yearRange = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      {label && (
        <label className="text-sm font-medium text-brand-gray-mid">
          {label}{required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setMode('day'); }}
        className={[
          'min-h-[44px] w-full px-4 py-2.5 bg-white rounded-lg text-sm text-left',
          'flex items-center justify-between transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
          error ? 'border border-red-500' : 'border border-gray-300',
        ].join(' ')}
      >
        <span className={value ? 'text-brand-black' : 'text-gray-400'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-72"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'month' ? 'day' : 'month')}
                  className="text-sm font-semibold text-brand-black hover:text-brand-red transition-colors px-1"
                >
                  {MONTHS[viewMonth]}
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'year' ? 'day' : 'year')}
                  className="text-sm font-semibold text-brand-black hover:text-brand-red transition-colors px-1"
                >
                  {viewYear}
                </button>
              </div>

              <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {/* Month picker */}
              {mode === 'month' && (
                <motion.div key="month" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-3 gap-1">
                  {MONTHS.map((m, i) => (
                    <button
                      key={m} type="button"
                      onClick={() => { setViewMonth(i); setMode('day'); }}
                      className={[
                        'py-2 rounded-lg text-xs font-medium transition-colors',
                        i === viewMonth ? 'bg-brand-red text-white' : 'hover:bg-gray-100 text-brand-black',
                      ].join(' ')}
                    >
                      {m.slice(0, 3)}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* Year picker */}
              {mode === 'year' && (
                <motion.div key="year" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-h-48 overflow-y-auto grid grid-cols-3 gap-1">
                  {yearRange.map((y) => (
                    <button
                      key={y} type="button"
                      onClick={() => { setViewYear(y); setMode('day'); }}
                      className={[
                        'py-2 rounded-lg text-xs font-medium transition-colors',
                        y === viewYear ? 'bg-brand-red text-white' : 'hover:bg-gray-100 text-brand-black',
                      ].join(' ')}
                    >
                      {y}
                    </button>
                  ))}
                </motion.div>
              )}

              {/* Day picker */}
              {mode === 'day' && (
                <motion.div key="day" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS.map((d) => (
                      <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const d = new Date(viewYear, viewMonth, day);
                      const isSelected = selected && toYMD(d) === toYMD(selected);
                      const disabled = isDisabled(d);
                      const isToday = toYMD(d) === toYMD(new Date());
                      return (
                        <button
                          key={day} type="button"
                          onClick={() => selectDay(day)}
                          disabled={disabled}
                          className={[
                            'w-full aspect-square rounded-full text-xs font-medium transition-colors flex items-center justify-center',
                            isSelected ? 'bg-brand-red text-white' :
                            isToday ? 'border border-brand-red text-brand-red' :
                            disabled ? 'text-gray-300 cursor-not-allowed' :
                            'hover:bg-red-50 text-brand-black',
                          ].join(' ')}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
