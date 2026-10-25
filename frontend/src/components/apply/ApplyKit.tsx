// The pieces the partner applications share (rider, hub, courier). They are made from the signed-in buyer account
// (like the seller application), so they show who is applying instead of asking for name, email, phone, password
// and ID again, and they show the application's status in place of the form once one exists.
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Clock, FileCheck, Mail, LogIn, UserPlus, RotateCcw, Ban, UserCircle2, Circle } from 'lucide-react';
import type { User } from '../../types';
import SiteHeader from '../SiteHeader';
import Footer from '../Footer';

const PRIMARY = 'flex items-center justify-center gap-2 w-full min-h-[46px] rounded-full bg-brand-red text-white text-[14px] font-semibold hover:bg-brand-red-dark transition-colors';
const SECONDARY = 'flex items-center justify-center gap-2 w-full min-h-[44px] rounded-full border border-stone-300 bg-white text-[14px] font-semibold text-stone-800 hover:border-stone-900 transition-colors';
const QUIET = 'flex items-center justify-center w-full min-h-[40px] rounded-full text-[13px] font-semibold text-stone-500 hover:text-stone-900 transition-colors';

// ─── Page frame ───────────────────────────────────────────────────────────────

/**
 * An application page: the storefront header, a title band with the partner's photo, then the form beside a sticky
 * rail (what you need, what you earn, who approves you). Without a rail (status screens) the content sits in a narrow
 * centred column.
 */
