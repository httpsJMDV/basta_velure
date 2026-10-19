import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { Warehouse, MapPin, Bike, Package, FileText, IdCard, X, Loader2, ArrowRight, Clock, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import {
  FilterPanel, SearchField, ListCard, ListEmpty, ListError, Avatar, Pill, RowAction, CardGrid, TileShell, SkeletonTiles,
  RailCard, Checklist, WaitingBadge, DocChip, type PillTone,
} from '../../components/admin/listKit';
import { getLogisticsHubsApi, getLogisticsHubApi, decideLogisticsHubApi, openAuthorizedFile } from '../../api/client';
import type { LogisticsHubRow, SortingCenterApplicationDetail, SortingCenterStatus } from '../../types';
import type { LogisticsOutletContext } from './LogisticsLayout';
import { HeroStats } from '../../components/logistics/CourierKit';

type Tab = SortingCenterStatus | 'ALL';

const TONE: Record<SortingCenterStatus, PillTone> = { PENDING: 'amber', APPROVED: 'emerald', REJECTED: 'red', SUSPENDED: 'gray' };
const LABEL: Record<SortingCenterStatus, string> = { PENDING: 'Pending review', APPROVED: 'Active', REJECTED: 'Rejected', SUSPENDED: 'Suspended' };

const CHECKLIST = [
  'The DTI or Mayor\'s permit is readable and names this hub or its owner.',
  'The owner\'s ID matches the applicant\'s name.',
  'The address is a real place inside the barangays it will cover.',
  'The coverage does not leave gaps or overlap your other hubs.',
];

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
  return data?.errors ? Object.values(data.errors)[0][0] : data?.message ?? fallback;
}

