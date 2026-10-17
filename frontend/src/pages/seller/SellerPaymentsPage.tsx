import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Gift, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import {
  getSellerPaymentSettingsApi, updateSellerPaymentSettingsApi,
  getSellerSettlementsApi, paySellerSettlementApi, confirmSellerSettlementApi,
  getSellerCommissionApi, paySellerCommissionApi,
} from '../../api/client';
import type { GcashAccount, SellerCommissionMonth, SellerPaymentSettings, SettlementLine, SettlementWeeks as Weeks } from '../../types';
import { GcashPayee, RecordPaymentDialog, peso, formatReference } from '../../components/payments/GcashKit';
import { SettlementWeeks, shortDate } from '../../components/payments/SettlementWeeks';
import { useToast } from '../../components/ui/Toast';
import gcashLogo from '../../assets/brand/gcash-logo.svg';

type Tab = 'gcash' | 'couriers' | 'commission';
const TABS: { key: Tab; label: string }[] = [
  { key: 'gcash', label: 'GCash & delivery' },
  { key: 'couriers', label: 'Courier statements' },
  { key: 'commission', label: 'Commission' },
];

/** 09171234567 → "0917 123 4567"; anything else as typed. */
function prettyNumber(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('63') && d.length === 12) d = `0${d.slice(2)}`;
  return d.length === 11 && d.startsWith('09') ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : raw;
}

type CommissionData = { months: SellerCommissionMonth[]; platform_gcash: GcashAccount | null };

/**
 * Seller Center → Payments. Buyers pay the shop directly (GCash to the shop, or cash to the rider), so this is
 * where the shop sets the GCash buyers see at checkout and its free-delivery minimum, settles each week with its
 * couriers, and pays Loved-IT's commission once a month.
 */
