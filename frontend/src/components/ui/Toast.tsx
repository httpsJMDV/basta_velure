import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** At most this many toasts at once; an older one makes way for a newer one. */
const MAX_TOASTS = 3;

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // A toast leaves when its countdown line runs out (see .toast-countdown), so hovering one keeps it.
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++_id;
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-4 sm:top-auto sm:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-[calc(100vw-32px)] sm:w-auto pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const error = toast.type === 'error';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      role={error ? 'alert' : 'status'}
      className="toast-card pointer-events-auto relative w-full sm:w-auto sm:min-w-[300px] sm:max-w-[440px] overflow-hidden rounded-2xl bg-[#1E1B18] text-[#FAF8F5] shadow-[0_18px_44px_-14px_rgba(28,25,23,0.55)] ring-1 ring-white/10"
    >
      <div className="flex items-center gap-3 py-2.5 pl-2.5 pr-2">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${error ? 'bg-brand-red text-white' : 'bg-white/10 text-emerald-300'}`}>
          {error ? <AlertCircle className="w-4 h-4" aria-hidden="true" /> : <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />}
        </span>
        <p className="flex-1 min-w-0 text-[13.5px] font-medium leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-white/45 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <span
        className={`toast-countdown absolute bottom-0 left-0 right-0 h-[2px] ${error ? 'bg-white/60' : 'bg-brand-red'}`}
        onAnimationEnd={onDismiss}
        aria-hidden="true"
      />
    </motion.div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
