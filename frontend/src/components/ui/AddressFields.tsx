import { useState, useEffect } from 'react';
import CustomSelect from './CustomSelect';
import Input from './Input';

interface PsgcItem { code: string; name: string; }

export interface AddressValue {
  province: string;
  city_municipality: string;
  barangay: string;
  street_address: string;
}

interface Props {
  value: AddressValue;
  onChange: (val: AddressValue) => void;
  errors?: Partial<Record<keyof AddressValue, string>>;
  streetLabel?: string;
  streetRequired?: boolean;
}

export default function AddressFields({ value, onChange, errors = {}, streetLabel = 'Street / House No. (optional)', streetRequired = false }: Props) {
  const [provinces, setProvinces] = useState<PsgcItem[]>([]);
  const [cities, setCities]       = useState<PsgcItem[]>([]);
  const [barangays, setBarangays] = useState<PsgcItem[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBrgy, setLoadingBrgy]     = useState(false);

  useEffect(() => {
    fetch('https://psgc.gitlab.io/api/provinces/')
      .then((r) => r.json())
      .then((data: PsgcItem[]) => setProvinces([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  // When editing an existing value, pre-load cities/barangays
  useEffect(() => {
    if (!value.province || provinces.length === 0) return;
    // Only fetch if cities not yet loaded for this province
    setLoadingCities(true);
    fetch(`https://psgc.gitlab.io/api/provinces/${value.province}/cities-municipalities/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => setCities([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingCities(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.province, provinces.length]);

  useEffect(() => {
    if (!value.city_municipality || cities.length === 0) return;
    setLoadingBrgy(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${value.city_municipality}/barangays/`)
      .then((r) => r.json())
      .then((data: PsgcItem[]) => setBarangays([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {})
      .finally(() => setLoadingBrgy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.city_municipality, cities.length]);

  function handleProvince(code: string) {
    onChange({ ...value, province: code, city_municipality: '', barangay: '' });
    setCities([]);
    setBarangays([]);
  }

  function handleCity(code: string) {
    onChange({ ...value, city_municipality: code, barangay: '' });
    setBarangays([]);
  }

  return (
    <div className="flex flex-col gap-3">
      <CustomSelect
        label="Province"
        required
        value={value.province}
        onChange={handleProvince}
        options={provinces.map((p) => ({ value: p.code, label: p.name }))}
        placeholder={provinces.length === 0 ? 'Loading…' : 'Select province'}
        error={errors.province}
      />
      <CustomSelect
        label="City / Municipality"
        required
        value={value.city_municipality}
        onChange={handleCity}
        options={cities.map((c) => ({ value: c.code, label: c.name }))}
        placeholder={loadingCities ? 'Loading…' : value.province ? 'Select city/municipality' : 'Select province first'}
        disabled={!value.province || loadingCities}
        error={errors.city_municipality}
      />
      <CustomSelect
        label="Barangay"
        required
        value={value.barangay}
        onChange={(v) => onChange({ ...value, barangay: v })}
        options={barangays.map((b) => ({ value: b.code, label: b.name }))}
        placeholder={loadingBrgy ? 'Loading…' : value.city_municipality ? 'Select barangay' : 'Select city first'}
        disabled={!value.city_municipality || loadingBrgy}
        error={errors.barangay}
      />
      <Input
        label={streetLabel}
        value={value.street_address}
        onChange={(e) => onChange({ ...value, street_address: e.target.value })}
        placeholder="e.g. 123 Rizal St., Unit 4B"
        required={streetRequired}
        error={errors.street_address}
      />
    </div>
  );
}
