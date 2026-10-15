import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Home, LocateFixed, Store, Truck, Warehouse } from 'lucide-react';
import type { ParcelTracking } from '../../types';
import {
  TILE_ATTRIBUTION,
  TILE_URL,
  distanceBetween,
  fetchRoute,
  findPlace,
  formatDistance,
  formatDuration,
  type LatLng,
  type RouteResult,
} from '../../utils/mapServices';

const GLIDE_MS = 1800;
const REROUTE_METERS = 150;
const REROUTE_MS = 60_000;

function pin(icon: React.ReactElement, tone: string, label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="w-[34px] h-[34px] rounded-full ${tone} border-2 border-white shadow-lg flex items-center justify-center" title="${label}">${renderToStaticMarkup(icon)}</div>`,
  });
}

function truckIcon(flip: boolean, live: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div class="relative w-[44px] h-[44px] flex items-center justify-center">
      ${live ? '<span class="absolute inset-0 rounded-full bg-brand-red/30 animate-ping"></span>' : ''}
      <div class="relative w-[40px] h-[40px] rounded-full ${live ? 'bg-brand-red' : 'bg-gray-500'} border-[3px] border-white shadow-xl flex items-center justify-center text-white" style="transform:scaleX(${flip ? -1 : 1})">
        ${renderToStaticMarkup(<Truck size={20} strokeWidth={2.2} />)}
      </div>
    </div>`,
  });
}

const ICONS = {
  origin: pin(<Store size={16} color="white" />, 'bg-amber-500', 'Seller'),
  hub: pin(<Warehouse size={16} color="white" />, 'bg-indigo-500', 'Logistics hub'),
  destination: pin(<Home size={16} color="white" />, 'bg-emerald-600', 'Delivery address'),
};

interface TrackingMapProps {
  tracking: ParcelTracking;
  className?: string;
}

/**
 * The tracking map: seller, hub and delivery address pins, the road route from the courier to where they are going,
 * and a truck that glides to each new position the courier reports.
 */
