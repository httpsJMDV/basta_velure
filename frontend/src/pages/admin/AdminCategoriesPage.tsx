import { useEffect, useState, useCallback, useMemo, useRef, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import CustomSelect from '../../components/ui/CustomSelect';
import { SidePanel, Dialog, BUTTON } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import { HeroStats } from '../../components/logistics/CourierKit';
import CategoryArt from '../../components/storefront/CategoryArt';
import {
  IconTaxonomy, IconSubcategory, IconProducts, IconFda, IconCommission, IconHidden, IconEdit, IconDelete, IconAdd, IconLock,
  IconSearch, IconOpenInStore, IconPhoto, IconRestore,
} from '../../components/admin/categoryIcons';
import {
  getAdminCategoriesApi,
  createAdminCategoryApi,
  updateAdminCategoryApi,
  deleteAdminCategoryApi,
  uploadCategoryPhotoApi,
  removeCategoryPhotoApi,
} from '../../api/client';
import { downscaleImage } from '../../utils/imageDownscale';
import type { AdminCategoryParent, AdminCategoryLeaf, AdminCategoryMetrics, CategoryPayload } from '../../types';

/** "Others" and its "Other items": the catch-all stays open and last, and cannot be deleted or moved (it can be renamed). */
const isLocked = (slug: string) => slug === 'others' || slug === 'other-items';

type Filter = 'all' | 'fda' | 'override' | 'inactive';

interface FormState {
  id?: number;
  isChild: boolean;
  name: string;
  slug: string;
  parent_id?: number | null;
  sort_order: number;
  is_active: boolean;
  requires_fda: boolean;
  commission_rate: string;
  /** The uploaded photo it has now (null: the built-in picture). */
  photo_url: string | null;
  /** A new photo picked in the panel, uploaded on Save. */
  photoFile?: File;
  photoPreview?: string;
  /** Go back to the built-in picture on Save. */
  removePhoto?: boolean;
}

type AnyCategory = AdminCategoryParent | AdminCategoryLeaf;

/** Photos are shrunk in the browser first, so even big phone photos fit the 5 MB limit. */
const PHOTO_MAX_EDGE = 1200;
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

function slugify(text: string): string {
  return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
}

const leafProducts = (p: AdminCategoryParent) => p.children.reduce((n, c) => n + (c.products_count ?? 0), 0) + (p.products_count ?? 0);
const leafLive = (p: AdminCategoryParent) => p.children.reduce((n, c) => n + (c.active_products_count ?? 0), 0);

/** The picture the storefront shows for the category: the uploaded photo, the built-in one, or its icon. */
function Thumb({ slug, name, photoUrl, busy, className }: { slug: string; name: string; photoUrl?: string | null; busy?: boolean; className: string }) {
  return (
    <span className={`relative block overflow-hidden bg-stone-100 ring-1 ring-black/5 shrink-0 ${className}`}>
      <CategoryArt category={{ id: 0, slug, name, product_count: 0, photo_url: photoUrl ?? null, image_url: null }} />
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center bg-white/70" role="status" aria-label="Uploading the photo">
          <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
        </span>
      )}
    </span>
  );
}

/** An on/off switch for whether shoppers and sellers see the category. */
function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-gray-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

const ICON_BUTTON = 'w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors';

/**
 * Admin > Categories: the two-level tree shoppers browse and sellers list in. Parents on the left with their photo and
 * size; the chosen parent on the right with its sub-categories as a ledger (photo, products, commission, FDA rule,
 * on/off). Creating and editing open a side panel; deleting is refused while a category still has children or products.
 * Any category's photo can be replaced (click it) and set back to the built-in picture.
 */
