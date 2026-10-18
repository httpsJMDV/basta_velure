// The 17 regions of the Philippines with their PSGC codes (same list as App\Support\PhRegions on the server).
export const PH_REGIONS: { code: string; name: string; short: string }[] = [
  { code: '130000000', name: 'National Capital Region (NCR)', short: 'NCR' },
  { code: '140000000', name: 'Cordillera Administrative Region (CAR)', short: 'CAR' },
  { code: '010000000', name: 'Region I (Ilocos Region)', short: 'Region I' },
  { code: '020000000', name: 'Region II (Cagayan Valley)', short: 'Region II' },
  { code: '030000000', name: 'Region III (Central Luzon)', short: 'Region III' },
  { code: '040000000', name: 'Region IV-A (CALABARZON)', short: 'Region IV-A' },
  { code: '170000000', name: 'MIMAROPA Region', short: 'MIMAROPA' },
  { code: '050000000', name: 'Region V (Bicol Region)', short: 'Region V' },
  { code: '060000000', name: 'Region VI (Western Visayas)', short: 'Region VI' },
  { code: '070000000', name: 'Region VII (Central Visayas)', short: 'Region VII' },
  { code: '080000000', name: 'Region VIII (Eastern Visayas)', short: 'Region VIII' },
  { code: '090000000', name: 'Region IX (Zamboanga Peninsula)', short: 'Region IX' },
  { code: '100000000', name: 'Region X (Northern Mindanao)', short: 'Region X' },
  { code: '110000000', name: 'Region XI (Davao Region)', short: 'Region XI' },
  { code: '120000000', name: 'Region XII (SOCCSKSARGEN)', short: 'Region XII' },
  { code: '160000000', name: 'Region XIII (Caraga)', short: 'Region XIII' },
  { code: '150000000', name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)', short: 'BARMM' },
];

export const regionName = (code: string) => PH_REGIONS.find((r) => r.code === code)?.name ?? code;