export default function SellerPaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS.find((t) => t.key === params.get('tab'))?.key) ?? 'gcash';
  const { showToast } = useToast();

  const [settings, setSettings] = useState<SellerPaymentSettings | null>(null);
  const [weeks, setWeeks] = useState<Weeks | null>(null);
  const [commission, setCommission] = useState<CommissionData | null>(null);
  const [failed, setFailed] = useState(false);
  const [paying, setPaying] = useState<{ line: SettlementLine; weekStart: string } | null>(null);
  const [payingMonth, setPayingMonth] = useState<SellerCommissionMonth | null>(null);

  const load = useCallback(() => {
    Promise.all([getSellerPaymentSettingsApi(), getSellerSettlementsApi(), getSellerCommissionApi()])
      .then(([s, w, c]) => { setSettings(s); setWeeks(w); setCommission(c); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const commissionDue = useMemo(
    () => (commission?.months ?? []).filter((m) => !m.in_progress && !m.payment && m.amount > 0).reduce((s, m) => s + m.amount, 0),
    [commission],
  );

  const figures = [
    { label: 'Couriers owe you', value: weeks?.totals.to_receive ?? 0, tone: 'text-emerald-700', tab: 'couriers' as Tab },
    { label: 'You owe couriers', value: weeks?.totals.to_pay ?? 0, tone: 'text-gray-900', tab: 'couriers' as Tab },
    { label: 'Commission due', value: commissionDue, tone: 'text-gray-900', tab: 'commission' as Tab },
  ];

  return (
    <div className="space-y-5 max-w-[1180px]">
      {/* Header: what this page is, the three numbers that need action, and the tabs */}
      <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 pb-4 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="max-w-xl">
            <h1 className="text-[20px] font-bold tracking-tight text-gray-900">Payments</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
              Buyers pay you directly: by GCash to your own account, or in cash to the rider. Couriers settle the cash with you every week, and Loved-IT's commission is paid once a month.
            </p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/60 shrink-0">
            {figures.map((f) => (
              <button key={f.label} type="button" onClick={() => setParams({ tab: f.tab })} className="px-4 py-2.5 text-left hover:bg-white transition-colors first:rounded-l-xl last:rounded-r-xl">
                <dt className="text-[11px] text-gray-500 whitespace-nowrap">{f.label}</dt>
                <dd className={`text-[16px] font-bold tabular-nums ${f.value > 0 ? f.tone : 'text-gray-300'}`}>{weeks ? peso(f.value) : '—'}</dd>
              </button>
            ))}
          </dl>
        </div>
        <nav className="flex gap-1 px-3 sm:px-4 border-t border-gray-100 overflow-x-auto" aria-label="Payments sections">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setParams({ tab: t.key })} aria-current={tab === t.key ? 'page' : undefined}
              className={`relative h-11 px-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${tab === t.key ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
              {t.label}
              {tab === t.key && <span className="absolute left-3 right-3 bottom-0 h-[2px] rounded-full bg-brand-red" />}
            </button>
          ))}
        </nav>
      </div>

      {failed ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-800 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Your payment details could not be loaded.</span>
          <button type="button" onClick={load} className="h-8 px-3 rounded-full bg-white border border-red-200 text-[12px] font-semibold">Try again</button>
        </div>
      ) : !settings || !weeks || !commission ? (
        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          <div className="h-80 rounded-2xl bg-gray-100 animate-pulse" />
          <div className="h-56 rounded-2xl bg-gray-100 animate-pulse" />
        </div>
      ) : tab === 'gcash' ? (
        <GcashSetup settings={settings} onSaved={(s) => { setSettings(s); showToast('Payment settings saved'); }} />
      ) : tab === 'couriers' ? (
        <div className="space-y-4">
          <HowItWorks
            lines={[
              'Your courier collects the cash for every cash-on-delivery order and charges its delivery fee for every parcel, including the ones you deliver free.',
              'Each Monday the past week is added up: cash collected minus delivery fees. If the cash is bigger, the courier sends you the difference by GCash. If the fees are bigger, you send it.',
              'Whoever sends records the GCash reference here. The other side checks their GCash and confirms.',
            ]}
          />
          <SettlementWeeks
            data={weeks}
            side="seller"
            empty="Once couriers deliver your orders, each week's statement with each courier shows up here."
            onPay={(line, weekStart) => setPaying({ line, weekStart })}
            onConfirm={async (s) => {
              try { await confirmSellerSettlementApi(s.id); showToast('Marked as received'); load(); }
              catch { showToast('That did not go through. Try again.', 'error'); }
            }}
          />
        </div>
      ) : (
        <CommissionTab data={commission} onPay={setPayingMonth} />
      )}

      {paying && (
        <RecordPaymentDialog
          title={`Pay ${paying.line.company?.name ?? 'the courier'}`}
          intro={<>For the week of {shortDate(paying.weekStart)}, the delivery fees ({peso(paying.line.courier_fees)}) are more than the cash the courier collected for you ({peso(paying.line.cod_collected)}). Send the difference to the courier's GCash.</>}
          payee={paying.line.company?.gcash ?? null}
          missingPayee="This courier has not added its GCash yet. Message it from Orders before you send money."
          amount={paying.line.net}
          onClose={() => setPaying(null)}
          onConfirm={async (reference) => {
            await paySellerSettlementApi({ company_id: paying.line.company!.id, week_start: paying.weekStart, reference });
            setPaying(null);
            showToast('Payment recorded. The courier will confirm it.');
            load();
          }}
        />
      )}

      {payingMonth && (
        <RecordPaymentDialog
          title={`Commission for ${payingMonth.label}`}
          intro={<>{payingMonth.orders_count} completed order{payingMonth.orders_count === 1 ? '' : 's'} in {payingMonth.label}. Send the commission to Loved-IT's GCash, then record the reference.</>}
          payee={commission?.platform_gcash ?? null}
          missingPayee="Loved-IT has not posted its GCash yet. Check back soon."
          amount={payingMonth.amount}
          onClose={() => setPayingMonth(null)}
          onConfirm={async (reference) => {
            await paySellerCommissionApi({ period: payingMonth.period, reference });
            setPayingMonth(null);
            showToast('Commission payment recorded');
            load();
          }}
        />
      )}
    </div>
  );
}

function HowItWorks({ lines }: { lines: string[] }) {
  return (
    <details className="group rounded-2xl bg-white border border-gray-200 open:pb-1">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-3.5 text-[13px] font-semibold text-gray-800">
        How the weekly statement works
        <span className="text-[12px] font-medium text-gray-400 group-open:hidden">Show</span>
        <span className="text-[12px] font-medium text-gray-400 hidden group-open:inline">Hide</span>
      </summary>
      <ol className="px-5 pb-4 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-gray-600">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            {l}
          </li>
        ))}
      </ol>
    </details>
  );
}

// ── GCash & delivery ──

function GcashSetup({ settings, onSaved }: { settings: SellerPaymentSettings; onSaved: (s: SellerPaymentSettings) => void }) {
  const [number, setNumber] = useState(settings.gcash_number ?? '');
  const [name, setName] = useState(settings.gcash_account_name ?? '');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [freeOn, setFreeOn] = useState(settings.free_delivery_min !== null);
  const [freeMin, setFreeMin] = useState(settings.free_delivery_min !== null ? String(settings.free_delivery_min) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const qrPreview = useMemo(() => (qrFile ? URL.createObjectURL(qrFile) : null), [qrFile]);
  useEffect(() => () => { if (qrPreview) URL.revokeObjectURL(qrPreview); }, [qrPreview]);
  const qrUrl = qrPreview ?? (removeQr ? null : settings.gcash_qr_url);

  const dirty = number !== (settings.gcash_number ?? '') || name !== (settings.gcash_account_name ?? '') || Boolean(qrFile) || removeQr
    || freeOn !== (settings.free_delivery_min !== null) || (freeOn && Number(freeMin) !== settings.free_delivery_min);
  const turningOff = settings.accepts_gcash && number.trim() === '';

  const pickQr = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErrors((x) => ({ ...x, gcash_qr: 'The QR code must be an image.' })); return; }
    if (f.size > 4 * 1024 * 1024) { setErrors((x) => ({ ...x, gcash_qr: 'That image is over 4 MB.' })); return; }
    setQrFile(f);
    setRemoveQr(false);
    setErrors((x) => ({ ...x, gcash_qr: '' }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (freeOn && !(Number(freeMin) >= 1)) local.free_delivery_min = 'Enter the order amount, in pesos, that earns free delivery.';
    if (number.trim() && !name.trim()) local.gcash_account_name = 'Enter the name on the GCash account, as GCash shows it to people who pay you.';
    if (Object.keys(local).length) { setErrors(local); return; }

    const form = new FormData();
    form.append('gcash_number', number.trim());
    form.append('gcash_account_name', name.trim());
    form.append('free_delivery_min', freeOn ? freeMin : '');
    if (qrFile) form.append('gcash_qr', qrFile);
    else if (removeQr) form.append('remove_qr', '1');

    setBusy(true);
    setErrors({});
    try {
      const saved = await updateSellerPaymentSettingsApi(form);
      setNumber(saved.gcash_number ?? '');
      setName(saved.gcash_account_name ?? '');
      setQrFile(null);
      setRemoveQr(false);
      setFreeOn(saved.free_delivery_min !== null);
      setFreeMin(saved.free_delivery_min !== null ? String(saved.free_delivery_min) : '');
      onSaved(saved);
    } catch (err) {
      const errs = (err as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })?.response?.data;
      setErrors(errs?.errors ? Object.fromEntries(Object.entries(errs.errors).map(([k, v]) => [k, v[0]])) : { form: errs?.message ?? 'Could not save. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const input = (bad?: string) => `w-full h-11 px-3.5 text-[14px] bg-white border rounded-xl outline-none transition-colors ${bad ? 'border-brand-red ring-2 ring-brand-red/10' : 'border-gray-300 focus:border-brand-red focus:ring-2 focus:ring-brand-red/10'}`;
  const fieldError = (k: string) => errors[k] ? <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-brand-red"><AlertCircle className="w-3.5 h-3.5" />{errors[k]}</p> : null;
  const previewAccount: GcashAccount | null = number.trim() ? { name: name.trim() || null, number: prettyNumber(number.trim()), qr_url: qrUrl } : null;
  const sample = freeOn && Number(freeMin) >= 1 ? Number(freeMin) : 850;

  return (
    <form onSubmit={save} noValidate className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
      <div className="space-y-5">
        {/* GCash account */}
        <section className="rounded-2xl bg-white border border-gray-200">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <img src={gcashLogo} alt="GCash" className="h-5 w-auto" />
              <h2 className="text-[15px] font-semibold text-gray-900">Your GCash account</h2>
            </div>
            {settings.accepts_gcash
              ? <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Taking GCash</span>
              : <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-700"><Clock className="w-4 h-4" /> Cash on delivery only</span>}
          </header>
          <div className="px-5 sm:px-6 py-5 space-y-4">
            <p className="text-[13px] leading-relaxed text-gray-600">
              Buyers who choose GCash send the money straight to this account and upload their receipt. You check the receipt in Orders before you pack.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="gcash-number" className="block text-[12px] font-medium text-gray-600 mb-1.5">GCash number</label>
                <input id="gcash-number" inputMode="tel" autoComplete="off" value={number} onChange={(e) => { setNumber(e.target.value); setErrors((x) => ({ ...x, gcash_number: '' })); }} placeholder="0917 123 4567" className={input(errors.gcash_number)} />
                {fieldError('gcash_number')}
              </div>
              <div>
                <label htmlFor="gcash-name" className="block text-[12px] font-medium text-gray-600 mb-1.5">Name on the account</label>
                <input id="gcash-name" value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, gcash_account_name: '' })); }} placeholder="e.g. JUAN D." className={input(errors.gcash_account_name)} />
                {fieldError('gcash_account_name') ?? <p className="mt-1 text-[12px] text-gray-400">As GCash shows it to people who send you money.</p>}
              </div>
            </div>
            {turningOff && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12.5px] text-amber-900">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> Without a number, buyers can only pay you by cash on delivery.
              </p>
            )}

            <div>
              <p className="text-[12px] font-medium text-gray-600 mb-1.5">QR code <span className="font-normal text-gray-400">(optional)</span></p>
              {qrUrl ? (
                <div className="flex items-center gap-4 rounded-xl border border-gray-200 p-3">
                  <img src={qrUrl} alt="Your GCash QR code" className="w-20 h-20 rounded-lg object-contain bg-white ring-1 ring-gray-200" />
                  <div className="flex-1 min-w-0 text-[12px] text-gray-500">{qrFile ? qrFile.name : 'Buyers can scan this instead of typing your number.'}</div>
                  <label className="h-8 px-3 rounded-full border border-gray-300 text-[12px] font-semibold text-gray-700 hover:border-gray-900 cursor-pointer inline-flex items-center">
                    Replace<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickQr} className="sr-only" />
                  </label>
                  <button type="button" onClick={() => { setQrFile(null); setRemoveQr(Boolean(settings.gcash_qr_url)); }} className="w-8 h-8 rounded-full text-gray-400 hover:text-brand-red hover:bg-rose-50 flex items-center justify-center" aria-label="Remove QR code">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-red px-4 py-3.5 cursor-pointer transition-colors">
                  <ImagePlus className="w-5 h-5 text-gray-400" />
                  <span className="text-[13px]"><span className="font-semibold text-brand-red">Upload your GCash QR</span><span className="block text-[12px] text-gray-400">From GCash: Profile → My QR → Save. PNG or JPG, up to 4 MB.</span></span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickQr} className="sr-only" />
                </label>
              )}
              {fieldError('gcash_qr')}
            </div>
          </div>
        </section>

        {/* Free delivery */}
        <section className="rounded-2xl bg-white border border-gray-200">
          <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center"><Gift className="w-4 h-4" /></span>
              <h2 className="text-[15px] font-semibold text-gray-900">Free delivery</h2>
            </div>
            <button type="button" role="switch" aria-checked={freeOn} aria-label="Offer free delivery" onClick={() => setFreeOn((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${freeOn ? 'bg-emerald-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${freeOn ? 'translate-x-5' : ''}`} />
            </button>
          </header>
          <div className="px-5 sm:px-6 py-5 space-y-3">
            {freeOn ? (
              <div>
                <label htmlFor="free-min" className="block text-[13px] text-gray-700 mb-2">Deliver free when a buyer's order from your shop reaches</label>
                <div className="relative max-w-[220px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-gray-400">₱</span>
                  <input id="free-min" inputMode="decimal" value={freeMin} onChange={(e) => { setFreeMin(e.target.value.replace(/[^\d.]/g, '')); setErrors((x) => ({ ...x, free_delivery_min: '' })); }} placeholder="999" className={`${input(errors.free_delivery_min)} pl-8 tabular-nums`} />
                </div>
                {fieldError('free_delivery_min')}
              </div>
            ) : (
              <p className="text-[13px] text-gray-600">Off. Every buyer pays the {peso(settings.delivery_fee)} delivery fee for their parcel.</p>
            )}
            <p className="text-[12.5px] leading-relaxed text-gray-500">
              Free delivery is your offer: the courier still earns {peso(settings.delivery_fee)} for each parcel, and it comes out of your weekly courier statement. Buyers see the minimum in their cart.
            </p>
          </div>
        </section>

        {errors.form && <p role="alert" className="text-[13px] text-brand-red">{errors.form}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy || !dirty} className="h-11 px-6 rounded-full bg-brand-red hover:bg-[#8e2424] text-white text-[13px] font-semibold inline-flex items-center gap-2 disabled:opacity-40">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
          </button>
          {!dirty && !busy && <span className="text-[12px] text-gray-400">No changes</span>}
        </div>
      </div>

      {/* What buyers see */}
      <aside className="lg:sticky lg:top-24 rounded-2xl bg-[#FAF8F5] border border-stone-200 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">What buyers see at checkout</p>
        <div className="mt-3 rounded-2xl bg-white border border-stone-200 p-4 space-y-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-stone-900">Your shop</span>
            <span className="text-stone-500">{freeOn && Number(freeMin) >= 1 ? 'Items · free delivery' : `Items + ${peso(settings.delivery_fee)} delivery`}</span>
          </div>
          {previewAccount
            ? <GcashPayee account={previewAccount} amount={sample + (freeOn && Number(freeMin) >= 1 ? 0 : settings.delivery_fee)} />
            : <p className="rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-3 text-[12.5px] text-stone-600">GCash is off for your shop. Buyers pay by cash on delivery.</p>}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-stone-500">
          A sample {peso(sample)} order. Only signed-in buyers see your number, at checkout.
        </p>
      </aside>
    </form>
  );
}

// ── Commission ──

function CommissionTab({ data, onPay }: { data: CommissionData; onPay: (m: SellerCommissionMonth) => void }) {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <header className="px-5 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Monthly commission</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">Counted on orders buyers completed during the month. Pay each month once it is over.</p>
        </header>
        {data.months.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-gray-500">No completed orders yet, so there is nothing to pay.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.months.map((m) => (
              <li key={m.period} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 sm:px-6 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900">{m.label}</p>
                  <p className="text-[12px] text-gray-500">{m.orders_count} completed order{m.orders_count === 1 ? '' : 's'}{m.in_progress ? ' so far' : ''}</p>
                </div>
                <p className={`sm:w-32 sm:text-right text-[17px] font-bold tabular-nums ${m.amount > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{peso(m.amount)}</p>
                <div className="sm:w-[230px] sm:flex sm:justify-end"><MonthStatus m={m} canPay={Boolean(data.platform_gcash)} onPay={() => onPay(m)} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="space-y-3">
        {data.platform_gcash
          ? <GcashPayee account={data.platform_gcash} caption="Commission goes to" />
          : <p className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-900">Loved-IT has not posted its GCash yet. You can pay once it is up.</p>}
        <p className="px-1 text-[12px] leading-relaxed text-gray-500">An admin checks each payment against Loved-IT's GCash and marks it confirmed. Returned or cancelled orders are never charged.</p>
      </aside>
    </div>
  );
}

function MonthStatus({ m, canPay, onPay }: { m: SellerCommissionMonth; canPay: boolean; onPay: () => void }) {
  const note = 'text-[12px] text-gray-500';
  if (m.payment?.confirmed_at) {
    return <p className="text-[12px] text-gray-600 sm:text-right"><span className="flex sm:justify-end items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Confirmed</span>Ref <span className="font-mono">{formatReference(m.payment.reference)}</span></p>;
  }
  if (m.payment) {
    return <p className="text-[12px] text-gray-600 sm:text-right"><span className="block font-semibold text-gray-900">Sent {m.payment.paid_at ? shortDate(m.payment.paid_at) : ''}</span>Ref <span className="font-mono">{formatReference(m.payment.reference)}</span> · being checked</p>;
  }
  if (m.in_progress) return <p className={note}>Running total. Due after the month ends.</p>;
  if (m.amount <= 0) return <p className={note}>Nothing to pay.</p>;
  return (
    <button type="button" onClick={onPay} disabled={!canPay} className="h-9 px-4 rounded-full bg-brand-red hover:bg-[#8e2424] text-white text-[13px] font-semibold w-full sm:w-auto disabled:opacity-40">
      Pay {peso(m.amount)}
    </button>
  );
}
