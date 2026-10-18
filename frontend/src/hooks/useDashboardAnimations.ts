import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const from  = value;
    const run = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      // Money is not whole pesos: land exactly on the target instead of its rounded value.
      setValue(p === 1 ? target : Math.round(from + (target - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

export function useMountAnim() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
    const id = requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    // A transform left on the page makes it the containing block of every position: fixed child, so modals and side
    // panels inside it would open inside the page instead of over the screen. Drop it once the entrance is over.
    const done = window.setTimeout(() => {
      el.style.transform = '';
      el.style.transition = '';
    }, 500);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(done);
    };
  }, []);
  return ref;
}
