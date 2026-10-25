import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, UserRound, KeyRound, Building2, Camera, Loader2, Check } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { ListError, Pill } from '../../components/admin/listKit';
import AccountSecurity from '../../components/account/AccountSecurity';
import { PortalAccountTab, SettingsRow } from '../../components/account/PortalAccount';
import { PayoutAccountForm } from '../../components/payments/GcashKit';
import PhoneInput from '../../components/ui/PhoneInput';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../hooks/useAuth';
import { getLogisticsMeApi, getPayoutAccountApi, updatePayoutAccountApi } from '../../api/client';
import { updateLogisticsCompanyApi, uploadLogisticsLogoApi } from '../../api/courierChat';
import type { LogisticsCompanyDetail } from '../../types';
import { emailError, fileError, phoneError } from '../../utils/accountRules';
import { apiErrorMessage } from '../../utils/apiError';

type Tab = 'account' | 'security' | 'company';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'account', label: 'Account', icon: UserRound },
  { key: 'security', label: 'Password', icon: KeyRound },
  { key: 'company', label: 'Company & payout', icon: Building2 },
];

const loadGcash = () => getPayoutAccountApi('logistics');
const saveGcash = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('logistics', p);

/**
 * The courier company's Settings: the signed-in team member's own account (photo, name, email and mobile with a
 * code, password), and the company's contact details, logo and the GCash shops pay delivery fees to. The company's
 * name, SEC number, TIN and address were reviewed by the admin, so they are shown here but changed through support.
 */
