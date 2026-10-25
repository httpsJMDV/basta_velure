import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings, UserRound, KeyRound, Warehouse, MapPin, Truck, ShieldCheck, FileCheck2, Mail, Phone,
} from 'lucide-react';
import { getHubProfileApi, getPayoutAccountApi, updatePayoutAccountApi } from '../../api/client';
import type { HubProfile } from '../../types';
import { PageHeader } from './hubKit';
import { Pill, ListError } from '../../components/admin/listKit';
import AccountSecurity from '../../components/account/AccountSecurity';
import { PayoutAccountForm } from '../../components/payments/GcashKit';
import { PortalAccountTab, SettingsRow } from '../../components/account/PortalAccount';

type Tab = 'account' | 'security' | 'hub';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'account', label: 'Account', icon: UserRound },
  { key: 'security', label: 'Password', icon: KeyRound },
  { key: 'hub', label: 'Hub & payout', icon: Warehouse },
];

const loadGcash = () => getPayoutAccountApi('hub');
const saveGcash = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('hub', p);

const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '—';

/**
 * The hub manager's settings (the seller portal's Account Settings, for the hub): their own account (photo, name,
 * email and mobile with a code), the password, and the hub's details with the GCash its courier pays it on. The hub's
 * name, address and coverage are read-only here: the courier company approves them, so changes go through it.
 */
export default function HubSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'account';

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHeader icon={Settings} accent="gray" title="Settings"
        subtitle="Your account, your password, your hub's details and the GCash your courier pays you on." />

      <section className="hub-settings-shell overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
        <div className="hub-settings-navigation">
          <div role="tablist" aria-label="Settings sections" className="inline-flex max-w-full items-center gap-0.5 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}
                className={`min-h-9 px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all ${tab === key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="hub-settings-content">
        {tab === 'account' && <PortalAccountTab photoHint="Shown to your riders in messages. JPG or PNG, up to 5 MB." idPrefix="hub" />}
        {tab === 'security' && (
          <div className="divide-y divide-gray-100">
            <SettingsRow label="Password" hint="Use it to sign in at /hub/login. You need your current password to set a new one.">
              <div className="max-w-3xl"><AccountSecurity show={['password']} /></div>
            </SettingsRow>
          </div>
        )}
        {tab === 'hub' && <HubTab />}
        </div>
      </section>
    </div>
  );
}

function HubTab() {
  const [hub, setHub] = useState<HubProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getHubProfileApi().then(setHub).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const address = hub ? [hub.address_street, hub.address_barangay, hub.address_city, hub.address_province].filter(Boolean).join(', ') : '';

  return (
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:divide-x divide-gray-100">
      <div className="min-w-0">
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-[13px] font-bold text-gray-900">Hub details</h2>
          <p className="text-[11.5px] text-gray-500">What riders, sellers and your courier see about this hub.</p>
        </div>
        {failed ? <div className="p-5"><ListError message="The hub details could not be loaded." onRetry={load} /></div> : !hub ? (
          <div className="p-5 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : (
          <>
            <dl className="divide-y divide-gray-100">
              {([
                [Warehouse, 'Hub name', <span key="hub-name" className="inline-flex flex-wrap items-center gap-2">{hub.hub_name} <Pill tone="emerald">Approved</Pill></span>],
                [Truck, 'Courier company', hub.courier ? `${hub.courier.name} (${hub.courier.code})` : '—'],
                [MapPin, 'Address', address || '—'],
                [ShieldCheck, 'Delivery coverage', `${hub.coverage_barangays_count} barangay${hub.coverage_barangays_count === 1 ? '' : 's'}`],
                [FileCheck2, 'Business permit', hub.has_permit ? 'On file' : 'Not on file'],
                [Settings, 'Applied · approved', `${longDate(hub.applied_at)} · ${longDate(hub.approved_at)}`],
              ] as const).map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-3 px-5 py-3">
                  <span className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                    <dd className="text-[13px] font-medium text-gray-900 break-words">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div className="m-5 mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-950">
              <p className="font-semibold">Need to change the hub's name, address or coverage?</p>
              <p className="mt-0.5 text-amber-900">
                Your courier company approved these, so it makes the change.{' '}
                {hub.courier ? <>Contact <b>{hub.courier.name}</b>:</> : 'Contact your courier company.'}
              </p>
              {hub.courier && (hub.courier.contact_email || hub.courier.contact_phone) && (
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {hub.courier.contact_email && <a href={`mailto:${hub.courier.contact_email}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Mail className="w-3.5 h-3.5" aria-hidden="true" />{hub.courier.contact_email}</a>}
                  {hub.courier.contact_phone && <a href={`tel:${hub.courier.contact_phone}`} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Phone className="w-3.5 h-3.5" aria-hidden="true" />{hub.courier.contact_phone}</a>}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="p-5 space-y-2 border-t border-gray-100 lg:border-t-0">
        <h2 className="text-[13px] font-bold text-gray-900">Payout GCash</h2>
        <p className="text-[11.5px] text-gray-500">Your courier sends the hub's share of delivery fees here. The Earnings page shows what it owes.</p>
        <PayoutAccountForm load={loadGcash} save={saveGcash} who="your courier" tone="gray" />
      </div>
    </div>
  );
}
