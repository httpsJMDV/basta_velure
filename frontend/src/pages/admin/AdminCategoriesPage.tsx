import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Coins,
  Package,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import {
  getAdminCategoriesApi,
  createAdminCategoryApi,
  updateAdminCategoryApi,
  deleteAdminCategoryApi,
} from '../../api/client';
import type {
  AdminCategoryParent,
  AdminCategoryLeaf,
  AdminCategoryMetrics,
  CategoryPayload,
} from '../../types';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export default function AdminCategoriesPage() {
  const [parents, setParents] = useState<AdminCategoryParent[]>([]);
  const [metrics, setMetrics] = useState<AdminCategoryMetrics>({
    total_parents: 0,
    total_leaves: 0,
    total_products: 0,
    fda_regulated_leaves: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'fda' | 'override' | 'inactive'>('all');
  const [expandedParents, setExpandedParents] = useState<Record<number, boolean>>({});

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id?: number;
    isChild: boolean;
    name: string;
    slug: string;
    parent_id?: number | null;
    sort_order: number;
    is_active: boolean;
    requires_fda: boolean;
    commission_rate: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Alert / Guardrail Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    category: AdminCategoryParent | AdminCategoryLeaf;
    isParent: boolean;
    childCount?: number;
    productCount?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const pageRef = useMountAnim();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminCategoriesApi();
      setParents(res.data);
      setMetrics(res.metrics);

      // Auto-expand all parents initially
      const initialExpand: Record<number, boolean> = {};
      res.data.forEach((p) => {
        initialExpand[p.id] = true;
      });
      setExpandedParents(initialExpand);
    } catch {
      setParents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleExpand = (parentId: number) => {
    setExpandedParents((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const expandAll = () => {
    const next: Record<number, boolean> = {};
    parents.forEach((p) => {
      next[p.id] = true;
    });
    setExpandedParents(next);
  };

  const collapseAll = () => {
    setExpandedParents({});
  };

  // ─── Optimistic Active/Inactive Toggle ───────────────────────────────────────
  const handleToggleActive = async (category: AdminCategoryParent | AdminCategoryLeaf, isParent: boolean) => {
    const nextActive = !category.is_active;

    // Optimistic UI update
    if (isParent) {
      setParents((prev) =>
        prev.map((p) => (p.id === category.id ? { ...p, is_active: nextActive } : p))
      );
    } else {
      setParents((prev) =>
        prev.map((p) => ({
          ...p,
          children: p.children.map((c) =>
            c.id === category.id ? { ...c, is_active: nextActive } : c
          ),
        }))
      );
    }

    try {
      await updateAdminCategoryApi(category.id, { is_active: nextActive });
      showToast(`${category.name} is now ${nextActive ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      // Revert on failure
      loadData();
      alert(err.response?.data?.message || 'Failed to update category status.');
    }
  };

  // ─── Open Create Modal ──────────────────────────────────────────────────────
  const handleOpenCreateModal = (preselectedParentId?: number) => {
    setModalError(null);
    setEditingCategory({
      isChild: !!preselectedParentId,
      name: '',
      slug: '',
      parent_id: preselectedParentId || (parents.length > 0 ? parents[0].id : null),
      sort_order: 1,
      is_active: true,
      requires_fda: false,
      commission_rate: '',
    });
    setIsModalOpen(true);
  };

  // ─── Open Edit Modal ────────────────────────────────────────────────────────
  const handleOpenEditModal = (category: AdminCategoryParent | AdminCategoryLeaf, isChild: boolean) => {
    setModalError(null);
    setEditingCategory({
      id: category.id,
      isChild,
      name: category.name,
      slug: category.slug,
      parent_id: isChild ? (category as AdminCategoryLeaf).parent_id : null,
      sort_order: category.sort_order,
      is_active: category.is_active,
      requires_fda: isChild ? (category as AdminCategoryLeaf).requires_fda : false,
      commission_rate:
        isChild && (category as AdminCategoryLeaf).commission_rate !== null
          ? String((category as AdminCategoryLeaf).commission_rate)
          : '',
    });
    setIsModalOpen(true);
  };

  // ─── Save Category (Create or Edit) ─────────────────────────────────────────
  const handleSaveModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    if (!editingCategory.name.trim()) {
      setModalError('Category name is required.');
      return;
    }

    const payload: CategoryPayload = {
      name: editingCategory.name.trim(),
      slug: editingCategory.slug ? slugify(editingCategory.slug) : slugify(editingCategory.name),
      parent_id: editingCategory.isChild ? Number(editingCategory.parent_id) : null,
      sort_order: Number(editingCategory.sort_order) || 0,
      is_active: editingCategory.is_active,
      requires_fda: editingCategory.isChild ? editingCategory.requires_fda : false,
      commission_rate:
        editingCategory.isChild && editingCategory.commission_rate !== ''
          ? Number(editingCategory.commission_rate)
          : null,
    };

    setIsSaving(true);
    setModalError(null);

    try {
      if (editingCategory.id) {
        await updateAdminCategoryApi(editingCategory.id, payload);
        showToast(`Category '${payload.name}' updated successfully.`);
      } else {
        await createAdminCategoryApi(payload);
        showToast(`Category '${payload.name}' created successfully.`);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(
        err.response?.data?.message || err.response?.data?.errors?.slug?.[0] || 'Failed to save category.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Delete Guardrail & Execution ───────────────────────────────────────────
  const handleInitiateDelete = (category: AdminCategoryParent | AdminCategoryLeaf, isParent: boolean) => {
    setDeleteErrorMessage(null);
    if (isParent) {
      const parentNode = category as AdminCategoryParent;
      const childCount = parentNode.children?.length || 0;
      setDeleteTarget({
        category,
        isParent: true,
        childCount,
      });
    } else {
      const leafNode = category as AdminCategoryLeaf;
      const productCount = leafNode.products_count || 0;
      setDeleteTarget({
        category,
        isParent: false,
        productCount,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    // Check frontend client guardrails before sending request
    if (deleteTarget.isParent && (deleteTarget.childCount || 0) > 0) {
      setDeleteErrorMessage(
        `Cannot delete parent category '${deleteTarget.category.name}' because it contains ${deleteTarget.childCount} sub-category children. Please delete or reassign its sub-categories first.`
      );
      return;
    }

    if (!deleteTarget.isParent && (deleteTarget.productCount || 0) > 0) {
      setDeleteErrorMessage(
        `Cannot delete sub-category '${deleteTarget.category.name}' because ${deleteTarget.productCount} products are currently assigned to it. Please reassign or archive these products first.`
      );
      return;
    }

    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      await deleteAdminCategoryApi(deleteTarget.category.id);
      showToast(`Category '${deleteTarget.category.name}' was safely deleted.`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      setDeleteErrorMessage(
        err.response?.data?.message || 'Server rejected deletion request. Please check dependencies.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Filtered Data Processing ───────────────────────────────────────────────
  const filteredParents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return parents
      .map((parent) => {
        // Filter children
        const matchingChildren = parent.children.filter((child) => {
          // Search filter
          const matchesQuery =
            !q ||
            child.name.toLowerCase().includes(q) ||
            child.slug.toLowerCase().includes(q) ||
            parent.name.toLowerCase().includes(q);

          if (!matchesQuery) return false;

          // Mode filter
          if (filterMode === 'fda') return child.requires_fda;
          if (filterMode === 'override') return child.commission_rate !== null;
          if (filterMode === 'inactive') return !child.is_active;

          return true;
        });

        const parentMatchesSearch =
          !q || parent.name.toLowerCase().includes(q) || parent.slug.toLowerCase().includes(q);

        // Include parent if parent matches or any child matches
        if (matchingChildren.length > 0 || (parentMatchesSearch && filterMode === 'all')) {
          return {
            ...parent,
            children: matchingChildren,
          };
        }

        return null;
      })
      .filter(Boolean) as AdminCategoryParent[];
  }, [parents, searchQuery, filterMode]);

  // Animated Velocity Metrics
  const animatedParents = useCountUp(metrics.total_parents);
  const animatedLeaves = useCountUp(metrics.total_leaves);
  const animatedProducts = useCountUp(metrics.total_products);
  const animatedFda = useCountUp(metrics.fda_regulated_leaves);

  const parentSelectOptions = parents.map((p) => ({
    value: String(p.id),
    label: p.name,
  }));

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Compact Executive Hero Command Bar ── */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Marketplace Categories &amp; Taxonomy
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Govern two-level product taxonomy, enforce FDA compliance gates, and configure custom category commission take-rates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <Button
            variant="primary"
            onClick={() => handleOpenCreateModal()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-brand-red hover:bg-[#8e2424] shadow-xs rounded-xl"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Category
          </Button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {toastMessage}
        </div>
      )}

      {/* ── 2. Compact 4-Card Taxonomy Stat Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-800 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-gray-400">Level 1 Roots</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
              {animatedParents}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Parent Categories</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Active navigation groupings</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
              <Tag className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-1.5 py-0.5 rounded">Leaves</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
              {animatedLeaves}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Leaf Sub-Categories</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Product listing targets</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <Package className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Catalog</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
              {animatedProducts.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Catalog Items Covered</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Live product mappings</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Compliance</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
              {animatedFda}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">FDA Regulated Categories</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Mandatory LTO/CPR verification</p>
          </div>
        </div>
      </div>

      {/* ── 3. Filters, Search & Controls Bar ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search category name, slug, or parent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red transition-all"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { key: 'all', label: 'All Categories' },
              { key: 'fda', label: '⚠️ FDA Regulated' },
              { key: 'override', label: 'Custom Commission' },
              { key: 'inactive', label: 'Inactive' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterMode(f.key as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  filterMode === f.key
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Expand/Collapse All Buttons */}
          <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
            <button
              onClick={expandAll}
              className="text-xs font-bold text-gray-500 hover:text-gray-900 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs font-bold text-gray-500 hover:text-gray-900 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Hierarchical Category Tree / Accordions ── */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-28" />
          ))}
        </div>
      ) : filteredParents.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-200/80 shadow-xs space-y-2">
          <Tag className="w-10 h-10 mx-auto text-gray-300" />
          <h3 className="text-sm font-bold text-gray-900">No categories found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            No category taxonomy records matched your search query or filter selection.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredParents.map((parent) => {
            const isExpanded = !!expandedParents[parent.id];
            const childCount = parent.children.length;

            return (
              <div
                key={parent.id}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden transition-all"
              >
                {/* ── Parent Header ── */}
                <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-100">
                  <div
                    onClick={() => toggleExpand(parent.id)}
                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 select-none"
                  >
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg bg-white border border-gray-200 text-gray-500 flex items-center justify-center shrink-0 hover:bg-gray-100"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-bold text-gray-900 truncate">{parent.name}</h3>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.2 rounded">
                          slug: {parent.slug}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                            parent.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          }`}
                        >
                          {parent.is_active ? 'Active Parent' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {childCount} Sub-Category {childCount === 1 ? 'Node' : 'Nodes'} · Sort Order: #{parent.sort_order}
                      </p>
                    </div>
                  </div>

                  {/* Actions on Parent Card */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => handleToggleActive(parent, true)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${
                        parent.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                      title="Toggle active status across catalog"
                    >
                      {parent.is_active ? 'Active' : 'Inactive'}
                    </button>

                    <Button
                      variant="secondary"
                      onClick={() => handleOpenCreateModal(parent.id)}
                      className="py-1 px-2.5 text-[11px] flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3 h-3" /> Add Sub-Category
                    </Button>

                    <button
                      onClick={() => handleOpenEditModal(parent, false)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-200/60 transition-colors"
                      title="Edit parent category"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleInitiateDelete(parent, true)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete parent category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* ── Leaf Sub-Categories Grid / Rows ── */}
                {isExpanded && (
                  <div className="divide-y divide-gray-100 bg-white">
                    {childCount === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400">
                        No sub-categories assigned to this parent yet.{' '}
                        <button
                          onClick={() => handleOpenCreateModal(parent.id)}
                          className="text-brand-red font-bold underline ml-1"
                        >
                          Create one now
                        </button>
                      </div>
                    ) : (
                      parent.children.map((child) => (
                        <div
                          key={child.id}
                          className="p-3 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-gray-50/70 transition-colors group text-xs"
                        >
                          {/* Leaf Info */}
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-brand-red shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900">{child.name}</span>
                                <span className="text-[10px] font-mono text-gray-400">slug: {child.slug}</span>

                                {/* FDA Badge */}
                                {child.requires_fda && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-[#FFC107]/20 border border-[#FFC107]/40 px-1.5 py-0.2 rounded">
                                    <ShieldAlert className="w-2.5 h-2.5 text-amber-700" /> FDA Required
                                  </span>
                                )}

                                {/* Commission Override Badge */}
                                {child.commission_rate !== null ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-brand-red bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded">
                                    <Coins className="w-2.5 h-2.5" /> {child.commission_rate}% Override
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold text-gray-400 bg-gray-50 px-1.5 py-0.2 rounded border border-gray-100">
                                    Default 10%
                                  </span>
                                )}

                                {/* Product Count */}
                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                                  {child.products_count ?? 0} items listed
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Leaf Actions */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            {/* Optimistic Active Toggle */}
                            <button
                              onClick={() => handleToggleActive(child, false)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors ${
                                child.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {child.is_active ? 'Active' : 'Inactive'}
                            </button>

                            <button
                              onClick={() => handleOpenEditModal(child, true)}
                              className="p-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100"
                              title="Edit sub-category"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>

                            <button
                              onClick={() => handleInitiateDelete(child, false)}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                              title="Delete sub-category"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 5. Create / Edit Category Modal ── */}
      {isModalOpen && editingCategory && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-5 border border-gray-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto [scrollbar-width:none]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-brand-red" />
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  {editingCategory.id
                    ? `Edit ${editingCategory.isChild ? 'Sub-Category' : 'Parent Category'}`
                    : 'Create New Category'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              {/* Level Selector (Only when creating new) */}
              {!editingCategory.id && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Category Hierarchy Level
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setEditingCategory({ ...editingCategory, isChild: false, parent_id: null })}
                      className={`py-1.5 rounded-lg font-bold transition-all text-center ${
                        !editingCategory.isChild
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Parent Category (Root)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCategory({
                          ...editingCategory,
                          isChild: true,
                          parent_id: parents.length > 0 ? parents[0].id : null,
                        })
                      }
                      className={`py-1.5 rounded-lg font-bold transition-all text-center ${
                        editingCategory.isChild
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Sub-Category (Child)
                    </button>
                  </div>
                </div>
              )}

              {/* Parent Category Selector (Shown only for Child Leaf) */}
              {editingCategory.isChild && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Select Parent Category
                  </label>
                  <CustomSelect
                    value={String(editingCategory.parent_id || '')}
                    onChange={(val) => setEditingCategory({ ...editingCategory, parent_id: Number(val) })}
                    options={parentSelectOptions}
                    placeholder="Choose parent category..."
                  />
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                  Category Name <span className="text-brand-red">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Consumer Electronics"
                  value={editingCategory.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setEditingCategory({
                      ...editingCategory,
                      name: newName,
                      slug: !editingCategory.id ? slugify(newName) : editingCategory.slug,
                    });
                  }}
                  className="w-full px-3 py-2 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                  Category Slug (Unique URL Identifier)
                </label>
                <input
                  type="text"
                  placeholder="e.g. consumer-electronics"
                  value={editingCategory.slug}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, slug: slugify(e.target.value) })
                  }
                  className="w-full px-3 py-2 font-mono text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Used in catalog navigation routes and product assignment payloads.
                </p>
              </div>

              {/* Sort Order & Active Status Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Sort Order</label>
                  <input
                    type="number"
                    min={0}
                    value={editingCategory.sort_order}
                    onChange={(e) =>
                      setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Active Status</label>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingCategory({ ...editingCategory, is_active: !editingCategory.is_active })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors w-full text-center ${
                        editingCategory.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {editingCategory.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-Category Specific Settings: FDA & Commission Override */}
              {editingCategory.isChild && (
                <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2.5">
                  <span className="text-xs font-bold text-gray-800 block">Sub-Category Governance</span>

                  {/* FDA Compliance Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-gray-900 block">FDA Compliance Gate</span>
                      <span className="text-[10px] text-gray-400">
                        Requires merchant FDA LTO &amp; CPR upload before review submission
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={editingCategory.requires_fda}
                      onChange={(e) =>
                        setEditingCategory({ ...editingCategory, requires_fda: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-brand-red focus:ring-brand-red cursor-pointer"
                    />
                  </div>

                  {/* Custom Commission Override */}
                  <div className="pt-2 border-t border-gray-200/60">
                    <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                      Commission Take-Rate Override (% optional)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder="Leave empty for default 10%"
                        value={editingCategory.commission_rate}
                        onChange={(e) =>
                          setEditingCategory({ ...editingCategory, commission_rate: e.target.value })
                        }
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg outline-none focus:border-brand-red"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                        %
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                  className="py-1.5 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSaving}
                  className="py-1.5 px-4 text-xs font-bold bg-brand-red hover:bg-[#8e2424]"
                >
                  {isSaving ? 'Saving...' : editingCategory.id ? 'Update Category' : 'Create Category'}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ── 6. Delete Guardrail / Blocking Alert Modal ── */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-5 border border-gray-200 shadow-xl space-y-3.5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
              <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Delete Category: {deleteTarget.category.name}
                </h3>
                <p className="text-[10px] text-gray-400 font-mono">slug: {deleteTarget.category.slug}</p>
              </div>
            </div>

            {deleteErrorMessage ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
                <span className="font-bold block">Deletion Blocked by System:</span>
                <p className="leading-relaxed">{deleteErrorMessage}</p>
              </div>
            ) : deleteTarget.isParent && (deleteTarget.childCount || 0) > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700" /> Cannot Delete Parent Category
                </span>
                <p className="leading-relaxed">
                  This parent category currently holds <strong>{deleteTarget.childCount} sub-categories</strong>. You must delete or reassign its sub-categories before removing this parent node.
                </p>
              </div>
            ) : !deleteTarget.isParent && (deleteTarget.productCount || 0) > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <span className="font-bold flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-amber-700" /> Cannot Delete Sub-Category
                </span>
                <p className="leading-relaxed">
                  This sub-category currently has <strong>{deleteTarget.productCount} product listings</strong> attached. You must reassign or archive those products before deleting this category.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-600 leading-relaxed">
                Are you sure you want to delete <strong>'{deleteTarget.category.name}'</strong>? This category is free of dependencies and can be safely removed.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                className="py-1.5 px-3 text-xs"
              >
                Cancel
              </Button>
              {!(
                (deleteTarget.isParent && (deleteTarget.childCount || 0) > 0) ||
                (!deleteTarget.isParent && (deleteTarget.productCount || 0) > 0)
              ) && (
                <Button
                  variant="primary"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="py-1.5 px-4 text-xs font-bold bg-red-600 hover:bg-red-700"
                >
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
