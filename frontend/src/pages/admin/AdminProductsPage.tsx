import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  getAdminProductsApi, getAdminProductStatsApi,
  approveAdminProductApi, rejectAdminProductApi, archiveAdminProductApi, reactivateAdminProductApi,
  type AdminProduct,
} from '../../api/client';
import { PageHero } from '../../components/admin/dashboardKit';
import {
  type ListMeta, FilterPanel, SearchField, ListCard, ListPager, ListEmpty, ListError, Pill, type PillTone,
  RowAction, SkeletonTiles, SkeletonRows, RailCard, Checklist, useViewMode, ViewToggle, TH, TD, ROW, rowKeys, relativeTime,
} from '../../components/admin/listKit';
import { Package, Archive, X, Store, Eye, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { whole } from '../../utils/adminReports';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Status = '' | 'pending_review' | 'active' | 'draft' | 'rejected' | 'archived';
type Stats = { pending_review: number; active: number; rejected: number; archived: number; draft?: number };

const PER_PAGE_OPTIONS = [24, 48, 96];
const EMPTY_META: ListMeta = { current_page: 1, last_page: 1, per_page: 24, total: 0, from: null, to: null };

/** The colour of each status in the queue (dot and share bar). */
const QUEUE_DOT: Record<string, string> = {
  all: 'bg-gray-900', pending_review: 'bg-amber-400', active: 'bg-emerald-500', draft: 'bg-sky-400', rejected: 'bg-red-500', archived: 'bg-gray-300',
};

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending_review: { label: 'Pending review', tone: 'amber' },
  active: { label: 'Active', tone: 'emerald' },
  draft: { label: 'Draft', tone: 'blue' },
  rejected: { label: 'Rejected', tone: 'red' },
  archived: { label: 'Archived', tone: 'gray' },
};

function peso(n: number) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as PillTone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

function stockOf(p: AdminProduct) {
  return p.variants.reduce((n, v) => n + (v.stock_quantity || 0), 0);
}

/** What the admin can do with a product in its current state. */
function actionsFor(p: AdminProduct) {
  return {
    review: p.status === 'pending_review',
    archive: p.status === 'active' || p.status === 'draft' || (p.status === 'archived' && p.archived_by === 'seller'),
    reactivate: p.status === 'archived' && p.archived_by === 'admin',
  };
}

// ─── Reason dialog (reject or archive) ────────────────────────────────────────

