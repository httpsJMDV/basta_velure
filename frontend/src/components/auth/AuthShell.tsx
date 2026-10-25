import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import LovedItLogo from '../LovedItLogo';

export interface AuthFact {
  icon: React.ElementType;
  text: string;
}

/** The ways into Loved-IT, listed under every sign-in and sign-up form so nobody has to hunt for their portal. */
const PORTALS = [
  { label: 'Shoppers', to: '/login', match: ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/complete-profile'] },
  { label: 'Sellers', to: '/register/seller', match: ['/register/seller'] },
  { label: 'Riders', to: '/rider/login', match: ['/rider'] },
  { label: 'Logistics hubs', to: '/hub/login', match: ['/hub/login', '/register/hub'] },
  { label: 'Courier companies', to: '/register/courier', match: ['/register/courier'] },
];

/**
 * Every sign-in and sign-up page: the form on the warm page colour on the left, a framed photo on the right with one
 * line about the portal and the facts that matter to it. On a phone the photo becomes a short banner above the form.
 */
export default function AuthShell({
  eyebrow, title, subtitle, image, imageAlt, imagePosition = 'center', headline, facts = [], topLink, wide = false, portals = true, children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  image: string;
  imageAlt: string;
  /** CSS object-position for the photo, to keep its subject in frame. */
  imagePosition?: string;
  headline: string;
  facts?: AuthFact[];
  /** Top right, e.g. "New to Loved-IT? Create an account". */
  topLink?: { text: string; label: string; to: string };
  /** A wider column for long sign-up forms. */
  wide?: boolean;
  /** The "Sign in as" links at the bottom; off for someone already signed in. */
  portals?: boolean;
  children: ReactNode;
}) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[#FAF8F5] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="flex flex-col min-h-screen px-5 sm:px-10 xl:px-16 py-6 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0" aria-label="Loved-IT home">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-9 sm:h-10 object-contain" />
          </Link>
          {topLink && (
            <p className="text-[13px] text-stone-500 text-right">
              <span className="hidden sm:inline">{topLink.text} </span>
              <Link to={topLink.to} className="font-semibold text-brand-red hover:underline">{topLink.label}</Link>
            </p>
          )}
        </header>

        <main className={`flex-1 w-full ${wide ? 'max-w-[520px]' : 'max-w-[400px]'} mx-auto flex flex-col justify-center py-8 sm:py-12`}>
          <div className="lg:hidden mb-7 h-32 sm:h-40 rounded-2xl overflow-hidden bg-stone-200">
            <img src={image} alt="" className="w-full h-full object-cover" style={{ objectPosition: imagePosition }} />
          </div>
          {eyebrow && <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-red">{eyebrow}</p>}
          <h1 className={`${eyebrow ? 'mt-2' : ''} font-serif text-[30px] sm:text-[34px] font-bold tracking-tight leading-[1.1] text-[#1E1B18]`}>{title}</h1>
          {subtitle && <div className="mt-2.5 text-[14.5px] leading-relaxed text-stone-500">{subtitle}</div>}
          <div className="mt-8">{children}</div>
        </main>

        {portals && <footer className="pt-6 border-t border-stone-200/80">
          <nav aria-label="Other ways into Loved-IT" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
            <span className="text-stone-400">Sign in as</span>
            {PORTALS.map((p) => {
              const here = p.match.some((m) => pathname.startsWith(m));
              return (
                <Link key={p.label} to={p.to} aria-current={here ? 'page' : undefined}
                  className={here ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-brand-red'}>
                  {p.label}
                </Link>
              );
            })}
          </nav>
        </footer>}
      </div>

      <div className="hidden lg:block p-3 pl-0">
        <figure className="sticky top-3 h-[calc(100vh-1.5rem)] rounded-[28px] overflow-hidden bg-stone-800">
          <img src={image} alt={imageAlt} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: imagePosition }} />
          {/* A scrim only where the words sit, so the photo stays bright above them. */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#1E1B18]/90 via-[#1E1B18]/45 to-transparent" aria-hidden="true" />
          <figcaption className="absolute inset-x-0 bottom-0 p-10 xl:p-12 text-white">
            <p className="max-w-[440px] font-serif text-[34px] xl:text-[40px] font-bold leading-[1.08] tracking-tight">{headline}</p>
            {facts.length > 0 && (
              <ul className="mt-7 max-w-[440px] pt-5 border-t border-white/20 space-y-2.5">
                {facts.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-[14px] leading-snug text-white/85">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-white" strokeWidth={1.75} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

/** The "or" rule between a form and the Google button. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 my-6" aria-hidden="true">
      <span className="flex-1 h-px bg-stone-200" />
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">or</span>
      <span className="flex-1 h-px bg-stone-200" />
    </div>
  );
}

/** A notice above a form: green for good news, amber for waiting, grey for a hint, red for a problem. */
export function AuthNotice({ tone, icon: Icon, children }: { tone: 'green' | 'amber' | 'gray' | 'red'; icon?: React.ElementType; children: ReactNode }) {
  const tones = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    gray: 'bg-white border-stone-200 text-stone-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  } as const;
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed ${tones[tone]}`}>
      {Icon && <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
