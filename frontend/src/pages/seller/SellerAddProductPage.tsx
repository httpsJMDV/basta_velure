import {
  useState, useRef, useCallback, useId, useEffect,
  type ChangeEvent, type DragEvent, type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ImagePlus, X, GripVertical, Plus, Trash2,
  Info, CheckCircle2, Upload, AlertTriangle, Package, ChevronLeft, ChevronRight,
  Bold, List, ListOrdered, Image as ImageIcon, Loader2,
} from 'lucide-react';
import CustomSelect from '../../components/ui/CustomSelect';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { CATEGORY_TREE, leafRequiresFda } from '../../data/categories';
import {
  createSellerProductApi,
  getSellerProductApi,
  updateSellerProductApi,
  uploadDescriptionImageApi,
} from '../../api/client';
import type {
  AddProductFormState, ProductFormImage,
  ProductFormVariantType, ProductFormVariantRow,
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
  fdaLtoFile: null, fdaLtoOnFile: false, fdaCprFile: null,
  ingredients: '', netWeight: '', storageInstructions: '',
  expiryDate: '', allergenInfo: '',
};

type FieldErrors = Partial<Record<string, string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function buildVariantRows(
  types: ProductFormVariantType[],
  images: ProductFormImage[],
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
    return {
      combination: filled.map((_, ti) => opts[ti]).join(' / '),
      options: opts,
      price: '',
      stock: '',
      imagePreview,
    };
  });
}

