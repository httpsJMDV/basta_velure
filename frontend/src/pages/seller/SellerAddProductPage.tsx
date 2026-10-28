import {
  useState, useRef, useCallback, useId, useEffect,
  type ChangeEvent, type DragEvent, type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ImagePlus, X, GripVertical, Plus, Trash2,
  Info, CheckCircle2, Upload, AlertTriangle, Package, ChevronLeft, ChevronRight,
  Bold, List, ListOrdered, Image as ImageIcon, Loader2,
} from 'lucide-react';
import CustomSelect from '../../components/ui/CustomSelect';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { CATEGORY_TREE, NOT_ALLOWED_NOTE, type CategoryNode } from '../../data/categories';
import { getSellerShopProfileApi, getStorefrontCategoriesApi } from '../../api/client';
import { downscaleImage } from '../../utils/imageDownscale';
import {
  getSellerProductApi,
  uploadDescriptionImageApi,
} from '../../api/client';
import { createSellerProductKeyedApi, getStoreCategoriesApi, updateSellerProductFullApi } from '../../api/sellerCatalog';
import type { StoreCategoryNode } from '../../api/sellerCatalog';
import { useAuth } from '../../hooks/useAuth';
import { displayNameError, fileError, skuError } from '../../utils/accountRules';
import type {
  AddProductFormState, ProductFormImage,
  ProductFormVariantType, ProductFormVariantRow, SellerProductVariant,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEIGHT_UNITS = ['kg', 'g'] as const;

const VARIANT_TYPE_OPTIONS = [
  { value: 'Color', label: 'Color' },
  { value: 'Size', label: 'Size' },
  { value: 'Flavor', label: 'Flavor' },
  { value: 'Style', label: 'Style' },
  { value: 'Material', label: 'Material' },
  { value: 'Scent', label: 'Scent' },
  { value: 'Pack Size', label: 'Pack Size' },
];

const EMPTY_FORM: AddProductFormState = {
  name: '', description: '', images: [], existingImages: [], deletedImageIds: [],
  parentCategoryId: '', leafCategoryId: '',
  hasVariants: false,
  variantTypes: [], variantRows: [],
  price: '', stock: '',
  weightValue: '', weightUnit: 'kg',
  dimensionL: '', dimensionW: '', dimensionH: '', sku: '',
  fdaLtoFile: null, fdaLtoOnFile: false, fdaCprFile: null, fdaCprOnFile: false,
  ingredients: '', netWeight: '', storageInstructions: '',
  expiryDate: '', allergenInfo: '',
  storeCategoryIds: [], purchaseLimit: '',
  lowStockMode: 'shop', lowStockLevel: '',
};

type FieldErrors = Partial<Record<string, string>>;

// The product rules (A7, A16, A17, A25); the server checks them again.
const NAME_MIN = 5;
const NAME_MAX = 120;
const DESC_MIN = 20;
const DESC_MAX = 3000;
const MAX_IMAGES = 9;
const MAX_TYPES = 2;
const MAX_OPTIONS = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A photo is shrunk in the browser before upload, so a phone photo larger than 5 MB is still accepted. */
const MAX_PICKED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_STORE_CATEGORIES = 3;
const OPTION_MAX = 20;
const MAX_WEIGHT_KG = 1000;
const MAX_DIMENSION_CM = 1000;

/** The visible text of the rich-text description, as the server counts it. */
function visibleText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function priceError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter a price.';
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Enter a number with at most 2 decimal places.';
  const n = Number(v);
  if (n < 1) return 'The price must be at least ₱1.00.';
  if (n > 1000000) return 'The price must be ₱1,000,000.00 or less.';
  return undefined;
}

function stockError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter the stock.';
  if (!/^\d+$/.test(v) || Number(v) > 99999) return 'Stock must be a whole number from 0 to 99,999.';
  return undefined;
}

function positiveError(value: string, label: string, max: number, unit: string): string | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n <= 0) return `${label} must be more than 0.`;
  if (n > max) return `${label} must be ${max.toLocaleString()} ${unit} or less.`;
  return undefined;
}

