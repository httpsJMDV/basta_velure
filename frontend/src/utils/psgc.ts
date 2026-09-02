import { PH_PROVINCES } from '../data/ph-provinces';

// PSGC code → name resolver with in-memory cache.
// NCR is a region (not a province) in PSGC, so its cities are hardcoded.

const cache = new Map<string, string>();

export const NCR_PROVINCE_CODE = '130000000';

// Real PSGC codes from https://psgc.gitlab.io/api/regions/130000000/cities-municipalities/
const NCR_CITIES: Record<string, string> = {
  '133900000': 'Manila',
  '137401000': 'Mandaluyong',
  '137402000': 'Marikina',
  '137403000': 'Pasig',
  '137404000': 'Quezon City',
  '137405000': 'San Juan',
  '137501000': 'Caloocan',
  '137502000': 'Malabon',
  '137503000': 'Navotas',
  '137504000': 'Valenzuela',
  '137601000': 'Las Piñas',
  '137602000': 'Makati',
  '137603000': 'Muntinlupa',
  '137604000': 'Parañaque',
  '137605000': 'Pasay',
  '137606000': 'Pateros',
  '137607000': 'Taguig',
};

// Pre-populate cache with NCR and province slugs
cache.set(NCR_PROVINCE_CODE, 'Metro Manila (NCR)');
for (const [code, name] of Object.entries(NCR_CITIES)) {
  cache.set(code, name);
}
for (const item of PH_PROVINCES) {
  cache.set(item.value, item.label);
}

function formatTextSlug(val: string): string {
  const match = PH_PROVINCES.find(
    (p) => p.value.toLowerCase() === val.toLowerCase() || p.label.toLowerCase() === val.toLowerCase()
  );
  if (match) return match.label;
  return val
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchPsgc(code: string, preferredType: 'provinces' | 'cities-municipalities' | 'barangays'): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) return '';

  // If already text / words (not digits)
  if (/^[a-zA-Z_\s-]+$/.test(trimmed)) {
    return formatTextSlug(trimmed);
  }

  if (cache.has(trimmed)) return cache.get(trimmed)!;

  let endpoints: string[];
  if (preferredType === 'barangays') {
    endpoints = [
      `https://psgc.gitlab.io/api/barangays/${trimmed}/`,
      `https://psgc.gitlab.io/api/cities-municipalities/${trimmed}/`,
    ];
  } else if (preferredType === 'cities-municipalities') {
    endpoints = [
      `https://psgc.gitlab.io/api/cities-municipalities/${trimmed}/`,
      `https://psgc.gitlab.io/api/provinces/${trimmed}/`,
      `https://psgc.gitlab.io/api/barangays/${trimmed}/`,
    ];
  } else {
    endpoints = [
      `https://psgc.gitlab.io/api/provinces/${trimmed}/`,
      `https://psgc.gitlab.io/api/regions/${trimmed}/`,
      `https://psgc.gitlab.io/api/cities-municipalities/${trimmed}/`,
    ];
  }

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data: { code?: string; name?: string; regionName?: string } = await res.json();
        const resolvedName = data.name || data.regionName;
        if (resolvedName) {
          cache.set(trimmed, resolvedName);
          return resolvedName;
        }
      }
    } catch {
      // try next fallback
    }
  }

  return trimmed;
}

export async function resolveProvinceName(code: string): Promise<string> {
  if (!code) return '';
  if (code === NCR_PROVINCE_CODE) return 'Metro Manila (NCR)';
  return fetchPsgc(code, 'provinces');
}

export async function resolveCityName(code: string): Promise<string> {
  if (!code) return '';
  if (NCR_CITIES[code]) return NCR_CITIES[code];
  return fetchPsgc(code, 'cities-municipalities');
}

export async function resolveBarangayName(code: string): Promise<string> {
  if (!code) return '';
  return fetchPsgc(code, 'barangays');
}

/** Returns "City, Province" or "Province" label formatted in words */
export async function resolveShortLocation(
  province: string | null | undefined,
  city: string | null | undefined,
): Promise<string> {
  const cleanCity = city?.trim() ?? '';
  const cleanProv = province?.trim() ?? '';

  if (!cleanCity && !cleanProv) return '';

  const [cityName, provName] = await Promise.all([
    cleanCity ? resolveCityName(cleanCity) : Promise.resolve(''),
    cleanProv ? resolveProvinceName(cleanProv) : Promise.resolve(''),
  ]);

  if (cityName && provName && cityName.toLowerCase() !== provName.toLowerCase()) {
    return `${cityName}, ${provName}`;
  }
  return cityName || provName || '';
}

export { NCR_CITIES };
