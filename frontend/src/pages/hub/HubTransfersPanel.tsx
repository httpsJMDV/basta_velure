import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ChevronDown, ChevronUp, Clock, RefreshCw, Truck } from 'lucide-react';
import { getHubTransfersApi, sendHubTransferApi } from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import type { HubTransferGroup } from '../../types';

const POLL_MS = 30000;

function waited(iso: string | null): string {
  if (!iso) return 'just now';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * Hub to hub: parcels this hub received for a barangay another hub of the courier covers. This hub sends them on, and
 * that hub scans them in on its Parcel Intake page and sorts them. Shows nothing when there is nothing to do.
 */
export default function HubTransfersPanel() {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<HubTransferGroup[]>([]);
  const [onTheWayHere, setOnTheWayHere] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getHubTransfersApi();
      setGroups(res.data);
      setOnTheWayHere(res.meta.on_the_way_here);
    } catch {
      // Sorting still works without this panel. The next poll tries again.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [load]);

  const send = async (group: HubTransferGroup) => {
    setSending(true);
    try {
      const res = await sendHubTransferApi(group.tracking_numbers);
      showToast(`${res.message} ${group.hub.name} scans them in when they arrive.`);
      setConfirming(null);
      setOpen(null);
      await load();
    } catch (err: unknown) {
      showToast(axios.isAxiosError(err) ? err.response?.data?.message ?? 'The parcels could not be sent.' : 'The parcels could not be sent.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (groups.length === 0 && onTheWayHere === 0) return null;

  return (
    <section aria-label="Parcels for other hubs" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      {onTheWayHere > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm border-b border-blue-100 bg-blue-50 text-blue-950">
          <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">
            <span className="font-bold">{onTheWayHere} parcel{onTheWayHere === 1 ? '' : 's'}</span> on the way from other hubs.
          </span>
          <Link to="/hub/intake" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            Scan them in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {groups.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-1">
            <h2 className="text-sm font-bold text-gray-900">For other hubs</h2>
            <p className="mt-0.5 text-xs text-gray-500">Another hub of your courier delivers to these barangays. Send them on instead of sorting them here.</p>
          </div>
          <ul className="p-3 space-y-2">
            {groups.map((group) => {
              const id = group.hub.id;
              const isOpen = open === id;
              const count = group.parcel_count;
              const word = `${count} parcel${count === 1 ? '' : 's'}`;
              return (
                <li key={id} className="border border-gray-200 rounded-xl">
                  <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex items-start flex-1 min-w-0 gap-3">
                      <span className="flex items-center justify-center w-10 h-10 text-gray-700 bg-gray-100 rounded-xl shrink-0">
                        <Truck className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 break-words">{group.hub.name}</p>
                        <p className="text-xs text-gray-500">
                          {[group.hub.city, group.hub.province].filter(Boolean).join(', ')}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                          <span className="font-semibold">{word}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Waiting {waited(group.oldest_scanned_in_at)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : id)}
                        aria-expanded={isOpen}
                        className="inline-flex items-center gap-1 px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-11 hover:bg-gray-100"
                      >
                        {isOpen ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
                        Parcels
                      </button>
                      {confirming === id ? (
                        <>
                          <button type="button" disabled={sending} onClick={() => setConfirming(null)} className="px-3 text-xs font-semibold text-gray-700 rounded-lg min-h-11 hover:bg-gray-100 disabled:opacity-50">
                            Cancel
                          </button>
                          <button type="button" disabled={sending} onClick={() => void send(group)} className="inline-flex items-center gap-1.5 px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark disabled:opacity-60">
                            {sending && <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            Yes, send {word}
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirming(id)} className="px-4 text-sm font-semibold text-white rounded-xl min-h-11 bg-brand-red hover:bg-brand-red-dark">
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <ul className="grid gap-1 px-4 py-3 border-t border-gray-100 sm:grid-cols-2 lg:grid-cols-3">
                      {group.tracking_numbers.map((number) => (
                        <li key={number} className="font-mono text-xs text-gray-700 break-all">{number}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
