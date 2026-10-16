import { LocateFixed, Loader2, Lock, MapPinOff } from 'lucide-react';
import type { BeaconState } from '../../hooks/useRiderLocationBeacon';

interface RiderLocationGateProps {
  state: BeaconState;
  activeParcels: number;
  onAsk: () => void;
}

/**
 * Shown in place of the courier pages while the rider has parcels and their location is not being shared. The people
 * waiting for those parcels follow them on a map through this phone, so the screens stay locked until it is on.
 */
export function RiderLocationGate({ state, activeParcels, onAsk }: RiderLocationGateProps) {
  const parcels = `${activeParcels} parcel${activeParcels === 1 ? '' : 's'}`;

  const copy: Record<Exclude<BeaconState, 'idle' | 'sharing'>, { title: string; body: string; action: string | null; icon: React.ElementType }> = {
    starting: {
      title: 'Turn on your location',
      body: 'Allow location when your phone asks. This is how the buyer, the seller and the hub follow the parcel on the map.',
      action: 'Turn on location',
      icon: LocateFixed,
    },
    denied: {
      title: 'Location is blocked',
      body: 'Open your browser settings for this site, set Location to Allow, then come back and tap Try again. On most phones: tap the lock icon next to the address, then Permissions, then Location.',
      action: 'Try again',
      icon: MapPinOff,
    },
    unavailable: {
      title: 'Looking for your location',
      body: 'Your phone cannot find its position yet. Turn on GPS (Location in your quick settings), step outside if you are indoors, then tap Try again.',
      action: 'Try again',
      icon: MapPinOff,
    },
    unsupported: {
      title: 'This browser cannot share a location',
      body: 'Open Courier Station in Chrome, Safari, Edge or Firefox on your phone to carry parcels.',
      action: null,
      icon: MapPinOff,
    },
    insecure: {
      title: 'Open the secure version of this page',
      body: 'Phones only share their location with pages that start with https://. Open the courier site with its https address (or localhost on this computer) and sign in again.',
      action: null,
      icon: Lock,
    },
  };

  if (state === 'idle' || state === 'sharing') return null;
  const c = copy[state];
  const Icon = c.icon;

  return (
    <div className="max-w-md mx-auto mt-6 sm:mt-12 bg-white border border-gray-200/80 shadow-xs rounded-2xl p-6 text-center space-y-4" role="alert">
      <div className="w-14 h-14 rounded-2xl bg-rose-50 text-brand-red border border-rose-100 flex items-center justify-center mx-auto">
        {state === 'starting' ? <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" /> : <Icon className="w-6 h-6" aria-hidden="true" />}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-black text-gray-900">{c.title}</h2>
        <p className="text-sm text-gray-600 leading-relaxed">{c.body}</p>
      </div>
      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3">
        You have <span className="font-bold text-gray-800">{parcels}</span> to collect or deliver. Your phone shares its position with the map while you carry them.
      </p>
      {c.action && (
        <button
          type="button"
          onClick={onAsk}
          className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-sm font-bold transition-colors"
        >
          <LocateFixed className="w-4 h-4" aria-hidden="true" />
          {c.action}
        </button>
      )}
    </div>
  );
}
