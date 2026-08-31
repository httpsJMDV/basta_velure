import CustomSelect from '../../../components/ui/CustomSelect';
import { CATEGORY_TREE } from '../../../data/categories';
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

export default function Step1BasicInfo({ form, patch, errors, clearError }: {
  form: EditForm;
  patch: (p: Partial<EditForm>) => void;
  errors: Record<string, string>;
  clearError: (k: string) => void;
}) {
  const parentNode = CATEGORY_TREE.find((n) => n.id === form.parentCategoryId);
  const leafOptions = parentNode
    ? parentNode.children.map((c) => ({ value: c.id, label: c.label }))
    : [];

  return (
    <div className="space-y-5">
      <Field label="Product Name" required error={errors.name}>
        <input
          type="text"
          value={form.name}
          onChange={(e) => { patch({ name: e.target.value }); clearError('name'); }}
          placeholder="e.g. Classic White Tee"
          className={inputCls(errors.name)}
        />
      </Field>

      <Field
        label="Description"
        hint={`${form.description.length}/1000 — describe materials, dimensions, use cases.`}
      >
        <textarea
          rows={5}
          maxLength={1000}
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Describe your product…"
          className={inputCls() + ' resize-none leading-relaxed'}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Parent Category" required>
          <CustomSelect
            value={form.parentCategoryId}
            onChange={(v) => patch({ parentCategoryId: v, leafCategoryId: '' })}
            options={CATEGORY_TREE.map((n) => ({ value: n.id, label: n.label }))}
            placeholder="Select category…"
          />
        </Field>
        <Field label="Sub-category" required error={errors.leafCategoryId}>
          <CustomSelect
            value={form.leafCategoryId}
            onChange={(v) => { patch({ leafCategoryId: v }); clearError('leafCategoryId'); }}
            options={leafOptions}
            placeholder={form.parentCategoryId ? 'Select sub…' : 'Select parent first'}
            disabled={!form.parentCategoryId}
            error={errors.leafCategoryId}
          />
        </Field>
      </div>
    </div>
  );
}
