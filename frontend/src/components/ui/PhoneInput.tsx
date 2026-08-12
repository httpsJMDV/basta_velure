import CustomSelect from './CustomSelect';

const COUNTRY_CODES = [
  { value: '+63', label: '🇵🇭 +63', maxDigits: 10 },  // PH: 10 digits after +63 (e.g. 9171234567)
  { value: '+1',  label: '🇺🇸 +1',  maxDigits: 10 },
  { value: '+44', label: '🇬🇧 +44', maxDigits: 10 },
  { value: '+61', label: '🇦🇺 +61', maxDigits: 9  },
  { value: '+81', label: '🇯🇵 +81', maxDigits: 10 },
  { value: '+82', label: '🇰🇷 +82', maxDigits: 10 },
  { value: '+86', label: '🇨🇳 +86', maxDigits: 11 },
  { value: '+91', label: '🇮🇳 +91', maxDigits: 10 },
  { value: '+65', label: '🇸🇬 +65', maxDigits: 8  },
  { value: '+60', label: '🇲🇾 +60', maxDigits: 9  },
  { value: '+66', label: '🇹🇭 +66', maxDigits: 9  },
  { value: '+62', label: '🇮🇩 +62', maxDigits: 11 },
  { value: '+84', label: '🇻🇳 +84', maxDigits: 9  },
  { value: '+971', label: '🇦🇪 +971', maxDigits: 9 },
  { value: '+966', label: '🇸🇦 +966', maxDigits: 9 },
];

interface PhoneInputProps {
  value: string;        // full E.164 e.g. "+639171234567"
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
}

function splitPhone(full: string): { code: string; number: string } {
  const match = COUNTRY_CODES.map((c) => c.value).find((c) => full.startsWith(c));
  if (match) return { code: match, number: full.slice(match.length) };
  return { code: '+63', number: full.replace(/^\+\d+/, '') };
}

export default function PhoneInput({ value, onChange, error, label, required }: PhoneInputProps) {
  const { code, number } = splitPhone(value);
  const countryConfig = COUNTRY_CODES.find((c) => c.value === code)!;
  const maxDigits = countryConfig.maxDigits;

  function handleCode(newCode: string) {
    // Reset number when switching country to avoid length mismatch
    onChange(newCode);
  }

  function handleNumber(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, maxDigits);
    onChange(code + digits);
  }

  const isValid = number.length === 0 || number.length === maxDigits;
  const combinedError = error ?? (!isValid && number.length > 0 ? `Must be exactly ${maxDigits} digits for ${code}` : undefined);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-brand-gray-mid">
          {label}{required && <span className="text-brand-red ml-0.5">*</span>}
        </label>
      )}
      <div className="flex gap-2 min-w-0">
        <CustomSelect
          value={code}
          onChange={handleCode}
          options={COUNTRY_CODES}
          className="w-32 shrink-0"
        />
        <input
          type="tel"
          inputMode="numeric"
          placeholder={code === '+63' ? '9171234567' : `${maxDigits} digits`}
          value={number}
          onChange={(e) => handleNumber(e.target.value)}
          maxLength={maxDigits}
          className={[
            'min-h-[44px] flex-1 min-w-0 rounded-lg border px-4 py-2.5 text-sm',
            'bg-white text-brand-black placeholder-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
            'transition-colors duration-150',
            combinedError ? 'border-red-500' : 'border-gray-300',
          ].join(' ')}
        />
      </div>
      {combinedError && <p className="text-xs text-red-600">{combinedError}</p>}
    </div>
  );
}
