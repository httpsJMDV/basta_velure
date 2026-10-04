import { useState, useEffect } from 'react';
import CustomSelect from '../ui/CustomSelect';
import Input from '../ui/Input';

export interface PsgcItem {
  code: string;
  name: string;
}

export interface HubAddressValue {
  region: string;
  regionName: string;
  province: string;
  provinceName: string;
  city: string;
  cityName: string;
  barangay: string;
  barangayName: string;
  street: string;
}

interface Props {
  value: HubAddressValue;
  onChange: (val: HubAddressValue) => void;
  errors?: {
    region?: string;
    province?: string;
    city?: string;
    barangay?: string;
    street?: string;
  };
  disabled?: boolean;
}

const NCR_REGION_CODE = '130000000';

export default function PsgcCascadingAddress({
  value,
  onChange,
  errors = {},
  disabled = false,
}: Props) {
  const [regions, setRegions] = useState<PsgcItem[]>([]);
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities] = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // 1. Fetch regions on mount
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

  // 2. Fetch provinces when region changes
  useEffect(() => {
    if (!value.region) {
      setProvinces([]);
      return;
    }

    if (value.region === NCR_REGION_CODE) {
      setProvinces([{ code: NCR_REGION_CODE, name: 'Metro Manila (NCR)' }]);
      return;
    }

    let active = true;
    setLoadingProvinces(true);
    fetch(`https://psgc.gitlab.io/api/regions/${value.region}/provinces/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => {
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
  }, [value.region]);

  // 3. Fetch cities when province changes
  useEffect(() => {
    if (!value.province) {
      setCities([]);
      return;
    }

    let active = true;
    setLoadingCities(true);

    const url = value.region === NCR_REGION_CODE
      ? `https://psgc.gitlab.io/api/regions/${NCR_REGION_CODE}/cities-municipalities/`
      : `https://psgc.gitlab.io/api/provinces/${value.province}/cities-municipalities/`;

    fetch(url)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => {
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
  }, [value.region, value.province]);

  // 4. Fetch barangays when city changes
  useEffect(() => {
    if (!value.city) {
      setBarangays([]);
      return;
    }

    let active = true;
    setLoadingBarangays(true);

    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${value.city}/barangays/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => {
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
  }, [value.city]);

  function handleRegionChange(regionCode: string) {
    const selected = regions.find((r) => r.code === regionCode);
    const isNcr = regionCode === NCR_REGION_CODE;

    onChange({
      ...value,
      region: regionCode,
      regionName: selected ? selected.name : '',
      province: isNcr ? NCR_REGION_CODE : '',
      provinceName: isNcr ? 'Metro Manila (NCR)' : '',
      city: '',
      cityName: '',
      barangay: '',
      barangayName: '',
    });
    setCities([]);
    setBarangays([]);
  }

  function handleProvinceChange(provinceCode: string) {
    const selected = provinces.find((p) => p.code === provinceCode);
    onChange({
      ...value,
      province: provinceCode,
      provinceName: selected ? selected.name : '',
      city: '',
      cityName: '',
      barangay: '',
      barangayName: '',
    });
    setCities([]);
    setBarangays([]);
  }

  function handleCityChange(cityCode: string) {
    const selected = cities.find((c) => c.code === cityCode);
    onChange({
      ...value,
      city: cityCode,
      cityName: selected ? selected.name : '',
      barangay: '',
      barangayName: '',
    });
    setBarangays([]);
  }

  function handleBarangayChange(barangayCode: string) {
    const selected = barangays.find((b) => b.code === barangayCode);
    onChange({
      ...value,
      barangay: barangayCode,
      barangayName: selected ? selected.name : '',
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Region */}
      <CustomSelect
        label="Region"
        required
        value={value.region}
        onChange={handleRegionChange}
        options={regions.map((r) => ({ value: r.code, label: r.name }))}
        placeholder={loadingRegions ? 'Loading regions…' : 'Select region'}
        disabled={disabled || loadingRegions}
        error={errors.region}
      />

      {/* Province */}
      <CustomSelect
        label="Province"
        required
        value={value.province}
        onChange={handleProvinceChange}
        options={provinces.map((p) => ({ value: p.code, label: p.name }))}
        placeholder={
          loadingProvinces
            ? 'Loading provinces…'
            : value.region === NCR_REGION_CODE
            ? 'Metro Manila (NCR)'
            : value.region
            ? 'Select province'
            : 'Select region first'
        }
        disabled={disabled || !value.region || loadingProvinces || value.region === NCR_REGION_CODE}
        error={errors.province}
      />

      {/* City / Municipality */}
      <CustomSelect
        label="City / Municipality"
        required
        value={value.city}
        onChange={handleCityChange}
        options={cities.map((c) => ({ value: c.code, label: c.name }))}
        placeholder={
          loadingCities
            ? 'Loading cities…'
            : value.province
            ? 'Select city/municipality'
            : 'Select province first'
        }
        disabled={disabled || !value.province || loadingCities}
        error={errors.city}
      />

      {/* Barangay */}
      <CustomSelect
        label="Barangay"
        required
        value={value.barangay}
        onChange={handleBarangayChange}
        options={barangays.map((b) => ({ value: b.code, label: b.name }))}
        placeholder={
          loadingBarangays
            ? 'Loading barangays…'
            : value.city
            ? 'Select barangay'
            : 'Select city/municipality first'
        }
        disabled={disabled || !value.city || loadingBarangays}
        error={errors.barangay}
      />

      {/* Street / Building Address */}
      <Input
        label="Street / Building / Unit No."
        required
        value={value.street}
        onChange={(e) => onChange({ ...value, street: e.target.value })}
        placeholder="e.g. Blk 12 Lot 4, Industrial Logistics Park, National Hwy"
        disabled={disabled}
        error={errors.street}
      />
    </div>
  );
}