/** Review drawer: the application in full, its documents, and the decision buttons. */
function HubDrawer({ hubId, onClose, onDecided }: { hubId: number; onClose: () => void; onDecided: () => void }) {
  const [hub, setHub] = useState<SortingCenterApplicationDetail | null>(null);
  const [error, setError] = useState('');
  const [reasonFor, setReasonFor] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLogisticsHubApi(hubId).then(setHub).catch((e) => setError(errorMessage(e, 'The hub could not be loaded.')));
  }, [hubId]);

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
      await decideLogisticsHubApi(hubId, action, reason.trim() || undefined);
      onDecided();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'The decision could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function open(url: string | null | undefined) {
    if (!url) return;
    try { await openAuthorizedFile(url); } catch { setError('The document could not be opened.'); }
  }

  const applicant = hub?.applicant;
  const name = applicant ? [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') : '';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label="Hub application">
      <div className="flex flex-col w-full h-full max-w-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Hub application</p>
            <h2 className="text-base font-bold text-gray-900 truncate">{hub?.hub_name ?? '…'}</h2>
            {hub && <div className="mt-1"><Pill tone={TONE[hub.status]}>{LABEL[hub.status]}</Pill></div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </header>

        <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
          {error && <p role="alert" className="py-2 px-3 text-[13px] text-red-800 bg-red-50 border-l-2 border-red-500 rounded-r-lg">{error}</p>}
          {!hub && !error && <div className="space-y-3 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}</div>}

          {hub && (
            <>
              {hub.rejection_reason && hub.status !== 'APPROVED' && (
                <p className="py-2 px-3 text-[13px] text-gray-700 bg-gray-50 border-l-2 border-gray-400 rounded-r-lg"><strong>Reason:</strong> {hub.rejection_reason}</p>
              )}
              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Location & coverage</h3>
                <dl className="text-[13px] divide-y divide-gray-100 border border-gray-200 rounded-xl">
                  <div className="flex justify-between gap-3 px-3 py-2.5"><dt className="text-gray-500">Address</dt><dd className="text-right text-gray-900">{[hub.address_street, hub.address_barangay, hub.address_city, hub.address_province].filter(Boolean).join(', ')}</dd></div>
                  <div className="flex justify-between gap-3 px-3 py-2.5"><dt className="text-gray-500">Barangays covered</dt><dd className="font-medium text-gray-900">{hub.coverage_count}</dd></div>
                  <div className="flex justify-between gap-3 px-3 py-2.5"><dt className="text-gray-500">Applied</dt><dd className="text-gray-900">{hub.created_at ? new Date(hub.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</dd></div>
                </dl>
                {hub.coverage_barangays.length > 0 && (
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-gray-400 break-words">{hub.coverage_barangays.join(' · ')}</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Owner</h3>
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                  <Avatar name={name || hub.hub_name} size="md" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{name || '—'}</p>
                    <p className="text-[12px] text-gray-500 truncate">{applicant?.email}{applicant?.phone ? ` · ${applicant.phone}` : ''}</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-gray-900">Documents</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { label: 'DTI / Mayor\'s permit', url: hub.dti_permit_url, icon: FileText },
                    { label: 'Owner ID (front)', url: applicant?.government_id_image_url, icon: IdCard },
                    { label: 'Owner ID (back)', url: applicant?.government_id_image_back_url, icon: IdCard },
                  ].map((doc) => (
                    <button
                      key={doc.label}
                      type="button"
                      disabled={!doc.url}
                      onClick={() => open(doc.url)}
                      className="flex items-center gap-2 px-3 py-2.5 text-left border border-gray-200 rounded-xl text-[13px] font-medium text-gray-800 hover:border-brand-red hover:text-brand-red disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-800 transition-colors"
                    >
                      <doc.icon className="w-4 h-4 shrink-0" aria-hidden="true" /> {doc.label}
                      <span className="ml-auto text-[11px] text-gray-400">{doc.url ? 'Open' : 'None'}</span>
                    </button>
                  ))}
                </div>
              </section>

              {reasonFor && (
                <section>
                  <label htmlFor="hub-reason" className="mb-1.5 block text-[13px] font-semibold text-gray-900">
                    {reasonFor === 'reject' ? 'Why is this hub not approved?' : 'Why are you suspending this hub?'}
                  </label>
                  <textarea
                    id="hub-reason"
                    autoFocus
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 500))}
                    placeholder={reasonFor === 'reject' ? 'e.g. The permit is expired. Upload a valid one and resubmit.' : 'e.g. Repeated late deliveries this month.'}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent resize-none"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">The hub owner sees this reason.</p>
                </section>
              )}
            </>
          )}
        </div>

        {hub && (
          <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
            {reasonFor ? (
              <>
                <button type="button" onClick={() => { setReasonFor(null); setReason(''); }} className="h-10 px-4 rounded-lg text-[13px] font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="button" disabled={busy || !reason.trim()} onClick={() => decide(reasonFor)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold disabled:opacity-50">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}{reasonFor === 'reject' ? 'Reject hub' : 'Suspend hub'}
                </button>
              </>
            ) : hub.status === 'PENDING' ? (
              <>
                <button type="button" onClick={() => setReasonFor('reject')} className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-red-300 hover:text-red-700">Reject</button>
                <button type="button" disabled={busy} onClick={() => decide('approve')} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}Approve hub
                </button>
              </>
            ) : hub.status === 'APPROVED' ? (
              <button type="button" onClick={() => setReasonFor('suspend')} className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-red-300 hover:text-red-700">Suspend hub</button>
            ) : hub.status === 'SUSPENDED' ? (
              <button type="button" disabled={busy} onClick={() => decide('reactivate')} className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}Reactivate hub
              </button>
            ) : (
              <span className="text-[12px] text-gray-500">The owner can fix the issues and resubmit.</span>
            )}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The courier's hubs: applications to review first, then the live network. */
export default function LogisticsHubsPage() {
  const { refresh } = useOutletContext<LogisticsOutletContext>();
  const [hubs, setHubs] = useState<LogisticsHubRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getLogisticsHubsApi().then(setHubs).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { PENDING: 0, APPROVED: 0, SUSPENDED: 0, REJECTED: 0, ALL: hubs?.length ?? 0 };
    hubs?.forEach((h) => { c[h.status] += 1; });
    return c;
  }, [hubs]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (hubs ?? []).filter((h) => (tab === 'ALL' || h.status === tab)
      && (!q || h.hub_name.toLowerCase().includes(q) || h.city_province.toLowerCase().includes(q) || (h.applicant_name ?? '').toLowerCase().includes(q)));
  }, [hubs, tab, search]);

  const tabs: { key: Tab; label: string; icon: React.ElementType; bg: string; fg: string }[] = [
    { key: 'PENDING', label: 'Applications', icon: Clock, bg: 'bg-amber-50', fg: 'text-amber-600' },
    { key: 'APPROVED', label: 'Active hubs', icon: CheckCircle, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
    { key: 'SUSPENDED', label: 'Suspended', icon: PauseCircle, bg: 'bg-gray-100', fg: 'text-gray-600' },
    { key: 'REJECTED', label: 'Rejected', icon: XCircle, bg: 'bg-red-50', fg: 'text-red-600' },
  ];

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Warehouse} eyebrow="Network" title="Hubs & Applications" subtitle="Approve the hubs that apply to join you and manage the ones in your network">
        {hubs && (
          <HeroStats items={[
            { label: 'Applications', value: counts.PENDING, tone: counts.PENDING ? 'warn' : 'default' },
            { label: 'Active hubs', value: counts.APPROVED, tone: 'good' },
            { label: 'Suspended', value: counts.SUSPENDED },
          ]} />
        )}
      </PageHero>

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {!hubs ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : tabs.map((t) => (
              <StatCard key={t.key} compact icon={t.icon} label={t.label} value={counts[t.key]} iconBg={t.bg} iconColor={t.fg} onClick={() => setTab(t.key)} active={tab === t.key} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTab('ALL')}
            aria-pressed={tab === 'ALL'}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${tab === 'ALL' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            Every hub <span className="tabular-nums">{counts.ALL}</span>
          </button>
          <RailCard title="What to check"><Checklist items={CHECKLIST} /></RailCard>
        </aside>

        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <SearchField value={search} onChange={setSearch} label="Search hubs" placeholder="Search hub, city or owner…" />
          </FilterPanel>

          {failed ? <ListError message="The hubs could not be loaded." onRetry={load} /> : (
            <ListCard title={tab === 'ALL' ? 'Every hub' : tabs.find((t) => t.key === tab)?.label} count={shown.length} busy={!hubs}>
              {hubs && shown.length === 0 ? (
                <ListEmpty icon={Warehouse} title={tab === 'PENDING' ? 'No applications waiting' : 'No hubs here yet'}
                  hint={tab === 'PENDING' ? 'Hubs that choose your company when they apply show up here.' : 'Try another status.'} filtered={Boolean(search)} onClear={() => setSearch('')} />
              ) : (
                <CardGrid>
                  {!hubs && <SkeletonTiles />}
                  {shown.map((h) => (
                    <TileShell key={h.id} onOpen={() => setOpenId(h.id)}>
                      <div className="flex items-start gap-3 p-4">
                        <div className="relative shrink-0">
                          <Avatar name={h.applicant_name || h.hub_name} src={h.applicant_avatar_url} size="xl" />
                          <span className="absolute flex items-center justify-center w-6 h-6 text-white border-2 border-white rounded-lg -bottom-1 -right-1 bg-neutral-800" aria-hidden="true"><Warehouse className="w-3 h-3" /></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[14px] font-bold leading-tight truncate text-brand-black group-hover:text-brand-red">{h.hub_name}</p>
                            <Pill tone={TONE[h.status]}>{LABEL[h.status]}</Pill>
                          </div>
                          <p className="text-[12px] font-medium text-gray-700 truncate mt-0.5">{h.applicant_name ?? '—'}</p>
                          <p className="text-[11px] text-gray-400 truncate">{h.applicant_email ?? ''}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                        <DocChip icon={MapPin} label={h.city_province || '—'} />
                        <DocChip icon={Warehouse} label={`${h.coverage_count} barangay${h.coverage_count === 1 ? '' : 's'}`} />
                        {h.status === 'APPROVED' && <DocChip icon={Bike} label={`${h.active_riders} rider${h.active_riders === 1 ? '' : 's'}`} />}
                        {h.status === 'APPROVED' && <DocChip icon={Package} label={`${h.active_parcels} active parcel${h.active_parcels === 1 ? '' : 's'}`} />}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-4 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
                        {h.status === 'PENDING' ? <WaitingBadge since={h.submitted_at} /> : <span className="text-[11px] text-gray-500">#{h.id}</span>}
                        <RowAction onClick={() => setOpenId(h.id)}>{h.status === 'PENDING' ? 'Review' : 'Manage'} <ArrowRight className="w-3 h-3" aria-hidden="true" /></RowAction>
                      </div>
                    </TileShell>
                  ))}
                </CardGrid>
              )}
            </ListCard>
          )}
        </section>
      </div>

      {openId !== null && <HubDrawer hubId={openId} onClose={() => setOpenId(null)} onDecided={() => { load(); refresh(); }} />}
    </div>
  );
}