function ReasonDialog({ title, intro, placeholder, confirmLabel, tone, busy, onConfirm, onCancel }: {
  title: string; intro: React.ReactNode; placeholder: string; confirmLabel: string; tone: 'danger' | 'neutral'; busy: boolean;
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-gray-950/50" onClick={onCancel} />
      <div className="relative w-full max-w-md p-5 bg-white border border-gray-100 shadow-2xl rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex items-center justify-center w-8 h-8 text-gray-400 rounded-lg hover:bg-gray-100 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-1 text-[13px] text-gray-500 leading-relaxed">{intro}</p>
        <textarea
          autoFocus
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          className="w-full mt-4 px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none"
        />
        <p className="mt-1 text-[11px] text-gray-400">The seller sees this word for word, so say what to fix.</p>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            disabled={!reason.trim() || busy}
            onClick={() => onConfirm(reason.trim())}
            className={`flex-1 h-10 rounded-xl text-white text-[13px] font-bold disabled:opacity-50 ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-gray-900'}`}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminProductsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>('pending_review');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [view, setView] = useViewMode('products');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminProduct | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminProduct | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getAdminProductsApi({ status: status || undefined, search: search || undefined, page, per_page: perPage })
      .then((res) => { setProducts(res.data); setMeta(res.meta); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [status, search, page, perPage]);

  const refreshStats = useCallback(() => { getAdminProductStatsApi().then(setStats).catch(() => {}); }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshStats(); }, [refreshStats]);

  const pickStatus = (s: Status) => { setStatus(s); setPage(1); };

  const replace = (updated: AdminProduct) => setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  const run = async (product: AdminProduct, action: () => Promise<AdminProduct>) => {
    setBusyId(product.id);
    try {
      replace(await action());
      refreshStats();
      return true;
    } catch {
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const approve = (p: AdminProduct) => run(p, () => approveAdminProductApi(p.id));
  const reactivate = (p: AdminProduct) => run(p, () => reactivateAdminProductApi(p.id));
  const reject = async (p: AdminProduct, reason: string) => { if (await run(p, () => rejectAdminProductApi(p.id, reason))) setRejectTarget(null); };
  const archive = async (p: AdminProduct, reason: string) => { if (await run(p, () => archiveAdminProductApi(p.id, reason))) setArchiveTarget(null); };
  const open = (p: AdminProduct) => navigate(`/admin/products/${p.id}/review`);

  const total = stats ? stats.pending_review + stats.active + stats.rejected + stats.archived + (stats.draft ?? 0) : undefined;
  const tabs = [
    { value: '' as Status, label: 'All', count: total ?? null },
    { value: 'pending_review' as Status, label: 'Pending review', count: stats ? stats.pending_review : null },
    { value: 'active' as Status, label: 'Active', count: stats ? stats.active : null },
    { value: 'draft' as Status, label: 'Drafts', count: stats ? stats.draft ?? 0 : null },
    { value: 'rejected' as Status, label: 'Rejected', count: stats ? stats.rejected : null },
    { value: 'archived' as Status, label: 'Archived', count: stats ? stats.archived : null },
  ];

  const empty = (
    <ListEmpty
      icon={Package}
      title={status === 'pending_review' ? 'Nothing waiting for review' : 'No products here'}
      hint={status === 'pending_review' ? 'New and edited listings land here before buyers can see them.' : 'Products in this state show up here.'}
      filtered={Boolean(search)}
      onClear={() => setSearchInput('')}
    />
  );

  const actionButtons = (p: AdminProduct) => {
    const a = actionsFor(p);
    const busy = busyId === p.id;
    return (
      <>
        {a.review && (
          <>
            <RowAction tone="success" loading={busy} onClick={() => approve(p)} label={`Approve ${p.name}`}><CheckCircle2 className="w-3.5 h-3.5" /> Approve</RowAction>
            <RowAction tone="danger" loading={busy} onClick={() => setRejectTarget(p)} label={`Reject ${p.name}`}><XCircle className="w-3.5 h-3.5" /> Reject</RowAction>
          </>
        )}
        {a.archive && <RowAction tone="brand" loading={busy} onClick={() => setArchiveTarget(p)} label={`Archive ${p.name}`}><Archive className="w-3.5 h-3.5" /> Archive</RowAction>}
        {a.reactivate && <RowAction tone="success" loading={busy} onClick={() => reactivate(p)} label={`Reactivate ${p.name}`}><RotateCcw className="w-3.5 h-3.5" /> Reactivate</RowAction>}
        {!a.review && <RowAction onClick={() => open(p)} label={`Open ${p.name}`}><Eye className="w-3.5 h-3.5" /> View</RowAction>}
      </>
    );
  };

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Package} eyebrow="Admin / Catalog" title="Products"
        subtitle="Check new and edited listings before buyers see them, and take down the ones that break the rules." />

      <div className="grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3 lg:sticky lg:top-4">
          {/* The review queue: every status with its count and share, and the filter at the same time */}
          <nav aria-label="Product status" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
            <p className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-wider text-gray-500 uppercase">Catalog</p>
            <ul className="pb-1.5">
              {tabs.map((t) => {
                const on = status === t.value;
                const share = total && t.value && t.count ? (t.count / total) * 100 : 0;
                return (
                  <li key={t.value || 'all'}>
                    <button type="button" onClick={() => pickStatus(t.value)} aria-current={on ? 'true' : undefined}
                      className={`relative w-full px-4 py-2 text-left transition-colors focus:outline-none focus-visible:bg-red-50/60 ${on ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}>
                      {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-red" aria-hidden="true" />}
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${QUEUE_DOT[t.value || 'all']}`} aria-hidden="true" />
                        <span className={`flex-1 text-[13px] ${on ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{t.label}</span>
                        <span className={`text-[13px] tabular-nums ${on ? 'font-bold text-brand-red' : 'text-gray-500'}`}>{t.count === null ? '…' : whole(t.count)}</span>
                      </span>
                      {t.value && (
                        <span className="block h-1 mt-1.5 ml-4 overflow-hidden bg-gray-100 rounded-full" aria-hidden="true">
                          <span className={`block h-full rounded-full ${QUEUE_DOT[t.value]}`} style={{ width: `${share}%` }} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <RailCard title="Before you approve">
            <Checklist items={[
              'The photos show the actual item, not a stock image of something else.',
              'The name, category and description match the photos.',
              'The price and stock look real for every variant.',
              'Nothing prohibited: weapons, drugs, counterfeits, adult items.',
            ]} />
          </RailCard>
        </aside>

        <section className="min-w-0 space-y-3">
          <FilterPanel>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchField value={searchInput} onChange={setSearchInput} label="Search products" placeholder="Search a product, seller or shop…" />
              <ViewToggle value={view} onChange={setView} />
            </div>
          </FilterPanel>

          {failed ? <ListError message="The products could not be loaded." onRetry={load} /> : (
            <ListCard title={tabs.find((t) => t.value === status)?.label ?? 'Products'} count={meta.total} busy={loading}>
              {view === 'grid' ? (
                products.length === 0 && !loading ? empty : (
                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {loading && products.length === 0 && <SkeletonTiles count={8} />}
                    {products.map((p) => {
                      const stock = stockOf(p);
                      return (
                        <article key={p.id} {...rowKeys(() => open(p))}
                          className={`group flex flex-col overflow-hidden bg-white border border-gray-200/80 rounded-2xl cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-brand-red/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${loading ? 'opacity-60' : ''}`}>
                          <div className="relative overflow-hidden bg-gray-100 aspect-square">
                            {p.thumbnail_url
                              ? <img src={p.thumbnail_url} alt="" loading="lazy" className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
                              : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-10 h-10" /></span>}
                            <span className="absolute left-2 top-2"><StatusPill status={p.status} /></span>
                          </div>
                          <div className="flex flex-col flex-1 p-3">
                            <p className="text-[13px] font-semibold leading-snug text-gray-900 line-clamp-2 group-hover:text-brand-red">{p.name}</p>
                            <p className="mt-1 text-[11.5px] text-gray-500 truncate flex items-center gap-1"><Store className="w-3 h-3 shrink-0" />{p.seller?.shop_name || p.seller?.full_name || 'Unknown shop'}</p>
                            <div className="flex items-baseline justify-between gap-2 mt-2">
                              <span className="text-[15px] font-bold text-brand-red">{peso(p.base_price)}</span>
                              <span className={`text-[11px] ${stock === 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{stock === 0 ? 'Out of stock' : `${whole(stock)} in stock`}</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-gray-400">{p.category?.name ?? 'No category'} · {relativeTime(p.created_at)}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 mt-auto border-t border-gray-100 bg-gray-50/60">
                            {actionsFor(p).review
                              ? <RowAction onClick={() => open(p)} label={`Review ${p.name}`}><Eye className="w-3.5 h-3.5" /> Review</RowAction>
                              : actionButtons(p)}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-[13px]">
                    <thead><tr>
                      <th scope="col" className={TH}>Product</th>
                      <th scope="col" className={`${TH} hidden md:table-cell`}>Shop</th>
                      <th scope="col" className={TH}>Price</th>
                      <th scope="col" className={`${TH} hidden lg:table-cell`}>Stock</th>
                      <th scope="col" className={TH}>Status</th>
                      <th scope="col" className={`${TH} hidden xl:table-cell`}>Submitted</th>
                      <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {loading && products.length === 0 && <SkeletonRows cols={7} />}
                      {!loading && products.length === 0 && <tr><td colSpan={7}>{empty}</td></tr>}
                      {products.map((p) => (
                        <tr key={p.id} {...rowKeys(() => open(p))} className={`${ROW} ${loading ? 'opacity-60' : ''}`}>
                          <td className={TD}>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-11 h-11 overflow-hidden bg-gray-100 border border-gray-200 rounded-lg shrink-0">
                                {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" loading="lazy" className="object-cover w-full h-full" /> : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-4 h-4" /></span>}
                              </span>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate max-w-[280px]">{p.name}</p>
                                <p className="text-[11px] text-gray-400">{p.category?.name ?? 'No category'} · {p.variants.length} variant{p.variants.length === 1 ? '' : 's'}</p>
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} hidden md:table-cell text-gray-600`}><span className="block truncate max-w-[180px]">{p.seller?.shop_name || p.seller?.full_name || '—'}</span></td>
                          <td className={`${TD} font-semibold text-gray-900 whitespace-nowrap`}>{peso(p.base_price)}</td>
                          <td className={`${TD} hidden lg:table-cell text-gray-600`}>{whole(stockOf(p))}</td>
                          <td className={TD}><StatusPill status={p.status} /></td>
                          <td className={`${TD} hidden xl:table-cell text-gray-500 whitespace-nowrap`}>{relativeTime(p.created_at)}</td>
                          <td className={`${TD} text-right`}>
                            <div className="flex items-center justify-end gap-1.5">
                              {actionsFor(p).review && <RowAction onClick={() => open(p)} label={`Review ${p.name}`}><Eye className="w-3.5 h-3.5" /> Review</RowAction>}
                              {actionButtons(p)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ListPager meta={meta} perPage={perPage} perPageOptions={PER_PAGE_OPTIONS} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} noun={['product', 'products']} />
            </ListCard>
          )}
        </section>
      </div>

      {rejectTarget && (
        <ReasonDialog
          title="Reject this product"
          intro={<>Rejecting <span className="font-semibold text-gray-800">{rejectTarget.name}</span>. The seller can fix it and submit it again.</>}
          placeholder="For example: the photos show a different item than the title."
          confirmLabel="Reject"
          tone="danger"
          busy={busyId === rejectTarget.id}
          onConfirm={(reason) => reject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {archiveTarget && (
        <ReasonDialog
          title="Archive this product"
          intro={<>Archiving <span className="font-semibold text-gray-800">{archiveTarget.name}</span> takes it off the storefront. The seller has to edit and resubmit it to bring it back.</>}
          placeholder="For example: this item is not allowed on Loved-IT."
          confirmLabel="Archive"
          tone="neutral"
          busy={busyId === archiveTarget.id}
          onConfirm={(reason) => archive(archiveTarget, reason)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
