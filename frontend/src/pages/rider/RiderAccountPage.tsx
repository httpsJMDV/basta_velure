import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { AlertCircle, Bike, CheckCircle2, Lock, LogOut, MessageSquare, RefreshCw, ShieldCheck, User as UserIcon, Warehouse } from 'lucide-react';
import { getRiderChatThreadsApi, updateRiderVehicleApi, getPayoutAccountApi, updatePayoutAccountApi } from '../../api/client';
import { PayoutAccountForm } from '../../components/payments/GcashKit';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import type { RiderThread, RiderVehicleType } from '../../types';
import type { RiderOutletContext } from './RiderLayout';
import RiderChatSheet from './RiderChatSheet';
import { PageHero, StateCard } from './RiderUi';
import { BTN_PRIMARY } from './riderStyles';
import CustomSelect from '../../components/ui/CustomSelect';

const VEHICLE_TYPES: RiderVehicleType[] = ['Motorcycle', 'Tricycle', 'Car', 'Van'];
const PLATE_PATTERN = /^[A-Za-z0-9\s-]+$/;
const THREADS_POLL_MS = 15000;

const COUNTERPART_LABEL = { seller: 'Seller', buyer: 'Buyer', hub: 'Hub' } as const;

type FieldErrors = Partial<Record<'vehicle_type' | 'plate_number', string>>;

const loadGcash = () => getPayoutAccountApi('rider');
const saveGcash = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('rider', p);

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export default function RiderAccountPage() {
  const { riderData, loading, error, refreshRider, chat, logout, loggingOut } = useOutletContext<RiderOutletContext>();

  return (
    <div className="max-w-3xl w-full mx-auto pb-4 space-y-4">
      <PageHero icon={UserIcon} title="Account" subtitle="Your profile, your vehicle, where you get paid, and your delivery conversations." />
      {loading && !riderData ? (
        <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 animate-pulse" aria-label="Loading your profile">
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-200" />
        </div>
      ) : error && !riderData ? (
        <StateCard icon={AlertCircle} tone="red" alert title="Could not load your profile" message={error}>
          <button type="button" onClick={refreshRider} className={BTN_PRIMARY}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </StateCard>
      ) : riderData ? (
        <>
          <ProfileCard
            name={riderData.full_name}
            hub={riderData.hub?.hub_name ?? null}
            status={riderData.status}
          />
          <VehicleForm
            vehicleType={riderData.vehicle_type}
            plateNumber={riderData.plate_number}
            onSaved={refreshRider}
          />
          <section aria-labelledby="gcash-heading" className="space-y-2">
            <h2 id="gcash-heading" className="px-1 text-xs font-bold text-gray-900 uppercase tracking-wider">GCash payouts</h2>
            <PayoutAccountForm load={loadGcash} save={saveGcash} who="your courier" tone="gray" />
          </section>
        </>
      ) : null}

      <MessagesSection onChanged={chat.refresh} />

      <LogoutSection onConfirm={logout} busy={loggingOut} />
    </div>
  );
}

// ─── Profile (read-only) ──────────────────────────────────────────────────────