/** The weight in kilograms as the form holds it (grams are converted). */
function weightKg(form: AddProductFormState): number {
  const n = Number(form.weightValue);
  return form.weightUnit === 'g' ? n / 1000 : n;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function buildVariantRows(
  types: ProductFormVariantType[],
  images: ProductFormImage[],
  previous: ProductFormVariantRow[] = [],
): ProductFormVariantRow[] {
  const filled = types.filter((t) => t.name.trim() && t.options.length > 0);
  if (filled.length === 0) return [];
  const combos: Record<number, string>[] = [{}];
  filled.forEach((type, ti) => {
    const next: Record<number, string>[] = [];
    combos.forEach((combo) => {
      type.options.forEach((opt) => {
        next.push({ ...combo, [ti]: opt });
      });
    });
    combos.length = 0;
    combos.push(...next);
  });
  const mainPreview = images[0]?.preview;
  return combos.map((opts) => {
    // Find first type that has an image mapped for this row's option
    let imagePreview = mainPreview;
    for (let ti = 0; ti < filled.length; ti++) {
      const opt = opts[ti];
      const mapped = filled[ti].optionImages?.[opt];
      if (mapped) {
        const found = images.find((img) => img.id === mapped);
        if (found) { imagePreview = found.preview; break; }
      }
    }
    const combination = filled.map((_, ti) => opts[ti]).join(' / ');
    const prev = previous.find((r) => r.combination.toLowerCase() === combination.toLowerCase());
    return {
      id: prev?.id,
      sku: prev?.sku ?? '',
      combination,
      options: opts,
      price: prev?.price ?? '',
      stock: prev?.stock ?? '',
      imagePreview,
    };
  });
}

/** Whether a sub-category asks for FDA documents, from the category tree in use. */
function fdaFor(tree: CategoryNode[], leafId: string): boolean {
  return tree.some((p) => p.children.some((c) => c.id === leafId && c.requiresFdaDoc === true));
}

function validate(form: AddProductFormState, publish: boolean, tree: CategoryNode[]): { errors: FieldErrors; firstSection: string | null } {
  const errors: FieldErrors = {};

  const nameProblem = displayNameError(form.name, 'Product name', NAME_MIN, NAME_MAX);
  if (nameProblem) errors.name = nameProblem;
  const skuProblem = skuError(form.sku);
  if (skuProblem) errors.sku = skuProblem;

  const descLength = visibleText(form.description).length;
  if (descLength > DESC_MAX) errors.description = 'The description must be 3,000 characters or fewer.';
  const imageCount = form.images.length + form.existingImages.length;
  if (imageCount > MAX_IMAGES) errors.images = `A product can have at most ${MAX_IMAGES} images.`;
  if (form.storeCategoryIds.length > MAX_STORE_CATEGORIES) errors.storeCategoryIds = 'A product can be in at most 3 store categories.';
  if (form.purchaseLimit.trim() && (!/^\d+$/.test(form.purchaseLimit.trim()) || Number(form.purchaseLimit) < 1)) {
    errors.purchaseLimit = 'The purchase limit must be a whole number of at least 1.';
  }
  if (form.lowStockMode === 'custom' && (!/^\d+$/.test(form.lowStockLevel.trim()) || Number(form.lowStockLevel) > 999)) {
    errors.lowStockLevel = 'Enter the alert level as a whole number from 0 to 999.';
  }
  const weightProblem = positiveError(form.weightValue, 'The weight', form.weightUnit === 'g' ? MAX_WEIGHT_KG * 1000 : MAX_WEIGHT_KG, form.weightUnit);
  if (weightProblem) errors.weightValue = weightProblem;
  // The server keeps the weight to the gram: anything that rounds to 0 kg would be "no weight".
  else if (form.weightValue.trim() && Math.round(weightKg(form) * 1000) < 1) errors.weightValue = 'The weight must be at least 1 g.';
  for (const key of ['dimensionL', 'dimensionW', 'dimensionH'] as const) {
    const p = positiveError(form[key], 'Each dimension', MAX_DIMENSION_CM, 'cm');
    if (p) errors.dimensions = p;
  }
  // SKUs are checked for drafts too: the server refuses a badly formed one either way.
  const skus = new Map<string, number>();
  if (form.hasVariants) {
    form.variantRows.forEach((row, i) => {
      const sku = (row.sku ?? '').trim();
      const problem = skuError(sku);
      if (problem) errors[`variantRow_sku_${i}`] = problem;
      else if (sku) {
        if (skus.has(sku.toLowerCase())) errors[`variantRow_sku_${i}`] = 'Each variant needs its own SKU.';
        skus.set(sku.toLowerCase(), i);
      }
    });
  }

  if (publish) {
    if (descLength < DESC_MIN) errors.description = `The description must be at least ${DESC_MIN} characters.`;
    if (imageCount === 0) errors.images = 'Add at least one product image (JPG or PNG).';
    if (!form.leafCategoryId) errors.leafCategoryId = 'Please select a category.';
    if (!form.weightValue.trim()) errors.weightValue = 'Enter the weight.';

    if (form.hasVariants) {
      const filled = form.variantTypes.filter((t) => t.name.trim() && t.options.length > 0);
      if (filled.length === 0) errors.variantTypes = 'Add at least one variation type with options.';
      form.variantRows.forEach((row, i) => {
        const pe = priceError(row.price);
        if (pe) errors[`variantRow_price_${i}`] = pe;
        const se = stockError(row.stock);
        if (se) errors[`variantRow_stock_${i}`] = se;
      });
    } else {
      const pe = priceError(form.price);
      if (pe) errors.price = pe;
      const se = stockError(form.stock);
      if (se) errors.stock = se;
    }

    const needsFda = form.leafCategoryId && fdaFor(tree, form.leafCategoryId);
    if (needsFda) {
      if (!form.fdaLtoFile && !form.fdaLtoOnFile) errors.fdaLtoFile = 'FDA LTO is required.';
      // A CPR already saved on this product counts; editing it does not ask for the document again.
      if (!form.fdaCprFile && !form.fdaCprOnFile) errors.fdaCprFile = 'CPR/CPN document is required.';
    }
  }
  // The documents are checked whenever one is chosen: JPG, PNG or PDF up to 5 MB, as the server checks them.
  const ltoProblem = fileError(form.fdaLtoFile, 'the FDA LTO', { pdf: true, required: false });
  if (ltoProblem) errors.fdaLtoFile = ltoProblem;
  const cprProblem = fileError(form.fdaCprFile, 'the CPR/CPN document', { pdf: true, required: false });
  if (cprProblem) errors.fdaCprFile = cprProblem;

  const sectionOrder = ['basic', 'category', 'variants', 'shipping', 'fda'];
  const sectionErrors: Record<string, string[]> = {
    basic: ['name', 'description', 'images'],
    category: ['leafCategoryId', 'storeCategoryIds'],
    variants: ['variantTypes', 'price', 'stock', 'purchaseLimit', 'lowStockLevel',
      ...Object.keys(errors).filter((k) => k.startsWith('variantRow_'))],
    shipping: ['weightValue', 'dimensions', 'sku'],
    fda: ['fdaLtoFile', 'fdaCprFile'],
  };

  let firstSection: string | null = null;
  for (const sec of sectionOrder) {
    if (sectionErrors[sec].some((k) => errors[k])) { firstSection = sec; break; }
  }

  return { errors, firstSection };
}

/** Product photos are shrunk in the browser to this long edge before upload (the server allows 5 MB each). */
const PRODUCT_MAX_EDGE = 2000;
const PRODUCT_JPEG_QUALITY = 0.85;

/** The form field that shows a server validation error, so nested keys like "images.2" are never lost. */
function formFieldForServerKey(key: string, hasVariants: boolean): string {
  const variant = key.match(/^variants\.(\d+)\.(price|stock|label|sku)$/);
  if (variant) {
    const [, i, part] = variant;
    if (!hasVariants) return part === 'label' ? 'variantTypes' : part;
    return `variantRow_${part}_${i}`;
  }
  if (key === 'variants' || key.startsWith('variants.') || key.startsWith('variation_types')) return hasVariants ? 'variantTypes' : 'price';
  if (key.startsWith('store_category_ids')) return 'storeCategoryIds';
  if (key === 'purchase_limit') return 'purchaseLimit';
  if (key === 'low_stock_threshold' || key === 'low_stock_alert') return 'lowStockLevel';
  if (key.startsWith('dimension_')) return 'dimensions';
  if (key === 'images' || key.startsWith('images.')) return 'images';
  const direct: Record<string, string> = {
    category_slug: 'leafCategoryId',
    base_price: 'price',
    weight_kg: 'weightValue',
    fda_lto: 'fdaLtoFile',
    fda_cpr: 'fdaCprFile',
  };
  return direct[key] ?? key;
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionCard({
  id, step, icon: Icon, title, children,
}: {
  id: string; step: number; icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div id={`section-${id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50">
        <span className="w-7 h-7 rounded-xl bg-brand-red text-white text-[12px] font-black flex items-center justify-center shrink-0">
          {step}
        </span>
        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

function FieldWrap({
  label, required, hint, error, children, tooltip,
}: {
  label: string; required?: boolean; hint?: string; error?: string;
  children: React.ReactNode; tooltip?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-[13px] font-semibold text-gray-700">
          {label}{required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
        {tooltip && (
          <div className="group relative">
            <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
            <div className="absolute left-5 top-0 z-20 hidden group-hover:block w-56 bg-gray-900 text-white text-[11px] rounded-xl px-3 py-2 leading-relaxed shadow-xl">
              {tooltip}
            </div>
          </div>
        )}
      </div>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

/**
 * When this product's low-stock alert fires (A29): at the shop's level, at its own level, only when it sells out, or
 * never. The alert fires once when stock drops to the level from above it, so a listing that starts at or below the
 * level (a single laptop) is offered "When sold out" instead.
 */
function LowStockAlertField({ form, shopLevel, error, onMode, onLevel }: {
  form: AddProductFormState;
  shopLevel: number | null;
  error?: string;
  onMode: (mode: AddProductFormState['lowStockMode']) => void;
  onLevel: (value: string) => void;
}) {
  const stock = form.hasVariants
    ? form.variantRows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0)
    : Number(form.stock) || 0;
  const level = form.lowStockMode === 'shop' ? shopLevel
    : form.lowStockMode === 'sold_out' ? 0
      : form.lowStockMode === 'custom' && /^\d+$/.test(form.lowStockLevel.trim()) ? Number(form.lowStockLevel) : null;
  const options: { value: AddProductFormState['lowStockMode']; title: string; text: string }[] = [
    { value: 'shop', title: shopLevel !== null ? `Shop level (${shopLevel})` : 'Shop level', text: 'The level in your Shop Profile.' },
    { value: 'custom', title: 'Own level', text: 'A level just for this product.' },
    { value: 'sold_out', title: 'When sold out', text: 'For a single or one-of-a-kind item.' },
    { value: 'off', title: 'No alert', text: 'Never alert for this product.' },
  ];

  return (
    <div className="space-y-2.5 pt-4 border-t border-gray-100">
      <div>
        <p className="text-[13px] font-semibold text-gray-700">Low-stock alert</p>
        <p className="text-[11.5px] text-gray-400">One notification when stock falls to this level. It comes again only after you restock above it.</p>
      </div>
      <div role="radiogroup" aria-label="Low-stock alert" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {options.map((o) => {
          const on = form.lowStockMode === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onMode(o.value)}
              className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${on ? 'border-brand-red bg-rose-50/60 ring-1 ring-brand-red/20' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
              <span className={`block text-[12.5px] font-bold ${on ? 'text-brand-red' : 'text-gray-800'}`}>{o.title}</span>
              <span className="block text-[11px] leading-snug text-gray-500">{o.text}</span>
            </button>
          );
        })}
      </div>
      {form.lowStockMode === 'custom' && (
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-[13px] text-gray-700">
            Alert when stock is
            <input type="number" min="0" max="999" step="1" inputMode="numeric" value={form.lowStockLevel} onChange={(e) => onLevel(e.target.value)}
              className={`${inputCls(error)} !w-24 !py-2`} aria-label="Low-stock level for this product" />
            or fewer
          </label>
          {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
        </div>
      )}
      {level !== null && level > 0 && stock > 0 && stock <= level && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <Info className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
          <span>
            You are listing {stock} {stock === 1 ? 'unit' : 'units'}, already at or below {level}, so this alert will not fire until you restock above {level}.{' '}
            <button type="button" onClick={() => onMode('sold_out')} className="font-bold underline underline-offset-2">Alert me when it sells out</button>
          </span>
        </p>
      )}
    </div>
  );
}

function inputCls(error?: string) {
  return [
    'w-full px-3.5 py-2.5 text-[13.5px] border rounded-xl outline-none transition-all',
    'focus:ring-2 focus:ring-red-100 bg-gray-50 focus:bg-white',
    error
      ? 'border-red-400 focus:border-red-500'
      : 'border-gray-200 focus:border-brand-red',
  ].join(' ');
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({
  images, index, onClose, onNav,
}: {
  images: ProductFormImage[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav((index - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') onNav((index + 1) % images.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, images.length, onClose, onNav]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNav((index - 1 + images.length) % images.length); }}
          className="absolute left-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <img
        src={images[index].preview}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] rounded-xl object-contain shadow-2xl"
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNav((index + 1) % images.length); }}
          className="absolute right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Counter */}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-[12px] font-medium">
        {index + 1} / {images.length}
      </span>
    </div>,
    document.body,
  );
}

// ─── Image Uploader ───────────────────────────────────────────────────────────

function ImageUploader({
  images, existingImages, onDeleteExisting, onChange, error, onZoom,
}: {
  images: ProductFormImage[];
  existingImages: { id: number; url: string; is_primary: boolean }[];
  onDeleteExisting: (id: number) => void;
  onChange: (imgs: ProductFormImage[]) => void;
  error?: string;
  onZoom: (index: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const total = images.length + existingImages.length;
  const full = total >= MAX_IMAGES;
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const pointerMoved = useRef(false);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next = [...images];
    const problems: string[] = [];
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['jpg', 'jpeg', 'png'].includes(ext) || (file.type && !['image/jpeg', 'image/png'].includes(file.type))) {
        problems.push(`${file.name}: only JPG or PNG images can be added.`);
        return;
      }
      if (file.size > MAX_PICKED_IMAGE_BYTES) {
        problems.push(`${file.name}: larger than 20 MB. Use a smaller photo.`);
        return;
      }
      if (next.length + existingImages.length >= MAX_IMAGES) {
        problems.push(`${file.name}: a product can have at most ${MAX_IMAGES} images.`);
        return;
      }
      next.push({ id: uid(), file, preview: URL.createObjectURL(file) });
    });
    setRejected(problems);
    onChange(next);
  }, [images, existingImages.length, onChange]);

  const remove = (id: string) => onChange(images.filter((img) => img.id !== id));

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const reorder = (from: number, to: number) => {
    const next = [...images];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => { if (!full) inputRef.current?.click(); }}
        aria-disabled={full}
        className={[
          'border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 py-8 transition-all',
          full ? 'cursor-not-allowed opacity-60 border-gray-200' : 'cursor-pointer',
          dragging
            ? 'border-brand-red bg-red-50'
            : error
            ? 'border-red-300 bg-red-50/40'
            : 'border-gray-200 hover:border-brand-red hover:bg-red-50/30',
        ].join(' ')}
      >
        <ImagePlus className={`w-8 h-8 ${dragging ? 'text-brand-red' : 'text-gray-300'}`} />
        <p className="text-[13px] font-semibold text-gray-500">
          {full ? 'Image limit reached' : <>Drag & drop images here, or <span className="text-brand-red">browse</span></>}
        </p>
        <p className="text-[11px] text-gray-400 tabular-nums">JPG or PNG, resized for upload · {total}/{MAX_IMAGES} images · First image = main photo</p>
        <input
          ref={inputRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple hidden disabled={full}
          onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
        />
      </div>

      {/* Existing server images (edit mode) */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-6 gap-2.5">
          {existingImages.map((img, i) => (
            <div key={img.id} className="relative group w-full aspect-square rounded-xl overflow-hidden border-2 border-gray-100">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              {img.is_primary && (
                <span className="absolute bottom-0 left-0 right-0 bg-brand-red text-white text-[9px] font-bold text-center py-0.5">
                  MAIN
                </span>
              )}
              <button
                type="button"
                onClick={() => onDeleteExisting(img.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              {i === 0 && existingImages.length > 0 && !img.is_primary && (
                <span className="absolute bottom-0 left-0 right-0 bg-gray-600 text-white text-[9px] font-bold text-center py-0.5">
                  SAVED
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-6 gap-2.5">
          {images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => { dragItem.current = i; }}
              onDragEnter={() => { dragOver.current = i; }}
              onDragEnd={() => {
                if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current)
                  reorder(dragItem.current, dragOver.current);
                dragItem.current = null; dragOver.current = null;
              }}
              onPointerDown={() => { pointerMoved.current = false; }}
              onPointerMove={() => { pointerMoved.current = true; }}
              onPointerUp={() => {
                if (!pointerMoved.current) onZoom(i);
              }}
              className="relative group w-full aspect-square rounded-xl overflow-hidden border-2 border-gray-100 cursor-grab active:cursor-grabbing hover:border-brand-red transition-colors"
            >
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-brand-red text-white text-[9px] font-bold text-center py-0.5">
                  MAIN
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(img.id); }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <GripVertical className="absolute top-1 left-1 w-4 h-4 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      )}
      {rejected.length > 0 && (
        <ul role="alert" className="text-[11px] text-red-600 font-medium space-y-0.5">
          {rejected.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

// ─── Variant Option Gallery Picker ───────────────────────────────────────────

function OptionGalleryPicker({
  optionLabel, images, selectedId, onSelect,
}: {
  optionLabel: string;
  images: ProductFormImage[];
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = images.find((img) => img.id === selectedId);

  if (images.length === 0) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Set image for "${optionLabel}"`}
        className="w-7 h-7 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-red overflow-hidden flex items-center justify-center transition-colors shrink-0"
      >
        {selected
          ? <img src={selected.preview} alt="" className="w-full h-full object-cover" />
          : <ImagePlus className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && (
        <div className="absolute z-30 top-9 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-48">
          <p className="w-full text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
            Pick image for "{optionLabel}"
          </p>
          {selected && (
            <button
              type="button"
              onClick={() => { onSelect(undefined); setOpen(false); }}
              className="w-full text-[11px] text-gray-400 hover:text-red-500 text-left mb-1"
            >
              ✕ Clear
            </button>
          )}
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => { onSelect(img.id); setOpen(false); }}
              className={[
                'w-10 h-10 rounded-lg overflow-hidden border-2 transition-colors',
                img.id === selectedId ? 'border-brand-red' : 'border-transparent hover:border-gray-300',
              ].join(' ')}
            >
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chip Tag Input ───────────────────────────────────────────────────────────

function ChipInput({
  options, onChange, images, optionImages, onOptionImageChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
  images?: ProductFormImage[];
  optionImages?: Record<string, string>;
  onOptionImageChange?: (opt: string, id: string | undefined) => void;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');

  const add = () => {
    const val = draft.trim();
    setDraft('');
    if (!val) return;
    if (options.some((o) => o.toLowerCase() === val.toLowerCase())) {
      setProblem(`"${val}" is already an option (upper and lower case count as the same).`);
      return;
    }
    if (options.length >= MAX_OPTIONS) {
      setProblem(`A variation type can have at most ${MAX_OPTIONS} options.`);
      return;
    }
    if (val.includes('/')) {
      setProblem('An option name cannot contain "/".');
      return;
    }
    if (val.length > OPTION_MAX || !/[\p{L}\p{N}]/u.test(val)) {
      setProblem(`An option name is 1 to ${OPTION_MAX} characters with a letter or number, like "Red" or "XL".`);
      return;
    }
    setProblem('');
    onChange([...options, val]);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !draft && options.length > 0)
      onChange(options.slice(0, -1));
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center min-h-[42px] px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus-within:border-brand-red focus-within:ring-2 focus-within:ring-red-100 focus-within:bg-white transition-all">
      {options.map((opt) => (
        <span key={opt} className="flex items-center gap-1 bg-brand-red/10 text-brand-red text-[12px] font-semibold px-2 py-0.5 rounded-full">
          {images && images.length > 0 && onOptionImageChange && (
            <OptionGalleryPicker
              optionLabel={opt}
              images={images}
              selectedId={optionImages?.[opt]}
              onSelect={(id) => onOptionImageChange(opt, id)}
            />
          )}
          {opt}
          <button type="button" onClick={() => onChange(options.filter((o) => o !== opt))}>
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        maxLength={OPTION_MAX}
        onChange={(e) => { setDraft(e.target.value); setProblem(''); }}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={options.length === 0 ? 'Type option + Enter…' : options.length >= MAX_OPTIONS ? `${MAX_OPTIONS} of ${MAX_OPTIONS} options` : 'Add more…'}
        disabled={options.length >= MAX_OPTIONS}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-[13px] text-gray-700 placeholder:text-gray-400"
      />
      <span className="w-full text-[10.5px] text-gray-400 tabular-nums">{options.length}/{MAX_OPTIONS} options</span>
      {problem && <span role="alert" className="w-full text-[11px] font-medium text-red-600">{problem}</span>}
    </div>
  );
}

// ─── Variant Types Builder ────────────────────────────────────────────────────

function VariantTypesBuilder({
  types, onChange, images,
}: {
  types: ProductFormVariantType[];
  onChange: (types: ProductFormVariantType[]) => void;
  images: ProductFormImage[];
}) {
  const addType = () => onChange([...types, { name: '', options: [], optionImages: {} }]);
  const removeType = (i: number) => onChange(types.filter((_, idx) => idx !== i));
  const updateName = (i: number, name: string) => {
    const next = [...types];
    next[i] = { ...next[i], name };
    onChange(next);
  };
  const updateOptions = (i: number, options: string[]) => {
    const next = [...types];
    next[i] = { ...next[i], options };
    onChange(next);
  };
  const updateOptionImage = (i: number, opt: string, id: string | undefined) => {
    const next = [...types];
    const imgs = { ...(next[i].optionImages ?? {}) };
    if (id === undefined) delete imgs[opt]; else imgs[opt] = id;
    next[i] = { ...next[i], optionImages: imgs };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {types.map((type, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="flex-1 space-y-2">
            <CustomSelect
              value={type.name}
              onChange={(v) => updateName(i, v)}
              options={[
                ...VARIANT_TYPE_OPTIONS,
                ...(type.name && !VARIANT_TYPE_OPTIONS.some((o) => o.value === type.name) ? [{ value: type.name, label: type.name }] : []),
              ].filter((o) => o.value === type.name || !types.some((t, ti) => ti !== i && t.name.toLowerCase() === o.value.toLowerCase()))}
              placeholder={`Variant type (e.g. ${['Color', 'Size', 'Flavor'][i] ?? 'Style'})`}
            />
            <ChipInput
              options={type.options}
              onChange={(opts) => updateOptions(i, opts)}
              images={images}
              optionImages={type.optionImages}
              onOptionImageChange={(opt, id) => updateOptionImage(i, opt, id)}
            />
          </div>
          <button
            type="button"
            onClick={() => removeType(i)}
            className="mt-2.5 w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {types.length < MAX_TYPES && (
        <button
          type="button"
          onClick={addType}
          className="flex items-center gap-2 text-[13px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> Add variant type
        </button>
      )}
    </div>
  );
}

// ─── Variant Combination Table ────────────────────────────────────────────────

function VariantTable({
  rows, onChange, errors,
}: {
  rows: ProductFormVariantRow[];
  onChange: (rows: ProductFormVariantRow[]) => void;
  errors: FieldErrors;
}) {
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');

  const applyBulk = () => {
    onChange(rows.map((r) => ({
      ...r,
      price: bulkPrice || r.price,
      stock: bulkStock || r.stock,
    })));
  };

  const updateRow = (i: number, field: 'price' | 'stock' | 'sku', val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Bulk fill */}
      <div className="flex flex-wrap items-end gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-[12px] font-bold text-gray-600 w-full">Bulk fill all rows</p>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 shrink-0">Price ₱</span>
          <input
            type="number" min="0" placeholder="—"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            className="w-24 px-2.5 py-1.5 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 shrink-0">Stock</span>
          <input
            type="number" min="0" placeholder="—"
            value={bulkStock}
            onChange={(e) => setBulkStock(e.target.value)}
            className="w-24 px-2.5 py-1.5 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-red focus:ring-2 focus:ring-red-100 bg-white"
          />
        </div>
        <button
          type="button"
          onClick={applyBulk}
          className="px-3.5 py-1.5 rounded-lg bg-brand-red text-white text-[12px] font-bold hover:bg-brand-red-dark transition-colors"
        >
          Apply to all
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-12">Img</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Combination</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-36">Price (₱)</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-32">Stock</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-36">SKU</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 py-2">
                  {row.imagePreview
                    ? <img src={row.imagePreview} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100" />
                    : <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="w-4 h-4 text-gray-300" /></div>}
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-700">
                  {row.combination}
                  {errors[`variantRow_label_${i}`] && <p className="text-[10px] text-red-500 mt-0.5">{errors[`variantRow_label_${i}`]}</p>}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" min="0" placeholder="0.00"
                    value={row.price}
                    onChange={(e) => updateRow(i, 'price', e.target.value)}
                    className={[
                      'w-full px-2.5 py-1.5 border rounded-lg outline-none focus:ring-2 focus:ring-red-100 bg-white text-[13px]',
                      errors[`variantRow_price_${i}`] ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
                    ].join(' ')}
                  />
                  {errors[`variantRow_price_${i}`] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{errors[`variantRow_price_${i}`]}</p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number" min="0" placeholder="0"
                    value={row.stock}
                    onChange={(e) => updateRow(i, 'stock', e.target.value)}
                    className={[
                      'w-full px-2.5 py-1.5 border rounded-lg outline-none focus:ring-2 focus:ring-red-100 bg-white text-[13px]',
                      errors[`variantRow_stock_${i}`] ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
                    ].join(' ')}
                  />
                  {errors[`variantRow_stock_${i}`] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{errors[`variantRow_stock_${i}`]}</p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text" placeholder="Optional"
                    value={row.sku ?? ''}
                    onChange={(e) => updateRow(i, 'sku', e.target.value)}
                    className={[
                      'w-full px-2.5 py-1.5 border rounded-lg outline-none focus:ring-2 focus:ring-red-100 bg-white text-[13px] font-mono',
                      errors[`variantRow_sku_${i}`] ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
                    ].join(' ')}
                  />
                  {errors[`variantRow_sku_${i}`] && (
                    <p className="text-[10px] text-red-500 mt-0.5">{errors[`variantRow_sku_${i}`]}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── FDA File Upload ──────────────────────────────────────────────────────────

function FdaFileInput({
  label, file, onFile, error,
  alreadyOnFile, onReplace,
}: {
  label: string; file: File | null; onFile: (f: File | null) => void;
  error?: string; alreadyOnFile?: boolean; onReplace?: () => void;
}) {
  const id = useId();
  if (alreadyOnFile) {
    return (
      <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-[13px] font-semibold text-emerald-700 flex-1">Already on file</span>
        <button
          type="button"
          onClick={onReplace}
          className="text-[12px] text-gray-500 underline hover:text-gray-700"
        >
          Replace
        </button>
      </div>
    );
  }
  return (
    <div>
      <label
        htmlFor={id}
        className={[
          'flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all',
          error
            ? 'border-red-300 bg-red-50/40'
            : 'border-gray-200 hover:border-brand-red hover:bg-red-50/20',
        ].join(' ')}
      >
        <Upload className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-[13px] text-gray-500 flex-1 truncate">
          {file ? file.name : `Upload ${label}`}
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onFile(null); }}
            className="text-gray-400 hover:text-red-500"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <input
          id={id} type="file" accept=".pdf,image/*" hidden
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && <p className="text-[11px] text-red-500 font-medium mt-1">{error}</p>}
    </div>
  );
}

// ─── Rich Text Editor ─────────────────────────────────────────────────────────

function RichTextEditor({
  value, onChange, error, maxLength = 1500,
}: {
  value: string;
  onChange: (html: string) => void;
  error?: string;
  maxLength?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitialized = useRef(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;
    if (!isInitialized.current && value) {
      editorRef.current.innerHTML = value;
      isInitialized.current = true;
    }
  }, [value]);

  const exec = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    syncContent();
  };

  const syncContent = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const insertImage = async (file: File) => {
    try {
      setUploadingImage(true);
      const { file: upload } = await downscaleImage(file, PRODUCT_MAX_EDGE, PRODUCT_JPEG_QUALITY);
      const { url } = await uploadDescriptionImageApi(upload);
      editorRef.current?.focus();
      document.execCommand(
        'insertHTML',
        false,
        `<img src="${url}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" alt="Product image" />`
      );
      syncContent();
    } catch {
      // ignore
    } finally {
      setUploadingImage(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) insertImage(file);
        return;
      }
    }
  };

  const charCount = value.replace(/<[^>]*>/g, '').length;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all focus-within:ring-2 focus-within:ring-red-100 ${
      error ? 'border-red-400' : 'border-gray-200 focus-within:border-brand-red'
    }`}>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}
          title="Bold"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}
          title="Bullet list"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}
          title="Numbered list"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <button
          type="button"
          disabled={uploadingImage}
          onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
          title="Insert image"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors disabled:opacity-50"
        >
          {uploadingImage ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-red" />
          ) : (
            <ImageIcon className="w-3.5 h-3.5" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImage(file);
            e.target.value = '';
          }}
        />
        <span className={`ml-auto text-[11px] font-medium ${charCount > maxLength ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
          {charCount}/{maxLength}
        </span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        onPaste={onPaste}
        onDrop={(e) => {
          e.preventDefault();
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
          if (file) insertImage(file);
        }}
        onDragOver={(e) => e.preventDefault()}
        className="min-h-[140px] max-h-[400px] overflow-y-auto px-3.5 py-2.5 text-[13.5px] text-gray-700 leading-relaxed bg-white outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full [&_img]:rounded-xl empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
        data-placeholder="Describe your product in detail…"
      />
      {error && <p className="text-[11px] text-red-500 font-medium px-3.5 pb-2">{error}</p>}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

/** Rebuilds a saved product's variation types and rows from its type names and "Red / M" labels. */
function loadVariants(
  variants: SellerProductVariant[],
  typeNames: string[],
): { types: ProductFormVariantType[]; rows: ProductFormVariantRow[] } {
  const parts = variants.map((v) => v.label.split(' / ').map((s) => s.trim()));
  const width = typeNames.length || parts[0]?.length || 1;
  // Older products may not follow "Option / Option": they load as one type whose options are the full labels.
  const parsable = width <= MAX_TYPES && parts.every((p) => p.length === width);
  const split = parsable ? parts : variants.map((v) => [v.label]);
  const names = parsable
    ? Array.from({ length: width }, (_, i) => typeNames[i] ?? (width === 1 ? 'Style' : `Variation ${i + 1}`))
    : [typeNames[0] ?? 'Style'];

  const types = names.map((name, ti) => {
    const options: string[] = [];
    split.forEach((p) => {
      const o = p[ti];
      if (o && !options.some((x) => x.toLowerCase() === o.toLowerCase())) options.push(o);
    });
    return { name, options, optionImages: {} };
  });
  const rows = variants.map((v, i) => ({
    id: v.id,
    sku: v.sku ?? '',
    combination: split[i].join(' / '),
    options: Object.fromEntries(split[i].map((o, ti) => [ti, o])) as Record<number, string>,
    price: String(v.regular_price ?? v.price),
    stock: String(v.stock_quantity),
    imagePreview: undefined,
  }));
  return { types, rows };
}

// ─── Store categories (A17) ───────────────────────────────────────────────────

function StoreCategoryPicker({
  tree, selected, onChange, locked,
}: {
  tree: StoreCategoryNode[] | null;
  selected: number[];
  onChange: (ids: number[]) => void;
  locked: boolean;
}) {
  if (locked) {
    return <p className="text-[12px] text-gray-400">Store categories open once your shop is approved.</p>;
  }
  if (tree === null) return <div className="h-9 rounded-xl bg-gray-50 animate-pulse" />;

  const flat = tree.flatMap((n) => [
    { id: n.id, label: n.name, hidden: !n.is_visible },
    ...(n.children ?? []).map((c) => ({ id: c.id, label: `${n.name} › ${c.name}`, hidden: !c.is_visible || !n.is_visible })),
  ]);
  if (flat.length === 0) {
    return (
      <p className="text-[12px] text-gray-500">
        You have no store categories yet.{' '}
        <Link to="/seller/store-categories" className="font-semibold text-brand-red hover:underline">Create them</Link>
        {' '}to group products on your shop page.
      </p>
    );
  }

  const full = selected.length >= MAX_STORE_CATEGORIES;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {flat.map((c) => {
          const on = selected.includes(c.id);
          const disabled = !on && full;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors',
                on ? 'border-brand-red bg-red-50 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {on && <CheckCircle2 className="w-3.5 h-3.5" />}
              {c.label}
              {c.hidden && <span className="text-[10px] font-medium text-gray-400">hidden</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 tabular-nums">
        {selected.length}/{MAX_STORE_CATEGORIES} selected{full ? ' · remove one to pick another' : ''}
      </p>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 group"
    >
      <div className={[
        'w-11 h-6 rounded-full transition-colors relative shrink-0',
        checked ? 'bg-brand-red' : 'bg-gray-200',
      ].join(' ')}>
        <span className={[
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')} />
      </div>
      <span className="text-[13.5px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">
        {label}
      </span>
    </button>
  );
}

// ─── SellerAddProductPage ─────────────────────────────────────────────────────

export default function SellerAddProductPage() {
  const pageRef = useMountAnim();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [form, setForm] = useState<AddProductFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // The server's summary, shown above the form so an error for a field without its own slot is never silent.
  const [serverError, setServerError] = useState('');
  const serverErrorRef = useRef<HTMLDivElement>(null);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [fdaOpen, setFdaOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const { user } = useAuth();
  // A seller whose application is still waiting can prepare drafts; only an approved store publishes (A18).
  const approved = user?.seller_profile?.application_status === 'approved';
  const [storeTree, setStoreTree] = useState<StoreCategoryNode[] | null>(null);
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null);
  // The single variant of a product without variations, so a save updates it instead of replacing it.
  const simpleVariantId = useRef<number | undefined>(undefined);
  // One key per new product: a double click or a retried request never creates it twice (A37).
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${uid()}${uid()}`,
  );

  // The platform categories the admin keeps (active only), with their FDA rule. The built-in list is shown only
  // until they load, or if they cannot be loaded.
  const [tree, setTree] = useState<CategoryNode[]>(CATEGORY_TREE);

  // The shop's low-stock level, for the alert's "Shop level" choice (5 unless the seller changed it).
  const [shopLowStock, setShopLowStock] = useState<number | null>(null);
  // The shop's FDA LTO (from its application or an earlier product) counts for every food product.
  const [shopLtoOnFile, setShopLtoOnFile] = useState(false);
  useEffect(() => {
    getSellerShopProfileApi()
      .then((p) => { setShopLowStock(p.low_stock_threshold ?? 5); setShopLtoOnFile(p.fda_lto_on_file === true); })
      .catch(() => setShopLowStock(5));
  }, []);
  useEffect(() => {
    if (shopLtoOnFile) setForm((prev) => (prev.fdaLtoOnFile || prev.fdaLtoFile ? prev : { ...prev, fdaLtoOnFile: true }));
  }, [shopLtoOnFile]);
  useEffect(() => {
    getStorefrontCategoriesApi()
      .then((cats) => {
        const live = cats.filter((p) => (p.children ?? []).length > 0).map((p) => ({
          id: p.slug, label: p.name,
          children: (p.children ?? []).map((c) => ({ id: c.slug, label: c.name, requiresFdaDoc: c.requires_fda === true })),
        }));
        if (live.length > 0) setTree(live);
      })
      .catch(() => {});
  }, []);

  // An edited product's parent category, once the tree is known.
  useEffect(() => {
    setForm((prev) => {
      if (!prev.leafCategoryId) return prev;
      const parent = tree.find((n) => n.children.some((c) => c.id === prev.leafCategoryId));
      return parent && parent.id !== prev.parentCategoryId ? { ...prev, parentCategoryId: parent.id } : prev;
    });
  }, [tree]);

  useEffect(() => {
    if (!approved) { setStoreTree([]); return; }
    getStoreCategoriesApi().then(setStoreTree).catch(() => setStoreTree([]));
  }, [approved]);

  // Load existing product when editing
  useEffect(() => {
    if (!isEdit) return;
    getSellerProductApi(Number(id))
      .then((p) => {
        // The live tree may still be loading; the effect on `tree` settles the parent once it has.
        const parentEntry = CATEGORY_TREE.find((n) =>
          n.children.some((c) => c.id === p.category_id)
        );
        const hasVariants = p.variants.length > 1 ||
          (p.variants.length === 1 && p.variants[0].label !== 'Default');
        const loaded = loadVariants(p.variants, p.variation_types ?? []);
        simpleVariantId.current = hasVariants ? undefined : p.variants[0]?.id;
        setLoadedStatus(p.status);

        let weightValue = '';
        let weightUnit: 'kg' | 'g' = 'kg';
        if (p.weight_kg != null) {
          // Rounded to the gram: 0.29 * 1000 is 290.00000000000006 in floating point.
          const kg = Number(p.weight_kg);
          if (kg < 1) { weightValue = String(Math.round(kg * 1000)); weightUnit = 'g'; }
          else { weightValue = String(Math.round(kg * 1000) / 1000); weightUnit = 'kg'; }
        }

        setForm((prev) => ({
          ...prev,
          name: p.name,
          description: p.description ?? '',
          parentCategoryId: parentEntry?.id ?? '',
          leafCategoryId: p.category_id ?? '',
          hasVariants,
          images: [],
          existingImages: [...(p.images ?? [])].sort((a, b) => a.sort_order - b.sort_order),
          deletedImageIds: [],
          // The form edits regular prices; store and flash sales are priced on top of them.
          price: hasVariants ? '' : String(p.variants[0]?.regular_price ?? p.variants[0]?.price ?? p.base_price),
          stock: hasVariants ? '' : String(p.variants[0]?.stock_quantity ?? 0),
          variantTypes: hasVariants ? loaded.types : [],
          variantRows: hasVariants ? loaded.rows : [],
          storeCategoryIds: p.store_category_ids ?? [],
          purchaseLimit: p.purchase_limit ? String(p.purchase_limit) : '',
          lowStockMode: p.low_stock_alert === 'off' ? 'off' : p.low_stock_alert === 'custom' ? (p.low_stock_threshold === 0 ? 'sold_out' : 'custom') : 'shop',
          lowStockLevel: p.low_stock_alert === 'custom' && p.low_stock_threshold ? String(p.low_stock_threshold) : '',
          weightValue,
          weightUnit,
          dimensionL: p.dimension_l_cm != null ? String(p.dimension_l_cm) : '',
          dimensionW: p.dimension_w_cm != null ? String(p.dimension_w_cm) : '',
          dimensionH: p.dimension_h_cm != null ? String(p.dimension_h_cm) : '',
          sku: p.sku ?? '',
          netWeight: p.net_weight_volume ?? '',
          expiryDate: p.expiry_best_before ?? '',
          ingredients: p.ingredients ?? '',
          storageInstructions: p.storage_instructions ?? '',
          allergenInfo: p.allergen_info ?? '',
          fdaLtoOnFile: p.fda_lto_on_file || prev.fdaLtoOnFile,
          fdaCprOnFile: p.fda_cpr_on_file,
        }));
        if (hasVariants) setVariantsOpen(true);
        if (p.fda_lto_on_file || p.fda_cpr_on_file) setFdaOpen(true);
      })
      .catch(() => navigate('/seller/products'))
      .finally(() => setLoadingProduct(false));
  }, [id, isEdit, navigate]);

  const set = <K extends keyof AddProductFormState>(key: K, value: AddProductFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const clearError = (key: string) =>
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });

  // Category
  const parentNode = tree.find((n) => n.id === form.parentCategoryId);
  const leafOptions = parentNode
    ? parentNode.children
    : [];
  const needsFda = form.leafCategoryId ? fdaFor(tree, form.leafCategoryId) : false;

  // Sync FDA section open state
  const handleLeafChange = (leafId: string) => {
    set('leafCategoryId', leafId);
    clearError('leafCategoryId');
    const requires = fdaFor(tree, leafId);
    if (requires && !fdaOpen) setFdaOpen(true);
    if (!requires) setFdaOpen(false);
  };

  // When images change, rebuild variant rows so thumbnails stay in sync
  const handleImagesChange = (imgs: ProductFormImage[]) => {
    setForm((prev) => ({
      ...prev,
      images: imgs,
      variantRows: prev.hasVariants && prev.variantTypes.length ? buildVariantRows(prev.variantTypes, imgs, prev.variantRows) : prev.variantRows,
    }));
    clearError('images');
    setZoomIndex((prev) => (prev !== null && prev >= imgs.length ? null : prev));
  };

  // Variants: rows keep their saved price, stock and SKU when options are added or removed.
  const handleVariantTypesChange = (types: ProductFormVariantType[]) => {
    setForm((prev) => ({ ...prev, variantTypes: types, variantRows: buildVariantRows(types, prev.images, prev.variantRows) }));
    clearError('variantTypes');
  };

  const handleToggleVariants = (v: boolean) => {
    setVariantsOpen(v);
    set('hasVariants', v);
    if (!v) setForm((prev) => ({ ...prev, variantTypes: [], variantRows: [] }));
  };

  // Submit: a draft needs only a valid name; publishing checks every rule and makes the product live at once.
  const handleSubmit = async (publish: boolean) => {
    if (submitting) return;
    const { errors: errs, firstSection } = validate(form, publish, tree);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setServerError('');
      if (firstSection) {
        const el = document.getElementById(`section-${firstSection}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    setErrors({});
    setSubmitting(true);
    setServerError('');
    try {
      // Phone photos are often over the 5 MB limit (or HEIC): shrink them to a JPEG first, like delivery proofs.
      const uploads = await Promise.all(form.images.map((img) => downscaleImage(img.file, PRODUCT_MAX_EDGE, PRODUCT_JPEG_QUALITY)));
      // A photo the browser could not shrink below the server's 5 MB is named here instead of failing the upload.
      const tooBig = uploads.find((u) => u.file.size > MAX_IMAGE_BYTES);
      if (tooBig) {
        setErrors({ images: `${tooBig.file.name} is still over 5 MB after resizing. Use a smaller photo.` });
        setSubmitting(false);
        document.getElementById('section-basic')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('description', form.description);
      fd.append('category_slug', form.leafCategoryId);
      fd.append('status', publish ? 'active' : 'draft');

      if (form.hasVariants) {
        form.variantTypes
          .filter((t) => t.name.trim() && t.options.length > 0)
          .forEach((t) => fd.append('variation_types[]', t.name.trim()));
        form.variantRows.forEach((row, i) => {
          if (row.id) fd.append(`variants[${i}][id]`, String(row.id));
          fd.append(`variants[${i}][label]`, row.combination);
          fd.append(`variants[${i}][price]`, row.price.trim());
          fd.append(`variants[${i}][stock]`, row.stock.trim());
          fd.append(`variants[${i}][sku]`, (row.sku ?? '').trim());
        });
      } else {
        fd.append('variation_types', '');
        if (simpleVariantId.current) fd.append('variants[0][id]', String(simpleVariantId.current));
        fd.append('variants[0][label]', 'Default');
        fd.append('variants[0][price]', form.price.trim());
        fd.append('variants[0][stock]', form.stock.trim());
      }
      if (form.storeCategoryIds.length) form.storeCategoryIds.forEach((sc) => fd.append('store_category_ids[]', String(sc)));
      else fd.append('store_category_ids', '');
      fd.append('purchase_limit', form.purchaseLimit.trim());
      fd.append('low_stock_alert', form.lowStockMode === 'sold_out' ? 'custom' : form.lowStockMode);
      if (form.lowStockMode === 'custom') fd.append('low_stock_threshold', form.lowStockLevel.trim());
      if (form.lowStockMode === 'sold_out') fd.append('low_stock_threshold', '0');

      if (form.weightValue) {
        const kg = form.weightUnit === 'g'
          ? String(Number(form.weightValue) / 1000)
          : form.weightValue;
        fd.append('weight_kg', kg);
      }
      if (form.dimensionL) fd.append('dimension_l_cm', form.dimensionL);
      if (form.dimensionW) fd.append('dimension_w_cm', form.dimensionW);
      if (form.dimensionH) fd.append('dimension_h_cm', form.dimensionH);
      if (form.sku)        fd.append('sku', form.sku);

      uploads.forEach((u) => fd.append('images[]', u.file));
      form.deletedImageIds.forEach((id) => fd.append('delete_image_ids[]', String(id)));

      if (form.fdaLtoFile)           fd.append('fda_lto', form.fdaLtoFile);
      if (form.fdaCprFile)           fd.append('fda_cpr', form.fdaCprFile);
      if (form.netWeight)            fd.append('net_weight_volume', form.netWeight);
      if (form.expiryDate)           fd.append('expiry_best_before', form.expiryDate);
      if (form.ingredients)          fd.append('ingredients', form.ingredients);
      if (form.storageInstructions)  fd.append('storage_instructions', form.storageInstructions);
      if (form.allergenInfo)         fd.append('allergen_info', form.allergenInfo);

      const saved = isEdit
        ? await updateSellerProductFullApi(Number(id), fd)
        : await createSellerProductKeyedApi(fd, idempotencyKey);
      navigate('/seller/products', {
        state: { flash: saved.message ?? (publish ? 'Product published. It is live in your store.' : 'Draft saved.') },
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } };
      const serverErrors = axiosErr?.response?.data?.errors;
      if (serverErrors) {
        const mapped: FieldErrors = {};
        Object.entries(serverErrors).forEach(([k, v]) => {
          const field = formFieldForServerKey(k, form.hasVariants);
          if (!mapped[field]) mapped[field] = v[0];
        });
        setErrors(mapped);
        setServerError(axiosErr.response?.data?.message ?? 'Please check the highlighted fields.');
      } else if (axiosErr?.response?.status === 413) {
        setServerError('The photos are too large to upload together. Remove a few or use smaller photos.');
      } else {
        setServerError(axiosErr?.response?.data?.message ?? 'Something went wrong. Please try again.');
      }
      window.setTimeout(() => serverErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingProduct) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {[1,2,3,4].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div ref={pageRef} className="max-w-3xl mx-auto space-y-5 pb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-black text-gray-900">{isEdit ? 'Edit Product' : 'Add Product'}</h1>
      </div>

      {serverError && (
        <div ref={serverErrorRef} role="alert" className="px-4 py-3 text-sm text-red-700 border border-red-200 bg-red-50 rounded-xl">
          <p className="font-bold">The product could not be saved</p>
          <p className="mt-0.5">{serverError}</p>
        </div>
      )}

      {/* ── 1. Basic Info ─────────────────────────────────────────────────── */}
      <SectionCard id="basic" step={1} icon={Package} title="Basic Info">
        <FieldWrap label="Product Name" required error={errors.name}
          hint={`${NAME_MIN} to ${NAME_MAX} characters · ${form.name.trim().length}/${NAME_MAX}`}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => { set('name', e.target.value); clearError('name'); }}
            placeholder="e.g. Classic White Tee"
            className={inputCls(errors.name)}
          />
        </FieldWrap>

        <FieldWrap
          label="Description" required error={errors.description}
          hint={`Shown in the Product Details tab. Bold, lists and images are allowed. ${DESC_MIN} to ${DESC_MAX.toLocaleString()} characters · ${visibleText(form.description).length.toLocaleString()}/${DESC_MAX.toLocaleString()}`}
        >
          <RichTextEditor
            value={form.description}
            onChange={(html) => { set('description', html); clearError('description'); }}
            error={errors.description}
          />
        </FieldWrap>

        <FieldWrap label="Product Images" required>
          <ImageUploader
            images={form.images}
            existingImages={form.existingImages}
            onDeleteExisting={(id) => setForm((prev) => ({
              ...prev,
              existingImages: prev.existingImages.filter((img) => img.id !== id),
              deletedImageIds: [...prev.deletedImageIds, id],
            }))}
            onChange={handleImagesChange}
            error={errors.images}
            onZoom={setZoomIndex}
          />
        </FieldWrap>
      </SectionCard>

      {/* ── 2. Category ───────────────────────────────────────────────────── */}
      <SectionCard id="category" step={2} icon={Package} title="Category">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Parent Category" required>
            <CustomSelect
              value={form.parentCategoryId}
              onChange={(v) => {
                setForm((prev) => ({ ...prev, parentCategoryId: v, leafCategoryId: '' }));
                setFdaOpen(false);
              }}
              options={tree.map((n) => ({ value: n.id, label: n.label }))}
              placeholder="Select parent category…"
            />
          </FieldWrap>

          <FieldWrap label="Sub-category" required error={errors.leafCategoryId}>
            <CustomSelect
              value={form.leafCategoryId}
              onChange={handleLeafChange}
              options={leafOptions.map((c) => ({ value: c.id, label: c.label }))}
              placeholder={form.parentCategoryId ? 'Select sub-category…' : 'Select parent first'}
              disabled={!form.parentCategoryId}
              error={errors.leafCategoryId}
            />
          </FieldWrap>
        </div>

        {form.parentCategoryId === 'others' && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
            Use Others only when no other category fits. The Loved-IT team checks products in Others before they go live, usually within 1 business day.
          </p>
        )}
        <p className="text-[12px] leading-relaxed text-gray-500">{NOT_ALLOWED_NOTE}</p>

        <FieldWrap label="Store Categories" error={errors.storeCategoryIds}
          hint={approved ? 'Optional. Where this product appears on your shop page (up to 3).' : undefined}>
          <StoreCategoryPicker
            tree={storeTree}
            locked={!approved}
            selected={form.storeCategoryIds}
            onChange={(ids) => { set('storeCategoryIds', ids); clearError('storeCategoryIds'); }}
          />
        </FieldWrap>
      </SectionCard>

      {/* ── 3. Variants ───────────────────────────────────────────────────── */}
      <SectionCard id="variants" step={3} icon={Plus} title="Variants & Pricing">
        <Toggle
          checked={form.hasVariants}
          onChange={handleToggleVariants}
          label="This product has variants (e.g. Color, Size, Flavor)"
        />

        {/* Animated expand */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: variantsOpen ? '9999px' : '0', opacity: variantsOpen ? 1 : 0 }}
        >
          <div className="pt-2 space-y-4">
            <FieldWrap label="Variant Types" error={errors.variantTypes}
              hint={`Up to ${MAX_TYPES} variation types, each with up to ${MAX_OPTIONS} options. Type an option and press Enter.`}>
              <VariantTypesBuilder
                types={form.variantTypes}
                onChange={handleVariantTypesChange}
                images={form.images}
              />
            </FieldWrap>

            {form.variantRows.length > 0 && (
              <FieldWrap label="Variant Combinations">
                <VariantTable
                  rows={form.variantRows}
                  onChange={(rows) => set('variantRows', rows)}
                  errors={errors}
                />
              </FieldWrap>
            )}
          </div>
        </div>

        {/* Simple price + stock when no variants */}
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: !variantsOpen ? '9999px' : '0', opacity: !variantsOpen ? 1 : 0 }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <FieldWrap label="Price (₱)" required error={errors.price} hint="₱1.00 to ₱1,000,000.00">
              <input
                type="number" min="1" max="1000000" step="0.01" inputMode="decimal" placeholder="0.00"
                value={form.price}
                onChange={(e) => { set('price', e.target.value); clearError('price'); }}
                className={inputCls(errors.price)}
              />
            </FieldWrap>
            <FieldWrap label="Stock Quantity" required error={errors.stock} hint="0 to 99,999">
              <input
                type="number" min="0" max="99999" step="1" inputMode="numeric" placeholder="0"
                value={form.stock}
                onChange={(e) => { set('stock', e.target.value); clearError('stock'); }}
                className={inputCls(errors.stock)}
              />
            </FieldWrap>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Purchase Limit" error={errors.purchaseLimit}
            hint="Optional. The most one buyer can buy in total, across all orders.">
            <input
              type="number" min="1" step="1" inputMode="numeric" placeholder="No limit"
              value={form.purchaseLimit}
              onChange={(e) => { set('purchaseLimit', e.target.value); clearError('purchaseLimit'); }}
              className={inputCls(errors.purchaseLimit)}
            />
          </FieldWrap>
          <div className="self-end text-[12px] text-gray-500 leading-relaxed rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5">
            Discounts are scheduled store sales and flash sales.{' '}
            {approved
              ? <Link to="/seller/promotions" className="font-semibold text-brand-red hover:underline">Open Promotions</Link>
              : 'They open once your shop is approved.'}
          </div>
        </div>

        <LowStockAlertField
          form={form}
          shopLevel={shopLowStock}
          error={errors.lowStockLevel}
          onMode={(m) => { set('lowStockMode', m); clearError('lowStockLevel'); }}
          onLevel={(v) => { set('lowStockLevel', v); clearError('lowStockLevel'); }}
        />
      </SectionCard>

      {/* ── 4. Shipping ───────────────────────────────────────────────────── */}
      <SectionCard id="shipping" step={4} icon={Package} title="Shipping & Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Weight" required error={errors.weightValue}
            hint="Shipping is charged per kilogram, rounded up to the next kg.">
            <div className="flex gap-2">
              <input
                type="number" min="0" step="any" placeholder="0"
                value={form.weightValue}
                onChange={(e) => { set('weightValue', e.target.value); clearError('weightValue'); }}
                className={inputCls(errors.weightValue) + ' flex-1'}
              />
              <div className="w-20 shrink-0">
                <CustomSelect
                  value={form.weightUnit}
                  onChange={(v) => set('weightUnit', v as 'kg' | 'g')}
                  options={WEIGHT_UNITS.map((u) => ({ value: u, label: u }))}
                />
              </div>
            </div>
          </FieldWrap>

          <FieldWrap label="SKU" hint="Optional. Your own product code: letters, numbers, dots, dashes and underscores." error={errors.sku}>
            <input
              type="text" placeholder="e.g. SKU-001" maxLength={100} autoComplete="off"
              value={form.sku}
              onChange={(e) => { set('sku', e.target.value); clearError('sku'); }}
              className={inputCls(errors.sku)}
            />
          </FieldWrap>
        </div>

        <FieldWrap label="Dimensions (L × W × H)" hint="Optional — in cm" error={errors.dimensions}>
          <div className="grid grid-cols-3 gap-2">
            {(['dimensionL', 'dimensionW', 'dimensionH'] as const).map((key, i) => (
              <input
                key={key}
                type="number" min="0" step="any"
                aria-label={['Length (cm)', 'Width (cm)', 'Height (cm)'][i]}
                placeholder={['Length', 'Width', 'Height'][i]}
                value={form[key]}
                onChange={(e) => { set(key, e.target.value); clearError('dimensions'); }}
                className={inputCls(errors.dimensions)}
              />
            ))}
          </div>
        </FieldWrap>
      </SectionCard>

      {/* ── 5. FDA Compliance (conditional) ──────────────────────────────── */}
      {needsFda && (
        <div
          id="section-fda"
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: fdaOpen ? '9999px' : '0', opacity: fdaOpen ? 1 : 0 }}
        >
          <div className="bg-white rounded-2xl border-l-4 border-l-amber-400 border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50">
              <span className="w-7 h-7 rounded-xl bg-amber-400 text-white text-[12px] font-black flex items-center justify-center shrink-0">
                5
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <h2 className="text-[15px] font-bold text-gray-900">FDA Compliance</h2>
              <span className="ml-auto text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-0.5 rounded-full">
                Required for Food products
              </span>
            </div>
            <div className="px-6 py-5 space-y-5">
              <FieldWrap
                label="FDA License to Operate (LTO)"
                required
                error={errors.fdaLtoFile}
                hint="Your shop's FDA LTO. If already uploaded for a previous product, it will show as on file."
              >
                <FdaFileInput
                  label="FDA LTO"
                  file={form.fdaLtoFile}
                  onFile={(f) => { set('fdaLtoFile', f); clearError('fdaLtoFile'); }}
                  error={errors.fdaLtoFile}
                  alreadyOnFile={form.fdaLtoOnFile}
                  onReplace={() => set('fdaLtoOnFile', false)}
                />
              </FieldWrap>

              <FieldWrap
                label="CPR / CPN"
                required
                error={errors.fdaCprFile}
                tooltip="CPR (Certificate of Product Registration) is for processed/manufactured food. CPN (Certificate of Product Notification) is for lower-risk food products. Upload whichever applies to this product."
              >
                <FdaFileInput
                  label="CPR or CPN document"
                  file={form.fdaCprFile}
                  onFile={(f) => { set('fdaCprFile', f); clearError('fdaCprFile'); }}
                  error={errors.fdaCprFile}
                  alreadyOnFile={form.fdaCprOnFile}
                  onReplace={() => set('fdaCprOnFile', false)}
                />
              </FieldWrap>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FieldWrap label="Net Weight / Volume">
                  <input
                    type="text" placeholder="e.g. 250g, 500ml"
                    maxLength={10}
                    value={form.netWeight}
                    onChange={(e) => set('netWeight', e.target.value)}
                    className={inputCls()}
                  />
                </FieldWrap>
                <FieldWrap label="Expiry / Best Before Date">
                  <input
                    type="text" placeholder="e.g. 12 months from manufacture"
                    maxLength={50}
                    value={form.expiryDate}
                    onChange={(e) => set('expiryDate', e.target.value)}
                    className={inputCls()}
                  />
                </FieldWrap>
              </div>

              <FieldWrap label="Ingredients">
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.ingredients}
                  onChange={(e) => set('ingredients', e.target.value)}
                  placeholder="List all ingredients…"
                  className={inputCls() + ' resize-none'}
                />
              </FieldWrap>

              <FieldWrap label="Storage Instructions">
                <input
                  type="text" placeholder="e.g. Store in a cool, dry place"
                  maxLength={500}
                  value={form.storageInstructions}
                  onChange={(e) => set('storageInstructions', e.target.value)}
                  className={inputCls()}
                />
              </FieldWrap>

              <FieldWrap label="Allergen Information" hint="Optional — list any allergens present">
                <input
                  type="text" placeholder="e.g. Contains wheat, soy, milk"
                  maxLength={500}
                  value={form.allergenInfo}
                  onChange={(e) => set('allergenInfo', e.target.value)}
                  className={inputCls()}
                />
              </FieldWrap>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-[12px] text-gray-500 leading-snug flex-1">
          {!approved
            ? 'Your seller application is still being reviewed. You can save drafts now and publish them once your shop is approved.'
            : loadedStatus === 'active'
              ? 'This product is live. Saving updates it right away; saving as a draft hides it from buyers.'
              : 'Publishing makes the product live in your store right away. A draft stays hidden until you publish it.'}
        </p>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            className="px-5 py-2.5 rounded-xl border-2 border-gray-200 text-[13px] font-bold text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {loadedStatus === 'active' ? 'Move to Drafts' : 'Save as Draft'}
          </button>
          <button
            type="button"
            disabled={submitting || !approved}
            title={approved ? undefined : 'Publishing opens once your shop is approved.'}
            onClick={() => handleSubmit(true)}
            className="px-6 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {loadedStatus === 'active' ? 'Save Changes' : 'Publish'}
          </button>
        </div>
      </div>

      {zoomIndex !== null && (
        <ImageLightbox
          images={form.images}
          index={zoomIndex}
          onClose={() => setZoomIndex(null)}
          onNav={setZoomIndex}
        />
      )}
    </div>
  );
}
