import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Network, Clock, CheckCircle, XCircle, PauseCircle, Mail, Phone, MapPin, FileText, Warehouse, X, Loader2, ArrowRight } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  FilterPanel, SearchField, ListCard, ListEmpty, ListError, ListPager, Avatar, Pill, RowAction, CardGrid, TileShell, SkeletonTiles,
  RailCard, Checklist, WaitingBadge, DocChip, useDebouncedSearch, type ListMeta, type PillTone,
} from '../../components/admin/listKit';
import { getAdminCourierApplicationsApi, decideAdminCourierApi, openAuthorizedFile, type CourierApplicationsResponse } from '../../api/client';
import type { LogisticsCompanyDetail, LogisticsCompanyStatus } from '../../types';

const TONE: Record<LogisticsCompanyStatus, PillTone> = { PENDING: 'amber', APPROVED: 'emerald', REJECTED: 'red', SUSPENDED: 'gray' };
const LABEL: Record<LogisticsCompanyStatus, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', SUSPENDED: 'Suspended' };
const CHECKLIST = [
  'The DTI, SEC or Mayor\'s permit is valid and names this company.',
  'The company name and code do not imitate an existing courier.',
  'The contact email and number reach a real operations team.',
  'The owner account belongs to the person on the permit.',
];

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  return data?.errors ? Object.values(data.errors)[0][0] : data?.message ?? fallback;
}

