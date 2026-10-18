import { useEffect, useMemo, useState, useCallback, type FormEvent } from 'react';
import {
  Percent, Plus, Trash2, Save, QrCode, Truck, ShieldCheck, Calculator, Sliders, Layers, Clock, CreditCard,
  AlertTriangle, RotateCcw, Undo2,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import { useToast } from '../../components/ui/Toast';
import {
  getAdminCommissionSettingsApi, updateAdminCommissionSettingsApi, getAdminReturnPolicySettingsApi, updateAdminReturnPolicySettingsApi,
} from '../../api/client';
import type { CategoryCommissionOverride, CommissionCategoryOption, ReturnPolicySettings } from '../../types';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { apiProblem } from '../../utils/apiError';

type Row = CategoryCommissionOverride & { rate: string };

/** A rate typed as text: a number from 0 to 100 with at most 2 decimals. */
function rateError(v: string): string | null {
  const t = v.trim();
  if (t === '') return 'Enter a rate.';
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'Use a number with at most 2 decimals, like 5 or 7.5.';
  if (Number(t) > 100) return 'The rate cannot be above 100%.';
  return null;
}

const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const optionLabel = (c: CommissionCategoryOption) =>
  `${c.parent_name ? `${c.parent_name} › ${c.name}` : `${c.name} (all ${c.sub_categories} sub-categories)`}${c.is_active ? '' : ' · inactive'}`;

/**
 * Platform Settings (A9, A31): the commission every order is charged, overrides on real categories (a parent's rate
 * covers its sub-categories that have none), and the return policy whose numbers the return flow uses.
 */
export default function AdminPlatformSettingsPage() {
  const pageRef = useMountAnim();
  const { showToast } = useToast();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CommissionCategoryOption[]>([]);
  const [saved, setSaved] = useState<{ base: string; rows: Row[] } | null>(null);
  const [base, setBase] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [commissionErrors, setCommissionErrors] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState('');
  const [newRate, setNewRate] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [policy, setPolicy] = useState<ReturnPolicySettings | null>(null);
  const [savedPolicy, setSavedPolicy] = useState<ReturnPolicySettings | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>({});

  const [simAmount, setSimAmount] = useState('1000');

  const applyCommission = useCallback((data: { base_rate_percent: number; overrides: CategoryCommissionOverride[]; categories: CommissionCategoryOption[] }) => {
    const r = data.overrides.map((o) => ({ ...o, rate: String(o.rate_percent) }));
    setCategories(data.categories);
    setBase(String(data.base_rate_percent));
    setRows(r);
    setSaved({ base: String(data.base_rate_percent), rows: r });
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([getAdminCommissionSettingsApi(), getAdminReturnPolicySettingsApi()])
      .then(([commission, returns]) => {
        applyCommission(commission);
        setPolicy(returns);
        setSavedPolicy(returns);
      })
      .catch(() => setLoadError('The settings could not be loaded. Nothing is shown until they are, so nothing wrong gets saved.'));
  }, [applyCommission]);
  useEffect(() => { load(); }, [load]);

  // ── Commission ─────────────────────────────────────────────────────────────

  const dirty = useMemo(() => {
    if (!saved) return false;
    if (base.trim() !== saved.base) return true;
    if (rows.length !== saved.rows.length) return true;
    return rows.some((r) => {
      const s = saved.rows.find((x) => x.category_id === r.category_id);
      return !s || s.rate !== r.rate.trim();
    });
  }, [saved, base, rows]);

  const baseError = rateError(base);
  const rowErrors = Object.fromEntries(rows.map((r) => [r.category_id, rateError(r.rate)]));
  const hasErrors = !!baseError || Object.values(rowErrors).some(Boolean);

  const available = categories.filter((c) => !rows.some((r) => r.category_id === c.id));

  const addOverride = (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const cat = categories.find((c) => String(c.id) === newCategory);
    if (!cat) { setAddError('Choose a category from the list.'); return; }
    const err = rateError(newRate);
    if (err) { setAddError(err); return; }
    setRows((list) => [...list, {
      category_id: cat.id, category_name: cat.name, parent_name: cat.parent_name, is_parent: cat.is_parent,
      sub_categories: cat.sub_categories, rate_percent: Number(newRate), rate: newRate.trim(),
    }]);
    setNewCategory('');
    setNewRate('');
    showToast(`${cat.name} added. Press Save settings to apply it.`);
  };

  const saveCommission = async () => {
    if (hasErrors || saving) return;
    setSaving(true);
    setCommissionErrors({});
    try {
      const res = await updateAdminCommissionSettingsApi({
        base_rate_percent: Number(base),
        overrides: rows.map((r) => ({ category_id: r.category_id, rate_percent: Number(r.rate) })),
      });
      applyCommission(res.data);
      showToast(res.message);
    } catch (e) {
      const p = apiProblem(e, 'The commission settings were not saved.');
      setCommissionErrors({ ...p.fields, form: Object.keys(p.fields).length ? '' : p.message });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!saved) return;
    setBase(saved.base);
    setRows(saved.rows);
    setCommissionErrors({});
  };

  // ── Return policy ──────────────────────────────────────────────────────────

  const policyDirty = !!policy && !!savedPolicy && JSON.stringify(policy) !== JSON.stringify(savedPolicy);
  const setP = (k: keyof ReturnPolicySettings, v: string | number) => {
    setPolicy((p) => (p ? { ...p, [k]: v } : p));
    setPolicyErrors((e) => ({ ...e, [k]: '' }));
  };

  const savePolicy = async () => {
    if (!policy || savingPolicy) return;
    setSavingPolicy(true);
    setPolicyErrors({});
    try {
      const res = await updateAdminReturnPolicySettingsApi(policy);
      setPolicy(res.data);
      setSavedPolicy(res.data);
      showToast(res.message);
    } catch (e) {
      const p = apiProblem(e, 'The return policy was not saved.');
      setPolicyErrors({ ...p.fields, form: Object.keys(p.fields).length ? '' : p.message });
    } finally {
      setSavingPolicy(false);
    }
  };

  const sim = Math.max(0, Number(simAmount) || 0);
  const baseNum = baseError ? 0 : Number(base);
  const loading = !saved || !policy;

  const input = (bad?: string | null) =>
    `w-full px-3 py-1.5 text-xs font-bold text-gray-900 bg-gray-50 border rounded-lg outline-none focus:bg-white transition-all ${bad ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-brand-red'}`;

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* Hero */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Platform Engine &amp; Policy Settings</h1>
              {dirty && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  Unsaved changes
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">The commission every new order is charged, and the return rules buyers and shops follow</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          {dirty && (
            <button type="button" onClick={discard} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white rounded-xl border border-white/15">
              <RotateCcw className="w-3.5 h-3.5" /> Discard
            </button>
          )}
          <Button variant="primary" onClick={() => void saveCommission()} disabled={saving || loading || !dirty || hasErrors}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-brand-red hover:bg-[#8e2424] shadow-xs rounded-xl">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-red-800 text-xs font-semibold">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {loadError}</span>
          <button type="button" onClick={load} className="underline">Try again</button>
        </div>
      )}
      {commissionErrors.form && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">{commissionErrors.form}</div>
      )}

      {loading ? (
        !loadError && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 animate-pulse">
            <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 h-96" />
            <div className="lg:col-span-6 space-y-3"><div className="bg-white rounded-2xl border border-gray-200/80 h-32" /><div className="bg-white rounded-2xl border border-gray-200/80 h-64" /></div>
            <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200/80 h-72" />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* Left: summary */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700"><Layers className="w-3.5 h-3.5" /></div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">In effect now</h3>
                  <p className="text-[10px] text-gray-400">The saved values new orders and returns use</p>
                </div>
              </div>
              <dl className="space-y-1 text-xs">
                {[
                  [Percent, 'Platform commission', `${saved!.base}%`],
                  [Sliders, 'Category overrides', String(saved!.rows.length)],
                  [ShieldCheck, 'Return window', `${savedPolicy!.return_window_days} days`],
                  [Clock, 'Shop must answer in', `${savedPolicy!.seller_response_days} days`],
                  [Undo2, 'Buyer may escalate in', `${savedPolicy!.escalation_days} days`],
                ].map(([Icon, label, value]) => {
                  const I = Icon as typeof Percent;
                  return (
                    <div key={label as string} className="flex items-center justify-between p-2 rounded-xl bg-gray-50 text-gray-700 font-semibold">
                      <dt className="flex items-center gap-1.5"><I className="w-3.5 h-3.5 text-gray-400" /> {label as string}</dt>
                      <dd className="text-[11px] font-bold text-gray-900 tabular-nums">{value as string}</dd>
                    </div>
                  );
                })}
              </dl>
              <p className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[10px] text-gray-500 leading-relaxed">
                Commission is worked out when an order is placed, so a change applies to new orders only. Return deadlines are set when a request is made.
              </p>
            </div>
          </div>

          {/* Middle: commission and returns */}
          <div className="lg:col-span-6 space-y-3">
            <section className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center shrink-0"><Percent className="w-3.5 h-3.5" /></div>
                <div>
                  <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Platform commission</h2>
                  <p className="text-[11px] text-gray-400">Taken from what a shop sells, after its own vouchers and promotions</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="w-36">
                  <div className="relative">
                    <input inputMode="decimal" value={base} onChange={(e) => { setBase(e.target.value); setCommissionErrors({}); }} aria-invalid={!!baseError}
                      aria-label="Platform commission rate" className={`${input(baseError || commissionErrors.base_rate_percent)} pr-8 text-sm`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                  </div>
                  {(baseError || commissionErrors.base_rate_percent) && <p className="mt-1 text-[11px] font-medium text-red-700">{baseError || commissionErrors.base_rate_percent}</p>}
                </div>
                <p className="text-xs text-gray-500 sm:pt-1.5">Every category without its own override below uses this rate.</p>
              </div>
            </section>

            <section className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Category overrides</h2>
                  <p className="text-[11px] text-gray-400">A parent category's rate covers its sub-categories that have none of their own</p>
                </div>
                <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">{rows.length} override{rows.length === 1 ? '' : 's'}</span>
              </div>

              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden text-xs">
                {rows.length === 0 && <li className="p-4 text-center text-gray-400">No overrides. {baseError ? 'The platform rate' : `${base}%`} applies to every category.</li>}
                {rows.map((r, i) => {
                  const err = rowErrors[r.category_id] || commissionErrors[`overrides.${i}.rate_percent`] || commissionErrors[`overrides.${i}.category_id`];
                  const changed = !saved!.rows.some((s) => s.category_id === r.category_id && s.rate === r.rate.trim());
                  return (
                    <li key={r.category_id} className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">
                          {r.category_name}
                          {changed && <span className="ml-1.5 text-[10px] font-semibold text-amber-700">not saved</span>}
                        </p>
                        <p className="text-[10.5px] text-gray-400">
                          {r.is_parent ? `Parent category · covers ${r.sub_categories} sub-categor${r.sub_categories === 1 ? 'y' : 'ies'}` : `Sub-category of ${r.parent_name}`}
                        </p>
                        {err && <p className="mt-1 text-[11px] font-medium text-red-700">{err}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative w-24">
                          <input inputMode="decimal" value={r.rate} aria-label={`Rate for ${r.category_name}`} aria-invalid={!!err}
                            onChange={(e) => { const v = e.target.value; setRows((list) => list.map((x) => (x.category_id === r.category_id ? { ...x, rate: v } : x))); setCommissionErrors({}); }}
                            className={`${input(err)} pr-6`} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                        </div>
                        <button type="button" onClick={() => setRows((list) => list.filter((x) => x.category_id !== r.category_id))}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" aria-label={`Remove the override for ${r.category_name}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <form onSubmit={addOverride} className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2" noValidate>
                <span className="text-xs font-bold text-gray-800 block">Add an override</span>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Category</label>
                    <CustomSelect value={newCategory} onChange={(v) => { setNewCategory(v); setAddError(null); }}
                      placeholder={available.length ? 'Choose a category' : 'Every category has an override'}
                      options={available.map((c) => ({ value: String(c.id), label: optionLabel(c) }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Rate</label>
                    <div className="relative">
                      <input inputMode="decimal" value={newRate} onChange={(e) => { setNewRate(e.target.value); setAddError(null); }} placeholder="8"
                        className={`${input()} bg-white pr-6`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                    </div>
                  </div>
                  <Button type="submit" variant="secondary" disabled={!available.length} className="text-xs font-bold py-1.5 flex items-center justify-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
                {addError && <p className="text-[11px] font-medium text-red-700">{addError}</p>}
                <p className="text-[10.5px] text-gray-400">Only categories from Catalog › Categories can be chosen. Added overrides apply once you press Save settings.</p>
              </form>
            </section>

            {policy && (
              <section className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3 pb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center shrink-0"><ShieldCheck className="w-3.5 h-3.5" /></div>
                    <div>
                      <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Returns and refunds</h2>
                      <p className="text-[11px] text-gray-400">These days are the deadlines the return flow enforces</p>
                    </div>
                  </div>
                  <Button variant="primary" onClick={() => void savePolicy()} disabled={savingPolicy || !policyDirty}
                    className="text-xs font-bold py-1 px-3 flex items-center gap-1 shrink-0 bg-brand-red hover:bg-[#8e2424] rounded-lg">
                    <Save className="w-3 h-3" /> {savingPolicy ? 'Saving…' : 'Save policy'}
                  </Button>
                </div>
                {policyErrors.form && <p role="alert" className="text-[11px] font-semibold text-red-700">{policyErrors.form}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    ['return_window_days', 'Return window', 'days after delivery', 1, 90],
                    ['seller_response_days', 'Shop must answer in', 'days, or it is approved', 1, 14],
                    ['escalation_days', 'Buyer may escalate in', 'days after a rejection', 1, 14],
                  ] as const).map(([key, label, hint, min, max]) => (
                    <label key={key} className="block">
                      <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1">{label}</span>
                      <input type="number" min={min} max={max} value={policy[key]} onChange={(e) => setP(key, e.target.value === '' ? '' : Number(e.target.value))}
                        className={input(policyErrors[key])} />
                      <span className={`block mt-0.5 text-[10.5px] ${policyErrors[key] ? 'text-red-700 font-medium' : 'text-gray-400'}`}>{policyErrors[key] || hint}</span>
                    </label>
                  ))}
                </div>

                <label className="block">
                  <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Buyer protection summary</span>
                  <textarea rows={2} value={policy.summary} onChange={(e) => setP('summary', e.target.value)} maxLength={1000}
                    className={`${input(policyErrors.summary)} font-normal resize-none`} />
                  {policyErrors.summary && <span className="text-[11px] font-medium text-red-700">{policyErrors.summary}</span>}
                </label>
                <label className="block">
                  <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Mediation terms</span>
                  <textarea rows={2} value={policy.mediation_terms} onChange={(e) => setP('mediation_terms', e.target.value)} maxLength={1000}
                    className={`${input(policyErrors.mediation_terms)} font-normal resize-none`} />
                  {policyErrors.mediation_terms && <span className="text-[11px] font-medium text-red-700">{policyErrors.mediation_terms}</span>}
                </label>

                {Object.keys(policy.non_returnable_categories ?? {}).length > 0 && (
                  <div className="p-3 bg-rose-50/50 border border-brand-red/20 rounded-xl text-[11px] text-gray-600 space-y-1">
                    <span className="font-bold text-brand-red block text-xs">Exemptions shown to buyers</span>
                    {Object.entries(policy.non_returnable_categories).map(([name, text]) => (
                      <p key={name}>• <strong>{name}:</strong> {text}</p>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right: calculator and payments */}
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Calculator className="w-3.5 h-3.5" /></div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Fee calculator</h3>
                  <p className="text-[10px] text-gray-400">With the rates on screen, saved or not</p>
                </div>
              </div>
              <label className="block">
                <span className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Items sold (PHP)</span>
                <span className="relative block">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                  <input inputMode="decimal" value={simAmount} onChange={(e) => setSimAmount(e.target.value.replace(/[^\d.]/g, ''))} className={`${input()} pl-7`} />
                </span>
              </label>
              <div className="space-y-2 pt-1 border-t border-gray-100 text-xs">
                {[{ key: 'base', label: `Platform (${baseError ? '—' : `${base}%`})`, rate: baseNum, sub: 'Every other category' },
                  ...rows.filter((r) => !rowErrors[r.category_id]).map((r) => ({ key: String(r.category_id), label: `${r.category_name} (${r.rate}%)`, rate: Number(r.rate), sub: r.is_parent ? 'Override, with its sub-categories' : 'Override' }))]
                  .map((x) => (
                    <div key={x.key} className={`p-2.5 rounded-xl flex justify-between items-center gap-2 ${x.key === 'base' ? 'bg-gray-50' : 'bg-rose-50/40 border border-rose-100/60'}`}>
                      <div className="min-w-0">
                        <span className="font-bold text-gray-900 block truncate">{x.label}</span>
                        <span className="text-[10px] text-gray-400">{x.sub}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-brand-red block">{peso((sim * x.rate) / 100)}</span>
                        <span className="text-[10px] text-emerald-600">Shop: {peso(sim - (sim * x.rate) / 100)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 uppercase tracking-wider pb-1 border-b border-gray-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Payment methods at checkout
              </div>
              {[
                [Truck, 'Cash on delivery', 'The rider collects it; the courier settles with the shop each week.', 'text-blue-700'],
                [QrCode, 'GCash', 'Paid straight to the shop\'s own GCash; the shop confirms the receipt.', 'text-[#007DFE]'],
                [CreditCard, 'E-wallet and card', 'Through Loved-IT\'s sandbox gateway (test mode, no real money); paid out from Earnings.', 'text-violet-700'],
              ].map(([Icon, name, text, color]) => {
                const I = Icon as typeof Truck;
                return (
                  <div key={name as string} className="p-2 bg-gray-50 rounded-lg text-xs">
                    <span className={`flex items-center gap-1 font-bold ${color as string}`}><I className="w-3 h-3" /> {name as string}</span>
                    <span className="block mt-0.5 text-[10.5px] text-gray-500 leading-snug">{text as string}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
