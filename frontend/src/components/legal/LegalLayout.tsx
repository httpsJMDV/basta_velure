import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, LifeBuoy } from 'lucide-react';
import SiteHeader from '../SiteHeader';
import Footer from '../Footer';
import { useAuth } from '../../hooks/useAuth';
import { useChat } from '../../hooks/useChat';

export type LegalDoc = 'terms' | 'privacy' | 'cookies';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const DOCS: { key: LegalDoc; label: string; to: string }[] = [
  { key: 'terms', label: 'Terms of use', to: '/terms-of-service' },
  { key: 'privacy', label: 'Privacy policy', to: '/privacy-policy' },
  { key: 'cookies', label: 'Cookie policy', to: '/cookie-policy' },
];

/** A titled block of prose inside a section. */
export function LegalPoint({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      {title && <h3 className="text-[15px] font-semibold text-stone-900">{title}</h3>}
      <div className={`${title ? 'mt-1.5' : ''} text-[15px] leading-7 text-stone-700 space-y-3`}>{children}</div>
    </div>
  );
}

/**
 * The frame of the legal pages: one readable column with a table of contents that follows the reader, and links
 * between the three documents, inside the normal storefront header and footer.
 */
export default function LegalLayout({ doc, title, updated, intro, sections }: {
  doc: LegalDoc;
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id);
  const { user } = useAuth();
  const { openChatWithSupport } = useChat();

  // Highlight the section being read.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />

      <div className="bg-white border-b border-stone-200">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-8 sm:pb-10">
          <nav aria-label="Legal documents" className="flex gap-5 border-b border-stone-200 overflow-x-auto no-scrollbar">
            {DOCS.map((d) => (
              <Link key={d.key} to={d.to} aria-current={d.key === doc ? 'page' : undefined}
                className={`relative shrink-0 pb-3 text-[13.5px] transition-colors ${d.key === doc ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}>
                {d.label}
                {d.key === doc && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-red" />}
              </Link>
            ))}
          </nav>
          <h1 className="mt-7 text-[32px] sm:text-[40px] font-serif font-bold tracking-tight leading-tight text-[#1E1B18]">{title}</h1>
          <p className="mt-2 text-[13px] text-stone-500">Last updated {updated}</p>
          <div className="mt-4 max-w-[720px] text-[15.5px] leading-7 text-stone-700">{intro}</div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-[1100px] mx-auto px-4 sm:px-8 py-10 grid lg:grid-cols-[220px_minmax(0,1fr)] gap-10 lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-[140px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">On this page</p>
            <ol className="mt-3 space-y-0.5 border-l border-stone-200">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}
                    className={`-ml-px flex gap-2 pl-3 py-1.5 border-l-2 text-[13px] leading-snug transition-colors ${active === s.id ? 'border-brand-red text-stone-900 font-semibold' : 'border-transparent text-stone-500 hover:text-stone-900'}`}>
                    <span className="tabular-nums text-stone-400">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="min-w-0 max-w-[720px]">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-36 pb-10 mb-10 border-b border-stone-200 last:border-0 last:mb-0">
              <h2 className="flex items-baseline gap-3 text-[22px] font-serif font-bold tracking-tight text-[#1E1B18]">
                <span className="text-[13px] font-sans font-semibold tabular-nums text-stone-400">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className="mt-4">{s.body}</div>
            </section>
          ))}

          <div className="mt-4 rounded-3xl bg-white border border-stone-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-stone-900">Questions about this page?</p>
              <p className="mt-1 text-[13.5px] text-stone-600">Message our support team. We usually reply within a day.</p>
            </div>
            <div className="flex gap-2">
              {user ? (
                <button type="button" onClick={() => void openChatWithSupport()} className="h-10 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" /> Chat with support
                </button>
              ) : (
                <Link to="/login" className="h-10 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold inline-flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" /> Sign in to chat
                </Link>
              )}
              <Link to="/help/safety" className="h-10 px-4 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-800 hover:border-stone-900 inline-flex items-center gap-1.5">
                <LifeBuoy className="w-4 h-4" /> Help center
              </Link>
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
