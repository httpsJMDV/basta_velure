import { useEffect, useState, useCallback, type FormEvent } from 'react';
import {
  Percent,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  QrCode,
  Truck,
  ShieldCheck,
  Calculator,
  Sliders,
  Layers,
  Clock,
  Check,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import {
  getAdminCommissionSettingsApi,
  updateAdminCommissionSettingsApi,
  getAdminReturnPolicySettingsApi,
  updateAdminReturnPolicySettingsApi,
} from '../../api/client';
import type {
  CategoryCommissionOverride,
} from '../../types';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

const PRESET_CATEGORIES = [
  { key: 'food-grocery', name: 'Food & Grocery' },
  { key: 'food-beverage', name: 'Food & Beverage' },
  { key: 'electronics', name: 'Consumer Electronics' },
  { key: 'fashion-apparel', name: 'Fashion & Apparel' },
  { key: 'health-beauty', name: 'Health & Beauty' },
  { key: 'home-living', name: 'Home & Living' },
  { key: 'sports-outdoors', name: 'Sports & Outdoors' },
];

export default function AdminPlatformSettingsPage() {
  const [baseRate, setBaseRate] = useState<number>(10);
  const [overrides, setOverrides] = useState<CategoryCommissionOverride[]>([
    { category_key: 'food-grocery', category_name: 'Food & Grocery', rate_percent: 8 },
  ]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Return & Refund Policy state
  const [returnDays, setReturnDays] = useState<number>(7);
  const [escalationHours, setEscalationHours] = useState<number>(48);
  const [policySummary, setPolicySummary] = useState<string>(
    '7-day standard return window upon delivery for eligible items in original, unused condition with complete packaging and tags.'
  );
  const [mediationTerms, setMediationTerms] = useState<string>(
    'If the seller rejects your return or does not respond within 48 hours, your request is automatically escalated to Velure Platform Mediation for binding review.'
  );
  const [savingPolicy, setSavingPolicy] = useState<boolean>(false);

  // New override modal/form state
  const [newCatKey, setNewCatKey] = useState<string>('fashion-apparel');
  const [newCustomName, setNewCustomName] = useState<string>('');
  const [newRate, setNewRate] = useState<number>(8);
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);

  // Simulator state
  const [simAmount, setSimAmount] = useState<number>(1000);

  const pageRef = useMountAnim();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [commRes, policyRes] = await Promise.allSettled([
        getAdminCommissionSettingsApi(),
        getAdminReturnPolicySettingsApi(),
      ]);

      if (commRes.status === 'fulfilled' && commRes.value) {
        setBaseRate(commRes.value.base_rate_percent ?? 10);
        if (commRes.value.overrides && commRes.value.overrides.length > 0) {
          setOverrides(commRes.value.overrides);
        }
      }

      if (policyRes.status === 'fulfilled' && policyRes.value) {
        const p = policyRes.value;
        if (p.return_window_days) setReturnDays(p.return_window_days);
        if (p.auto_escalation_hours) setEscalationHours(p.auto_escalation_hours);
        if (p.summary) setPolicySummary(p.summary);
        if (p.mediation_terms) setMediationTerms(p.mediation_terms);
      }
    } catch {
      // fallback defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveCommission = async () => {
    setSaving(true);
    try {
      await updateAdminCommissionSettingsApi({
        base_rate_percent: Number(baseRate),
        overrides: overrides.map((o) => ({
          category_key: o.category_key,
          category_name: o.category_name,
          rate_percent: Number(o.rate_percent),
        })),
      });
      showToast('Platform commission settings saved and active across checkout & earnings engine.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save commission settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      await updateAdminReturnPolicySettingsApi({
        return_window_days: Number(returnDays),
        auto_escalation_hours: Number(escalationHours),
        summary: policySummary,
        mediation_terms: mediationTerms,
      });
      showToast('Platform-Wide Return & Refund Policy updated and broadcast to all shop touchpoints.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save return policy settings.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleAddOverride = (e: FormEvent) => {
    e.preventDefault();
    const finalKey = isCustomCategory
      ? newCustomName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
      : newCatKey;
    const finalName = isCustomCategory
      ? newCustomName.trim()
      : PRESET_CATEGORIES.find((c) => c.key === newCatKey)?.name || newCatKey;

    if (!finalKey || !finalName) return;

    if (overrides.some((o) => o.category_key.toLowerCase() === finalKey.toLowerCase())) {
      alert('An override for this category already exists.');
      return;
    }

    setOverrides([
      ...overrides,
      {
        category_key: finalKey,
        category_name: finalName,
        rate_percent: Number(newRate),
      },
    ]);

    setNewCustomName('');
    setIsCustomCategory(false);
    showToast(`Added ${finalName} override.`);
  };

  const handleRemoveOverride = (catKey: string) => {
    setOverrides(overrides.filter((o) => o.category_key !== catKey));
  };

  const handleOverrideRateChange = (catKey: string, rate: number) => {
    setOverrides(
      overrides.map((o) =>
        o.category_key === catKey ? { ...o, rate_percent: Math.max(0, Math.min(100, rate)) } : o
      )
    );
  };

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Compact Executive Hero Command Bar ── */}
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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`} />
                {loading ? 'Loading…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Configure dynamic platform commission engine, category overrides, and dispute arbitration SLA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <Button
            variant="primary"
            onClick={handleSaveCommission}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-brand-red hover:bg-[#8e2424] shadow-xs rounded-xl"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {toastMessage}
        </div>
      )}

      {/* ── SKELETON STATE ── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 animate-pulse">
          <div className="lg:col-span-3 bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-96" />
          <div className="lg:col-span-6 space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-32" />
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-64" />
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-72" />
          </div>
          <div className="lg:col-span-3 space-y-3">
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-72" />
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs h-40" />
          </div>
        </div>
      ) : (
        /* ── Full-Width Balanced 3-Column Layout ── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          {/* ── LEFT COLUMN (3 Cols): Settings Index & Live Overview ── */}
          <div className="lg:col-span-3 space-y-3">
            {/* Quick Navigation & Section Index */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 font-bold">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Engine Sections</h3>
                  <p className="text-[10px] text-gray-400">Jump to configuration modules</p>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50/60 border border-rose-100 text-brand-red font-bold">
                  <span className="flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Base Commission</span>
                  <span className="text-[10px] bg-white px-1.5 py-0.2 rounded border border-rose-200">{baseRate}%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 text-gray-700 font-semibold hover:bg-gray-100 transition-colors">
                  <span className="flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5 text-gray-400" /> Category Overrides</span>
                  <span className="text-[10px] bg-gray-200 px-1.5 py-0.2 rounded font-bold text-gray-700">{overrides.length}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 text-gray-700 font-semibold hover:bg-gray-100 transition-colors">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-gray-400" /> Return Window</span>
                  <span className="text-[10px] bg-gray-200 px-1.5 py-0.2 rounded font-bold text-gray-700">{returnDays}d</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 text-gray-700 font-semibold hover:bg-gray-100 transition-colors">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-400" /> Mediation SLA</span>
                  <span className="text-[10px] bg-gray-200 px-1.5 py-0.2 rounded font-bold text-gray-700">{escalationHours}h</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 text-gray-700 font-semibold hover:bg-gray-100 transition-colors">
                  <span className="flex items-center gap-1.5"><QrCode className="w-3.5 h-3.5 text-gray-400" /> Payment Rules</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-bold border border-emerald-200">Enforced</span>
                </div>
              </div>
            </div>

            {/* Platform Status & Compliance Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Engine Status</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Checkout Take-Rate:</span>
                  <span className="font-bold text-emerald-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Active
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Arbitration SLA:</span>
                  <span className="font-mono font-bold text-gray-900">{escalationHours} Hours</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <span>Return Window:</span>
                  <span className="font-mono font-bold text-gray-900">{returnDays} Days</span>
                </div>
              </div>

              <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-[10px] text-gray-500 leading-relaxed">
                Changes saved here apply immediately across the checkout pipeline, seller balances, and refund arbitration queues.
              </div>
            </div>
          </div>

          {/* ── MIDDLE COLUMN (6 Cols): Configuration & Policies ── */}
          <div className="lg:col-span-6 space-y-3">
            {/* Base Commission Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                  <Percent className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Default Base Commission Rate</h2>
                  <p className="text-[11px] text-gray-400">
                    Standard percentage deducted from seller item subtotal across general catalog products
                  </p>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative w-36">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={baseRate}
                    onChange={(e) => setBaseRate(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className="w-full pl-3.5 pr-8 py-1.5 text-sm font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                </div>
                <p className="text-xs text-gray-500">
                  Applied automatically to all store checkouts unless a category override is defined below.
                </p>
              </div>
            </div>

            {/* Category Overrides Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div>
                  <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Category-Level Commission Overrides</h2>
                  <p className="text-[11px] text-gray-400">
                    Tailored fee rates for specialized merchant sectors (e.g. 8% Food &amp; Grocery)
                  </p>
                </div>
                <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                  {overrides.length} Active Overrides
                </span>
              </div>

              {/* List of active overrides */}
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden text-xs">
                {overrides.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No category overrides configured. Base rate ({baseRate}%) applies platform-wide.
                  </div>
                ) : (
                  overrides.map((override) => (
                    <div
                      key={override.category_key}
                      className="p-3 flex items-center justify-between gap-2 hover:bg-gray-50/60 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-gray-900">{override.category_name}</p>
                        <p className="text-[10px] font-mono text-gray-400">key: {override.category_key}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative w-24">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={override.rate_percent}
                            onChange={(e) =>
                              handleOverrideRateChange(override.category_key, Number(e.target.value))
                            }
                            className="w-full pl-2.5 pr-6 py-1 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red transition-all"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                            %
                          </span>
                        </div>

                        <button
                          onClick={() => handleRemoveOverride(override.category_key)}
                          className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete override"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Override Sub-form */}
              <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 space-y-2">
                <span className="text-xs font-bold text-gray-800 block">Add Category Override</span>
                <form onSubmit={handleAddOverride} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Category</label>
                    {!isCustomCategory ? (
                      <CustomSelect
                        value={newCatKey}
                        onChange={(val) => {
                          if (val === '__custom__') {
                            setIsCustomCategory(true);
                          } else {
                            setNewCatKey(val);
                          }
                        }}
                        options={[
                          ...PRESET_CATEGORIES.map((c) => ({ value: c.key, label: c.name })),
                          { value: '__custom__', label: '+ Custom Category...' },
                        ]}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="e.g. Toys & Games"
                          value={newCustomName}
                          onChange={(e) => setNewCustomName(e.target.value)}
                          className="w-full p-2 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-brand-red"
                        />
                        <button
                          type="button"
                          onClick={() => setIsCustomCategory(false)}
                          className="text-[10px] text-gray-400 hover:text-gray-700 underline shrink-0"
                        >
                          Presets
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Override Rate</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={newRate}
                        onChange={(e) => setNewRate(Number(e.target.value))}
                        className="w-full pl-2.5 pr-6 py-1.5 text-xs font-bold text-gray-900 bg-white border border-gray-200 rounded-lg outline-none focus:border-brand-red"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                    </div>
                  </div>

                  <Button type="submit" variant="secondary" className="text-xs font-bold py-1.5 flex items-center justify-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add Override
                  </Button>
                </form>
              </div>
            </div>

            {/* Platform Baseline Return & Refund Policy Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Baseline Return &amp; Refund Policy</h2>
                    <p className="text-[11px] text-gray-400">
                      Standard terms applied across all Velure seller storefronts
                    </p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={handleSavePolicy}
                  disabled={savingPolicy}
                  className="text-xs font-bold py-1 px-3 flex items-center gap-1 shrink-0 bg-brand-red hover:bg-[#8e2424] rounded-lg"
                >
                  <Save className="w-3 h-3" />
                  {savingPolicy ? 'Saving...' : 'Save Policy'}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    Standard Return Window (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={returnDays}
                    onChange={(e) => setReturnDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                    Auto-Escalation to Mediation (Hours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={escalationHours}
                    onChange={(e) => setEscalationHours(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                  Buyer Protection Summary
                </label>
                <textarea
                  rows={2}
                  value={policySummary}
                  onChange={(e) => setPolicySummary(e.target.value)}
                  className="w-full p-2.5 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                  Binding Mediation Terms
                </label>
                <textarea
                  rows={2}
                  value={mediationTerms}
                  onChange={(e) => setMediationTerms(e.target.value)}
                  className="w-full p-2.5 text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red resize-none"
                />
              </div>

              <div className="p-3 bg-rose-50/50 border border-brand-red/20 rounded-xl text-[11px] text-gray-600 space-y-1">
                <span className="font-bold text-brand-red block text-xs">Exemption Safeguards:</span>
                <p>• <strong>Food &amp; Grocery:</strong> Non-returnable once opened for safety; full refund if expired or damaged upon arrival.</p>
                <p>• <strong>Custom Items:</strong> Non-returnable unless defective or mismatched from order specs.</p>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (3 Cols): Live Fee Simulator & Enforcement ── */}
          <div className="lg:col-span-3 space-y-3">
            {/* Live Simulator */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
                  <Calculator className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Fee Calculator</h3>
                  <p className="text-[10px] text-gray-400">Live preview on sample cart checkout</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Item Subtotal (PHP)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                  <input
                    type="number"
                    min={1}
                    value={simAmount}
                    onChange={(e) => setSimAmount(Math.max(1, Number(e.target.value)))}
                    className="w-full pl-7 pr-3 py-1.5 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-brand-red"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-gray-100 text-xs">
                <div className="p-2.5 bg-gray-50 rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-bold text-gray-900 block">General ({baseRate}%)</span>
                    <span className="text-[10px] text-gray-400">Standard rate</span>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-brand-red block">
                      ₱{((simAmount * baseRate) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-emerald-600">
                      Seller: ₱{(simAmount - (simAmount * baseRate) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {overrides.map((o) => (
                  <div key={o.category_key} className="p-2.5 bg-rose-50/40 border border-rose-100/60 rounded-xl flex justify-between items-center">
                    <div>
                      <span className="font-bold text-gray-900 block">{o.category_name} ({o.rate_percent}%)</span>
                      <span className="text-[10px] text-gray-400">Override</span>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-brand-red block">
                        ₱{((simAmount * o.rate_percent) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-emerald-600">
                        Seller: ₱{(simAmount - (simAmount * o.rate_percent) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Method Enforcement Notice */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-900 uppercase tracking-wider pb-1 border-b border-gray-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Active Payment Gateways
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Velure marketplace operates strictly with <strong>GCash</strong> and <strong>Cash on Delivery (COD)</strong>.
              </p>
              <div className="space-y-1.5 pt-1">
                <div className="p-2 bg-gray-50 rounded-lg text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1 font-bold text-[#007DFE]">
                    <QrCode className="w-3 h-3" /> GCash Official
                  </span>
                  <span className="font-mono text-gray-600 text-[11px]">0917-835-8731</span>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1 font-bold text-blue-700">
                    <Truck className="w-3 h-3" /> Cash on Delivery
                  </span>
                  <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
