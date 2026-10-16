// The pieces the hub and courier applications share. Both are made from the signed-in buyer account (like the seller
// application), so they show who is applying instead of asking for name, email, phone, password and ID again, and
// they show the application's status in place of the form once one exists.
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle, AlertCircle, Clock, FileCheck, Mail, LogIn, UserPlus, RotateCcw, Ban, UserCircle2 } from 'lucide-react';
import type { User } from '../../types';

const PRIMARY = 'flex items-center justify-center gap-2 w-full min-h-[46px] rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-wine transition-colors';
const SECONDARY = 'flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors';
const QUIET = 'flex items-center justify-center w-full min-h-[40px] rounded-xl text-sm font-semibold text-gray-500 hover:text-brand-black transition-colors';

function DarkHero({ tone, icon, badge, title, text }: { tone: 'amber' | 'green' | 'red' | 'gray'; icon?: ReactNode; badge?: string; title: string; text: string }) {
  const glow = { amber: 'bg-brand-red/10', green: 'bg-green-500/10', red: 'bg-brand-red/10', gray: 'bg-white/5' }[tone];
  return (
    <div className="relative px-6 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 py-7">
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 ${glow}`} />
      <div className="relative">
        {badge ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 border rounded-full bg-amber-400/15 border-amber-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-semibold tracking-wide text-amber-300">{badge}</span>
          </div>
        ) : icon}
        <h2 className="text-xl font-bold leading-snug text-white">{title}</h2>
        <p className="text-sm text-white/50 mt-1.5">{text}</p>
      </div>
    </div>
  );
}

/** Shown to guests: the application needs a buyer account first. */
export function SignInRequired({ what }: { what: string }) {
  const { pathname } = useLocation();
  const next = encodeURIComponent(pathname);
  return (
    <div className="flex flex-col gap-6">
      <DarkHero
        tone="gray"
        icon={<div className="flex items-center justify-center w-10 h-10 mb-4 border rounded-full bg-white/10 border-white/20"><UserCircle2 className="w-5 h-5 text-white" /></div>}
        title={`Apply as a ${what} from your Loved-IT account`}
        text="Sign in first. Your name, contact details and ID come from your account, so you only add the new details."
      />
      <div className="px-4 py-4 text-sm leading-relaxed text-gray-600 border border-gray-100 rounded-xl bg-gray-50">
        No account yet? Create a buyer account, wait for your ID to be verified, then come back here to apply.
      </div>
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
    <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-gray-50/70">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="object-cover w-11 h-11 border border-gray-200 rounded-xl shrink-0" />
      ) : (
        <div className="flex items-center justify-center text-sm font-bold w-11 h-11 rounded-xl bg-brand-red/10 text-brand-red shrink-0">
          {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Applying as</p>
        <p className="text-sm font-bold truncate text-brand-black">{name}</p>
        <p className="text-xs text-gray-500 truncate">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
        {idType && <p className="text-[11px] text-gray-400 mt-0.5">ID on file: {idType}</p>}
      </div>
      <Link to="/settings" className="text-xs font-semibold text-brand-red hover:underline shrink-0">Edit</Link>
    </div>
  );
}

export interface StatusStep { icon: React.ElementType; label: string; sub: string }

export function PendingStatus({ title, steps, note }: { title: string; steps: StatusStep[]; note?: string }) {
  const all: StatusStep[] = [{ icon: FileCheck, label: 'Application submitted', sub: 'Your documents are in the queue' }, ...steps];
  return (
    <div className="flex flex-col gap-7">
      <DarkHero tone="amber" badge="Under Review" title={title} text={note ?? 'Typically takes 1–3 business days. You can keep shopping meanwhile.'} />
      <div className="flex flex-col">
        {all.map(({ icon: Icon, label, sub }, i) => {
          const done = i === 0;
          const current = i === 1;
          return (
            <div key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${done ? 'bg-green-500 border-green-500' : current ? 'bg-white border-brand-red' : 'bg-white border-gray-200'}`}>
                  {done ? <CheckCircle className="w-4 h-4 text-white" /> : <Icon className={`w-3.5 h-3.5 ${current ? 'text-brand-red' : 'text-gray-300'}`} />}
                </div>
                {i < all.length - 1 && <div className={`w-px flex-1 my-1 ${done ? 'bg-green-200' : 'bg-gray-100'}`} style={{ minHeight: 20 }} />}
              </div>
              <div className="flex-1 min-w-0 pt-1 pb-5">
                <p className={`text-sm font-semibold leading-none ${done ? 'text-green-700' : current ? 'text-brand-black' : 'text-gray-400'}`}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
              {done && <span className="mt-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 h-fit shrink-0">Done</span>}
              {current && <span className="mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 h-fit shrink-0">In progress</span>}
            </div>
          );
        })}
      </div>
      <Link to="/" className={PRIMARY}>Continue Shopping <ArrowRight className="w-4 h-4" /></Link>
    </div>
  );
}

export const DEFAULT_PENDING_STEPS: StatusStep[] = [
  { icon: Clock, label: 'Document verification', sub: 'Your documents are being checked' },
  { icon: Mail, label: 'Decision via email', sub: 'Approval or feedback sent to you' },
];

export function ApprovedStatus({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) {
  return (
    <div className="flex flex-col gap-7">
      <DarkHero
        tone="green"
        icon={<div className="flex items-center justify-center w-10 h-10 mb-4 border rounded-full bg-green-500/20 border-green-500/30"><CheckCircle className="w-5 h-5 text-green-400" /></div>}
        title={title}
        text={text}
      />
      <div className="flex flex-col gap-2">
        <Link to={to} className={PRIMARY}>{cta} <ArrowRight className="w-4 h-4" /></Link>
        <Link to="/" className={QUIET}>Back to Shopping</Link>
      </div>
    </div>
  );
}

export function RejectedStatus({ reason, onReapply, who }: { reason: string | null | undefined; onReapply: () => void; who: string }) {
  return (
    <div className="flex flex-col gap-7">
      <DarkHero
        tone="red"
        icon={<div className="flex items-center justify-center w-10 h-10 mb-4 border rounded-full bg-brand-red/20 border-brand-red/30"><AlertCircle className="w-5 h-5 text-brand-red" /></div>}
        title="Application not approved"
        text={`The ${who} did not approve this application. You can fix the issues and resubmit.`}
      />
      {reason && (
        <div className="px-4 py-4 border border-red-200 rounded-xl bg-red-50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Reason</p>
          <p className="text-sm leading-relaxed text-red-700">{reason}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onReapply} className={PRIMARY}><RotateCcw className="w-4 h-4" /> Resubmit Application</button>
        <Link to="/" className={QUIET}>Back to Shopping</Link>
      </div>
    </div>
  );
}

/** The account cannot apply (wrong account type, missing ID, already a hub or a courier). */
export function BlockedStatus({ title, text, action }: { title: string; text: string; action?: { to: string; label: string } }) {
  return (
    <div className="flex flex-col gap-7">
      <DarkHero
        tone="gray"
        icon={<div className="flex items-center justify-center w-10 h-10 mb-4 border rounded-full bg-white/10 border-white/20"><Ban className="w-5 h-5 text-white/80" /></div>}
        title={title}
        text={text}
      />
      <div className="flex flex-col gap-2">
        {action && <Link to={action.to} className={PRIMARY}>{action.label} <ArrowRight className="w-4 h-4" /></Link>}
        <Link to="/" className={QUIET}>Back to Shopping</Link>
      </div>
    </div>
  );
}
