import { getAdminPaymentSettingsApi, updateAdminPaymentSettingsApi } from '../../api/client';
import { PayoutAccountForm } from './GcashKit';
const load = async () => { const r = await getAdminPaymentSettingsApi(); return { gcash_number: r.platform_gcash_number, gcash_name: r.platform_gcash_name }; };
const save = async (p: { gcash_number: string | null; gcash_name: string | null }) => {
  const r = await updateAdminPaymentSettingsApi({ platform_gcash_number: p.gcash_number, platform_gcash_name: p.gcash_name });
  return { gcash_number: r.platform_gcash_number, gcash_name: r.platform_gcash_name };
};
export default function PlatformCollectionSettings() {
  return <section className="grid gap-5 md:grid-cols-2 rounded-2xl border border-gray-200 bg-white p-5">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-red">Collection account</p><h2 className="mt-2 text-xl font-bold text-gray-900">Where buyers pay Loved-IT</h2><p className="mt-3 text-sm leading-relaxed text-gray-600">Enter the actual Loved-IT GCash account. Checkout becomes available once the name and number are configured. Existing orders keep the account shown when they were placed.</p><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Check incoming transfers in GCash before approving receipts. Seller payouts, courier funding and refunds are sent manually, then recorded here. Saving an account does not connect a payment-provider API.</p></div>
    <PayoutAccountForm load={load} save={save} who="buyers" tone="gray" intro="Use the verified platform account, rather than a seller’s personal collection account." />
  </section>;
}
