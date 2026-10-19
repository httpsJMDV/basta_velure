import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Eye, EyeOff, FolderTree, Pencil, Plus, Trash2, CornerDownRight, AlertTriangle, Check, X,
} from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useToast } from '../../components/ui/Toast';
import { Dialog, BUTTON } from '../../components/ui/Overlay';
import CustomSelect from '../../components/ui/CustomSelect';
import {
  createStoreCategoryApi, deleteStoreCategoryApi, getStoreCategoriesApi, previewDeleteStoreCategoryApi,
  reorderStoreCategoriesApi, updateStoreCategoryApi,
} from '../../api/sellerCatalog';
import type { StoreCategoryNode } from '../../api/sellerCatalog';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { storeCategoryNameError } from '../../utils/accountRules';

const NAME_MAX = 50;

/**
 * The seller's own store categories (A17): two levels (category and subcategory), names unique in the store, up to
 * three per product. Hidden categories stay assigned but do not show on the shop page.
 */
export default function SellerStoreCategoriesPage() {
  const pageRef = useMountAnim();
  const { showToast } = useToast();
  const [tree, setTree] = useState<StoreCategoryNode[] | null>(null);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<{ node: StoreCategoryNode; message: string; subcategories: string[]; products: number } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = () => {
    setLoadError('');
    getStoreCategoriesApi().then(setTree).catch((e) => setLoadError(apiErrorMessage(e, 'Your store categories could not be loaded.')));
  };
  useEffect(load, []);

  const add = async () => {
    const n = name.trim();
    const problem = storeCategoryNameError(n);
    if (problem) { setAddError(problem); return; }
    setAdding(true);
    setAddError('');
    try {
      const res = await createStoreCategoryApi(n, parentId ? Number(parentId) : null);
      setTree(res.data);
      setName('');
      showToast(res.message);
    } catch (e) {
      setAddError(apiErrorMessage(e, 'The category could not be added.'));
    } finally { setAdding(false); }
  };

  const rename = async (node: StoreCategoryNode, next: string): Promise<string | undefined> => {
    try {
      const res = await updateStoreCategoryApi(node.id, { name: next });
      setTree(res.data);
      return undefined;
    } catch (e) { return apiErrorMessage(e, 'The name could not be saved.'); }
  };

  const toggleVisible = async (node: StoreCategoryNode) => {
    setBusyId(node.id);
    try {
      const res = await updateStoreCategoryApi(node.id, { is_visible: !node.is_visible });
      setTree(res.data);
      showToast(node.is_visible ? `"${node.name}" is hidden from your shop page.` : `"${node.name}" shows on your shop page.`);
    } catch (e) { showToast(apiErrorMessage(e, 'The category could not be changed.'), 'error'); }
    finally { setBusyId(null); }
  };

  const move = async (siblings: StoreCategoryNode[], index: number, dir: -1 | 1, parent: number | null) => {
    const target = index + dir;
    if (target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusyId(siblings[index].id);
    try {
      const res = await reorderStoreCategoriesApi(ids, parent);
      setTree(res.data);
    } catch (e) { showToast(apiErrorMessage(e, 'The order could not be saved.'), 'error'); }
    finally { setBusyId(null); }
  };

  const askDelete = async (node: StoreCategoryNode) => {
    setBusyId(node.id);
    try {
      const preview = await previewDeleteStoreCategoryApi(node.id);
      setDeleting({ node, ...preview });
    } catch (e) { showToast(apiErrorMessage(e, 'The category could not be checked.'), 'error'); }
    finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await deleteStoreCategoryApi(deleting.node.id);
      setTree(res.data);
      setDeleting(null);
      showToast(res.message);
    } catch (e) { showToast(apiProblem(e, 'The category could not be deleted.').message, 'error'); }
    finally { setDeleteBusy(false); }
  };

  const parents = tree ?? [];

  return (
    <div ref={pageRef} className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Store Categories</h1>
        <p className="text-[13px] text-gray-500 mt-0.5 max-w-2xl">
          Group your products on your shop page, like "Best Sellers" or "Skincare › Serums". Categories can have one level of
          subcategories. Pick up to three for each product on its edit page.
        </p>
      </div>

      {/* Add */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[13px] font-bold text-gray-900 mb-3">Add a category</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] items-start">
          <div>
            <label htmlFor="sc-name" className="sr-only">Category name</label>
            <input
              id="sc-name" type="text" value={name} placeholder="e.g. New Arrivals"
              onChange={(e) => { setName(e.target.value); setAddError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              aria-invalid={!!addError}
              className={[
                'w-full px-3.5 py-2.5 text-[13.5px] border rounded-xl outline-none transition-all bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-100',
                addError ? 'border-red-400' : 'border-gray-200 focus:border-brand-red',
              ].join(' ')}
            />
            <p className={`mt-1 text-[11px] tabular-nums ${addError ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              {addError || `${name.trim().length}/${NAME_MAX} characters · names are unique in your store`}
            </p>
          </div>
          <CustomSelect
            value={parentId}
            onChange={setParentId}
            options={[{ value: '', label: 'Top level' }, ...parents.map((p) => ({ value: String(p.id), label: `Inside ${p.name}` }))]}
          />
          <button
            type="button" onClick={add} disabled={adding}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors disabled:opacity-60"
          >
            <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="text-[13px] font-bold text-gray-900">Your categories</p>
          <p className="text-[11.5px] text-gray-400">Use the arrows to set the order buyers see.</p>
        </div>

        {loadError ? (
          <div role="alert" className="flex items-center gap-3 px-5 py-6 text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4" /> {loadError}
            <button type="button" onClick={load} className="font-bold underline">Try again</button>
          </div>
        ) : tree === null ? (
          <div className="p-5 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-11 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center"><FolderTree className="w-6 h-6 text-gray-300" /></div>
            <p className="text-[14px] font-bold text-gray-800">No store categories yet</p>
            <p className="text-[12.5px] text-gray-500 max-w-sm">Products without a store category show under "All products" on your shop page.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {tree.map((node, i) => (
              <li key={node.id}>
                <CategoryRow
                  node={node} depth={0} first={i === 0} last={i === tree.length - 1} busy={busyId === node.id}
                  onUp={() => move(tree, i, -1, null)} onDown={() => move(tree, i, 1, null)}
                  onRename={(v) => rename(node, v)} onToggle={() => toggleVisible(node)} onDelete={() => askDelete(node)}
                  onAddChild={() => { setParentId(String(node.id)); document.getElementById('sc-name')?.focus(); }}
                />
                {(node.children ?? []).length > 0 && (
                  <ul className="border-t border-gray-50 bg-gray-50/40">
                    {(node.children ?? []).map((child, ci, arr) => (
                      <li key={child.id} className="border-b border-gray-50 last:border-0">
                        <CategoryRow
                          node={child} depth={1} parentHidden={!node.is_visible}
                          first={ci === 0} last={ci === arr.length - 1} busy={busyId === child.id}
                          onUp={() => move(arr, ci, -1, node.id)} onDown={() => move(arr, ci, 1, node.id)}
                          onRename={(v) => rename(child, v)} onToggle={() => toggleVisible(child)} onDelete={() => askDelete(child)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[12px] text-gray-500">
        Assign categories from each product's edit page in <Link to="/seller/products" className="font-semibold text-brand-red hover:underline">Products</Link>.
      </p>

      <Dialog
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        title={`Delete "${deleting?.node.name ?? ''}"?`}
        footer={<>
          <button type="button" className={BUTTON.ghost} disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</button>
          <button type="button" className={BUTTON.danger} disabled={deleteBusy} onClick={confirmDelete}>{deleteBusy ? 'Deleting…' : 'Delete category'}</button>
        </>}
      >
        <p className="text-[13.5px] text-stone-700">{deleting?.message}</p>
        {deleting && deleting.subcategories.length > 0 && (
          <div className="mt-3 rounded-xl border border-stone-200 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Subcategories also deleted</p>
            <p className="text-[13px] text-stone-800 mt-0.5">{deleting.subcategories.join(', ')}</p>
          </div>
        )}
        <p className="mt-3 text-[12px] text-stone-500">The products themselves are not deleted.</p>
      </Dialog>
    </div>
  );
}

function CategoryRow({
  node, depth, first, last, busy, parentHidden, onUp, onDown, onRename, onToggle, onDelete, onAddChild,
}: {
  node: StoreCategoryNode;
  depth: 0 | 1;
  first: boolean;
  last: boolean;
  busy: boolean;
  parentHidden?: boolean;
  onUp: () => void;
  onDown: () => void;
  onRename: (name: string) => Promise<string | undefined>;
  onToggle: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = draft.trim();
    if (v === node.name) { setEditing(false); return; }
    const local = storeCategoryNameError(v);
    if (local) { setError(local); return; }
    setSaving(true);
    const problem = await onRename(v);
    setSaving(false);
    if (problem) setError(problem);
    else { setEditing(false); setError(''); }
  };

  const arrow = 'w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';
  const hidden = !node.is_visible || parentHidden;

  return (
    <div className={`flex flex-wrap items-center gap-2 px-5 py-2.5 ${depth ? 'pl-10' : ''}`}>
      <div className="flex items-center">
        <button type="button" className={arrow} disabled={first || busy} onClick={onUp} aria-label={`Move ${node.name} up`}><ArrowUp className="w-3.5 h-3.5" /></button>
        <button type="button" className={arrow} disabled={last || busy} onClick={onDown} aria-label={`Move ${node.name} down`}><ArrowDown className="w-3.5 h-3.5" /></button>
      </div>
      {depth === 1 && <CornerDownRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}

      <div className="flex-1 min-w-[160px]">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus value={draft} aria-label="Category name"
              onChange={(e) => { setDraft(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setDraft(node.name); setError(''); } }}
              className={`w-full max-w-xs px-2.5 py-1.5 text-[13px] border rounded-lg outline-none focus:ring-2 focus:ring-red-100 ${error ? 'border-red-400' : 'border-brand-red'}`}
            />
            <button type="button" onClick={save} disabled={saving} className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50" aria-label="Save name"><Check className="w-4 h-4" /></button>
            <button type="button" onClick={() => { setEditing(false); setDraft(node.name); setError(''); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cancel"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <p className={`text-[13.5px] ${depth ? 'font-medium' : 'font-semibold'} ${hidden ? 'text-gray-400' : 'text-gray-900'}`}>
            {node.name}
            {!node.is_visible && <span className="ml-2 text-[10.5px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Hidden</span>}
            {node.is_visible && parentHidden && <span className="ml-2 text-[10.5px] text-gray-400">hidden with its parent</span>}
          </p>
        )}
        {error && <p role="alert" className="mt-0.5 text-[11px] text-red-600">{error}</p>}
      </div>

      <span className="text-[11.5px] text-gray-500 tabular-nums whitespace-nowrap">{node.product_count} product{node.product_count === 1 ? '' : 's'}</span>

      <div className="flex items-center gap-0.5 ml-auto">
        {onAddChild && (
          <button type="button" onClick={onAddChild} className="px-2 py-1 rounded-lg text-[11.5px] font-semibold text-gray-500 hover:text-brand-red hover:bg-red-50">
            + Subcategory
          </button>
        )}
        <button type="button" onClick={() => { setEditing(true); setDraft(node.name); }} className={arrow} aria-label={`Rename ${node.name}`} title="Rename"><Pencil className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onToggle} disabled={busy} className={arrow} aria-label={node.is_visible ? `Hide ${node.name}` : `Show ${node.name}`} title={node.is_visible ? 'Hide from shop page' : 'Show on shop page'}>
          {node.is_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={onDelete} disabled={busy} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={`Delete ${node.name}`} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
