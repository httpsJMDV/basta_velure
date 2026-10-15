import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, X } from 'lucide-react';
import { getHubAwaitingPickupApi } from '../../api/client';
import ParcelQr from '../../components/logistics/ParcelQr';
import { useLivePolling } from '../../hooks/useLivePolling';
import type { HubAwaitingRider } from '../../types';

/** Every QR for one rider, big enough to scan from across a desk. */
function QrSheet({ group, onClose }: { group: HubAwaitingRider; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-sheet-title"
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="qr-sheet-title" className="text-lg font-black text-gray-900">
              Handover QR codes for {group.rider.name}
            </h2>
            <p className="text-xs text-gray-500">The rider opens Collect parcels, taps Scan with camera and points it at each code.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {group.parcels.map((p) => (
            <li key={p.tracking_number} className="rounded-2xl border border-gray-200 p-4 flex flex-col items-center gap-2 text-center">
              <ParcelQr value={p.tracking_number} size={200} />
              <p className="font-mono text-sm font-bold text-gray-900 break-all">{p.tracking_number}</p>
              <p className="text-xs text-gray-500">
                {p.barangay}
                {p.recipient_name && ` · ${p.recipient_name}`}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

/**
 * Parcels the hub has assigned to a rider who has not collected them yet, with a QR for each. The rider scans the QR
 * off this screen instead of a printed label, and the parcel goes out for delivery. It refreshes itself.
 */
export default function AwaitingPickupPanel() {
  const [groups, setGroups] = useState<HubAwaitingRider[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getHubAwaitingPickupApi();
      setGroups(res.data);
    } catch {
      // The panel is an extra; if it cannot load it stays as it was.
    }
  }, []);
  useLivePolling(load, 15_000);

  if (groups.length === 0) return null;
  const openGroup = groups.find((g) => g.rider.id === open) ?? null;
  const total = groups.reduce((n, g) => n + g.parcels.length, 0);

  return (
    <section aria-label="Waiting for riders to collect" className="bg-white border border-gray-200/80 shadow-xs rounded-2xl overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center" aria-hidden="true">
          <QrCode className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-gray-900">Waiting for riders to collect</h2>
          <p className="text-[11px] text-gray-500">
            {total} {total === 1 ? 'parcel' : 'parcels'} assigned. Show the QR on this screen and the rider scans it.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-gray-100">
        {groups.map((g) => (
          <li key={g.rider.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{g.rider.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {g.parcels.length} {g.parcels.length === 1 ? 'parcel' : 'parcels'} &bull; {[...new Set(g.parcels.map((p) => p.barangay).filter(Boolean))].join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(g.rider.id)}
              className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold"
            >
              <QrCode className="w-4 h-4" aria-hidden="true" />
              Show QR codes
            </button>
          </li>
        ))}
      </ul>
      {openGroup && <QrSheet group={openGroup} onClose={() => setOpen(null)} />}
    </section>
  );
}
