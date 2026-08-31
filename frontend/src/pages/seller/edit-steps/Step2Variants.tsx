import { useState, type KeyboardEvent } from 'react';
import { Plus, Trash2, ImagePlus, X, Package } from 'lucide-react';
import CustomSelect from '../../../components/ui/CustomSelect';
import type { EditForm, EditVariantType, EditVariantRow } from '../SellerEditProductModal';

const VARIANT_TYPE_OPTIONS = ['Color', 'Size', 'Flavor', 'Style', 'Material', 'Scent', 'Pack Size'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }

type FlatImage = { id: string; preview: string };

function getFlatImages(form: EditForm): FlatImage[] {
  return [
    ...form.existingImages.map((img) => ({ id: `e-${img.id}`, preview: img.url })),
    ...form.newImages.map((img) => ({ id: `n-${img.id}`, preview: img.preview })),
  ];
}

function buildRows(types: EditVariantType[]): EditVariantRow[] {
  const filled = types.filter((t) => t.name.trim() && t.options.length > 0);
  if (filled.length === 0) return [];
  const combos: string[][] = [[]];
  filled.forEach((t) => {
    const next: string[][] = [];
    combos.forEach((c) => t.options.forEach((o) => next.push([...c, o])));
    combos.length = 0; combos.push(...next);
  });
  return combos.map((opts) => ({
    combination: opts.join(' / '),
    price: '',
    stock: '',
  }));
}

// ─── Option image picker ──────────────────────────────────────────────────────

