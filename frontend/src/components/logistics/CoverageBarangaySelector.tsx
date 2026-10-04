import { useState, useEffect } from 'react';
import CustomSelect from '../ui/CustomSelect';
import { Plus, X, MapPin, Check, Trash2, Layers } from 'lucide-react';

export interface SelectedBarangay {
  code: string;
  name: string;
  cityCode: string;
  cityName: string;
  provinceName?: string;
}

interface Props {
  selected: SelectedBarangay[];
  onChange: (items: SelectedBarangay[]) => void;
  error?: string;
  disabled?: boolean;
}

interface PsgcOption {
  code: string;
  name: string;
}

const NCR_REGION_CODE = '130000000';

export default function CoverageBarangaySelector({
  selected,
  onChange,
  error,
  disabled = false,
}: Props) {
  // Cascading picker state
  const [regions, setRegions] = useState<PsgcOption[]>([]);
  const [provinces, setProvinces] = useState<PsgcOption[]>([]);
  const [cities, setCities] = useState<PsgcOption[]>([]);
  const [barangays, setBarangays] = useState<PsgcOption[]>([]);

  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedProvinceName, setSelectedProvinceName] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedCityName, setSelectedCityName] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // 1. Load regions
  useEffect(() => {
    let active = true;
    setLoadingRegions(true);
    fetch('https://psgc.gitlab.io/api/regions/')
      .then((r) => r.json())
      .then((data: Array<{ code: string; name: string; regionName?: string }>) => {
        if (!active) return;
        const sorted = data.map((d) => ({
          code: d.code,
          name: d.regionName ? `${d.regionName} (${d.name})` : d.name,
        })).sort((a, b) => a.name.localeCompare(b.name));
        setRegions(sorted);
      })
      .catch(() => {
        if (active) setRegions([]);
      })
      .finally(() => {
        if (active) setLoadingRegions(false);
      });
    return () => { active = false; };
  }, []);

  // 2. Load provinces when region changes
  useEffect(() => {
    if (!selectedRegion) {
      setProvinces([]);
      return;
    }

    if (selectedRegion === NCR_REGION_CODE) {
      setProvinces([{ code: NCR_REGION_CODE, name: 'Metro Manila (NCR)' }]);
      setSelectedProvince(NCR_REGION_CODE);
      setSelectedProvinceName('Metro Manila (NCR)');
      return;
    }

    let active = true;
    setLoadingProvinces(true);
    fetch(`https://psgc.gitlab.io/api/regions/${selectedRegion}/provinces/`)
      .then((r) => r.json())
      .then((data: PsgcOption[]) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setProvinces(sorted);
      })
      .catch(() => {
        if (active) setProvinces([]);
      })
      .finally(() => {
        if (active) setLoadingProvinces(false);
      });
    return () => { active = false; };
  }, [selectedRegion]);

  // 3. Load cities when province changes
  useEffect(() => {
    if (!selectedProvince) {
      setCities([]);
      return;
    }

    let active = true;
    setLoadingCities(true);
    const url = selectedRegion === NCR_REGION_CODE
      ? `https://psgc.gitlab.io/api/regions/${NCR_REGION_CODE}/cities-municipalities/`
      : `https://psgc.gitlab.io/api/provinces/${selectedProvince}/cities-municipalities/`;

    fetch(url)
      .then((r) => r.json())
      .then((data: PsgcOption[]) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setCities(sorted);
      })
      .catch(() => {
        if (active) setCities([]);
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => { active = false; };
  }, [selectedRegion, selectedProvince]);

  // 4. Load barangays when city changes
  useEffect(() => {
    if (!selectedCity) {
      setBarangays([]);
      return;
    }

    let active = true;
    setLoadingBarangays(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity}/barangays/`)
      .then((r) => r.json())
      .then((data: PsgcOption[]) => {
        if (!active) return;
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setBarangays(sorted);
      })
      .catch(() => {
        if (active) setBarangays([]);
      })
      .finally(() => {
        if (active) setLoadingBarangays(false);
      });
    return () => { active = false; };
  }, [selectedCity]);

  // Handlers for resets
  function handleRegionChange(code: string) {
    setSelectedRegion(code);
    const isNcr = code === NCR_REGION_CODE;
    setSelectedProvince(isNcr ? NCR_REGION_CODE : '');
    setSelectedProvinceName(isNcr ? 'Metro Manila (NCR)' : '');
    setSelectedCity('');
    setSelectedCityName('');
    setSelectedBarangay('');
    setCities([]);
    setBarangays([]);
  }

  function handleProvinceChange(code: string) {
    const match = provinces.find((p) => p.code === code);
    setSelectedProvince(code);
    setSelectedProvinceName(match ? match.name : '');
    setSelectedCity('');
    setSelectedCityName('');
    setSelectedBarangay('');
    setBarangays([]);
  }

  function handleCityChange(code: string) {
    const match = cities.find((c) => c.code === code);
    setSelectedCity(code);
    setSelectedCityName(match ? match.name : '');
    setSelectedBarangay('');
  }

  // Add a single barangay
  function handleAddBarangay() {
    if (!selectedBarangay || !selectedCity) return;
    const match = barangays.find((b) => b.code === selectedBarangay);
    if (!match) return;

    // Check duplicate
    if (selected.some((item) => item.code === match.code)) return;

    onChange([
      ...selected,
      {
        code: match.code,
        name: match.name,
        cityCode: selectedCity,
        cityName: selectedCityName || 'City',
        provinceName: selectedProvinceName,
      },
    ]);
    setSelectedBarangay('');
  }

  // Add all barangays in current city
  function handleAddAllInCity() {
    if (!selectedCity || barangays.length === 0) return;

    const existingCodes = new Set(selected.map((s) => s.code));
    const newItems: SelectedBarangay[] = [];

    for (const b of barangays) {
      if (!existingCodes.has(b.code)) {
        newItems.push({
          code: b.code,
          name: b.name,
          cityCode: selectedCity,
          cityName: selectedCityName || 'City',
          provinceName: selectedProvinceName,
        });
        existingCodes.add(b.code);
      }
    }

    if (newItems.length > 0) {
      onChange([...selected, ...newItems]);
    }
  }

  // Remove single barangay
  function handleRemove(code: string) {
    onChange(selected.filter((s) => s.code !== code));
  }

  // Clear all
  function handleClearAll() {
    onChange([]);
  }

  const isCurrentBarangayAlreadySelected = selected.some((s) => s.code === selectedBarangay);

  // Group selected barangays by city for organized display
  const groupedByCity = selected.reduce<Record<string, SelectedBarangay[]>>((acc, item) => {
    const key = item.cityName || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-sm font-medium text-brand-gray-mid">
          Coverage Barangays <span className="text-brand-red">*</span>
        </label>
        <p className="text-xs text-gray-500 mt-0.5">
          Select all barangays served by this sorting hub. You can add barangays across multiple cities.
        </p>
      </div>

      {/* Cascading Picker Area */}
      <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/90 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <CustomSelect
            label="Filter Region"
            value={selectedRegion}
            onChange={handleRegionChange}
            options={regions.map((r) => ({ value: r.code, label: r.name }))}
            placeholder={loadingRegions ? 'Loading regions…' : '1. Choose region'}
            disabled={disabled || loadingRegions}
          />
          <CustomSelect
            label="Filter Province"
            value={selectedProvince}
            onChange={handleProvinceChange}
            options={provinces.map((p) => ({ value: p.code, label: p.name }))}
            placeholder={
              loadingProvinces
                ? 'Loading provinces…'
                : selectedRegion === NCR_REGION_CODE
                ? 'Metro Manila (NCR)'
                : selectedRegion
                ? '2. Choose province'
                : 'Select region first'
            }
            disabled={disabled || !selectedRegion || loadingProvinces || selectedRegion === NCR_REGION_CODE}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <CustomSelect
            label="Filter City / Municipality"
            value={selectedCity}
            onChange={handleCityChange}
            options={cities.map((c) => ({ value: c.code, label: c.name }))}
            placeholder={
              loadingCities
                ? 'Loading cities…'
                : selectedProvince
                ? '3. Choose city/municipality'
                : 'Select province first'
            }
            disabled={disabled || !selectedProvince || loadingCities}
          />

          <CustomSelect
            label="Select Barangay"
            value={selectedBarangay}
            onChange={(val) => setSelectedBarangay(val)}
            options={barangays.map((b) => ({
              value: b.code,
              label: selected.some((s) => s.code === b.code) ? `✓ ${b.name} (Added)` : b.name,
            }))}
            placeholder={
              loadingBarangays
                ? 'Loading barangays…'
                : selectedCity
                ? '4. Choose barangay'
                : 'Select city first'
            }
            disabled={disabled || !selectedCity || loadingBarangays}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || !selectedBarangay || isCurrentBarangayAlreadySelected}
              onClick={handleAddBarangay}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors',
                disabled || !selectedBarangay || isCurrentBarangayAlreadySelected
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-red text-white hover:bg-brand-wine active:scale-95',
              ].join(' ')}
            >
              {isCurrentBarangayAlreadySelected ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  Already Added
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Add Barangay
                </>
              )}
            </button>

            {selectedCity && barangays.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={handleAddAllInCity}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                title={`Add all ${barangays.length} barangays in ${selectedCityName}`}
              >
                <Layers className="w-3.5 h-3.5 text-brand-red" />
                Add All in {selectedCityName || 'City'} ({barangays.length})
              </button>
            )}
          </div>

          {selected.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Selected Coverage Chips Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-brand-red" />
            Selected Coverage Area ({selected.length} {selected.length === 1 ? 'barangay' : 'barangays'})
          </span>
          {Object.keys(groupedByCity).length > 0 && (
            <span className="text-[11px] text-gray-500 font-normal">
              Across {Object.keys(groupedByCity).length} {Object.keys(groupedByCity).length === 1 ? 'city/municipality' : 'cities/municipalities'}
            </span>
          )}
        </div>

        {selected.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-4 text-center">
            <p className="text-xs text-gray-400">No coverage barangays added yet.</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Use the dropdowns above to add at least 1 barangay to your hub's service area.</p>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto p-2.5 rounded-xl border border-gray-200 bg-white space-y-2.5">
            {Object.entries(groupedByCity).map(([cityName, items]) => (
              <div key={cityName} className="space-y-1.5">
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <span>{cityName}</span>
                  <span className="text-gray-400 font-normal">({items.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <span
                      key={item.code}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-brand-black border border-red-200 shadow-2xs hover:border-red-300 transition-colors group"
                    >
                      <span className="font-semibold text-brand-red">{item.name}</span>
                      <span className="text-[10px] text-gray-400 font-mono">({item.code})</span>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.code)}
                        disabled={disabled}
                        aria-label={`Remove ${item.name} from coverage`}
                        className="text-gray-400 hover:text-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