export default function TrackingMap({ tracking, className = 'h-72' }: TrackingMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const guideLine = useRef<L.Polyline | null>(null);
  const truck = useRef<L.Marker | null>(null);
  const truckAt = useRef<LatLng | null>(null);
  const glideFrame = useRef<number | null>(null);
  const fitted = useRef(false);
  const lastRoute = useRef<{ from: LatLng; to: LatLng; at: number } | null>(null);

  const [points, setPoints] = useState<{ origin: LatLng | null; hub: LatLng | null; destination: LatLng | null }>({
    origin: null,
    hub: null,
    destination: null,
  });
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  const { courier, status } = tracking;
  const courierPoint: LatLng | null = courier.location ? { lat: courier.location.latitude, lng: courier.location.longitude } : null;
  const live = courier.state === 'live';
  const flip = (courier.location?.heading ?? 90) > 180;

  // The place the courier is heading to: the buyer when delivering; the seller and then the hub when collecting.
  const target: LatLng | null =
    courier.leg === 'delivery' ? points.destination : courier.leg === 'pickup' ? (status === 'READY_FOR_PICKUP' ? points.origin : points.hub) : null;

  // Find the three places on the map (cached, one at a time).
  const originKey = tracking.origin.full_address;
  const hubKey = tracking.hub?.full_address ?? '';
  const destinationKey = tracking.destination.full_address;
  useEffect(() => {
    let cancelled = false;
    setLookupDone(false);
    void Promise.all([findPlace(tracking.origin), findPlace(tracking.hub), findPlace(tracking.destination)]).then(([origin, hub, destination]) => {
      if (cancelled) return;
      setPoints({ origin, hub, destination });
      setLookupDone(true);
    });
    return () => {
      cancelled = true;
    };
    // The addresses are the identity of the lookup, not the object that carries them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, hubKey, destinationKey]);

  // Create the map once.
  useEffect(() => {
    if (!holder.current || map.current) return;
    const m = L.map(holder.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([12.8797, 121.774], 5);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    pinLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The sheet can still be settling when the map is made; keep the tiles matched to the box.
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(holder.current);
    return () => {
      observer.disconnect();
      if (glideFrame.current) cancelAnimationFrame(glideFrame.current);
      m.remove();
      map.current = null;
      truck.current = null;
      truckAt.current = null;
      fitted.current = false;
    };
  }, []);

  // Place pins and the dashed guide through the places.
  useEffect(() => {
    const m = map.current;
    const layer = pinLayer.current;
    if (!m || !layer) return;
    layer.clearLayers();
    if (points.origin) L.marker(points.origin, { icon: ICONS.origin, keyboard: false }).bindTooltip(tracking.origin.name || 'Seller').addTo(layer);
    if (points.hub) L.marker(points.hub, { icon: ICONS.hub, keyboard: false }).bindTooltip(tracking.hub?.name || 'Logistics hub').addTo(layer);
    if (points.destination) L.marker(points.destination, { icon: ICONS.destination, keyboard: false }).bindTooltip('Delivery address').addTo(layer);

    guideLine.current?.remove();
    const guide = [points.origin, points.hub, points.destination].filter((p): p is LatLng => p !== null);
    guideLine.current = guide.length > 1 ? L.polyline(guide, { color: '#9ca3af', weight: 3, dashArray: '6 8', opacity: 0.8 }).addTo(m) : null;
  }, [points, tracking.origin.name, tracking.hub?.name]);

  // The truck: appears at the first position and then glides to each new one.
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (!courierPoint) {
      truck.current?.remove();
      truck.current = null;
      truckAt.current = null;
      return;
    }

    if (!truck.current) {
      truck.current = L.marker(courierPoint, { icon: truckIcon(flip, live), zIndexOffset: 1000, keyboard: false }).addTo(m);
      truckAt.current = courierPoint;
      return;
    }

    truck.current.setIcon(truckIcon(flip, live));
    const from = truckAt.current ?? courierPoint;
    const to = courierPoint;
    if (from.lat === to.lat && from.lng === to.lng) return;

    if (glideFrame.current) cancelAnimationFrame(glideFrame.current);
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / GLIDE_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const here = { lat: from.lat + (to.lat - from.lat) * eased, lng: from.lng + (to.lng - from.lng) * eased };
      truck.current?.setLatLng(here);
      truckAt.current = here;
      if (t < 1) glideFrame.current = requestAnimationFrame(step);
    };
    glideFrame.current = requestAnimationFrame(step);
    // courierPoint is rebuilt each render, so key the effect on its numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierPoint?.lat, courierPoint?.lng, flip, live]);

  // Road route from the courier to where they are going. Redrawn when they move far or a minute has passed.
  useEffect(() => {
    if (!courierPoint || !target) {
      setRoute(null);
      lastRoute.current = null;
      return;
    }
    const prev = lastRoute.current;
    const moved = !prev || distanceBetween(prev.from, courierPoint) > REROUTE_METERS || distanceBetween(prev.to, target) > 5;
    const old = prev ? Date.now() - prev.at > REROUTE_MS : true;
    if (!moved && !old) return;

    const controller = new AbortController();
    lastRoute.current = { from: courierPoint, to: target, at: Date.now() };
    void fetchRoute(courierPoint, target, controller.signal).then((r) => {
      if (!controller.signal.aborted) setRoute(r);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierPoint?.lat, courierPoint?.lng, target?.lat, target?.lng]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    routeLine.current?.remove();
    routeLine.current = route ? L.polyline(route.path, { color: '#c1121f', weight: 5, opacity: 0.85, lineCap: 'round' }).addTo(m) : null;
  }, [route]);

  const fit = () => {
    const m = map.current;
    if (!m) return;
    const all = [courierPoint, points.origin, points.hub, points.destination].filter((p): p is LatLng => p !== null);
    if (all.length === 0) return;
    if (all.length === 1) {
      m.setView(all[0], 15);
      return;
    }
    m.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 16 });
  };

  // Frame everything once the places and the courier are known; after that the viewer's own panning is respected.
  useEffect(() => {
    if (fitted.current || !map.current) return;
    if (courierPoint || points.origin || points.hub || points.destination) {
      fit();
      fitted.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, courierPoint?.lat, courierPoint?.lng]);

  const nothingToShow = lookupDone && !courierPoint && !points.origin && !points.hub && !points.destination;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 ${className}`}>
      <div ref={holder} className="absolute inset-0 z-0" role="img" aria-label="Map of the parcel's route" />

      {route && (
        <div className="absolute top-3 left-3 z-[500] rounded-xl bg-white/95 backdrop-blur border border-gray-200 shadow-md px-3 py-2">
          <p className="text-sm font-black text-gray-900 leading-tight">{formatDuration(route.durationS)} away</p>
          <p className="text-[11px] text-gray-500">{formatDistance(route.distanceM)} by road</p>
        </div>
      )}

      <button
        type="button"
        onClick={fit}
        aria-label="Show the whole route"
        className="absolute top-3 right-3 z-[500] w-9 h-9 rounded-xl bg-white/95 border border-gray-200 shadow-md flex items-center justify-center text-gray-700 hover:text-brand-red"
      >
        <LocateFixed className="w-4 h-4" aria-hidden="true" />
      </button>

      {!lookupDone && !courierPoint && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-gray-100/70 text-xs font-semibold text-gray-600">Loading map...</div>
      )}
      {nothingToShow && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-gray-100/90 px-6 text-center text-xs font-semibold text-gray-600">
          The addresses on this parcel could not be found on the map. The timeline below is still up to date.
        </div>
      )}
    </div>
  );
}
