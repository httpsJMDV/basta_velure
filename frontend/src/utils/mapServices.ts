import type { TrackingPlace } from '../types';

/**
 * Free map services used by the tracking map. All three are fair-use public services without an API key:
 * OpenStreetMap tiles, the OSRM demo router and Nominatim for finding an address. A deployment with real traffic
 * should point the VITE_ variables at its own or a paid provider (docs/api/parcel-tracking.md).
 */
export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const OSRM_URL = import.meta.env.VITE_OSRM_URL ?? 'https://router.project-osrm.org';
const GEOCODE_URL = import.meta.env.VITE_GEOCODE_URL ?? 'https://nominatim.openstreetmap.org/search';

export interface LatLng {
  lat: number;
  lng: number;
}

// ─── Finding an address ──────────────────────────────────────────────────────

const CACHE_PREFIX = 'geo:v1:';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 1100; // Nominatim allows one request a second

interface CacheEntry {
  at: number;
  point: LatLng | null;
}

function readCache(key: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    const ttl = entry.point ? HIT_TTL_MS : MISS_TTL_MS;
    return Date.now() - entry.at < ttl ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, point: LatLng | null): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), point } satisfies CacheEntry));
  } catch {
    // Storage can be full or blocked; the lookup just runs again next time.
  }
}

const memory = new Map<string, Promise<LatLng | null>>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

async function lookup(query: string): Promise<LatLng | null> {
  const cached = readCache(query);
  if (cached) return cached.point;

  // One at a time, a little apart, whoever asks.
  const result = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    try {
      const url = `${GEOCODE_URL}?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return undefined; // do not cache a failed request
      const rows = (await res.json()) as Array<{ lat: string; lon: string }>;
      const first = rows[0];
      const point = first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
      writeCache(query, point);
      return point;
    } catch {
      return undefined;
    }
  });
  queue = result.catch(() => undefined);
  return (await result) ?? null;
}

/**
 * Finds a place on the map. Tries the full address first and then falls back to the barangay and the city, because
 * street addresses are patchy on OpenStreetMap in the Philippines. Resolves to null when nothing is found.
 */
export function findPlace(place: TrackingPlace | null | undefined): Promise<LatLng | null> {
  if (!place) return Promise.resolve(null);

  const clean = (parts: Array<string | undefined>) => parts.map((p) => (p ?? '').trim()).filter(Boolean).join(', ');
  const candidates = [
    place.full_address,
    clean([place.barangay, place.city, place.province]),
    clean([place.city, place.province]),
  ].filter((q, i, all) => q !== '' && all.indexOf(q) === i);

  const key = candidates.join('|');
  const known = memory.get(key);
  if (known) return known;

  const promise = (async () => {
    for (const q of candidates) {
      const point = await lookup(q);
      if (point) return point;
    }
    return null;
  })();
  memory.set(key, promise);
  return promise;
}

// ─── Route and ETA ───────────────────────────────────────────────────────────

export interface RouteResult {
  /** [lat, lng] pairs along the road. */
  path: Array<[number, number]>;
  distanceM: number;
  durationS: number;
}

export async function fetchRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult | null> {
  try {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
    };
    const route = body.routes?.[0];
    if (!route) return null;
    return {
      path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceM: route.distance,
      durationS: route.duration,
    };
  } catch {
    return null;
  }
}

/** Straight-line distance in metres. */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
