import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { useStorefrontCategories } from '../../hooks/useStorefrontCategories';
import CategoryArt from './CategoryArt';

/** The header's pill hover: a soft ring that grows around the button. */
export const NAV_PILL =
  'relative isolate rounded-full px-3 py-1.5 outline-none before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-white/15 before:ring-1 before:ring-inset before:ring-white/25 before:opacity-0 before:scale-90 before:transition-all before:duration-300 before:ease-out hover:before:opacity-100 hover:before:scale-100 focus-visible:before:opacity-100 focus-visible:before:scale-100';

/**
 * "Categories" in the header: every main category on the left and, for the one under the pointer, its
 * subcategories as round thumbnails on the right (like Temu). Opens on hover or click.
 */
export default function CategoriesMenu() {
  const categories = useStorefrontCategories();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const hold = () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); };
  const show = () => { hold(); setOpen(true); };
  const hideSoon = () => { hold(); closeTimer.current = window.setTimeout(() => setOpen(false), 180); };

  const parent = categories?.[active];

  return (
    <div ref={ref} className="relative hidden md:block shrink-0 ml-1 lg:ml-4" onMouseEnter={show} onMouseLeave={hideSoon}>
      <button
        type="button"
        // Hover already opens it; a click only opens (it never closes what the pointer just opened).
        onClick={show}
        aria-expanded={open}
        aria-haspopup="true"
        className={`${NAV_PILL} flex items-center gap-1.5 text-sm font-semibold text-white bg-white/10 ring-1 ring-inset ring-white/20 ${open ? 'before:opacity-100 before:scale-100' : ''}`}
      >
        <LayoutGrid className="w-4 h-4" aria-hidden="true" />
        <span>Categories</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 top-full z-50 pt-4"
            role="menu"
          >
            <div className="flex w-[min(880px,calc(100vw-64px))] h-[min(520px,calc(100vh-140px))] overflow-hidden bg-white border border-gray-100 shadow-2xl rounded-2xl">
              {/* Main categories */}
              <ul className="w-60 shrink-0 py-2 overflow-y-auto border-r border-gray-100 bg-gray-50/60">
                {(categories ?? Array.from({ length: 10 }, () => null)).map((c, i) => (
                  <li key={c?.id ?? i}>
                    {c ? (
                      <Link
                        to={`/category/${c.slug}`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => setOpen(false)}
                        onFocus={() => setActive(i)}
                        className={`flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] transition-colors ${
                          i === active ? 'bg-white text-brand-red font-semibold shadow-[inset_3px_0_0_#B91C1C]' : 'text-gray-700 hover:text-brand-red'
                        }`}
                        role="menuitem"
                      >
                        <span className="truncate">{c.name}</span>
                        <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${i === active ? 'text-brand-red' : 'text-gray-300'}`} aria-hidden="true" />
                      </Link>
                    ) : (
                      <div className="px-4 py-2.5"><div className="h-3.5 rounded bg-gray-200 animate-pulse" /></div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Subcategories of the active one */}
              <div className="flex-1 min-w-0 p-5 overflow-y-auto">
                {parent ? (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-gray-900 truncate">{parent.name}</p>
                        <p className="text-[12px] text-gray-500">{parent.product_count.toLocaleString()} product{parent.product_count === 1 ? '' : 's'}</p>
                      </div>
                      <Link to={`/category/${parent.slug}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-red hover:underline shrink-0">
                        See all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-5">
                      {(parent.children ?? []).map((leaf) => (
                        <Link
                          key={leaf.id}
                          to={`/category/${parent.slug}?cat=${leaf.slug}`}
                          onClick={() => setOpen(false)}
                          className="group flex flex-col items-center gap-2 text-center"
                          role="menuitem"
                        >
                          <span className="w-[76px] h-[76px] rounded-full p-0.5 bg-white ring-1 ring-gray-100 shadow-sm overflow-hidden transition-all duration-300 group-hover:ring-2 group-hover:ring-brand-red/40 group-hover:-translate-y-0.5">
                            <CategoryArt category={leaf} variant="circle" />
                          </span>
                          <span className="text-[12px] leading-snug text-gray-700 group-hover:text-brand-red line-clamp-2">{leaf.name}</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-5 gap-4">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="w-[76px] h-[76px] rounded-full bg-gray-100 animate-pulse" />
                        <div className="w-16 h-3 rounded bg-gray-100 animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