function ProfileCard({ name, hub, status }: { name: string; hub: string | null; status: string }) {
  return (
    <section aria-labelledby="profile-heading" className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
      <h2 id="profile-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Profile</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-gray-500">Name</dt>
          <dd className="font-bold text-gray-900">{name}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Hub</dt>
          <dd className="font-bold text-gray-900 flex items-center gap-1.5">
            <Warehouse className="w-4 h-4 text-gray-500" aria-hidden="true" />
            {hub ?? 'No hub on file'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-gray-500">Status</dt>
          <dd className="font-bold text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            {status === 'ACTIVE' ? 'Active' : status}
          </dd>
        </div>
      </dl>
    </section>
  );
}

// ─── Vehicle form ─────────────────────────────────────────────────────────────

function VehicleForm({
  vehicleType,
  plateNumber,
  onSaved,
}: {
  vehicleType: RiderVehicleType;
  plateNumber: string;
  onSaved: () => void;
}) {
  const [type, setType] = useState<RiderVehicleType>(vehicleType);
  const [plate, setPlate] = useState(plateNumber);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);

  const dirty = type !== vehicleType || plate.trim().toUpperCase() !== plateNumber.toUpperCase();

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const trimmed = plate.trim();
    if (trimmed === '') next.plate_number = 'Vehicle plate number is required.';
    else if (trimmed.length > 20) next.plate_number = 'Plate number must not exceed 20 characters.';
    else if (!PLATE_PATTERN.test(trimmed)) next.plate_number = 'Plate number contains invalid characters.';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current || !dirty) return;

    const local = validate();
    setErrors(local);
    setSaved(false);
    setFormError(null);
    if (Object.keys(local).length > 0) return;

    busyRef.current = true;
    setSaving(true);
    try {
      const res = await updateRiderVehicleApi({ vehicle_type: type, plate_number: plate.trim() });
      setType(res.data.vehicle_type);
      setPlate(res.data.plate_number);
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const fields = (err.response.data as { errors?: Record<string, string[]> }).errors ?? {};
        setErrors({ vehicle_type: fields.vehicle_type?.[0], plate_number: fields.plate_number?.[0] });
      } else if (axios.isAxiosError(err) && err.response) {
        setFormError((err.response.data as { message?: string })?.message || 'Your vehicle could not be saved. Try again.');
      } else {
        setFormError('No connection. Check your network and try again.');
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="vehicle-heading" className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center gap-2">
        <Bike className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <h2 id="vehicle-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Vehicle</h2>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <CustomSelect
          label="Vehicle type"
          value={type}
          onChange={(v) => {
            setType(v as RiderVehicleType);
            setSaved(false);
          }}
          options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
          error={errors.vehicle_type}
        />
        <div className="space-y-1">
          <label htmlFor="plate-number" className="block text-xs font-bold text-gray-700">Plate number</label>
          <input
            id="plate-number"
            type="text"
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase());
              setSaved(false);
            }}
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            aria-invalid={errors.plate_number ? true : undefined}
            aria-describedby={errors.plate_number ? 'plate-number-error' : 'plate-number-hint'}
            className="w-full min-h-11 rounded-xl border border-gray-300 px-3 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-red/40"
          />
          {errors.plate_number ? (
            <p id="plate-number-error" role="alert" className="text-xs font-semibold text-red-700">{errors.plate_number}</p>
          ) : (
            <p id="plate-number-hint" className="text-xs text-gray-500">Letters, numbers, spaces and hyphens. Saved in capitals.</p>
          )}
        </div>

        <p className="text-xs text-gray-500">Changes take effect immediately. Your hub is not asked to re-check your documents.</p>

        {formError && <p role="alert" className="text-xs font-semibold text-red-700">{formError}</p>}
        {saved && (
          <p role="status" className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            Vehicle details saved.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !dirty}
          className="w-full sm:w-auto min-h-12 px-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save vehicle'}
        </button>
      </form>
    </section>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function MessagesSection({ onChanged }: { onChanged: () => void }) {
  const [threads, setThreads] = useState<RiderThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RiderThread | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    openRef.current = open !== null;
  }, [open]);

  const load = useCallback(async (mode: 'initial' | 'silent') => {
    if (mode === 'initial') {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await getRiderChatThreadsApi({ per_page: 50 });
      setThreads(res.data);
      setError(null);
    } catch (err: unknown) {
      if (mode === 'silent') return;
      setError(
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : 'Could not load your conversations. Check your connection.'
      );
    } finally {
      if (mode === 'initial') setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Keep the list fresh while the tab is visible. Paused while a conversation is open (it polls itself).
  useEffect(() => {
    const tick = () => {
      if (!openRef.current && document.visibilityState === 'visible') void load('silent');
    };
    const timer = setInterval(tick, THREADS_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  const closeSheet = () => {
    setOpen(null);
    void load('silent');
    onChanged();
  };

  return (
    <section aria-labelledby="messages-heading" className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <h2 id="messages-heading" className="text-xs font-bold text-gray-900 uppercase tracking-wider">Messages</h2>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Loading conversations">
          <div className="h-14 rounded-xl bg-gray-100" />
          <div className="h-14 rounded-xl bg-gray-100" />
        </div>
      ) : error ? (
        <div className="text-center space-y-3 py-4">
          <p role="alert" className="text-sm text-gray-700">{error}</p>
          <button
            type="button"
            onClick={() => void load('initial')}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">
          No conversations yet. Use the Message button on a pickup or delivery to talk to the seller, the buyer or your hub.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 -mx-2">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpen(t)}
                className="w-full min-h-14 px-2 py-2.5 flex items-start gap-3 text-left rounded-xl hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <span className="truncate">{t.recipient.name}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-gray-500">{COUNTERPART_LABEL[t.counterpart]}</span>
                  </p>
                  <p className="font-mono text-[11px] text-gray-500">{t.parcel?.tracking_number}</p>
                  {t.last_message && <p className="text-xs text-gray-600 truncate">{t.last_message.body}</p>}
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p className="text-[11px] text-gray-500">{timeAgo(t.last_message_at)}</p>
                  {t.unread > 0 && (
                    <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-black">
                      {t.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                  {t.is_closed && (
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      Closed
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <RiderChatSheet target={{ kind: 'thread', thread: open }} onClose={closeSheet} onActivity={onChanged} />}
    </section>
  );
}

// ─── Log out ──────────────────────────────────────────────────────────────────

function LogoutSection({ onConfirm, busy }: { onConfirm: () => Promise<void>; busy: boolean }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-label="Log out" className="pt-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-bold disabled:opacity-50"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        Log out
      </button>

      {confirming && (
        <LogoutConfirm
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void onConfirm();
          }}
        />
      )}
    </section>
  );
}

function LogoutConfirm({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y(dialogRef, busy ? () => undefined : onCancel);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="presentation">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-desc"
        className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl"
      >
        <div className="space-y-1">
          <h2 id="logout-title" className="text-lg font-black text-gray-900">Log out of Courier Station?</h2>
          <p id="logout-desc" className="text-sm text-gray-600">You will need to sign in again to see your pickups and deliveries.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-autofocus
            className="min-h-12 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 disabled:opacity-50"
          >
            Stay signed in
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Log out
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
