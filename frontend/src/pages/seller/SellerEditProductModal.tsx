import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronLeft, Check, AlertTriangle } from 'lucide-react';
import type { SellerProduct } from '../../types';
import { updateSellerProductApi } from '../../api/client';
import { CATEGORY_TREE, leafRequiresFda } from '../../data/categories';
import Step0Images from './edit-steps/Step0Images';
import Step1BasicInfo from './edit-steps/Step1BasicInfo';
import Step2Variants from './edit-steps/Step2Variants';
import Step3Shipping from './edit-steps/Step3Shipping';
import Step4Fda from './edit-steps/Step4Fda';

export interface EditVariantType {
  name: string;
  options: string[];
  /** option value → image id (existing: `e-{id}`, new: `n-{id}`) */
  optionImages: Record<string, string>;
}

export interface EditVariantRow {
  combination: string;
  price: string;
  stock: string;
}

export interface EditForm {
  name: string;
  description: string;
  parentCategoryId: string;
  leafCategoryId: string;
  hasVariants: boolean;
  price: string;
  stock: string;
  variantTypes: EditVariantType[];
  variantRows: EditVariantRow[];
  weightValue: string;
  weightUnit: 'kg' | 'g';
  dimensionL: string;
  dimensionW: string;
  dimensionH: string;
  sku: string;
  // Images
  existingImages: { id: number; url: string; is_primary: boolean; sort_order: number }[];
  newImages: { id: string; file: File; preview: string }[];
  deletedImageIds: number[];
  // FDA
  fdaLtoFile: File | null;
  fdaLtoOnFile: boolean;
  fdaCprFile: File | null;
  fdaCprOnFile: boolean;
  netWeight: string;
  expiryDate: string;
  ingredients: string;
  storageInstructions: string;
  allergenInfo: string;
}

const BASE_STEPS = ['Images', 'Basic Info', 'Variants & Pricing', 'Shipping'];

