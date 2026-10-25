import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Bike, FileText, Plus, RotateCw, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { PageHero, HERO_BUTTON } from '../../components/admin/dashboardKit';
import CustomSelect from '../../components/ui/CustomSelect';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import FileUploadZone from '../../components/ui/FileUploadZone';
import { SidePanel, ReasonDialog, BUTTON } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import {
  FilterPanel, SearchField, StatusTabs, ListCard, ListEmpty, ListError, Avatar, Pill, SkeletonRows, TH, TD, ROW, rowKeys,
  formatShortDate, relativeTime, type PillTone,
} from '../../components/admin/listKit';
import { getLogisticsHubsApi, getLogisticsMeApi, openAuthorizedFile } from '../../api/client';
import RiderApplyLink from '../../components/logistics/RiderApplyLink';
import {
  addCompanyRiderApi, approveCompanyRiderApi, getCompanyRiderApi, getCompanyRidersApi, reactivateCompanyRiderApi,
  rejectCompanyRiderApi, resendRiderActivationApi, suspendCompanyRiderApi,
} from '../../api/logisticsRiders';
import type { LogisticsHubRow, LogisticsRiderRow, LogisticsRidersSummary, RiderStatus } from '../../types';
import {
  compact, dobError, emailError, fileError, firstErrors, licenseExpiryError, licenseNumberError, manilaToday, nameError, phoneError,
} from '../../utils/accountRules';
import { HeroStats } from '../../components/logistics/CourierKit';

const TONE: Record<RiderStatus, PillTone> = { ACTIVE: 'emerald', PENDING: 'amber', DISAPPROVED: 'red', PENDING_ACTIVATION: 'blue', SUSPENDED: 'red' };
const LABEL: Record<RiderStatus, string> = {
  ACTIVE: 'Active', PENDING: 'Waiting for verification', DISAPPROVED: 'Not approved', PENDING_ACTIVATION: 'Pending activation', SUSPENDED: 'Suspended',
};
/** An application from the public form reads "New application", not "Waiting for verification". */
const statusLabel = (r: LogisticsRiderRow) => (r.applicant ? 'New application' : LABEL[r.status]);
const VEHICLES = ['Motorcycle', 'Tricycle', 'Car', 'Van'].map((v) => ({ value: v, label: v }));
const ACTION_LABEL: Record<string, string> = {
  'rider.added': 'Rider added', 'rider.activation_resent': 'Activation email resent', 'rider.approved': 'Approved',
  'rider.rejected': 'Rejected', 'rider.suspended': 'Suspended', 'rider.reactivated': 'Reactivated',
  'rider.vehicle_changed': 'Vehicle changed by rider', 'rider.license_changed': 'License changed by rider',
  'rider.applied': 'Applied online', 'rider.reapplied': 'Applied again', 'rider.application_approved': 'Application approved',
  'rider.application_rejected': 'Application rejected',
};

type Filter = '' | RiderStatus | 'ONLINE' | 'VERIFY' | 'APPLICATIONS';

function Jobs({ n, max }: { n: number; max: number }) {
  return (
    <div className="flex items-center gap-2" title={`${n} of ${max} active jobs`}>
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`w-2.5 h-4 rounded-sm ${i < n ? (n >= max ? 'bg-brand-red' : 'bg-stone-800') : 'bg-stone-200'}`} />
        ))}
      </div>
      <span className="tabular-nums text-[12px] text-stone-600">{n}/{max}</span>
    </div>
  );
}

function Availability({ r }: { r: LogisticsRiderRow }) {
  if (r.status !== 'ACTIVE') return <span className="text-[12px] text-stone-400">—</span>;
  return r.online
    ? <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" />Online</span>
    : <span className="inline-flex items-center gap-1.5 text-[12px] text-stone-500"><span className="w-2 h-2 rounded-full bg-stone-300" />Offline{r.last_seen_at ? ` · ${relativeTime(r.last_seen_at)}` : ''}</span>;
}

