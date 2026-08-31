import CustomSelect from '../../../components/ui/CustomSelect';
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

const WEIGHT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
];

export default function Step3Shipping({ form, patch, errors }: {
  form: EditForm;
  patch: (p: Partial<EditForm>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  return (
    <div className="space-y-5">
      <Field label="Weight" error={errors.weightValue}>
        <div className="flex gap-2">
          <input
            type="number" min="0" placeholder="0"
            value={form.weightValue}
            onChange={(e) => patch({ weightValue: e.target.value })}
            className={inputCls(errors.weightValue) + ' flex-1'}
          />
          <div className="w-20 shrink-0">
            <CustomSelect
              value={form.weightUnit}
              onChange={(v) => patch({ weightUnit: v as 'kg' | 'g' })}
              options={WEIGHT_OPTIONS}
            />
          </div>
        </div>
      </Field>

      <Field label="SKU" hint="Optional — your internal product code">
        <input
          type="text" placeholder="e.g. SKU-001"
          value={form.sku}
          onChange={(e) => patch({ sku: e.target.value })}
          className={inputCls()}
        />
      </Field>

      <Field label="Dimensions (L × W × H)" hint="Optional — in cm">
        <div className="grid grid-cols-3 gap-2">
          {(['dimensionL', 'dimensionW', 'dimensionH'] as const).map((key, i) => (
            <input
              key={key}
              type="number" min="0"
              placeholder={['Length', 'Width', 'Height'][i]}
              value={form[key]}
              onChange={(e) => patch({ [key]: e.target.value })}
              className={inputCls()}
            />
          ))}
        </div>
      </Field>
    </div>
  );
}