function OptionImagePicker({ optionLabel, images, selectedId, onSelect }: {
  optionLabel: string;
  images: FlatImage[];
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
        className="w-6 h-6 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-red overflow-hidden flex items-center justify-center transition-colors shrink-0"
      >
        {selected
          ? <img src={selected.preview} alt="" className="w-full h-full object-cover" />
          : <ImagePlus className="w-3 h-3 text-gray-400" />}
      </button>
      {open && (
        <div className="absolute z-30 top-8 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-44">
          <p className="w-full text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">
            Image for "{optionLabel}"
          </p>
          {selected && (
            <button type="button" onClick={() => { onSelect(undefined); setOpen(false); }}
              className="w-full text-[11px] text-gray-400 hover:text-red-500 text-left mb-1">
              ✕ Clear
            </button>
          )}
          {images.map((img) => (
            <button key={img.id} type="button"
              onClick={() => { onSelect(img.id); setOpen(false); }}
              className={['w-9 h-9 rounded-lg overflow-hidden border-2 transition-colors',
                img.id === selectedId ? 'border-brand-red' : 'border-transparent hover:border-gray-300',
              ].join(' ')}>
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chip tag input ───────────────────────────────────────────────────────────

function ChipInput({ options, onChange, images, optionImages, onOptionImageChange }: {
  options: string[];
  onChange: (opts: string[]) => void;
  images: FlatImage[];
  optionImages: Record<string, string>;
  onOptionImageChange: (opt: string, id: string | undefined) => void;
}) {
  const [draft, setDraft] = useState('');
  const MAX = 12;

  const add = () => {
    const val = draft.trim();
    if (val && !options.includes(val) && options.length < MAX) onChange([...options, val]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !draft && options.length > 0) onChange(options.slice(0, -1));
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center min-h-[40px] px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 focus-within:border-brand-red focus-within:ring-2 focus-within:ring-red-100 focus-within:bg-white transition-all">
      {options.map((opt) => (
        <span key={opt} className="flex items-center gap-1 bg-brand-red/10 text-brand-red text-[12px] font-semibold px-2 py-0.5 rounded-full">
          {images.length > 0 && (
            <OptionImagePicker
              optionLabel={opt}
              images={images}
              selectedId={optionImages[opt]}
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
        placeholder={options.length === 0 ? 'Type option + Enter…' : options.length >= MAX ? '' : 'Add more…'}
        disabled={options.length >= MAX}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-[13px] text-gray-700 placeholder:text-gray-400"
      />
    </div>
  );
}

// ─── Variant types builder ────────────────────────────────────────────────────

function VariantTypesBuilder({ types, onChange, images }: {
  types: EditVariantType[];
  onChange: (types: EditVariantType[]) => void;
  images: FlatImage[];
}) {
  const addType = () => onChange([...types, { name: '', options: [], optionImages: {} }]);
  const removeType = (i: number) => onChange(types.filter((_, idx) => idx !== i));

  const updateName = (i: number, name: string) => {
    const next = [...types]; next[i] = { ...next[i], name }; onChange(next);
  };
  const updateOptions = (i: number, options: string[]) => {
    const next = [...types]; next[i] = { ...next[i], options }; onChange(next);
  };
  const updateOptionImage = (i: number, opt: string, id: string | undefined) => {
    const next = [...types];
    const imgs = { ...next[i].optionImages };
    if (id === undefined) delete imgs[opt]; else imgs[opt] = id;
    next[i] = { ...next[i], optionImages: imgs };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {types.map((type, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-2">
            <CustomSelect
              value={type.name}
              onChange={(v) => updateName(i, v)}
              options={VARIANT_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
              placeholder="Select type…"
            />
            <ChipInput
              options={type.options}
              onChange={(opts) => updateOptions(i, opts)}
              images={images}
              optionImages={type.optionImages}
              onOptionImageChange={(opt, id) => updateOptionImage(i, opt, id)}
            />
          </div>
          <button type="button" onClick={() => removeType(i)}
            className="mt-2 w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {types.length < 3 && (
        <button type="button" onClick={addType}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-red hover:text-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" /> Add variant type
        </button>
      )}
    </div>
  );
}

// ─── Combination table ────────────────────────────────────────────────────────

function CombinationTable({ rows, onChange, errors, clearError, variantTypes, images }: {
  rows: EditVariantRow[];
  onChange: (rows: EditVariantRow[]) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
  variantTypes: EditVariantType[];
  images: FlatImage[];
}) {
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkStock, setBulkStock] = useState('');

  const applyBulk = () => onChange(rows.map((r) => ({
    ...r,
    price: bulkPrice || r.price,
    stock: bulkStock || r.stock,
  })));

  const updateRow = (i: number, field: 'price' | 'stock', val: string) => {
    const next = [...rows]; next[i] = { ...next[i], [field]: val }; onChange(next);
  };

  // Resolve preview for a combination row
  const getPreview = (combination: string): string | undefined => {
    for (const type of variantTypes) {
      for (const opt of type.options) {
        if (combination.includes(opt) && type.optionImages[opt]) {
          const img = images.find((img) => img.id === type.optionImages[opt]);
          if (img) return img.preview;
        }
      }
    }
    return images[0]?.preview;
  };

  if (rows.length === 0) return null;

  const inputCls = (err?: string) => [
    'w-full px-2.5 py-2 text-[13px] border rounded-xl outline-none focus:ring-2 focus:ring-red-100 bg-white transition-all',
    err ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
  ].join(' ');

  return (
    <div className="space-y-3">
      {/* Bulk fill */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-[12px] font-bold text-gray-600 w-full">Bulk fill all rows</p>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 shrink-0">Price ₱</span>
          <input type="number" min="0" placeholder="—" value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            className="w-20 px-2.5 py-1.5 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-red bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 shrink-0">Stock</span>
          <input type="number" min="0" placeholder="—" value={bulkStock}
            onChange={(e) => setBulkStock(e.target.value)}
            className="w-20 px-2.5 py-1.5 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-brand-red bg-white" />
        </div>
        <button type="button" onClick={applyBulk}
          className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-[12px] font-bold hover:bg-brand-red-dark transition-colors">
          Apply to all
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-[13px] min-w-[380px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-10">Img</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Combination</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-28">Price (₱)</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-24">Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const preview = getPreview(row.combination);
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-2">
                    {preview
                      ? <img src={preview} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-100" />
                      : <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="w-3.5 h-3.5 text-gray-300" /></div>}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-700">{row.combination}</td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" placeholder="0.00" value={row.price}
                      onChange={(e) => { updateRow(i, 'price', e.target.value); clearError(`vp_${i}`); }}
                      className={inputCls(errors[`vp_${i}`])} />
                    {errors[`vp_${i}`] && <p className="text-[10px] text-red-500 mt-0.5">{errors[`vp_${i}`]}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" placeholder="0" value={row.stock}
                      onChange={(e) => { updateRow(i, 'stock', e.target.value); clearError(`vs_${i}`); }}
                      className={inputCls(errors[`vs_${i}`])} />
                    {errors[`vs_${i}`] && <p className="text-[10px] text-red-500 mt-0.5">{errors[`vs_${i}`]}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step2Variants ────────────────────────────────────────────────────────────

function inputCls(error?: string) {
  return [
    'w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none transition-all',
    'focus:ring-2 focus:ring-red-100 bg-gray-50 focus:bg-white',
    error ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
  ].join(' ');
}

export default function Step2Variants({ form, patch, errors, clearError }: {
  form: EditForm;
  patch: (p: Partial<EditForm>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const images = getFlatImages(form);

  const handleTypesChange = (types: EditVariantType[]) => {
    // Preserve existing row prices/stocks when rebuilding combinations
    const newRows = buildRows(types);
    const prevMap = Object.fromEntries(form.variantRows.map((r) => [r.combination, r]));
    const merged = newRows.map((r) => prevMap[r.combination]
      ? { ...r, price: prevMap[r.combination].price, stock: prevMap[r.combination].stock }
      : r
    );
    patch({ variantTypes: types, variantRows: merged });
  };

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <button type="button" onClick={() => patch({ hasVariants: !form.hasVariants })}
        className="flex items-center gap-3 group w-full">
        <div className={['w-11 h-6 rounded-full transition-colors relative shrink-0',
          form.hasVariants ? 'bg-brand-red' : 'bg-gray-200'].join(' ')}>
          <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
            form.hasVariants ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
        </div>
        <span className="text-[13px] font-semibold text-gray-700 group-hover:text-gray-900">
          This product has variants (e.g. Color, Size)
        </span>
      </button>

      {!form.hasVariants ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Price (₱)<span className="text-brand-red ml-0.5">*</span></label>
            <input type="number" min="0" placeholder="0.00" value={form.price}
              onChange={(e) => { patch({ price: e.target.value }); clearError('price'); }}
              className={inputCls(errors.price)} />
            {errors.price && <p className="text-[11px] text-red-500">{errors.price}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Stock<span className="text-brand-red ml-0.5">*</span></label>
            <input type="number" min="0" placeholder="0" value={form.stock}
              onChange={(e) => { patch({ stock: e.target.value }); clearError('stock'); }}
              className={inputCls(errors.stock)} />
            {errors.stock && <p className="text-[11px] text-red-500">{errors.stock}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Variant Types</label>
            <p className="text-[11px] text-gray-400">
              Up to 3 types, 12 options each. Type an option and press Enter. Click the image icon on a tag to link it to a product photo.
            </p>
            {errors.variantTypes && <p className="text-[11px] text-red-500 font-medium">{errors.variantTypes}</p>}
            <VariantTypesBuilder
              types={form.variantTypes}
              onChange={handleTypesChange}
              images={images}
            />
          </div>

          {form.variantRows.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Combinations</label>
              <CombinationTable
                rows={form.variantRows}
                onChange={(rows) => patch({ variantRows: rows })}
                errors={errors}
                clearError={clearError}
                variantTypes={form.variantTypes}
                images={images}
              />
            </div>
          )}

          {/* Existing saved variants shown when no types built yet */}
          {form.variantTypes.length === 0 && form.variantRows.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-gray-700">Saved Variants</label>
              <p className="text-[11px] text-gray-400">These are your current saved variants. Add variant types above to rebuild combinations.</p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Combination</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-28">Price (₱)</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 w-24">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.variantRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2.5 font-medium text-gray-700">{row.combination}</td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" placeholder="0.00" value={row.price}
                            onChange={(e) => {
                              const next = [...form.variantRows]; next[i] = { ...next[i], price: e.target.value };
                              patch({ variantRows: next }); clearError(`vp_${i}`);
                            }}
                            className={['w-full px-2.5 py-2 text-[13px] border rounded-xl outline-none focus:ring-2 focus:ring-red-100 bg-white transition-all',
                              errors[`vp_${i}`] ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'].join(' ')} />
                          {errors[`vp_${i}`] && <p className="text-[10px] text-red-500 mt-0.5">{errors[`vp_${i}`]}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" placeholder="0" value={row.stock}
                            onChange={(e) => {
                              const next = [...form.variantRows]; next[i] = { ...next[i], stock: e.target.value };
                              patch({ variantRows: next }); clearError(`vs_${i}`);
                            }}
                            className={['w-full px-2.5 py-2 text-[13px] border rounded-xl outline-none focus:ring-2 focus:ring-red-100 bg-white transition-all',
                              errors[`vs_${i}`] ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'].join(' ')} />
                          {errors[`vs_${i}`] && <p className="text-[10px] text-red-500 mt-0.5">{errors[`vs_${i}`]}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