export default function AdminCategoriesPage() {
  const { showToast } = useToast();
  const [parents, setParents] = useState<AdminCategoryParent[]>([]);
  const [metrics, setMetrics] = useState<AdminCategoryMetrics>({ total_parents: 0, total_leaves: 0, total_products: 0, fda_regulated_leaves: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ category: AdminCategoryParent | AdminCategoryLeaf; isParent: boolean; children: number; products: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // One file picker for every "Change photo": for a category straight away, or for the open panel (saved with it).
  const fileInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<AnyCategory | 'form' | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await getAdminCategoriesApi();
      setParents(res.data);
      setMetrics(res.metrics);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // The panel's preview is a local blob: freed when it is replaced or the panel closes.
  const preview = form?.photoPreview;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const baseRate = metrics.base_commission_rate ?? 5;
  const q = search.trim().toLowerCase();
  const leafMatches = useCallback((c: AdminCategoryLeaf, parent: AdminCategoryParent) =>
    !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q) || parent.name.toLowerCase().includes(q), [q]);

  // The rail: parents whose name matches, or that hold a matching sub-category.
  const railParents = useMemo(() => parents.filter((p) =>
    !q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.children.some((c) => leafMatches(c, p))), [parents, q, leafMatches]);

  const selected = railParents.find((p) => p.id === selectedId) ?? railParents[0] ?? null;

  const counts = useMemo(() => {
    const list = selected?.children ?? [];
    return {
      all: list.length,
      fda: list.filter((c) => c.requires_fda).length,
      override: list.filter((c) => c.commission_rate !== null).length,
      inactive: list.filter((c) => !c.is_active).length,
    };
  }, [selected]);

  const rows = useMemo(() => (selected?.children ?? []).filter((c) => {
    if (!leafMatches(c, selected!)) return false;
    if (filter === 'fda') return c.requires_fda;
    if (filter === 'override') return c.commission_rate !== null;
    if (filter === 'inactive') return !c.is_active;
    return true;
  }), [selected, filter, leafMatches]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const toggleActive = async (category: AdminCategoryParent | AdminCategoryLeaf) => {
    const next = !category.is_active;
    setParents((prev) => prev.map((p) => (p.id === category.id
      ? { ...p, is_active: next }
      : { ...p, children: p.children.map((c) => (c.id === category.id ? { ...c, is_active: next } : c)) })));
    try {
      await updateAdminCategoryApi(category.id, { is_active: next });
      showToast(`${category.name} is ${next ? 'open again' : 'hidden from shoppers and sellers'}.`);
    } catch (err: unknown) {
      void load();
      showToast(errorMessage(err, `${category.name} could not be updated.`), 'error');
    }
  };

  // ─── Photos ─────────────────────────────────────────────────────────────────

  const setPhotoUrl = (id: number, photoUrl: string | null) =>
    setParents((prev) => prev.map((p) => (p.id === id
      ? { ...p, photo_url: photoUrl }
      : { ...p, children: p.children.map((c) => (c.id === id ? { ...c, photo_url: photoUrl } : c)) })));

  const pickPhoto = (target: AnyCategory | 'form') => {
    photoTarget.current = target;
    fileInput.current?.click();
  };

  const onPhotoPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    const target = photoTarget.current;
    if (!picked || !target) return;
    if (!PHOTO_TYPES.includes(picked.type)) { showToast('Choose a JPG or PNG photo.', 'error'); return; }
    const { file } = await downscaleImage(picked, PHOTO_MAX_EDGE, 0.85);
    if (file.size > PHOTO_MAX_BYTES) { showToast('The photo must be 5 MB or smaller.', 'error'); return; }

    if (target === 'form') {
      setForm((f) => (f ? { ...f, photoFile: file, photoPreview: URL.createObjectURL(file), removePhoto: false } : f));
      return;
    }
    setPhotoBusyId(target.id);
    try {
      const res = await uploadCategoryPhotoApi(target.id, file);
      setPhotoUrl(target.id, res.data.photo_url);
      showToast(`New photo for ${target.name}.`);
    } catch (err: unknown) {
      showToast(errorMessage(err, `The photo for ${target.name} was not saved. Try again.`), 'error');
    } finally {
      setPhotoBusyId(null);
    }
  };

  const restoreDefaultPhoto = async (category: AnyCategory) => {
    setPhotoBusyId(category.id);
    try {
      await removeCategoryPhotoApi(category.id);
      setPhotoUrl(category.id, null);
      showToast(`${category.name} uses its default picture again.`);
    } catch (err: unknown) {
      showToast(errorMessage(err, 'The photo could not be removed. Try again.'), 'error');
    } finally {
      setPhotoBusyId(null);
    }
  };

  const openCreate = (parentId?: number) => {
    setFormError(null);
    setForm({
      isChild: !!parentId, name: '', slug: '', parent_id: parentId ?? null, sort_order: 1,
      is_active: true, requires_fda: false, commission_rate: '', photo_url: null,
    });
  };

  const openEdit = (category: AdminCategoryParent | AdminCategoryLeaf, isChild: boolean) => {
    setFormError(null);
    setForm({
      id: category.id, isChild, name: category.name, slug: category.slug,
      parent_id: isChild ? (category as AdminCategoryLeaf).parent_id : null,
      sort_order: category.sort_order, is_active: category.is_active,
      requires_fda: isChild ? (category as AdminCategoryLeaf).requires_fda : false,
      commission_rate: category.commission_rate !== null && category.commission_rate !== undefined ? String(category.commission_rate) : '',
      photo_url: category.photo_url ?? null,
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) { setFormError('Enter the category name.'); return; }
    const rate = form.commission_rate.trim();
    if (rate !== '' && (!/^\d+(\.\d{1,2})?$/.test(rate) || Number(rate) > 100)) {
      setFormError('The commission rate must be a number from 0 to 100 with at most 2 decimals.');
      return;
    }
    const payload: CategoryPayload = {
      name: form.name.trim(),
      slug: form.slug ? slugify(form.slug) : slugify(form.name),
      parent_id: form.isChild ? Number(form.parent_id) : null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
      requires_fda: form.isChild ? form.requires_fda : false,
      commission_rate: rate !== '' ? Number(rate) : null,
    };
    setSaving(true);
    setFormError(null);
    let id = form.id;
    try {
      if (id) await updateAdminCategoryApi(id, payload);
      else id = (await createAdminCategoryApi(payload)).data.id as number;
    } catch (err: unknown) {
      setFormError(errorMessage(err, 'The category was not saved. Try again.'));
      setSaving(false);
      return;
    }
    // The category is saved by now, so a photo that fails is reported without keeping the panel open.
    try {
      if (form.photoFile) await uploadCategoryPhotoApi(id, form.photoFile);
      else if (form.removePhoto && form.photo_url) await removeCategoryPhotoApi(id);
      showToast(form.id ? `${payload.name} saved.` : `${payload.name} created.`);
    } catch (err: unknown) {
      showToast(`${payload.name} was saved, but the photo was not: ${errorMessage(err, 'try uploading it again.')}`, 'error');
    } finally {
      setSaving(false);
      setForm(null);
      void load();
    }
  };

  const askDelete = (category: AdminCategoryParent | AdminCategoryLeaf, isParent: boolean) => {
    setDeleteError(null);
    setDeleteTarget({
      category, isParent,
      children: isParent ? (category as AdminCategoryParent).children.length : 0,
      products: isParent ? 0 : (category as AdminCategoryLeaf).products_count ?? 0,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminCategoryApi(deleteTarget.category.id);
      showToast(`${deleteTarget.category.name} deleted.`);
      if (deleteTarget.isParent && selected?.id === deleteTarget.category.id) setSelectedId(null);
      setDeleteTarget(null);
      void load();
    } catch (err: unknown) {
      setDeleteError(errorMessage(err, 'The category could not be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const blocked = deleteTarget ? (deleteTarget.isParent ? deleteTarget.children > 0 : deleteTarget.products > 0) : false;
  const commissionOf = (c: AdminCategoryLeaf, p: AdminCategoryParent) =>
    c.commission_rate !== null ? { rate: c.commission_rate, from: 'own' as const }
      : p.commission_rate !== null ? { rate: p.commission_rate, from: 'parent' as const }
        : { rate: baseRate, from: 'platform' as const };

  return (
    <div className="w-full pb-8 space-y-4">
      <input ref={fileInput} type="file" accept="image/jpeg,image/png" className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => void onPhotoPicked(e)} />
      <PageHero icon={IconTaxonomy} eyebrow="Catalog" title="Categories"
        subtitle="The tree shoppers browse and sellers list in. Commission and FDA rules are set per category.">
        <HeroStats items={[
          { label: 'Parents', value: metrics.total_parents },
          { label: 'Sub-categories', value: metrics.total_leaves },
          { label: 'Products', value: metrics.total_products },
          { label: 'FDA-gated', value: metrics.fda_regulated_leaves, tone: metrics.fda_regulated_leaves ? 'warn' : 'default' },
        ]} />
        <button type="button" className={HERO_BUTTON} onClick={() => openCreate()}><IconAdd className="w-4 h-4" /> New category</button>
      </PageHero>

      {failed ? (
        <div role="alert" className="p-6 bg-white border border-gray-200/80 rounded-2xl text-center">
          <p className="text-sm font-semibold text-gray-900">The categories could not be loaded.</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-3 text-[13px] font-semibold text-brand-red hover:underline">Try again</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          {/* ── Parents ── */}
          <aside className="lg:sticky lg:top-[84px] bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-3 border-b border-gray-100">
              <label className="relative block">
                <span className="sr-only">Search categories</span>
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or slug…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-gray-50 border border-gray-200 text-[13px] outline-none focus:bg-white focus:border-gray-900 transition-colors" />
              </label>
            </div>
            <div className="flex items-baseline justify-between px-4 pt-3 pb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Parent categories</p>
              <p className="text-[11px] text-gray-400 tabular-nums">{railParents.length}</p>
            </div>
            {loading ? (
              <ul className="px-2 pb-2 space-y-1">{Array.from({ length: 8 }, (_, i) => <li key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</ul>
            ) : railParents.length === 0 ? (
              <p className="px-4 pb-5 text-[13px] text-gray-500">Nothing matches “{search}”.</p>
            ) : (
              <ul className="flex lg:block gap-1.5 overflow-x-auto lg:overflow-visible px-2 pb-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto no-scrollbar">
                {railParents.map((p) => {
                  const on = selected?.id === p.id;
                  return (
                    <li key={p.id} className="shrink-0 w-[220px] lg:w-auto">
                      <button type="button" onClick={() => { setSelectedId(p.id); setFilter('all'); }} aria-current={on ? 'true' : undefined}
                        className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors ${on ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                        <Thumb slug={p.slug} name={p.name} photoUrl={p.photo_url} busy={photoBusyId === p.id} className={`w-11 h-11 rounded-lg ${p.is_active ? '' : 'opacity-50 grayscale'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[13px] font-semibold truncate ${on ? 'text-white' : 'text-gray-900'}`}>{p.name}</span>
                            {isLocked(p.slug) && <IconLock className={`w-3.5 h-3.5 shrink-0 ${on ? 'text-white/60' : 'text-gray-400'}`} />}
                            {!p.is_active && <IconHidden className={`w-3.5 h-3.5 shrink-0 ${on ? 'text-white/60' : 'text-gray-400'}`} />}
                          </span>
                          <span className={`block text-[11.5px] tabular-nums ${on ? 'text-white/60' : 'text-gray-500'}`}>
                            {p.children.length} sub · {leafProducts(p).toLocaleString()} products
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ── The chosen parent ── */}
          {loading ? (
            <div className="h-[420px] rounded-2xl bg-white border border-gray-200/80 animate-pulse" />
          ) : !selected ? (
            <div className="p-12 rounded-2xl bg-white border border-gray-200/80 text-center">
              <IconTaxonomy className="w-8 h-8 mx-auto text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-gray-900">No categories match</p>
              <p className="mt-1 text-[13px] text-gray-500">Clear the search to see every category.</p>
            </div>
          ) : (
            <section className="bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden">
              {/* Header */}
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-5 border-b border-gray-100">
                <div className="relative w-full sm:w-36 h-36 shrink-0">
                  <Thumb slug={selected.slug} name={selected.name} photoUrl={selected.photo_url} busy={photoBusyId === selected.id}
                    className={`w-full h-full rounded-xl ${selected.is_active ? '' : 'opacity-60 grayscale'}`} />
                  <div className="absolute inset-x-2 bottom-2 flex gap-1">
                    <button type="button" onClick={() => pickPhoto(selected)} disabled={photoBusyId !== null}
                      className="flex-1 h-8 rounded-lg bg-black/60 hover:bg-black/75 backdrop-blur-sm text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60">
                      <IconPhoto className="w-3.5 h-3.5" /> Change photo
                    </button>
                    {selected.photo_url && (
                      <button type="button" onClick={() => void restoreDefaultPhoto(selected)} disabled={photoBusyId !== null}
                        title="Use the default picture" aria-label={`Use the default picture for ${selected.name}`}
                        className="w-8 h-8 rounded-lg bg-black/60 hover:bg-black/75 backdrop-blur-sm text-white inline-flex items-center justify-center transition-colors disabled:opacity-60">
                        <IconRestore className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Parent category · #{selected.sort_order}</p>
                      <h2 className="mt-0.5 font-serif text-[24px] font-bold tracking-tight leading-tight text-[#1E1B18]">{selected.name}</h2>
                      <p className="mt-0.5 font-mono text-[12px] text-gray-400">/{selected.slug}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {selected.is_active && (
                        <Link to={`/category/${selected.slug}`} target="_blank" rel="noopener noreferrer" className={ICON_BUTTON} title="Open in the store" aria-label={`Open ${selected.name} in the store`}>
                          <IconOpenInStore />
                        </Link>
                      )}
                      <button type="button" onClick={() => openEdit(selected, false)} className={ICON_BUTTON} title="Edit" aria-label={`Edit ${selected.name}`}><IconEdit /></button>
                      {!isLocked(selected.slug) && (
                        <button type="button" onClick={() => askDelete(selected, true)} className={`${ICON_BUTTON} hover:!text-red-600 hover:!bg-red-50`} title="Delete" aria-label={`Delete ${selected.name}`}><IconDelete /></button>
                      )}
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100 text-[12px]">
                    {[
                      { icon: IconSubcategory, label: 'Sub-categories', value: String(selected.children.length) },
                      { icon: IconProducts, label: 'Products', value: `${leafProducts(selected).toLocaleString()}`, sub: `${leafLive(selected).toLocaleString()} live` },
                      { icon: IconCommission, label: 'Commission', value: `${selected.commission_rate ?? baseRate}%`, sub: selected.commission_rate !== null ? 'Set for this category' : 'Platform rate' },
                      { icon: IconFda, label: 'FDA-gated', value: String(selected.children.filter((c) => c.requires_fda).length), sub: 'sub-categories' },
                    ].map(({ icon: Icon, label, value, sub }) => (
                      <div key={label} className="bg-white px-3 py-2.5">
                        <dt className="flex items-center gap-1.5 text-gray-500"><Icon className="w-3.5 h-3.5 text-gray-400" />{label}</dt>
                        <dd className="mt-1 text-[16px] font-bold text-gray-900 tabular-nums leading-none">{value}</dd>
                        {sub && <dd className="mt-1 text-[11px] text-gray-400 truncate">{sub}</dd>}
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {isLocked(selected.slug) ? (
                      <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-50 text-amber-800 text-[12.5px] font-semibold"><IconLock className="w-3.5 h-3.5" /> Catch-all: always open, an admin checks every listing</span>
                    ) : (
                      <label className="inline-flex items-center gap-2.5 text-[13px] font-medium text-gray-700 cursor-pointer">
                        <Switch on={selected.is_active} onChange={() => void toggleActive(selected)} label={`${selected.name} is open to shoppers and sellers`} />
                        {selected.is_active ? 'Open to shoppers and sellers' : 'Hidden'}
                      </label>
                    )}
                    <button type="button" onClick={() => openCreate(selected.id)}
                      className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gray-900 hover:bg-black text-white text-[13px] font-semibold transition-colors">
                      <IconAdd className="w-4 h-4" /> Add sub-category
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-category filters */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60" role="group" aria-label="Filter sub-categories">
                {([['all', 'All', null], ['fda', 'FDA-gated', IconFda], ['override', 'Own commission', IconCommission], ['inactive', 'Hidden', IconHidden]] as const).map(([key, label, Icon]) => {
                  const on = filter === key;
                  return (
                    <button key={key} type="button" aria-pressed={on} onClick={() => setFilter(key)}
                      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${on ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                      {Icon && <Icon className="w-3.5 h-3.5" />}{label}
                      <span className={`tabular-nums ${on ? 'text-white/60' : 'text-gray-400'}`}>{counts[key]}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sub-categories */}
              {rows.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <IconSubcategory className="w-7 h-7 mx-auto text-gray-300" />
                  <p className="mt-2 text-[13px] font-semibold text-gray-800">{selected.children.length === 0 ? 'No sub-categories yet' : 'None match this filter'}</p>
                  <p className="mt-0.5 text-[12.5px] text-gray-500">{selected.children.length === 0 ? 'Products are listed in sub-categories, so add at least one.' : 'Choose All to see every sub-category.'}</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:grid grid-cols-[minmax(0,1.6fr)_96px_120px_120px_64px_92px] gap-3 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400 border-b border-gray-100">
                    <span>Sub-category</span><span className="text-right">Products</span><span>Commission</span><span>Rules</span><span>Open</span><span className="sr-only">Actions</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {rows.map((c) => {
                      const commission = commissionOf(c, selected);
                      const locked = isLocked(c.slug);
                      return (
                        <li key={c.id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_96px_120px_120px_64px_92px] gap-x-3 gap-y-1.5 items-center px-4 sm:px-5 py-3 hover:bg-gray-50/70">
                          <div className="contents md:flex md:items-center md:gap-3 md:min-w-0">
                            <button type="button" onClick={() => pickPhoto(c)} disabled={photoBusyId !== null}
                              title="Change photo" aria-label={`Change the photo of ${c.name}`}
                              className="group/photo relative shrink-0 rounded-lg row-span-2 md:row-span-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900">
                              <Thumb slug={c.slug} name={c.name} photoUrl={c.photo_url} busy={photoBusyId === c.id} className={`w-11 h-11 rounded-lg ${c.is_active ? '' : 'opacity-50 grayscale'}`} />
                              <span className="absolute inset-0 rounded-lg bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100 transition-opacity">
                                <IconPhoto className="w-4 h-4" />
                              </span>
                            </button>
                            <div className="min-w-0">
                              <p className={`flex items-center gap-1.5 text-[13.5px] font-semibold truncate ${c.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                                <span className="truncate">{c.name}</span>
                                {locked && <IconLock className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
                              </p>
                              <p className="font-mono text-[11.5px] text-gray-400 truncate">/{c.slug}</p>
                            </div>
                          </div>

                          <p className="col-start-2 md:col-start-auto md:text-right text-[12.5px] tabular-nums text-gray-500 md:text-gray-900">
                            <span className="font-semibold">{(c.products_count ?? 0).toLocaleString()}</span>
                            {(c.products_count ?? 0) !== (c.active_products_count ?? 0) && <span className="text-gray-400"> · {c.active_products_count ?? 0} live</span>}
                            <span className="md:hidden"> products</span>
                          </p>

                          <p className="hidden md:block text-[12.5px] tabular-nums">
                            <span className={`font-semibold ${commission.from === 'own' ? 'text-brand-red' : 'text-gray-900'}`}>{commission.rate}%</span>
                            <span className="block text-[11px] text-gray-400">{commission.from === 'own' ? 'Own rate' : commission.from === 'parent' ? 'From parent' : 'Platform'}</span>
                          </p>

                          <div className="hidden md:flex flex-wrap gap-1">
                            {c.requires_fda
                              ? <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-amber-50 text-amber-800 text-[11.5px] font-semibold"><IconFda className="w-3.5 h-3.5" />LTO + CPR</span>
                              : <span className="text-[12px] text-gray-300">—</span>}
                          </div>

                          <div className="row-start-1 col-start-3 md:row-start-auto md:col-start-auto">
                            {locked
                              ? <span className="text-[11.5px] text-gray-400">Always</span>
                              : <Switch on={c.is_active} onChange={() => void toggleActive(c)} label={`${c.name} is open`} />}
                          </div>

                          <div className="col-start-3 md:col-start-auto flex items-center justify-end gap-0.5">
                            {c.is_active && (
                              <Link to={`/category/${c.slug}`} target="_blank" rel="noopener noreferrer" className={`${ICON_BUTTON} hidden sm:flex`} title="Open in the store" aria-label={`Open ${c.name} in the store`}>
                                <IconOpenInStore />
                              </Link>
                            )}
                            <button type="button" onClick={() => openEdit(c, true)} className={ICON_BUTTON} title="Edit" aria-label={`Edit ${c.name}`}><IconEdit /></button>
                            {!locked && (
                              <button type="button" onClick={() => askDelete(c, false)} className={`${ICON_BUTTON} hover:!text-red-600 hover:!bg-red-50`} title="Delete" aria-label={`Delete ${c.name}`}><IconDelete /></button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {/* ── Create / edit ── */}
      <SidePanel open={form !== null} onClose={() => !saving && setForm(null)}
        title={form?.id ? `Edit ${form.isChild ? 'sub-category' : 'category'}` : form?.isChild ? 'New sub-category' : 'New category'}
        subtitle={form?.isChild ? `Under ${parents.find((p) => p.id === Number(form.parent_id))?.name ?? 'a parent category'}` : 'A top-level group in the store menu'}
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" className={BUTTON.quiet} onClick={() => setForm(null)} disabled={saving}>Cancel</button>
            <button type="submit" form="category-form" className={BUTTON.primary} disabled={saving}>{saving ? 'Saving…' : form?.id ? 'Save changes' : 'Create'}</button>
          </div>
        )}>
        {form && (
          <form id="category-form" onSubmit={save} className="space-y-5">
            {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{formError}</p>}

            {!form.id && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100" role="radiogroup" aria-label="Level">
                {([[false, 'Parent category', IconTaxonomy], [true, 'Sub-category', IconSubcategory]] as const).map(([child, label, Icon]) => (
                  <button key={label} type="button" role="radio" aria-checked={form.isChild === child}
                    onClick={() => setForm({ ...form, isChild: child, parent_id: child ? (form.parent_id ?? selected?.id ?? parents[0]?.id ?? null) : null })}
                    className={`h-9 rounded-lg inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors ${form.isChild === child ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
            )}

            {form.isChild && (
              <CustomSelect label="Parent category" value={String(form.parent_id ?? '')} onChange={(v) => setForm({ ...form, parent_id: Number(v) })}
                options={parents.map((p) => ({ value: String(p.id), label: p.name }))} placeholder="Choose a parent" />
            )}

            <div className="space-y-1">
              <label htmlFor="cat-name" className="text-[12.5px] font-semibold text-gray-800">Name <span className="text-brand-red">*</span></label>
              <input id="cat-name" type="text" required value={form.name} placeholder="e.g. Running Shoes"
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.id ? form.slug : slugify(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl border border-gray-300 text-[14px] outline-none focus:border-gray-900" />
            </div>

            {(() => {
              const custom = !!form.photoFile || (!!form.photo_url && !form.removePhoto);
              const shown = form.photoPreview ?? (form.removePhoto ? null : form.photo_url);
              const note = form.photoFile ? 'New photo. It is saved when you press Save.'
                : form.removePhoto ? 'The default picture comes back when you press Save.'
                  : form.photo_url ? 'A photo you uploaded.'
                    : 'The built-in picture. Upload a JPG or PNG (square works best) to use your own.';
              return (
                <div className="flex items-center gap-4 p-3 rounded-xl border border-gray-200">
                  <Thumb slug={form.slug || slugify(form.name)} name={form.name} photoUrl={shown} className="w-20 h-20 rounded-xl" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">Photo</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-gray-500">{note}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => pickPhoto('form')} disabled={saving}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-300 hover:border-gray-900 text-[12.5px] font-semibold text-gray-800 transition-colors disabled:opacity-50">
                        <IconPhoto className="w-3.5 h-3.5" /> {custom ? 'Replace photo' : 'Upload photo'}
                      </button>
                      {custom && (
                        <button type="button" disabled={saving}
                          onClick={() => setForm({ ...form, photoFile: undefined, photoPreview: undefined, removePhoto: !!form.photo_url })}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50">
                          <IconRestore className="w-3.5 h-3.5" /> Use default
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-1">
              <label htmlFor="cat-slug" className="text-[12.5px] font-semibold text-gray-800">Web address</label>
              <div className="flex items-center h-10 rounded-xl border border-gray-300 focus-within:border-gray-900 overflow-hidden">
                <span className="pl-3 pr-1 text-[13px] text-gray-400 font-mono">/category/</span>
                <input id="cat-slug" type="text" value={form.slug} disabled={!!form.id && isLocked(form.slug)}
                  onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                  className="flex-1 min-w-0 h-full pr-3 font-mono text-[13px] outline-none disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="cat-order" className="text-[12.5px] font-semibold text-gray-800">Order in the menu</label>
                <input id="cat-order" type="number" min={0} value={form.sort_order} disabled={!!form.id && isLocked(form.slug)}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl border border-gray-300 text-[14px] tabular-nums outline-none focus:border-gray-900 disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
              <div className="space-y-1">
                <span className="text-[12.5px] font-semibold text-gray-800">Open</span>
                <label className="flex items-center gap-2.5 h-10 text-[13px] text-gray-700">
                  <Switch on={form.is_active} disabled={!!form.id && isLocked(form.slug)} onChange={() => setForm({ ...form, is_active: !form.is_active })} label="Open to shoppers and sellers" />
                  {form.is_active ? 'Shoppers and sellers see it' : 'Hidden'}
                </label>
              </div>
            </div>

            <fieldset className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400">Rules</legend>
              {form.isChild && (
                <label className="flex items-start gap-3 p-3.5 cursor-pointer">
                  <IconFda className="w-5 h-5 mt-0.5 text-amber-600 shrink-0" />
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-gray-900">FDA documents required</span>
                    <span className="block text-[12px] text-gray-500">Sellers upload their FDA License to Operate and the product's CPR before publishing here.</span>
                  </span>
                  <input type="checkbox" checked={form.requires_fda} onChange={(e) => setForm({ ...form, requires_fda: e.target.checked })} className="mt-1 w-4 h-4 accent-brand-red" />
                </label>
              )}
              <div className="flex items-start gap-3 p-3.5">
                <IconCommission className="w-5 h-5 mt-0.5 text-brand-red shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="cat-rate" className="block text-[13px] font-semibold text-gray-900">Commission (optional)</label>
                  <div className="relative w-36">
                    <input id="cat-rate" inputMode="decimal" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
                      placeholder={(() => {
                        const parentRate = form.isChild ? parents.find((p) => p.id === Number(form.parent_id))?.commission_rate : null;
                        return parentRate !== null && parentRate !== undefined ? `${parentRate}` : `${baseRate}`;
                      })()}
                      className="w-full h-10 pl-3 pr-8 rounded-xl border border-gray-300 text-[14px] tabular-nums outline-none focus:border-gray-900" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">%</span>
                  </div>
                  <p className="text-[12px] text-gray-500">
                    {form.isChild
                      ? 'Empty uses the parent\'s rate, or the platform rate. New orders use it; placed orders keep theirs.'
                      : `Covers every sub-category without a rate of its own. Empty uses the platform rate (${baseRate}%).`}
                  </p>
                </div>
              </div>
            </fieldset>
          </form>
        )}
      </SidePanel>

      {/* ── Delete ── */}
      <Dialog open={deleteTarget !== null} onClose={() => !deleting && setDeleteTarget(null)} title={deleteTarget ? `Delete ${deleteTarget.category.name}?` : ''}
        footer={<>
          <button type="button" className={BUTTON.quiet} onClick={() => setDeleteTarget(null)} disabled={deleting}>{blocked ? 'Close' : 'Cancel'}</button>
          {!blocked && <button type="button" className={BUTTON.danger} onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
        </>}>
        {deleteTarget && (
          <div className="space-y-3 text-[13px] leading-relaxed text-gray-700">
            <div className="flex items-center gap-3">
              <Thumb slug={deleteTarget.category.slug} name={deleteTarget.category.name} photoUrl={deleteTarget.category.photo_url} className="w-12 h-12 rounded-lg" />
              <p className="font-mono text-[12px] text-gray-400">/{deleteTarget.category.slug}</p>
            </div>
            {deleteError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-red-800">{deleteError}</p>
            ) : blocked ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900">
                {deleteTarget.isParent
                  ? <>It still has <strong>{deleteTarget.children} sub-categories</strong>. Delete or move them first.</>
                  : <>It still has <strong>{deleteTarget.products} products</strong> (archived ones included). Move them to another category first, or hide this one instead.</>}
              </p>
            ) : (
              <p>Nothing is filed under it, so it can be removed. This cannot be undone.</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