export default function LogisticsSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'account';

  return (
    <div className="pb-8 space-y-4">
      <PageHero icon={Settings} eyebrow="Account" title="Settings" subtitle="Your own account and password, and your company's details and payout GCash." />

      <section className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="px-4 pt-4">
          <div role="tablist" aria-label="Settings sections" className="inline-flex max-w-full items-center gap-0.5 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}
                className={`min-h-9 px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${tab === key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {tab === 'account' && <PortalAccountTab photoHint="Shown to your hubs in messages. JPG or PNG, up to 5 MB." idPrefix="courier" />}
          {tab === 'security' && (
            <div className="divide-y divide-gray-100">
              <SettingsRow label="Password" hint="You sign in on the main sign-in page. You need your current password to set a new one.">
                <div className="max-w-3xl"><AccountSecurity show={['password']} /></div>
              </SettingsRow>
            </div>
          )}
          {tab === 'company' && <CompanyTab />}
        </div>
      </section>
    </div>
  );
}

function CompanyTab() {
  const { showToast } = useToast();
  const { user, setUser } = useAuth();
  const [company, setCompany] = useState<LogisticsCompanyDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const fill = (c: LogisticsCompanyDetail) => {
    setCompany(c);
    setDescription(c.description ?? '');
    setEmail(c.contact_email ?? '');
    setPhone(c.contact_phone ?? '');
  };
  const load = useCallback(() => {
    setFailed(false);
    getLogisticsMeApi().then(fill).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  // The sidebar shows the company's logo and name from the signed-in user, so keep it in step.
  const syncUser = (c: LogisticsCompanyDetail) => {
    if (user?.logistics_company) setUser({ ...user, logistics_company: { ...user.logistics_company, logo_url: c.logo_url } });
  };

  const save = async () => {
    const local = Object.fromEntries(Object.entries({
      contact_email: emailError(email),
      contact_phone: phoneError(phone),
      description: description.trim().length > 500 ? 'The description can be at most 500 characters.' : undefined,
    }).filter(([, v]) => v)) as Record<string, string>;
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const res = await updateLogisticsCompanyApi({ description: description.trim() || null, contact_email: email.trim(), contact_phone: phone });
      fill(res.data);
      showToast(res.message, 'success');
    } catch (e) {
      const errs = (e as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
      if (errs) setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])));
      else showToast(apiErrorMessage(e, 'The details could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeLogo = async (file: File | undefined) => {
    if (!file) return;
    const problem = fileError(file, 'the logo');
    if (problem) { setErrors((x) => ({ ...x, logo: problem })); return; }
    setErrors(({ logo: _drop, ...rest }) => rest);
    setLogoBusy(true);
    try {
      const res = await uploadLogisticsLogoApi(file);
      fill(res.data);
      syncUser(res.data);
      showToast(res.message, 'success');
    } catch (e) {
      setErrors((x) => ({ ...x, logo: apiErrorMessage(e, 'The logo was not saved. Use a JPG or PNG up to 5 MB.') }));
    } finally {
      setLogoBusy(false);
    }
  };

  const input = (err?: string) =>
    `w-full px-3 text-[13px] bg-white border rounded-xl outline-none focus:ring-2 focus:ring-brand-red/10 ${err ? 'border-red-400' : 'border-gray-200 focus:border-brand-red'}`;

  if (failed) return <div className="p-5"><ListError message="Your company's details could not be loaded." onRetry={load} /></div>;
  if (!company) return <div className="p-5 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}</div>;

  const address = [company.address_street, company.address_barangay, company.address_city, company.address_province].filter(Boolean).join(', ');

  return (
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:divide-x divide-gray-100 border-t border-gray-100">
      <div className="min-w-0 divide-y divide-gray-100">
        <SettingsRow label="Logo" hint="Shown to hubs, riders and shops. JPG or PNG, up to 5 MB.">
          <div className="flex flex-wrap items-center gap-4">
            {company.logo_url
              ? <img src={company.logo_url} alt="" className="w-16 h-16 rounded-2xl object-cover border border-gray-200" />
              : <span className="w-16 h-16 rounded-2xl bg-gray-900 text-white text-lg font-black flex items-center justify-center">{company.code}</span>}
            <button type="button" onClick={() => logoInput.current?.click()} disabled={logoBusy}
              className="min-h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1.5 disabled:opacity-50">
              {logoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Camera className="w-3.5 h-3.5" aria-hidden="true" />}
              {logoBusy ? 'Uploading…' : 'Change logo'}
            </button>
            <input ref={logoInput} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { void changeLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {errors.logo && <p role="alert" className="mt-2 text-[12px] font-medium text-red-700">{errors.logo}</p>}
        </SettingsRow>

        <SettingsRow label="Company" hint="Reviewed by Loved-IT when you applied. To change these, chat with Loved-IT Support.">
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Name</dt><dd className="font-semibold text-gray-900 flex items-center gap-2">{company.name} <Pill tone="emerald">Approved</Pill></dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Code</dt><dd className="font-mono font-semibold text-gray-900">{company.code}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">SEC registration no.</dt><dd className="text-gray-900">{company.sec_registration_no || '—'}</dd></div>
            <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">TIN</dt><dd className="text-gray-900 tabular-nums">{company.tin || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Head office</dt><dd className="text-gray-900">{address || '—'}</dd></div>
            {(company.service_region_names?.length ?? 0) > 0 && (
              <div className="sm:col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Service areas</dt><dd className="text-gray-900">{company.service_region_names!.join(', ')}</dd></div>
            )}
          </dl>
        </SettingsRow>

        <SettingsRow label="How to reach you" hint="Hubs and shops use these to contact the company.">
          <div className="grid gap-4 max-w-xl">
            <div>
              <label htmlFor="courier-email" className="block mb-1 text-[11.5px] font-medium text-gray-600">Contact email <span className="text-brand-red">*</span></label>
              <input id="courier-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors(({ contact_email: _d, ...r }) => r); }}
                aria-invalid={Boolean(errors.contact_email)} className={`${input(errors.contact_email)} h-10`} />
              {errors.contact_email && <p role="alert" className="mt-1 text-[11.5px] text-red-700">{errors.contact_email}</p>}
            </div>
            <PhoneInput id="courier-phone" label="Contact mobile" required value={phone} onChange={(v) => { setPhone(v); setErrors(({ contact_phone: _d, ...r }) => r); }} error={errors.contact_phone} />
            <div>
              <label htmlFor="courier-about" className="block mb-1 text-[11.5px] font-medium text-gray-600">About the company <span className="text-gray-400">(optional)</span></label>
              <textarea id="courier-about" rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setErrors(({ description: _d, ...r }) => r); }}
                placeholder="e.g. Same-day delivery across Laguna, with hubs in Santa Cruz and Calamba."
                className={`${input(errors.description)} py-2.5 resize-none`} />
              <p className={`mt-1 text-[11px] tabular-nums ${errors.description || description.length > 500 ? 'text-red-700' : 'text-gray-400'}`}>{errors.description ?? `${description.length}/500`}</p>
            </div>
            <div>
              <button type="button" onClick={() => void save()} disabled={saving}
                className="min-h-9 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </div>
        </SettingsRow>
      </div>

      <div className="p-5 space-y-2 border-t border-gray-100 lg:border-t-0">
        <h2 className="text-[13px] font-bold text-gray-900">Payout GCash</h2>
        <p className="text-[11.5px] text-gray-500">Shops send the delivery fees of GCash and free-delivery orders here.</p>
        <PayoutAccountForm load={loadGcash} save={saveGcash} who="shops" tone="gray" />
      </div>
    </div>
  );
}