function CompanyDrawer({ company, onClose, onDecided }: { company: LogisticsCompanyDetail; onClose: () => void; onDecided: () => void }) {
  const [reasonFor, setReasonFor] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function decide(action: 'approve' | 'reject' | 'suspend' | 'reactivate') {
    if ((action === 'reject' || action === 'suspend') && !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      await decideAdminCourierApi(company.id, action, reason.trim() || undefined);
      onDecided();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'The decision could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  const address = [company.address_street, company.address_barangay, company.address_city, company.address_province, company.address_region, company.address_postal_code].filter(Boolean).join(', ');
  const contact = [company.contact_first_name, company.contact_last_name].filter(Boolean).join(' ');

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={company.name}>
      <div className="flex flex-col w-full h-full max-w-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center min-w-0 gap-3">
            <Avatar name={company.name} src={company.logo_url} size="lg" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{company.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[12px] text-gray-500">{company.code}</span>
                <Pill tone={TONE[company.status]}>{LABEL[company.status]}</Pill>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
          {error && <p role="alert" className="py-2 px-3 text-[13px] text-red-800 bg-red-50 border-l-2 border-red-500 rounded-r-lg">{error}</p>}
          {company.rejection_reason && company.status !== 'APPROVED' && (
            <p className="py-2 px-3 text-[13px] text-gray-700 bg-gray-50 border-l-2 border-gray-400 rounded-r-lg"><strong>Reason:</strong> {company.rejection_reason}</p>
          )}
          {company.description && <p className="text-[13px] leading-relaxed text-gray-600">{company.description}</p>}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Company</h3>
            <dl className="text-[13px] divide-y divide-gray-100 border border-gray-200 rounded-xl">
              {[
                ['SEC registration no.', company.sec_registration_no ?? null],
                ['TIN', company.tin ?? null],
                ['Contact person', contact ? `${contact}${company.contact_position ? `, ${company.contact_position}` : ''}` : null],
                ['Contact email', company.contact_email],
                ['Contact number', company.contact_phone],
                ['Head office', address || null],
                ['Postal code', company.address_postal_code ?? null],
                ['Service areas', company.service_region_names?.length ? company.service_region_names.join('; ') : null],
                ['Hubs', company.hubs_count !== undefined ? `${company.approved_hubs_count ?? 0} active of ${company.hubs_count}` : null],
                ['Applied', company.submitted_at ? new Date(company.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3 py-2.5"><dt className="text-gray-500 shrink-0">{k}</dt><dd className="text-right text-gray-900 break-words">{v}</dd></div>
              ))}
            </dl>
          </section>

          {company.owner && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Owner account</h3>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                <Avatar name={company.owner.name} src={company.owner.avatar_url} size="md" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{company.owner.name}</p>
                  <p className="text-[12px] text-gray-500 truncate">{company.owner.email}{company.owner.phone ? ` · ${company.owner.phone}` : ''}</p>
                </div>
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Documents</h3>
            <div className="space-y-2">
              {(company.documents?.length ? company.documents : company.business_permit_url ? [{ key: 'permit', label: "Mayor's / business permit", url: company.business_permit_url }] : []).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => openAuthorizedFile(d.url).catch(() => setError(`${d.label} could not be opened.`))}
                  className="flex items-center w-full gap-2 px-3 py-2.5 text-left border border-gray-200 rounded-xl text-[13px] font-medium text-gray-800 hover:border-brand-red hover:text-brand-red transition-colors"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" /> {d.label}
                  <span className="ml-auto text-[11px] text-gray-400">Open</span>
                </button>
              ))}
              {!company.documents?.length && !company.business_permit_url && <p className="text-[12.5px] text-gray-400">No documents uploaded.</p>}
            </div>
          </section>

          {reasonFor && (
            <section>
              <label htmlFor="courier-reason" className="mb-1.5 block text-[13px] font-semibold text-gray-900">
                {reasonFor === 'reject' ? 'Why is this company not approved?' : 'Why are you suspending this company?'}
              </label>
              <textarea id="courier-reason" autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent resize-none" />
              <p className="mt-1 text-[11px] text-gray-400">The owner sees this reason.</p>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          {reasonFor ? (
            <>
              <button type="button" onClick={() => { setReasonFor(null); setReason(''); }} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="button" disabled={busy || !reason.trim()} onClick={() => decide(reasonFor)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}{reasonFor === 'reject' ? 'Reject company' : 'Suspend company'}
              </button>
            </>
          ) : company.status === 'PENDING' ? (
            <>
              <button type="button" onClick={() => setReasonFor('reject')} className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-red-300 hover:text-red-700">Reject</button>
              <button type="button" disabled={busy} onClick={() => decide('approve')} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}Approve company
              </button>
            </>
          ) : company.status === 'APPROVED' ? (
            <button type="button" onClick={() => setReasonFor('suspend')} className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-red-300 hover:text-red-700">Suspend company</button>
          ) : company.status === 'SUSPENDED' ? (
            <button type="button" disabled={busy} onClick={() => decide('reactivate')} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}Reactivate company
            </button>
          ) : (
            <span className="text-[12px] text-gray-500">The owner can fix the issues and resubmit.</span>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

type Tab = LogisticsCompanyStatus | 'all';

/** The admin's queue of courier companies (J&T, Flash, …) applying to deliver for Loved-IT shops. */
export default function AdminCourierApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('status') as Tab) || 'PENDING';
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? 1);

  const [data, setData] = useState<CourierApplicationsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<LogisticsCompanyDetail | null>(null);

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }, [params, setParams]);
  const [searchInput, setSearchInput] = useDebouncedSearch(search, (v) => set('search', v));

  const load = useCallback(() => {
    setFailed(false);
    getAdminCourierApplicationsApi({ status: tab, search: search || undefined, page }).then(setData).catch(() => setFailed(true));
  }, [tab, search, page]);
  useEffect(() => { load(); }, [load]);

  const counts = data?.counts;
  const meta: ListMeta = data?.meta ?? { current_page: 1, last_page: 1, per_page: 30, total: 0, from: null, to: null };
  const cards: { key: LogisticsCompanyStatus; label: string; icon: React.ElementType; bg: string; fg: string }[] = [
    { key: 'PENDING', label: 'Pending review', icon: Clock, bg: 'bg-amber-50', fg: 'text-amber-600' },
    { key: 'APPROVED', label: 'Approved couriers', icon: CheckCircle, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    { key: 'SUSPENDED', label: 'Suspended', icon: PauseCircle, bg: 'bg-gray-100', fg: 'text-gray-600' },
    { key: 'REJECTED', label: 'Rejected', icon: XCircle, bg: 'bg-red-50', fg: 'text-red-600' },
  ];

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Network} eyebrow="Applications · Logistics" title="Courier Applications" subtitle="Check the courier companies that want to deliver for Loved-IT shops">
      </PageHero>

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {!counts ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : cards.map((c) => (
              <StatCard key={c.key} compact icon={c.icon} label={c.label} value={counts[c.key.toLowerCase() as keyof typeof counts]} iconBg={c.bg} iconColor={c.fg}
                onClick={() => set('status', c.key)} active={tab === c.key} />
            ))}
          </div>
          <button type="button" onClick={() => set('status', 'all')} aria-pressed={tab === 'all'}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${tab === 'all' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            Every courier
          </button>
          <RailCard title="What to check"><Checklist items={CHECKLIST} /></RailCard>
        </aside>

        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <SearchField value={searchInput} onChange={setSearchInput} label="Search couriers" placeholder="Search company, code or owner…" />
          </FilterPanel>

          {failed ? <ListError message="The courier applications could not be loaded." onRetry={load} /> : (
            <ListCard title={tab === 'all' ? 'Every courier' : cards.find((c) => c.key === tab)?.label} count={meta.total} busy={!data}>
              {data && data.data.length === 0 ? (
                <ListEmpty icon={Network} title={tab === 'PENDING' ? 'No applications waiting' : 'Nothing here yet'} hint="Courier companies apply from their Loved-IT account." filtered={Boolean(search)} onClear={() => setSearchInput('')} />
              ) : (
                <CardGrid>
                  {!data && <SkeletonTiles />}
                  {data?.data.map((c) => (
                    <TileShell key={c.id} onOpen={() => setOpen(c)}>
                      <div className="flex items-start gap-3 p-4">
                        <Avatar name={c.name} src={c.logo_url} size="xl" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{c.name}</p>
                            <Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill>
                          </div>
                          <p className="font-mono text-[12px] text-gray-500 mt-0.5">{c.code}</p>
                          <p className="text-[11px] text-gray-400 truncate">{c.owner?.name ?? '—'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                        {c.contact_email && <DocChip icon={Mail} label={c.contact_email} />}
                        {c.contact_phone && <DocChip icon={Phone} label={c.contact_phone} />}
                        {c.address_city && <DocChip icon={MapPin} label={`${c.address_city}, ${c.address_province}`} />}
                        <DocChip icon={Warehouse} label={`${c.approved_hubs_count ?? 0} active hub${c.approved_hubs_count === 1 ? '' : 's'}`} />
                        <DocChip icon={FileText} label="Permit" ok={Boolean(c.business_permit_url)} />
                      </div>
                      <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                        {c.status === 'PENDING' ? <WaitingBadge since={c.submitted_at} /> : <span className="text-[11px] text-gray-500">#{c.id}</span>}
                        <RowAction onClick={() => setOpen(c)}>{c.status === 'PENDING' ? 'Review' : 'View'} <ArrowRight className="w-3 h-3" aria-hidden="true" /></RowAction>
                      </div>
                    </TileShell>
                  ))}
                </CardGrid>
              )}
              <ListPager meta={meta} perPage={30} perPageOptions={[30]} onPage={(n) => set('page', String(n))} onPerPage={() => {}} noun={['courier', 'couriers']} />
            </ListCard>
          )}
        </section>
      </div>

      {open && <CompanyDrawer company={open} onClose={() => setOpen(null)} onDecided={load} />}
    </div>
  );
}
