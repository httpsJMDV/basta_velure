import { useEffect, useState } from 'react';

/**
 * Names for barangay PSGC codes ("137403017" → "Rosario, Pasig"), for the screens that store only codes (hub coverage,
 * rider delivery areas). Looked up on the same public PSGC API the address pickers use, a few at a time, and kept in
 * memory and in localStorage so each code is fetched once per browser. Until a name arrives (or if the lookup fails)
 * the code itself is shown.
 */
const PSGC = 'https://psgc.gitlab.io/api';
const STORE_KEY = 'psgc-place-names-v1';
const PARALLEL = 6;

type Place = { name: string; city: string };

const places = new Map<string, Place>();
const cities = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, Place>;
  Object.entries(saved).forEach(([code, place]) => places.set(code, place));
} catch { /* no storage: look them up again */ }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(places))); } catch { /* full or blocked */ }
}

/** "City of Pasig" reads as "Pasig"; a municipality keeps its name. */
const shortCity = (name: string) => name.replace(/^City of\s+/i, '').replace(/\s+City$/i, '');

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function cityName(code: string): Promise<string> {
  const known = cities.get(code);
  if (known !== undefined) return known;
  const city = await getJson(`${PSGC}/cities-municipalities/${code}/`);
  const name = typeof city?.name === 'string' ? shortCity(city.name) : '';
  cities.set(code, name);
  return name;
}

function lookUp(code: string): Promise<void> {
  const running = pending.get(code);
  if (running) return running;
  const job = (async () => {
    const bgy = await getJson(`${PSGC}/barangays/${code}/`);
    if (typeof bgy?.name !== 'string') return;
    const cityCode = typeof bgy.cityCode === 'string' ? bgy.cityCode : typeof bgy.municipalityCode === 'string' ? bgy.municipalityCode : '';
    places.set(code, { name: bgy.name, city: cityCode ? await cityName(cityCode) : '' });
  })().finally(() => pending.delete(code));
  pending.set(code, job);
  return job;
}

async function lookUpAll(codes: string[]): Promise<void> {
  const queue = codes.filter((c) => !places.has(c));
  const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let code = queue.shift(); code !== undefined; code = queue.shift()) await lookUp(code);
  });
  await Promise.all(workers);
  if (queue.length === 0) save();
}

/**
 * place(code): "Rosario, Pasig" once known, else the code. barangay(code): just "Rosario". sortByName: the codes in
 * name order (unknown ones last).
 */
export function usePlaceNames(codes: readonly string[] | null | undefined) {
  const [, setVersion] = useState(0);
  const key = (codes ?? []).join(',');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.some((c) => !places.has(c))) return;
    let alive = true;
    void lookUpAll(list).then(() => { if (alive) setVersion((v) => v + 1); });
    return () => { alive = false; };
  }, [key]);

  const place = (code: string) => {
    const p = places.get(code);
    return p ? (p.city ? `${p.name}, ${p.city}` : p.name) : code;
  };
  const barangay = (code: string) => places.get(code)?.name ?? code;
  const known = (code: string) => places.has(code);
  const sortByName = (list: readonly string[]) =>
    [...list].sort((a, b) => (places.has(a) ? 0 : 1) - (places.has(b) ? 0 : 1) || place(a).localeCompare(place(b)));

  return { place, barangay, known, sortByName };
}