export function ApplyLayout({ kicker, title, intro, image, imageAlt, imagePosition = 'center', aside, children }: {
  kicker: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  imagePosition?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      <SiteHeader />
      <div className="max-w-[1200px] w-full mx-auto px-4 sm:px-8 pt-6 sm:pt-8">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] rounded-3xl bg-white border border-stone-200 overflow-hidden">
          <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
            <Link to="/partner" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-stone-500 hover:text-brand-red">
              <ArrowLeft className="w-3.5 h-3.5" /> All ways to partner
            </Link>
            <p className="mt-6 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand-red">{kicker}</p>
            <h1 className="mt-2 text-[28px] sm:text-[36px] font-serif font-bold tracking-tight leading-[1.08] text-[#1E1B18]">{title}</h1>
            <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-stone-600">{intro}</p>
          </div>
          <div className="relative h-44 sm:h-56 md:h-auto md:min-h-[260px] bg-stone-200 order-first md:order-none">
            <img src={image} alt={imageAlt} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: imagePosition }} />
          </div>
        </div>
      </div>
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-8 py-8">
        {aside ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-8 items-start">
            <div className="min-w-0 space-y-4">{children}</div>
            <aside className="lg:sticky lg:top-[126px] space-y-4">{aside}</aside>
          </div>
        ) : (
          <div className="max-w-xl mx-auto">{children}</div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/** A numbered step of an application form. */
export function ApplySection({ n, title, hint, action, children }: { n: number; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-stone-900 text-white text-[13px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
          <div>
            <h2 className="text-[17px] font-semibold text-stone-900">{title}</h2>
            {hint && <p className="mt-0.5 text-[13px] text-stone-500">{hint}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** The rail beside a form: a live checklist, a few facts and who reviews the application. */
export function ApplyRail({ checklist, facts, approver, footnote }: {
  checklist: { label: string; done: boolean }[];
  facts?: { label: string; value: string }[];
  approver: string;
  footnote?: ReactNode;
}) {
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-stone-900">Your application</h2>
          <span className="text-[12px] text-stone-500 tabular-nums">{done} of {checklist.length} done</span>
        </div>
        <div className="mt-2.5 h-1.5 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-red transition-[width] duration-500" style={{ width: `${(done / checklist.length) * 100}%` }} />
        </div>
        <ul className="mt-4 space-y-2">
          {checklist.map((c) => (
            <li key={c.label} className={`flex items-center gap-2.5 text-[13px] ${c.done ? 'text-stone-900' : 'text-stone-500'}`}>
              {c.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <Circle className="w-4 h-4 text-stone-300 shrink-0" />}
              {c.label}
            </li>
          ))}
        </ul>
      </div>
      {facts && facts.length > 0 && (
        <dl className="px-5 py-4 border-t border-stone-100 space-y-2.5">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline justify-between gap-3 text-[13px]">
              <dt className="text-stone-500">{f.label}</dt>
              <dd className="font-semibold text-stone-900 text-right">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="px-5 py-4 border-t border-stone-100 bg-[#FAF8F5]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Who reviews it</p>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-700">{approver}</p>
        {footnote && <div className="mt-2 text-[12px] text-stone-500">{footnote}</div>}
      </div>
    </div>
  );
}

// ─── Status screens ───────────────────────────────────────────────────────────

const TONES = {
  amber: { chip: 'bg-amber-50 text-amber-700', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  green: { chip: 'bg-emerald-50 text-emerald-700', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  red: { chip: 'bg-red-50 text-brand-red', badge: 'bg-red-50 text-red-800 border-red-200' },
  gray: { chip: 'bg-stone-100 text-stone-600', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
} as const;

function StatusCard({ tone, icon: Icon, badge, title, text }: { tone: keyof typeof TONES; icon: React.ElementType; badge?: string; title: string; text: string }) {
  const t = TONES[tone];
  return (
    <div className="rounded-3xl bg-white border border-stone-200 p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${t.chip}`}><Icon className="w-5 h-5" /></span>
        {badge && <span className={`px-2.5 py-1 rounded-full border text-[11.5px] font-semibold ${t.badge}`}>{badge}</span>}
      </div>
      <h2 className="mt-4 text-[22px] font-serif font-bold tracking-tight text-[#1E1B18]">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{text}</p>
    </div>
  );
}

/** Shown to guests: the application needs a buyer account first. */
export function SignInRequired({ what }: { what: string }) {
  const { pathname } = useLocation();
  const next = encodeURIComponent(pathname);
  return (
    <div className="flex flex-col gap-4">
      <StatusCard tone="gray" icon={UserCircle2} title={`Apply as a ${what} from your Loved-IT account`}
        text="Sign in first. Your name, contact details and ID come from your account, so you only add the new details." />
      <p className="px-4 py-3 rounded-2xl bg-white border border-stone-200 text-[13px] leading-relaxed text-stone-600">
        No account yet? Create a buyer account, wait for your ID to be verified, then come back here to apply.
      </p>
      <div className="flex flex-col gap-2">
        <Link to={`/login?next=${next}`} className={PRIMARY}><LogIn className="w-4 h-4" /> Sign in to apply</Link>
        <Link to="/register" className={SECONDARY}><UserPlus className="w-4 h-4" /> Create a buyer account</Link>
      </div>
    </div>
  );
}

/** "Applying as": the account the application will be attached to. */
export function ApplyingAs({ user }: { user: User }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const idType = user.government_id_type?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex items-center gap-3 p-4 rounded-3xl bg-white border border-stone-200">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="object-cover w-12 h-12 rounded-full ring-1 ring-stone-200 shrink-0" />
      ) : (
        <div className="flex items-center justify-center w-12 h-12 text-[14px] font-bold rounded-full bg-[#1E1B18] text-[#FAF8F5] shrink-0">
          {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">Applying as</p>
        <p className="text-[14px] font-semibold truncate text-stone-900">{name}</p>
        <p className="text-[12.5px] text-stone-500 truncate">{user.email}{user.phone ? ` · ${user.phone}` : ''}{idType ? ` · ID: ${idType}` : ''}</p>
      </div>
      <Link to="/settings" className="h-8 px-3 rounded-full border border-stone-300 text-[12px] font-semibold text-stone-700 hover:border-stone-900 inline-flex items-center shrink-0">Edit</Link>
    </div>
  );
}

export interface StatusStep { icon: React.ElementType; label: string; sub: string }

export function PendingStatus({ title, steps, note }: { title: string; steps: StatusStep[]; note?: string }) {
  const all: StatusStep[] = [{ icon: FileCheck, label: 'Application submitted', sub: 'Your documents are in the queue' }, ...steps];
  return (
    <div className="flex flex-col gap-4">
      <StatusCard tone="amber" icon={Clock} badge="Under review" title={title} text={note ?? 'This usually takes 1 to 3 business days. You can keep shopping meanwhile.'} />
      <ol className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6">
        {all.map(({ icon: Icon, label, sub }, i) => {
          const done = i === 0;
          const current = i === 1;
          return (
            <li key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${done ? 'bg-emerald-600 border-emerald-600' : current ? 'bg-white border-brand-red' : 'bg-white border-stone-200'}`}>
                  {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : <Icon className={`w-3.5 h-3.5 ${current ? 'text-brand-red' : 'text-stone-300'}`} />}
                </span>
                {i < all.length - 1 && <span className={`w-px flex-1 my-1 ${done ? 'bg-emerald-200' : 'bg-stone-200'}`} style={{ minHeight: 20 }} />}
              </div>
              <div className="flex-1 min-w-0 pt-1 pb-5">
                <p className={`text-[14px] font-semibold leading-none ${done ? 'text-emerald-700' : current ? 'text-stone-900' : 'text-stone-400'}`}>{label}</p>
                <p className="mt-1 text-[12.5px] text-stone-500">{sub}</p>
              </div>
              {current && <span className="mt-1 h-fit px-2 py-0.5 rounded-full bg-amber-50 text-[11px] font-semibold text-amber-700 shrink-0">In progress</span>}
            </li>
          );
        })}
      </ol>
      <Link to="/" className={PRIMARY}>Continue shopping <ArrowRight className="w-4 h-4" /></Link>
    </div>
  );
}

export const DEFAULT_PENDING_STEPS: StatusStep[] = [
  { icon: Clock, label: 'Document verification', sub: 'Your documents are being checked' },
  { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
];

export function ApprovedStatus({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StatusCard tone="green" icon={CheckCircle2} badge="Approved" title={title} text={text} />
      <div className="flex flex-col gap-2">
        <Link to={to} className={PRIMARY}>{cta} <ArrowRight className="w-4 h-4" /></Link>
        <Link to="/" className={QUIET}>Back to shopping</Link>
      </div>
    </div>
  );
}

export function RejectedStatus({ reason, onReapply, who }: { reason: string | null | undefined; onReapply: () => void; who: string }) {
  return (
    <div className="flex flex-col gap-4">
      <StatusCard tone="red" icon={AlertCircle} badge="Not approved" title="Application not approved"
        text={`The ${who} did not approve this application. You can fix what they pointed out and send it again.`} />
      {reason && (
        <div className="px-5 py-4 rounded-3xl bg-white border border-red-200">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-500">Their reason</p>
          <p className="mt-1 text-[14px] leading-relaxed text-stone-800">{reason}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onReapply} className={PRIMARY}><RotateCcw className="w-4 h-4" /> Apply again</button>
        <Link to="/" className={QUIET}>Back to shopping</Link>
      </div>
    </div>
  );
}

/** The account cannot apply (wrong account type, missing ID, already a hub or a courier). */
export function BlockedStatus({ title, text, action }: { title: string; text: string; action?: { to: string; label: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <StatusCard tone="gray" icon={Ban} title={title} text={text} />
      <div className="flex flex-col gap-2">
        {action && <Link to={action.to} className={PRIMARY}>{action.label} <ArrowRight className="w-4 h-4" /></Link>}
        <Link to="/" className={QUIET}>Back to shopping</Link>
      </div>
    </div>
  );
}