function validate(form: AddProductFormState): { errors: FieldErrors; firstSection: string | null } {
  const errors: FieldErrors = {};

  if (!form.name.trim()) errors.name = 'Product name is required.';
  const descText = form.description.replace(/<[^>]*>/g, '').trim();
  if (!descText && !form.description.includes('<img')) {
    errors.description = 'Description is required.';
  } else if (descText.length > 1500) {
    errors.description = 'Description must not exceed 1,500 characters.';
  }
  if (form.images.length === 0 && form.existingImages.length === 0) errors.images = 'At least one product image is required.';

  if (!form.leafCategoryId) errors.leafCategoryId = 'Please select a category.';

  if (form.hasVariants) {
    const filled = form.variantTypes.filter((t) => t.name.trim() && t.options.length > 0);
    if (filled.length === 0) errors.variantTypes = 'Add at least one variant type with options.';
    form.variantRows.forEach((row, i) => {
      if (!row.price || isNaN(Number(row.price)) || Number(row.price) <= 0)
        errors[`variantRow_price_${i}`] = 'Required';
      if (!row.stock || isNaN(Number(row.stock)) || Number(row.stock) < 0)
        errors[`variantRow_stock_${i}`] = 'Required';
    });
  } else {
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0)
      errors.price = 'Enter a valid price.';
    if (!form.stock || isNaN(Number(form.stock)) || Number(form.stock) < 0)
      errors.stock = 'Enter a valid stock quantity.';
  }

  if (!form.weightValue || isNaN(Number(form.weightValue)) || Number(form.weightValue) <= 0)
    errors.weightValue = 'Weight is required.';

  const needsFda = form.leafCategoryId && leafRequiresFda(form.leafCategoryId);
  if (needsFda) {
    if (!form.fdaLtoFile && !form.fdaLtoOnFile) errors.fdaLtoFile = 'FDA LTO is required.';
    if (!form.fdaCprFile) errors.fdaCprFile = 'CPR/CPN document is required.';
  }

  const sectionOrder = ['basic', 'category', 'variants', 'shipping', 'fda'];
  const sectionErrors: Record<string, string[]> = {
    basic: ['name', 'description', 'images'],
    category: ['leafCategoryId'],
    variants: ['variantTypes', 'price', 'stock',
      ...Object.keys(errors).filter((k) => k.startsWith('variantRow_'))],
    shipping: ['weightValue'],
    fda: ['fdaLtoFile', 'fdaCprFile'],
  };

  let firstSection: string | null = null;
  for (const sec of sectionOrder) {
    if (sectionErrors[sec].some((k) => errors[k])) { firstSection = sec; break; }
  }

  return { errors, firstSection };
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
  const inputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const pointerMoved = useRef(false);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next = [...images];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      next.push({ id: uid(), file, preview: URL.createObjectURL(file) });
    });
    onChange(next);
  }, [images, onChange]);

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
        onClick={() => inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-all',
          dragging
            ? 'border-brand-red bg-red-50'
            : error
            ? 'border-red-300 bg-red-50/40'
            : 'border-gray-200 hover:border-brand-red hover:bg-red-50/30',
        ].join(' ')}
      >
        <ImagePlus className={`w-8 h-8 ${dragging ? 'text-brand-red' : 'text-gray-300'}`} />
        <p className="text-[13px] font-semibold text-gray-500">
          Drag & drop images here, or <span className="text-brand-red">browse</span>
        </p>
        <p className="text-[11px] text-gray-400">PNG, JPG, WEBP · First image = main photo</p>
        <input
          ref={inputRef} type="file" accept="image/*" multiple hidden
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

  const MAX_OPTIONS = 12;

  const add = () => {
    const val = draft.trim();
    if (val && !options.includes(val) && options.length < MAX_OPTIONS) onChange([...options, val]);
    setDraft('');
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
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={options.length === 0 ? 'Type option + Enter…' : options.length >= MAX_OPTIONS ? '' : 'Add more…'}
        disabled={options.length >= MAX_OPTIONS}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-[13px] text-gray-700 placeholder:text-gray-400"
      />
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
              options={VARIANT_TYPE_OPTIONS}
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
      {types.length < 3 && (
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

  const updateRow = (i: number, field: 'price' | 'stock', val: string) => {
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
        <table className="w-full text-[13px] min-w-[420px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-12">Img</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Combination</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-36">Price (₱)</th>
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-32">Stock</th>
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
                <td className="px-4 py-2.5 font-medium text-gray-700">{row.combination}</td>
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
        <span className="text-[13px] font-semibold text-emerald-700 flex-1">Already on file ✓</span>
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
      const { url } = await uploadDescriptionImageApi(file);
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
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [fdaOpen, setFdaOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  // Load existing product when editing
  useEffect(() => {
    if (!isEdit) return;
    getSellerProductApi(Number(id))
      .then((p) => {
        const parentEntry = CATEGORY_TREE.find((n) =>
          n.children.some((c) => c.id === p.category_id)
        );
        const hasVariants = p.variants.length > 1 ||
          (p.variants.length === 1 && p.variants[0].label !== 'Default');

        let weightValue = '';
        let weightUnit: 'kg' | 'g' = 'kg';
        if (p.weight_kg != null) {
          if (p.weight_kg < 1) { weightValue = String(p.weight_kg * 1000); weightUnit = 'g'; }
          else { weightValue = String(p.weight_kg); weightUnit = 'kg'; }
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
          price: hasVariants ? '' : String(p.variants[0]?.price ?? p.base_price),
          stock: hasVariants ? '' : String(p.variants[0]?.stock_quantity ?? 0),
          variantRows: hasVariants ? p.variants.map((v) => ({
            combination: v.label,
            options: {},
            price: String(v.price),
            stock: String(v.stock_quantity),
            imagePreview: undefined,
          })) : [],
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
          fdaLtoOnFile: p.fda_lto_on_file,
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
  const parentNode = CATEGORY_TREE.find((n) => n.id === form.parentCategoryId);
  const leafOptions = parentNode
    ? parentNode.children
    : [];
  const needsFda = form.leafCategoryId ? leafRequiresFda(form.leafCategoryId) : false;

  // Sync FDA section open state
  const handleLeafChange = (leafId: string) => {
    set('leafCategoryId', leafId);
    clearError('leafCategoryId');
    const requires = leafRequiresFda(leafId);
    if (requires && !fdaOpen) setFdaOpen(true);
    if (!requires) setFdaOpen(false);
  };

  // When images change, rebuild variant rows so thumbnails stay in sync
  const handleImagesChange = (imgs: ProductFormImage[]) => {
    setForm((prev) => ({
      ...prev,
      images: imgs,
      variantRows: prev.hasVariants ? buildVariantRows(prev.variantTypes, imgs) : prev.variantRows,
    }));
    clearError('images');
    setZoomIndex((prev) => (prev !== null && prev >= imgs.length ? null : prev));
  };

  // Variants
  const handleVariantTypesChange = (types: ProductFormVariantType[]) => {
    const rows = buildVariantRows(types, form.images);
    setForm((prev) => ({ ...prev, variantTypes: types, variantRows: rows }));
  };

  const handleToggleVariants = (v: boolean) => {
    setVariantsOpen(v);
    set('hasVariants', v);
    if (!v) setForm((prev) => ({ ...prev, variantTypes: [], variantRows: [] }));
  };

  // Submit
  const handleSubmit = async (isDraft: boolean) => {
    if (!isDraft) {
      const { errors: errs, firstSection } = validate(form);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        if (firstSection) {
          const el = document.getElementById(`section-${firstSection}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('category_slug', form.leafCategoryId);
      fd.append('status', isDraft ? 'draft' : 'pending_review');

      if (form.hasVariants) {
        form.variantRows.forEach((row, i) => {
          fd.append(`variants[${i}][label]`, row.combination);
          fd.append(`variants[${i}][price]`, row.price || '0');
          fd.append(`variants[${i}][stock]`, row.stock || '0');
        });
        const prices = form.variantRows.map((r) => Number(r.price)).filter(Boolean);
        fd.append('base_price', String(prices.length ? Math.min(...prices) : 0));
      } else {
        fd.append('base_price', form.price || '0');
        fd.append('variants[0][label]', 'Default');
        fd.append('variants[0][price]', form.price || '0');
        fd.append('variants[0][stock]', form.stock || '0');
      }

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

      form.images.forEach((img) => fd.append('images[]', img.file));
      form.deletedImageIds.forEach((id) => fd.append('delete_image_ids[]', String(id)));

      if (form.fdaLtoFile)           fd.append('fda_lto', form.fdaLtoFile);
      if (form.fdaCprFile)           fd.append('fda_cpr', form.fdaCprFile);
      if (form.netWeight)            fd.append('net_weight_volume', form.netWeight);
      if (form.expiryDate)           fd.append('expiry_best_before', form.expiryDate);
      if (form.ingredients)          fd.append('ingredients', form.ingredients);
      if (form.storageInstructions)  fd.append('storage_instructions', form.storageInstructions);
      if (form.allergenInfo)         fd.append('allergen_info', form.allergenInfo);

      if (isEdit) {
        await updateSellerProductApi(Number(id), fd);
      } else {
        await createSellerProductApi(fd);
      }
      navigate('/seller/products');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { errors?: Record<string, string[]> } } };
      const serverErrors = axiosErr?.response?.data?.errors;
      if (serverErrors) {
        const mapped: FieldErrors = {};
        Object.entries(serverErrors).forEach(([k, v]) => { mapped[k] = v[0]; });
        setErrors(mapped);
      } else {
        setErrors({ name: 'Something went wrong. Please try again.' });
      }
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

      {/* ── 1. Basic Info ─────────────────────────────────────────────────── */}
      <SectionCard id="basic" step={1} icon={Package} title="Basic Info">
        <FieldWrap label="Product Name" required error={errors.name}>
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
          hint={`This appears in the Product Details tab. Supports bold, bullet points, and embedded images. (${form.description.replace(/<[^>]*>/g, '').length}/1500)`}
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
              options={CATEGORY_TREE.map((n) => ({ value: n.id, label: n.label }))}
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
              hint="Add up to 3 variant types, each with up to 12 options. Type an option and press Enter to add it as a chip.">
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
            <FieldWrap label="Price (₱)" required error={errors.price}>
              <input
                type="number" min="0" placeholder="0.00"
                value={form.price}
                onChange={(e) => { set('price', e.target.value); clearError('price'); }}
                className={inputCls(errors.price)}
              />
            </FieldWrap>
            <FieldWrap label="Stock Quantity" required error={errors.stock}>
              <input
                type="number" min="0" placeholder="0"
                value={form.stock}
                onChange={(e) => { set('stock', e.target.value); clearError('stock'); }}
                className={inputCls(errors.stock)}
              />
            </FieldWrap>
          </div>
        </div>
      </SectionCard>

      {/* ── 4. Shipping ───────────────────────────────────────────────────── */}
      <SectionCard id="shipping" step={4} icon={Package} title="Shipping & Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Weight" required error={errors.weightValue}>
            <div className="flex gap-2">
              <input
                type="number" min="0" placeholder="0"
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

          <FieldWrap label="SKU" hint="Optional — your internal product code">
            <input
              type="text" placeholder="e.g. SKU-001"
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              className={inputCls()}
            />
          </FieldWrap>
        </div>

        <FieldWrap label="Dimensions (L × W × H)" hint="Optional — in cm">
          <div className="grid grid-cols-3 gap-2">
            {(['dimensionL', 'dimensionW', 'dimensionH'] as const).map((key, i) => (
              <input
                key={key}
                type="number" min="0"
                placeholder={['Length', 'Width', 'Height'][i]}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className={inputCls()}
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
        <p className="text-[12px] text-gray-400 leading-snug flex-1">
          Your product will be reviewed by our team before it appears in the marketplace.
        </p>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
            className="px-5 py-2.5 rounded-xl border-2 border-gray-200 text-[13px] font-bold text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            className="px-6 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100 disabled:opacity-60 flex items-center gap-2"
          >
            {submitting && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            Submit for Review
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