/** The courier company's riders (A13, A14, A34): add riders, verify them, suspend or reactivate, see who is Online. */
export default function LogisticsRidersPage() {
  const { showToast } = useToast();
  const [riders, setRiders] = useState<LogisticsRiderRow[] | null>(null);
  const [summary, setSummary] = useState<LogisticsRidersSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [company, setCompany] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => { getLogisticsMeApi().then((c) => setCompany({ id: c.id, name: c.name })).catch(() => setCompany(null)); }, []);

  const load = useCallback(() => {
    setFailed(false);
    getCompanyRidersApi().then((res) => { setRiders(res.data); setSummary(res.summary); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (riders ?? []).filter((r) => {
      if (filter === 'ONLINE' && !r.online) return false;
      if (filter === 'VERIFY' && !((r.status === 'PENDING' && !r.applicant) || r.needs_reverification)) return false;
      if (filter === 'APPLICATIONS' && !r.applicant) return false;
      if (filter && !['ONLINE', 'VERIFY', 'APPLICATIONS'].includes(filter) && r.status !== filter) return false;
      return !q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)
        || r.plate_number.toLowerCase().includes(q) || (r.license_number ?? '').toLowerCase().includes(q);
    });
  }, [riders, filter, search]);

  const max = summary?.max_active_jobs ?? 3;

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={Bike} eyebrow="Network" title="Riders" subtitle={`Add your riders, verify them and see who is online. Each rider holds up to ${max} jobs at a time.`}>
        {summary && (
          <HeroStats items={[
            { label: 'Online now', value: summary.online, tone: summary.online ? 'good' : 'warn' },
            { label: 'Active', value: summary.active },
            { label: 'To activate', value: summary.pending_activation, tone: summary.pending_activation ? 'warn' : 'default' },
          ]} />
        )}
        <button type="button" className={HERO_BUTTON} onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add rider</button>
      </PageHero>

      {company && (
        <RiderApplyLink
          query={`courier=${company.id}`}
          title="Rider application link"
          hint="Riders who apply through it choose one of your hubs. The application shows up under Applications here and in that hub's Riders page."
          fileName={`rider-application-${company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        />
      )}

      <FilterPanel>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <StatusTabs
            label="Filter riders"
            value={filter}
            onChange={setFilter}
            options={[
              { value: '', label: 'All', count: summary?.total ?? null },
              { value: 'ONLINE', label: 'Online', count: summary?.online ?? null },
              { value: 'ACTIVE', label: 'Active', count: summary?.active ?? null },
              { value: 'APPLICATIONS', label: 'Applications', count: summary?.applications ?? null },
              { value: 'PENDING_ACTIVATION', label: 'Pending activation', count: summary?.pending_activation ?? null },
              { value: 'VERIFY', label: 'Needs verification', count: summary?.pending_verification ?? null },
              { value: 'SUSPENDED', label: 'Suspended', count: summary?.suspended ?? null },
            ]}
          />
          <div className="lg:w-[360px]">
            <SearchField value={search} onChange={setSearch} label="Search riders" placeholder="Name, email, plate or license…" />
          </div>
        </div>
      </FilterPanel>

      {failed ? <ListError message="The riders could not be loaded." onRetry={load} /> : (
        <ListCard title="Riders" count={shown.length} busy={!riders}>
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>Rider</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Availability</th>
                  <th scope="col" className={TH}>Active jobs</th>
                  <th scope="col" className={`${TH} text-right`}>Delivered today</th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>Vehicle</th>
                  <th scope="col" className={`${TH} hidden xl:table-cell`}>License</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!riders && <SkeletonRows cols={7} />}
                {riders && shown.length === 0 && (
                  <tr><td colSpan={7}><ListEmpty icon={Bike} title="No riders here" hint="Use Add rider to add someone who delivers for you. They get an email to set their password." filtered={Boolean(search || filter)} onClear={() => { setSearch(''); setFilter(''); }} /></td></tr>
                )}
                {shown.map((r) => (
                  <tr key={r.id} className={ROW} {...rowKeys(() => setOpenId(r.id))}>
                    <td className={TD}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={r.name} src={r.avatar_url} size="md" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate text-brand-black">{r.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        <Pill tone={TONE[r.status]}>{statusLabel(r)}</Pill>
                        {r.needs_reverification && r.status === 'ACTIVE' && <Pill tone="amber">Re-verify documents</Pill>}
                      </div>
                    </td>
                    <td className={TD}><Availability r={r} /></td>
                    <td className={TD}>{r.status === 'ACTIVE' || r.active_jobs > 0 ? <Jobs n={r.active_jobs} max={max} /> : <span className="text-stone-400">—</span>}</td>
                    <td className={`${TD} text-right tabular-nums font-semibold text-stone-800`}>{r.delivered_today}</td>
                    <td className={`${TD} hidden md:table-cell text-gray-600`}>{r.vehicle_type} · <span className="font-mono text-[12px]">{r.plate_number}</span></td>
                    <td className={`${TD} hidden xl:table-cell text-gray-600`}>
                      {r.license_number ? <span className="font-mono text-[12px]">{r.license_number}</span> : '—'}
                      {r.license_expiry && <span className={`block text-[11px] ${r.license_expiry < manilaToday() ? 'text-red-600 font-semibold' : 'text-stone-400'}`}>Expires {formatShortDate(r.license_expiry)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListCard>
      )}

      <AddRiderPanel open={adding} onClose={() => setAdding(false)} onAdded={(msg) => { setAdding(false); showToast(msg); load(); }} />
      <RiderPanel id={openId} onClose={() => setOpenId(null)} onChanged={(msg) => { showToast(msg); load(); }} max={max} />
    </div>
  );
}

// ─── Rider record ────────────────────────────────────────────────────────────

function RiderPanel({ id, onClose, onChanged, max }: { id: number | null; onClose: () => void; onChanged: (msg: string) => void; max: number }) {
  const { showToast } = useToast();
  const [rider, setRider] = useState<LogisticsRiderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [dialogError, setDialogError] = useState<string | undefined>();

  const reload = useCallback(() => { if (id) getCompanyRiderApi(id).then(setRider).catch(() => setRider(null)); }, [id]);
  useEffect(() => { setRider(null); reload(); }, [reload]);

  async function act(run: () => Promise<{ message: string }>) {
    setBusy(true);
    try {
      const res = await run();
      onChanged(res.message);
      setDialog(null);
      reload();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err) ? err.response?.data : null;
      const msg = data?.errors?.reason?.[0] ?? data?.message ?? 'That did not work. Please try again.';
      if (dialog) setDialogError(msg); else showToast(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  const verifiable = rider && (rider.status === 'PENDING' || (rider.status === 'ACTIVE' && rider.needs_reverification));

  return (
    <SidePanel open={id !== null} onClose={onClose} title={rider?.name ?? 'Rider'}
      subtitle={rider ? <span className="inline-flex items-center gap-2"><Pill tone={TONE[rider.status]}>{statusLabel(rider)}</Pill><Availability r={rider} /></span> : 'Loading…'}
      footer={rider && (
        <div className="flex flex-wrap gap-2 justify-end">
          {rider.status === 'PENDING_ACTIVATION' && (
            <button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => act(() => resendRiderActivationApi(rider.id))}>
              <span className="inline-flex items-center gap-1.5"><RotateCw className="w-4 h-4" /> Resend activation</span>
            </button>
          )}
          {verifiable && (
            <>
              <button type="button" className={BUTTON.ghost} disabled={busy} onClick={() => { setDialogError(undefined); setDialog('reject'); }}>
                <span className="inline-flex items-center gap-1.5"><UserX className="w-4 h-4" /> Reject</span>
              </button>
              <button type="button" className={BUTTON.dark} disabled={busy} onClick={() => act(() => approveCompanyRiderApi(rider.id))}>
                <span className="inline-flex items-center gap-1.5"><UserCheck className="w-4 h-4" /> Approve</span>
              </button>
            </>
          )}
          {(rider.status === 'ACTIVE' || (rider.status === 'PENDING' && !rider.applicant)) && (
            <button type="button" className={BUTTON.danger} disabled={busy} onClick={() => { setDialogError(undefined); setDialog('suspend'); }}>
              <span className="inline-flex items-center gap-1.5"><ShieldOff className="w-4 h-4" /> Suspend</span>
            </button>
          )}
          {rider.status === 'SUSPENDED' && (
            <button type="button" className={BUTTON.dark} disabled={busy} onClick={() => act(() => reactivateCompanyRiderApi(rider.id))}>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Reactivate</span>
            </button>
          )}
        </div>
      )}
    >
      {!rider ? <p className="text-sm text-stone-400">Loading…</p> : (
        <div className="space-y-5">
          {rider.status === 'SUSPENDED' && rider.suspension_reason && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"><span className="font-semibold">Suspended:</span> {rider.suspension_reason}</p>
          )}
          {rider.status === 'DISAPPROVED' && rider.rejection_reason && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"><span className="font-semibold">Not approved:</span> {rider.rejection_reason}</p>
          )}
          {rider.applicant && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              Applied online {rider.applied_at ? relativeTime(rider.applied_at) : ''} to ride for {rider.hub_name ?? 'one of your hubs'}. Check the documents below.
              Approving emails them a link to set their password; the hub can decide too.
            </p>
          )}
          {rider.needs_reverification && rider.status === 'ACTIVE' && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">The rider changed their vehicle or license documents. Open them below, then approve or reject.</p>
          )}
          {rider.status === 'PENDING_ACTIVATION' && (
            <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
              Activation email sent {rider.activation_sent_at ? relativeTime(rider.activation_sent_at) : ''}. The link works until{' '}
              {rider.activation_expires_at ? new Date(rider.activation_expires_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            {[
              ['Email', rider.email], ['Mobile', rider.phone], ['Date of birth', formatShortDate(rider.date_of_birth)],
              ['Hub', rider.hub_name ?? '—'], ['Vehicle', rider.vehicle_type], ['Plate', rider.plate_number],
              ['License no.', rider.license_number ?? '—'], ['License expiry', rider.license_expiry ? formatShortDate(rider.license_expiry) : '—'],
              ['Delivered today', String(rider.delivered_today)], ['Added', formatShortDate(rider.created_at)],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wide text-stone-400">{k}</dt><dd className="mt-0.5 font-medium text-stone-900 break-words">{v || '—'}</dd></div>
            ))}
            <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-stone-400">Active jobs</dt><dd className="mt-1"><Jobs n={rider.active_jobs} max={max} /></dd></div>
          </dl>

          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">Documents</h3>
            <div className="mt-2 grid gap-2">
              {(rider.documents ?? []).map((d) => (
                <button key={d.key} type="button" onClick={() => openAuthorizedFile(d.url).catch(() => showToast('The document could not be opened.', 'error'))}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 px-3.5 py-2.5 text-left hover:border-stone-400">
                  <FileText className="w-4 h-4 text-brand-red" />
                  <span className="text-[13px] font-medium text-stone-800">{d.label}</span>
                  <span className="ml-auto text-[12px] text-brand-red font-semibold">Open</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">Audit log</h3>
            <ol className="mt-2 space-y-2">
              {(rider.audit ?? []).length === 0 && <li className="text-[12.5px] text-stone-400">No entries yet.</li>}
              {(rider.audit ?? []).map((a) => (
                <li key={a.id} className="rounded-xl border border-stone-100 bg-stone-50 px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-stone-900">{ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="text-[11.5px] text-stone-400 tabular-nums">{a.created_at ? new Date(a.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
                  </div>
                  <p className="text-[12px] text-stone-500">by {a.actor}</p>
                  {a.reason && <p className="mt-1 text-[12.5px] text-stone-700">“{a.reason}”</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <ReasonDialog
        open={dialog === 'reject'}
        onClose={() => setDialog(null)}
        title="Reject this rider"
        intro="The rider is told this reason and cannot go Online."
        confirmLabel="Reject rider"
        quickPicks={['OR/CR photo is unreadable, please re-upload.', 'License is expired or does not match the name.']}
        busy={busy}
        error={dialogError}
        onConfirm={(reason) => rider && act(() => rejectCompanyRiderApi(rider.id, reason))}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        onClose={() => setDialog(null)}
        title="Suspend this rider"
        intro="The rider goes Offline and cannot go Online. Pickups not yet picked up move to the Unassigned queue; parcels already picked up stay with the rider."
        confirmLabel="Suspend rider"
        quickPicks={['Repeated late deliveries this week.', 'Customer complaint under review.']}
        busy={busy}
        error={dialogError}
        onConfirm={(reason) => rider && act(() => suspendCompanyRiderApi(rider.id, reason))}
      />
    </SidePanel>
  );
}

// ─── Add rider ───────────────────────────────────────────────────────────────

const EMPTY = { first_name: '', last_name: '', date_of_birth: '', email: '', phone: '', license_number: '', license_expiry: '', vehicle_type: '', plate_number: '', sorting_center_id: '' };

function AddRiderPanel({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [license, setLicense] = useState<File | null>(null);
  const [orCr, setOrCr] = useState<File | null>(null);
  const [hubs, setHubs] = useState<LogisticsHubRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY); setLicense(null); setOrCr(null); setErrors({}); setServerError('');
    getLogisticsHubsApi({ status: 'APPROVED' }).then(setHubs).catch(() => setHubs([]));
  }, [open]);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const problems = compact({
      first_name: nameError(form.first_name, 'First name'),
      last_name: nameError(form.last_name, 'Last name'),
      date_of_birth: dobError(form.date_of_birth),
      email: emailError(form.email),
      phone: phoneError(form.phone),
      license_number: licenseNumberError(form.license_number),
      license_expiry: licenseExpiryError(form.license_expiry),
      vehicle_type: form.vehicle_type ? undefined : 'Choose the vehicle type.',
      plate_number: form.plate_number.trim() ? undefined : 'Plate number is required.',
      drivers_license_image: fileError(license, "the driver's license", { pdf: true }),
      or_cr_image: fileError(orCr, 'the vehicle OR/CR', { pdf: true }),
    });
    setErrors(problems);
    if (Object.keys(problems).length) return;

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v.trim()) fd.append(k, k === 'email' ? v.trim().toLowerCase() : v.trim()); });
    fd.append('drivers_license_image', license as File);
    fd.append('or_cr_image', orCr as File);
    setSaving(true);
    setServerError('');
    try {
      const res = await addCompanyRiderApi(fd);
      onAdded(res.message);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        setErrors(firstErrors(err.response.data?.errors));
        setServerError('Please fix the highlighted fields.');
      } else {
        setServerError((axios.isAxiosError(err) && err.response?.data?.message) || 'The rider could not be added. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel open={open} onClose={onClose} title="Add rider" subtitle="The rider gets an email to set their password. The link works for 24 hours."
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="add-rider-form" className={BUTTON.primary} disabled={saving}>{saving ? 'Saving…' : 'Save rider'}</button>
        </div>
      )}
    >
      <form id="add-rider-form" onSubmit={submit} noValidate className="space-y-5">
        {serverError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{serverError}</p>}
        <fieldset className="grid sm:grid-cols-2 gap-3">
          <legend className="sm:col-span-2 mb-1 text-[12px] font-semibold uppercase tracking-wide text-stone-500">Rider</legend>
          <Input id="r-first" label="First name" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} error={errors.first_name} />
          <Input id="r-last" label="Last name" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} error={errors.last_name} />
          <Input id="r-dob" label="Date of birth" type="date" max={manilaToday()} value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} error={errors.date_of_birth} />
          <PhoneInput id="r-phone" label="Mobile number" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} />
          <div className="sm:col-span-2"><Input id="r-email" label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} /></div>
        </fieldset>
        <fieldset className="grid sm:grid-cols-2 gap-3">
          <legend className="sm:col-span-2 mb-1 text-[12px] font-semibold uppercase tracking-wide text-stone-500">License and vehicle</legend>
          <Input id="r-license" label="Driver's license no." placeholder="N01-23-456789" value={form.license_number} onChange={(e) => set('license_number', e.target.value.toUpperCase())} error={errors.license_number} />
          <Input id="r-expiry" label="License expiry date" type="date" min={manilaToday()} value={form.license_expiry} onChange={(e) => set('license_expiry', e.target.value)} error={errors.license_expiry} />
          <CustomSelect label="Vehicle type" required value={form.vehicle_type} onChange={(v) => set('vehicle_type', v)} options={VEHICLES} placeholder="Choose" error={errors.vehicle_type} />
          <Input id="r-plate" label="Plate number" placeholder="123ABC" value={form.plate_number} onChange={(e) => set('plate_number', e.target.value.toUpperCase())} error={errors.plate_number} />
          {hubs.length > 1 && (
            <div className="sm:col-span-2">
              <CustomSelect label="Starts at hub (optional)" value={form.sorting_center_id} onChange={(v) => set('sorting_center_id', v)}
                options={[{ value: '', label: 'Your main hub' }, ...hubs.map((h) => ({ value: String(h.id), label: h.hub_name }))]} error={errors.sorting_center_id} />
            </div>
          )}
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-stone-500">Documents</legend>
          <FileUploadZone label="Driver's license" required file={license} onChange={(f) => { setLicense(f); setErrors((e) => ({ ...e, drivers_license_image: '' })); }} onClear={() => setLicense(null)} error={errors.drivers_license_image} />
          <FileUploadZone label="Vehicle OR/CR" required file={orCr} onChange={(f) => { setOrCr(f); setErrors((e) => ({ ...e, or_cr_image: '' })); }} onClear={() => setOrCr(null)} error={errors.or_cr_image} />
        </fieldset>
      </form>
    </SidePanel>
  );
}
