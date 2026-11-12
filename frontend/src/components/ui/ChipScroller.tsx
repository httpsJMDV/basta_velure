import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A single row of chips that is wider than the page: it scrolls sideways, with arrow buttons and a soft fade on the
 * side that has more (so people can see there is more), a mouse wheel that scrolls it sideways, and the selected chip
 * (`data-active="true"`) brought into view. On a phone the row is swiped as before.
 */
export default function ChipScroller({ children, activeKey, label, className = '' }: {
  children: ReactNode;
  /** Changes when the selected chip changes, so it is scrolled into view. */
  activeKey?: string | number | null;
  label: string;
  className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  // A vertical wheel turn scrolls the row sideways while it can; at either end the page scrolls as usual.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const canScroll = e.deltaY > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0;
      if (!canScroll) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: 'auto' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Bring the selected chip into view (centred) when it changes, without moving the page.
  useEffect(() => {
    const el = row.current;
    const active = el?.querySelector<HTMLElement>('[data-active="true"]');
    if (!el || !active) return;
    const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeKey]);

  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.75), behavior: 'smooth' });
  };

  const arrow = 'absolute top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-white border border-stone-200 text-stone-700 shadow-[0_2px_8px_rgba(28,25,23,0.12)] hover:border-stone-400 hover:text-stone-900 transition-[opacity,colors] duration-150';

  return (
    <div className={`relative ${className}`} role="group" aria-label={label}>
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-16 z-[5] bg-gradient-to-r from-white via-white/80 to-transparent transition-opacity duration-200 ${edges.left ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute inset-y-0 right-0 w-16 z-[5] bg-gradient-to-l from-white via-white/80 to-transparent transition-opacity duration-200 ${edges.right ? 'opacity-100' : 'opacity-0'}`} />
      <button type="button" aria-label="Show earlier categories" onClick={() => page(-1)} tabIndex={edges.left ? 0 : -1}
        className={`${arrow} left-0 ${edges.left ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" aria-label="Show more categories" onClick={() => page(1)} tabIndex={edges.right ? 0 : -1}
        className={`${arrow} right-0 ${edges.right ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <ChevronRight className="w-4 h-4" />
      </button>
      <div ref={row} onScroll={measure} className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-proximity py-0.5 -mx-1 px-1">
        {children}
      </div>
    </div>
  );
}
