import { useId } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { EditForm } from '../SellerEditProductModal';

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-semibold text-gray-700">
        {label}{required && <span className="text-brand-red ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

function inputCls(error?: string) {
  return [
    'w-full px-3.5 py-2.5 text-[13px] border rounded-xl outline-none transition-all',
    'focus:ring-2 focus:ring-red-100 bg-gray-50 focus:bg-white',
    error ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red',
  ].join(' ');
}

function FileInput({ label, file, onFile, alreadyOnFile, onReplace, error }: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  alreadyOnFile?: boolean;
  onReplace?: () => void;
  error?: string;
}) {
  const id = useId();
  if (alreadyOnFile) {
    return (
      <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="text-[13px] font-semibold text-emerald-700 flex-1">Already on file ✓</span>
        <button type="button" onClick={onReplace} className="text-[12px] text-gray-500 underline hover:text-gray-700">
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
          error ? 'border-red-300 bg-red-50/40' : 'border-gray-200 hover:border-brand-red hover:bg-red-50/20',
        ].join(' ')}
      >
        <Upload className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-[13px] text-gray-500 flex-1 truncate">
          {file ? file.name : `Upload ${label}`}
        </span>
        {file && (
          <button type="button" onClick={(e) => { e.preventDefault(); onFile(null); }} className="text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        )}
        <input id={id} type="file" accept=".pdf,image/*" hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <p className="text-[11px] text-red-500 font-medium mt-1">{error}</p>}
    </div>
  );
}

export default function Step4Fda({ form, patch, errors, clearError }: {
  form: EditForm;
  patch: (p: Partial<EditForm>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-700 leading-relaxed">
          <span className="font-bold">FDA Compliance required</span> — food/beverage products must have valid FDA documents before going live.
        </p>
      </div>

      <Field label="FDA License to Operate (LTO)" required error={errors.fdaLtoFile}
        hint="Your shop's FDA LTO. If already uploaded for a previous product, it shows as on file.">
        <FileInput
          label="FDA LTO"
          file={form.fdaLtoFile}
          onFile={(f) => { patch({ fdaLtoFile: f, fdaLtoOnFile: false }); clearError('fdaLtoFile'); }}
          alreadyOnFile={form.fdaLtoOnFile}
          onReplace={() => patch({ fdaLtoOnFile: false })}
          error={errors.fdaLtoFile}
        />
      </Field>

      <Field label="CPR / CPN" required error={errors.fdaCprFile}
        hint="CPR for manufactured food, or CPN for lower-risk products.">
        <FileInput
          label="CPR or CPN document"
          file={form.fdaCprFile}
          onFile={(f) => { patch({ fdaCprFile: f }); clearError('fdaCprFile'); }}
          alreadyOnFile={form.fdaCprOnFile}
          onReplace={() => patch({ fdaCprOnFile: false })}
          error={errors.fdaCprFile}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Net Weight / Volume">
          <input
            type="text" placeholder="e.g. 250g, 500ml" maxLength={10}
            value={form.netWeight}
            onChange={(e) => patch({ netWeight: e.target.value })}
            className={inputCls()}
          />
        </Field>
        <Field label="Expiry / Best Before">
          <input
            type="text" placeholder="e.g. 12 months from manufacture" maxLength={50}
            value={form.expiryDate}
            onChange={(e) => patch({ expiryDate: e.target.value })}
            className={inputCls()}
          />
        </Field>
      </div>

      <Field label="Ingredients" hint={`${form.ingredients.length}/500`}>
        <textarea
          rows={3} maxLength={500}
          value={form.ingredients}
          onChange={(e) => patch({ ingredients: e.target.value })}
          placeholder="List all ingredients…"
          className={inputCls() + ' resize-none'}
        />
      </Field>

      <Field label="Storage Instructions">
        <input
          type="text" placeholder="e.g. Store in a cool, dry place" maxLength={500}
          value={form.storageInstructions}
          onChange={(e) => patch({ storageInstructions: e.target.value })}
          className={inputCls()}
        />
      </Field>

      <Field label="Allergen Information" hint="Optional — list any allergens present">
        <input
          type="text" placeholder="e.g. Contains wheat, soy, milk" maxLength={500}
          value={form.allergenInfo}
          onChange={(e) => patch({ allergenInfo: e.target.value })}
          className={inputCls()}
        />
      </Field>
    </div>
  );
}
