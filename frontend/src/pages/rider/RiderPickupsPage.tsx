import { useEffect, useState, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import RiderMessageControl from './RiderMessageControl';
import { groupUnread } from '../../hooks/useRiderChatUnread';
import axios from 'axios';
import {
  PackagePlus,
  Phone,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Undo2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Truck,
} from 'lucide-react';
import type { RiderOutletContext } from './RiderLayout';
import type { RiderPickedUpGroup, RiderPickupGroup, RiderPickupsMeta, RiderPickupView } from '../../types';
import {
  getRiderPickupsApi,
  getRiderPickedUpApi,
  acceptRiderPickupApi,
  declineRiderPickupApi,
  releaseRiderPickupApi,
} from '../../api/client';
import { useToast } from '../../components/ui/Toast';
import PickupHandoverScreen from './PickupHandoverScreen';

// Time formatting utilities
function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function formatFullDateTime(isoString?: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

interface ActionModalState {
  type: 'accept' | 'decline' | 'release';
  group: RiderPickupGroup;
}

export default function RiderPickupsPage() {
  const { riderData, chat } = useOutletContext<RiderOutletContext>();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<RiderPickupView>('available');
  const [pickups, setPickups] = useState<RiderPickupGroup[]>([]);
  const [pickedUp, setPickedUp] = useState<RiderPickedUpGroup[]>([]);
  const [meta, setMeta] = useState<RiderPickupsMeta>({
    available_count: 0,
    mine_count: 0,
    picked_up_count: 0,
    has_areas: true,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [handoverGroup, setHandoverGroup] = useState<RiderPickupGroup | null>(null);
  const handoverTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedTracking, setExpandedTracking] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPickups = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        setRefreshing(true);
      }
      try {
        if (activeTab === 'picked_up') {
          const response = await getRiderPickedUpApi();
          setPickedUp(response.data);
          setMeta(response.meta);
        } else {
          const response = await getRiderPickupsApi(activeTab);
          setPickups(response.data);
          setMeta(response.meta);
        }
        setLoadError(null);
      } catch (err: unknown) {
        if (!isBackground) {
          const message = axios.isAxiosError(err)
            ? err.response?.data?.message || 'Failed to load pickups'
            : 'Failed to load pickups';
          setLoadError(message);
          showToast(message, 'error');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, showToast]
  );

  // Tab change triggers initial fetch
  useEffect(() => {
    setLoading(true);
    fetchPickups(false);
  }, [fetchPickups]);

  // 30-second visibility-based polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab is visible again, fetch immediately & restart timer
        fetchPickups(true);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(() => {
          fetchPickups(true);
        }, 30000);
      } else {
        // Tab is hidden, clear timer to avoid background network noise
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial timer setup if page is visible
    if (document.visibilityState === 'visible') {
      pollTimerRef.current = setInterval(() => {
        fetchPickups(true);
      }, 30000);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchPickups]);

  // Copy tracking number or phone
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const toggleExpandTracking = (sellerId: number) => {
    setExpandedTracking((prev) => ({
      ...prev,
      [sellerId]: !prev[sellerId],
    }));
  };

  // Perform confirmed modal action
  const handleConfirmAction = async () => {
    if (!actionModal) return;
    const { type, group } = actionModal;
    setActionLoading(true);

    try {
      if (type === 'accept') {
        const res = await acceptRiderPickupApi(group.seller_id);
        showToast(res.message || `Accepted ${res.claimed_count} parcel(s) from ${group.shop_name}`, 'success');
        setActionModal(null);
        // Switch to "mine" view so rider sees their claimed pickup immediately
        setActiveTab('mine');
      } else if (type === 'decline') {
        const res = await declineRiderPickupApi(group.seller_id);
        showToast(res.message || `Pickup request from ${group.shop_name} declined`, 'success');
        setActionModal(null);
        fetchPickups(false);
      } else if (type === 'release') {
        const res = await releaseRiderPickupApi(group.seller_id);
        showToast(res.message || `Released ${res.released_count} parcel(s) back to the pool`, 'success');
        setActionModal(null);
        fetchPickups(false);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || 'Operation failed';
        showToast(msg, 'error');
        // If conflict (409) or not found (404), refresh list
        if (status === 409 || status === 404) {
          fetchPickups(false);
        }
      } else {
        showToast('Operation failed', 'error');
      }
      setActionModal(null);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Merchant Pickups
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Browse and accept collection requests from local merchants in your active delivery areas.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: Refresh Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchPickups(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-2xs transition-colors disabled:opacity-60"
            title="Refresh pickups list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-gray-500'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── No Active Areas Warning Banner ──────────────────────────── */}
      {!meta.has_areas && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-950">No Active Delivery Areas Assigned</h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              Your sorting center hub administrator has not yet assigned any active barangay delivery sectors to your courier account.
              Pickup requests only appear when you have active area assignments. Please contact your sorting center hub manager to map your coverage areas.
            </p>
          </div>
        </div>
      )}

      {/* ─── Segment / Tab Switcher ──────────────────────────────────── */}
      <div className="flex items-center border-b border-gray-200">
        <button
          onClick={() => setActiveTab('available')}
          className={`relative pb-3 px-4 text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'available'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>Available Pickups</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'available'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {meta.available_count}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('mine')}
          className={`relative pb-3 px-4 text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'mine'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>My Pickups</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'mine'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {meta.mine_count}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('picked_up')}
          className={`relative pb-3 px-4 text-xs font-bold transition-colors flex items-center gap-2 ${
            activeTab === 'picked_up'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>Picked Up</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'picked_up'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {meta.picked_up_count}
          </span>
        </button>
      </div>

      {/* ─── List Content ────────────────────────────────────────────── */}
      {loading ? (
        // Skeleton loader
        <div className="space-y-4 animate-pulse" aria-label="Loading pickups">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-gray-200/80 rounded-2xl border border-gray-200" />
          ))}
        </div>
      ) : loadError ? (
        // Error state with retry
        <div role="alert" className="bg-white border border-red-200 rounded-3xl p-8 text-center shadow-2xs space-y-4 max-w-lg mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900">Could not load pickups</h3>
          <p className="text-xs text-gray-500">{loadError}</p>
          <button
            onClick={() => fetchPickups(false)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Try again</span>
          </button>
        </div>
      ) : activeTab === 'picked_up' ? (
        pickedUp.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center shadow-2xs space-y-4 max-w-lg mx-auto my-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <Truck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Nothing to Drop Off</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Parcels you collect from merchants will be listed here until your hub scans them in.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pickedUp.map((group) => (
              <div
                key={group.seller_id}
                className="bg-white border border-gray-200/90 rounded-2xl p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-base text-gray-900">{group.shop_name}</h3>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                    <Package className="w-3.5 h-3.5" />
                    {group.parcel_count} {group.parcel_count === 1 ? 'parcel' : 'parcels'}
                  </span>
                </div>

                {group.picked_up_at && (
                  <p className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>Picked up</span>
                    <span className="font-semibold text-gray-700" title={formatFullDateTime(group.picked_up_at)}>
                      {formatRelativeTime(group.picked_up_at)}
                    </span>
                  </p>
                )}

                <ul className="flex flex-wrap gap-2">
                  {group.tracking_numbers.map((tn) => (
                    <li
                      key={tn}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono bg-gray-50 border border-gray-200 text-gray-800"
                    >
                      {tn}
                    </li>
                  ))}
                </ul>

                {group.hub ? (
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-1.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-blue-950">
                      <Truck className="w-4 h-4" aria-hidden="true" />
                      Take these to {group.hub.hub_name}
                    </p>
                    <p className="text-xs text-blue-900">{group.hub.full_address}</p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${group.hub.hub_name}, ${group.hub.full_address}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-blue-700 hover:underline"
                    >
                      <span>Open in Google Maps</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">
                    Your account has no hub on file. Ask your hub manager where to drop these parcels off.
                  </p>
                )}

                {group.tracking_numbers.length > 0 && (
                  <RiderMessageControl
                    trackingNumber={group.tracking_numbers[0]}
                    phase="pickup"
                    unread={groupUnread(chat, group.tracking_numbers).total}
                    unreadByCounterpart={groupUnread(chat, group.tracking_numbers).byCounterpart}
                    onActivity={chat.refresh}
                  />
                )}
              </div>
            ))}
          </div>
        )
      ) : pickups.length === 0 ? (
        // Empty state
        <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-12 text-center shadow-2xs space-y-4 max-w-lg mx-auto my-6">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          {activeTab === 'available' ? (
            <>
              <h3 className="text-base font-bold text-gray-900">No Pickups Available Right Now</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {meta.has_areas
                  ? 'There are currently no unclaimed pickup requests in your designated delivery areas. As soon as merchants mark orders ready, they will appear here.'
                  : 'You do not have any active delivery areas assigned. Once your hub maps your coverage barangays, requests in those areas will show up here.'}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900">No Active Pickups Claimed</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                You have not claimed any merchant pickups yet. Switch over to the Available Pickups tab to review and accept requests in your area.
              </p>
              <button
                onClick={() => setActiveTab('available')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
              >
                <span>View Available Pickups</span>
              </button>
            </>
          )}
        </div>
      ) : (
        // Pickup cards list
        <div className="space-y-4">
          {pickups.map((group) => {
            const trackingNumbers = group.tracking_numbers ?? [];
            const isExpanded = !!expandedTracking[group.seller_id];
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              group.pickup_address.full_address ||
                `${group.pickup_address.street}, ${group.pickup_address.barangay}, ${group.pickup_address.city}, ${group.pickup_address.province}`
            )}`;

            return (
              <div
                key={group.seller_id}
                className="bg-white border border-gray-200/90 hover:border-gray-300 rounded-2xl p-5 sm:p-6 shadow-2xs transition-all space-y-4"
              >
                {/* Header row: Shop Name, Area Badge, Parcel count */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                    <h3 className="font-bold text-base text-gray-900">{group.shop_name}</h3>
                    {group.matched_area_label && (
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/70">
                        {group.matched_area_label}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                      <Package className="w-3.5 h-3.5 text-blue-600" />
                      {group.parcel_count} {group.parcel_count === 1 ? 'parcel' : 'parcels'}
                    </span>
                  </div>
                </div>

                {/* Details grid: Address, Phone, Timestamps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                  {/* Left Column: Address & Location */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium text-gray-800 leading-snug">
                          {group.pickup_address.full_address ||
                            `${group.pickup_address.street}, ${group.pickup_address.barangay}, ${group.pickup_address.city}, ${group.pickup_address.province}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <span>Open in Google Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Contact Phone & Timestamps */}
                  <div className="space-y-2">
                    {/* Phone */}
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <a
                        href={`tel:${group.shop_phone}`}
                        className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                      >
                        {group.shop_phone}
                      </a>
                      <button
                        onClick={() => handleCopy(group.shop_phone, `phone-${group.seller_id}`)}
                        className="p-1 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
                        title="Copy phone number"
                      >
                        {copiedKey === `phone-${group.seller_id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Ready Since timestamp */}
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Ready for pickup:</span>
                      <span
                        className="font-semibold text-gray-700"
                        title={formatFullDateTime(group.ready_since)}
                      >
                        {formatRelativeTime(group.ready_since)}
                      </span>
                    </div>

                    {/* Accepted At timestamp if in "mine" view */}
                    {group.pickup_accepted_at && (
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Accepted by you:</span>
                        <span
                          className="font-semibold"
                          title={formatFullDateTime(group.pickup_accepted_at)}
                        >
                          {formatRelativeTime(group.pickup_accepted_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tracking numbers accordion */}
                {/* Only a group that lists its parcels (the My pickups view) has tracking numbers to show. */}
                {trackingNumbers.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between text-xs">
                      <button
                        onClick={() => toggleExpandTracking(group.seller_id)}
                        className="inline-flex items-center gap-1.5 font-bold text-gray-700 hover:text-gray-900"
                      >
                        <span>
                          {trackingNumbers.length}{' '}
                          {trackingNumbers.length === 1 ? 'Tracking Number' : 'Tracking Numbers'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </button>
  
                      <button
                        onClick={() =>
                          handleCopy(trackingNumbers.join(', '), `all-tracking-${group.seller_id}`)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                      >
                        {copiedKey === `all-tracking-${group.seller_id}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-bold">Copied all</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy all</span>
                          </>
                        )}
                      </button>
                    </div>
  
                    {isExpanded && (
                      <div className="flex flex-wrap gap-2 pt-2.5">
                        {trackingNumbers.map((tn) => (
                          <button
                            key={tn}
                            onClick={() => handleCopy(tn, tn)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 transition-colors"
                            title="Click to copy tracking number"
                          >
                            <span>{tn}</span>
                            {copiedKey === tn ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Bottom Card Actions */}
                <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
                  {activeTab === 'available' ? (
                    <>
                      <button
                        onClick={() => setActionModal({ type: 'decline', group })}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'accept', group })}
                        className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
                      >
                        <PackagePlus className="w-4 h-4" />
                        <span>Accept Pickup</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {trackingNumbers.length > 0 && (
                        <RiderMessageControl
                          trackingNumber={trackingNumbers[0]}
                          phase="pickup"
                          unread={groupUnread(chat, trackingNumbers).total}
                          unreadByCounterpart={groupUnread(chat, trackingNumbers).byCounterpart}
                          onActivity={chat.refresh}
                        />
                      )}
                      <button
                        onClick={() => setActionModal({ type: 'release', group })}
                        className="inline-flex items-center gap-1.5 min-h-11 px-4 border border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 text-xs font-bold rounded-xl transition-colors"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Release Pickup</span>
                      </button>
                      <button
                        onClick={(e) => {
                          handoverTriggerRef.current = e.currentTarget;
                          setHandoverGroup(group);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        <span>Start pickup</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Pickup Handover Screen (Feature 2.5) ────────────────────── */}
      {handoverGroup && (
        <PickupHandoverScreen
          group={handoverGroup}
          onClose={() => {
            setHandoverGroup(null);
            requestAnimationFrame(() => handoverTriggerRef.current?.focus());
          }}
          onChanged={() => fetchPickups(true)}
          onDone={() => {
            setHandoverGroup(null);
            setActiveTab('picked_up');
          }}
        />
      )}

      {/* ─── Confirmation Modal Dialog ───────────────────────────────── */}
      {actionModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border border-gray-100">
            {/* Modal Icon & Title */}
            <div className="flex items-start gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  actionModal.type === 'accept'
                    ? 'bg-blue-50 text-blue-600'
                    : actionModal.type === 'decline'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {actionModal.type === 'accept' && <PackagePlus className="w-6 h-6" />}
                {actionModal.type === 'decline' && <XCircle className="w-6 h-6" />}
                {actionModal.type === 'release' && <Undo2 className="w-6 h-6" />}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-900">
                  {actionModal.type === 'accept' && 'Accept Pickup Request'}
                  {actionModal.type === 'decline' && 'Decline Pickup Request'}
                  {actionModal.type === 'release' && 'Release Pickup to Pool'}
                </h3>
                <p className="text-xs text-gray-500">
                  {actionModal.group.shop_name} &bull; {actionModal.group.parcel_count}{' '}
                  {actionModal.group.parcel_count === 1 ? 'parcel' : 'parcels'}
                </p>
              </div>
            </div>

            {/* Modal Explanatory Body */}
            <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-600 space-y-2">
              {actionModal.type === 'accept' && (
                <p>
                  Claiming this pickup will assign the{' '}
                  <span className="font-bold text-gray-900">
                    {actionModal.group.parcel_count} parcel(s)
                  </span>{' '}
                  to you and your hub (<span className="font-semibold text-gray-900">{riderData?.hub?.hub_name}</span>).
                  Once accepted, head to the merchant&apos;s address to collect the packages.
                </p>
              )}
              {actionModal.type === 'decline' && (
                <p>
                  This pickup will be hidden from your Available tab. Other couriers assigned to this area will still be able to accept it.
                </p>
              )}
              {actionModal.type === 'release' && (
                <p>
                  Releasing this pickup removes your assignment and returns the{' '}
                  <span className="font-bold text-gray-900">
                    {actionModal.group.parcel_count} parcel(s)
                  </span>{' '}
                  back to the available pool for other couriers to accept.
                </p>
              )}

              <div className="pt-1 text-[11px] text-gray-500 font-medium">
                📍 {actionModal.group.pickup_address.full_address}
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={actionLoading}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors shadow-2xs disabled:opacity-50 ${
                  actionModal.type === 'accept'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : actionModal.type === 'decline'
                    ? 'bg-gray-900 hover:bg-gray-800'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {actionModal.type === 'accept' && 'Confirm & Accept'}
                  {actionModal.type === 'decline' && 'Confirm Decline'}
                  {actionModal.type === 'release' && 'Confirm Release'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