function buildInitialForm(p: SellerProduct): EditForm {
  const parentEntry = CATEGORY_TREE.find((n) =>
    n.children.some((c) => c.id === p.category_id)
  );
  const hasVariants =
    p.variants.length > 1 ||
    (p.variants.length === 1 && p.variants[0].label !== 'Default');

  let weightValue = '';
  let weightUnit: 'kg' | 'g' = 'kg';
  if (p.weight_kg != null) {
    if (p.weight_kg < 1) { weightValue = String(p.weight_kg * 1000); weightUnit = 'g'; }
    else { weightValue = String(p.weight_kg); weightUnit = 'kg'; }
  }

  // Reconstruct variantTypes + variantRows from saved flat labels (e.g. "Red / M")
  // We can't perfectly recover the original type names, so we treat each
  // saved variant as a row directly — types stay empty for the seller to re-label.
  const variantRows: EditVariantRow[] = hasVariants
    ? p.variants.map((v) => ({
        combination: v.label,
        price: String(v.price),
        stock: String(v.stock_quantity),
      }))
    : [];

  return {
    name: p.name,
    description: p.description ?? '',
    parentCategoryId: parentEntry?.id ?? '',
    leafCategoryId: p.category_id ?? '',
    hasVariants,
    price: hasVariants ? '' : String(p.variants[0]?.price ?? p.base_price),
    stock: hasVariants ? '' : String(p.variants[0]?.stock_quantity ?? 0),
    variantTypes: [],
    variantRows,
    existingImages: [...(p.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    newImages: [],
    deletedImageIds: [],
    weightValue,
    weightUnit,
    dimensionL: p.dimension_l_cm != null ? String(p.dimension_l_cm) : '',
    dimensionW: p.dimension_w_cm != null ? String(p.dimension_w_cm) : '',
    dimensionH: p.dimension_h_cm != null ? String(p.dimension_h_cm) : '',
    sku: p.sku ?? '',
    fdaLtoFile: null,
    fdaLtoOnFile: p.fda_lto_on_file,
    fdaCprFile: null,
    fdaCprOnFile: p.fda_cpr_on_file,
    netWeight: p.net_weight_volume ?? '',
    expiryDate: p.expiry_best_before ?? '',
    ingredients: p.ingredients ?? '',
    storageInstructions: p.storage_instructions ?? '',
    allergenInfo: p.allergen_info ?? '',
  };
}

export default function SellerEditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: SellerProduct;
  onClose: () => void;
  onSaved: (updated: SellerProduct) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<EditForm>(() => buildInitialForm(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const needsFda = leafRequiresFda(form.leafCategoryId);
  const STEPS = needsFda ? [...BASE_STEPS, 'FDA'] : BASE_STEPS;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Scroll body to top on step change
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const patch = useCallback((partial: Partial<EditForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearError = (key: string) =>
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (form.existingImages.length + form.newImages.length === 0)
        e.images = 'At least one product image is required.';
    }
    if (s === 1) {
      if (!form.name.trim()) e.name = 'Product name is required.';
      if (!form.leafCategoryId) e.leafCategoryId = 'Please select a sub-category.';
    }
    if (s === 2) {
      if (!form.hasVariants) {
        if (!form.price || Number(form.price) <= 0) e.price = 'Enter a valid price.';
        if (form.stock === '' || Number(form.stock) < 0) e.stock = 'Enter a valid stock.';
      } else {
        if (form.variantRows.length === 0) e.variantTypes = 'Add at least one variant type with options.';
        form.variantRows.forEach((v, i) => {
          if (!v.price || Number(v.price) <= 0) e[`vp_${i}`] = 'Required';
          if (v.stock === '' || Number(v.stock) < 0) e[`vs_${i}`] = 'Required';
        });
      }
    }
    if (s === 4 && needsFda) {
      if (!form.fdaLtoFile && !form.fdaLtoOnFile) e.fdaLtoFile = 'FDA LTO is required.';
      if (!form.fdaCprFile && !form.fdaCprOnFile) e.fdaCprFile = 'CPR/CPN document is required.';
    }
    return e;
  }

  const next = () => {
    const e = validateStep(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    setStep((s) => s + 1);
  };

  const back = () => { setErrors({}); setStep((s) => s - 1); };

  const handleSave = async () => {
    const e = validateStep(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('category_slug', form.leafCategoryId);

      const rawStatus = product.status;
      const statusToSend =
        rawStatus === 'rejected' ? 'pending_review' :
        rawStatus === 'out_of_stock' ? 'active' :
        (rawStatus === 'archived' && product.archived_by === 'admin') ? 'pending_review' :
        rawStatus;
      fd.append('status', statusToSend);

      if (form.hasVariants) {
        form.variantRows.forEach((v, i) => {
          fd.append(`variants[${i}][label]`, v.combination);
          fd.append(`variants[${i}][price]`, v.price || '0');
          fd.append(`variants[${i}][stock]`, v.stock || '0');
        });
        const prices = form.variantRows.map((v) => Number(v.price)).filter(Boolean);
        fd.append('base_price', String(prices.length ? Math.min(...prices) : 0));
      } else {
        fd.append('base_price', form.price || '0');
        fd.append('variants[0][label]', 'Default');
        fd.append('variants[0][price]', form.price || '0');
        fd.append('variants[0][stock]', form.stock || '0');
      }

      if (form.weightValue) {
        fd.append('weight_kg', form.weightUnit === 'g'
          ? String(Number(form.weightValue) / 1000)
          : form.weightValue);
      }
      if (form.dimensionL) fd.append('dimension_l_cm', form.dimensionL);
      if (form.dimensionW) fd.append('dimension_w_cm', form.dimensionW);
      if (form.dimensionH) fd.append('dimension_h_cm', form.dimensionH);
      if (form.sku)        fd.append('sku', form.sku);

      form.newImages.forEach((img) => fd.append('images[]', img.file));
      form.deletedImageIds.forEach((id) => fd.append('delete_image_ids[]', String(id)));

      if (needsFda) {
        if (form.fdaLtoFile)          fd.append('fda_lto', form.fdaLtoFile);
        if (form.fdaCprFile)          fd.append('fda_cpr', form.fdaCprFile);
        if (form.netWeight)           fd.append('net_weight_volume', form.netWeight);
        if (form.expiryDate)          fd.append('expiry_best_before', form.expiryDate);
        if (form.ingredients)         fd.append('ingredients', form.ingredients);
        if (form.storageInstructions) fd.append('storage_instructions', form.storageInstructions);
        if (form.allergenInfo)        fd.append('allergen_info', form.allergenInfo);
      }

      const updated = await updateSellerProductApi(product.id, fd);
      onSaved(updated);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const serverErrors = axiosErr?.response?.data?.errors;
      if (serverErrors) {
        const mapped: Record<string, string> = {};
        Object.entries(serverErrors).forEach(([k, v]) => { mapped[k] = v[0]; });
        setErrors({ ...mapped, _global: 'Please fix the errors below.' });
      } else {
        setErrors({ _global: axiosErr?.response?.data?.message ?? 'Failed to save. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  const isLast = step === STEPS.length - 1;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-red mb-0.5">
              Edit Product
            </p>
            <h2 className="text-[15px] font-black text-gray-900 leading-snug truncate">
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step bar ── */}
        <div className="px-6 pt-4 pb-3 shrink-0">
          <div className="flex items-start">
            {STEPS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              const isFda = needsFda && i === STEPS.length - 1;
              return (
                <div key={i} className="flex items-start flex-1 last:flex-none">
                  {/* Circle + label */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all',
                      done   ? 'bg-brand-red text-white' :
                      active ? 'bg-brand-red text-white ring-4 ring-red-100' :
                      isFda  ? 'bg-amber-100 text-amber-500' :
                               'bg-gray-100 text-gray-400',
                    ].join(' ')}>
                      {done ? <Check className="w-3.5 h-3.5" /> : isFda ? <AlertTriangle className="w-3 h-3" /> : i + 1}
                    </div>
                    <span className={[
                      'text-[10px] font-semibold text-center leading-tight',
                      active ? 'text-brand-red' : done ? 'text-gray-500' : 'text-gray-300',
                    ].join(' ')} style={{ maxWidth: 52 }}>
                      {label}
                    </span>
                  </div>
                  {/* Connector line — sits at circle vertical center (14px from top) */}
                  {i < STEPS.length - 1 && (
                    <div className={[
                      'flex-1 h-px mt-3.5 mx-1.5 transition-colors',
                      done ? 'bg-brand-red' : 'bg-gray-200',
                    ].join(' ')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-4">
          {errors._global && (
            <div className="mb-4 flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {errors._global}
            </div>
          )}
          {step === 0 && <Step0Images form={form} patch={patch} errors={errors} clearError={clearError} />}
          {step === 1 && <Step1BasicInfo form={form} patch={patch} errors={errors} clearError={clearError} />}
          {step === 2 && <Step2Variants form={form} patch={patch} errors={errors} clearError={clearError} />}
          {step === 3 && <Step3Shipping form={form} patch={patch} errors={errors} clearError={clearError} />}
          {step === 4 && needsFda && <Step4Fda form={form} patch={patch} errors={errors} clearError={clearError} />}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0 bg-gray-50/50 rounded-b-2xl">
          <button
            type="button"
            onClick={step === 0 ? onClose : back}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-white transition-colors"
          >
            {step > 0 && <ChevronLeft className="w-4 h-4" />}
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {/* Dot progress */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={[
                'rounded-full transition-all duration-200',
                i === step ? 'w-4 h-1.5 bg-brand-red' : i < step ? 'w-1.5 h-1.5 bg-brand-red/40' : 'w-1.5 h-1.5 bg-gray-200',
              ].join(' ')} />
            ))}
          </div>

          {isLast ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors disabled:opacity-60 shadow-sm shadow-red-100"
            >
              {saving && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              Save Changes
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
