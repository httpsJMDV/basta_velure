// Client-side copies of the account rules the API enforces (black-box workbook assumptions A2 to A16), so a form can
// show every problem at once before it is sent. The server stays the authority: its messages replace these on submit.

export const PH_MOBILE_MESSAGE = 'Enter a valid Philippine mobile number: 09XXXXXXXXX (11 digits) or +639XXXXXXXXX.';

/** "0917 123 4567", "0917-123-4567" or "+639171234567" → "+639171234567"; anything else → null. */
export function normalizePhMobile(raw: string): string | null {
  const compact = raw.trim().replace(/[\s-]+/g, '');
  let m = /^09(\d{9})$/.exec(compact);
  if (m) return `+639${m[1]}`;
  m = /^\+639(\d{9})$/.exec(compact);
  if (m) return `+639${m[1]}`;
  return null;
}

/** "+639171234567" → "09171234567" for display in a form. */
export function localPhMobile(stored: string | null | undefined): string {
  if (!stored) return '';
  const m = /^\+639(\d{9})$/.exec(stored);
  return m ? `09${m[1]}` : stored;
}

export function phoneError(raw: string, required = true): string | undefined {
  if (!raw.trim()) return required ? 'Mobile number is required.' : undefined;
  return normalizePhMobile(raw) ? undefined : PH_MOBILE_MESSAGE;
}

const NAME_RE = /^\p{L}[\p{L}\p{M} .'-]*$/u;

export function nameError(value: string, label: string, required = true): string | undefined {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return required ? `${label} is required.` : undefined;
  if (v.length < 2 || v.length > 50) return `${label} must be 2 to 50 characters.`;
  if (!NAME_RE.test(v)) return `${label} may contain letters only (spaces, hyphens, apostrophes and periods are allowed).`;
  return undefined;
}

export function emailError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address, for example name@example.com.';
  if (v.length > 100) return 'Email must be 100 characters or fewer.';
  return undefined;
}

export interface PasswordRule { key: string; label: string; ok: boolean }

/** A5: 8+ characters with an uppercase letter, a lowercase letter, a number and a special character. */
export function passwordRules(pw: string): PasswordRule[] {
  return [
    { key: 'length', label: 'At least 8 characters', ok: pw.length >= 8 },
    { key: 'upper', label: 'An uppercase letter', ok: /\p{Lu}/u.test(pw) },
    { key: 'lower', label: 'A lowercase letter', ok: /\p{Ll}/u.test(pw) },
    { key: 'number', label: 'A number', ok: /\d/.test(pw) },
    { key: 'symbol', label: 'A special character', ok: /[^\p{L}\d]/u.test(pw) },
  ];
}

export function passwordError(pw: string): string | undefined {
  if (!pw) return 'Password is required.';
  const missing = passwordRules(pw).filter((r) => !r.ok).map((r) => r.label.toLowerCase());
  return missing.length ? `Password needs ${missing.join(', ')}.` : undefined;
}

export function confirmError(pw: string, confirm: string): string | undefined {
  if (!confirm) return 'Please confirm your password.';
  return pw === confirm ? undefined : 'The passwords do not match.';
}

/** Today's date in the Philippines as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(y + years).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A6: not in the future, and 18 or older today (Manila). */
export function dobError(value: string, required = true): string | undefined {
  if (!value) return required ? 'Date of birth is required.' : undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date of birth.';
  const today = manilaToday();
  if (value > today) return 'The date of birth cannot be in the future.';
  if (addYears(value, 18) > today) return 'You must be at least 18 years old to register.';
  return undefined;
}

export const TIN_MESSAGE = 'Enter the TIN as 12 digits in the format 000-000-000-000.';

/** Formats digits as 000-000-000-000 while typing. */
export function formatTin(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{3})(?=\d)/g, '$1-');
}

export function tinError(value: string): string | undefined {
  if (!value.trim()) return 'TIN is required.';
  return /^\d{3}-\d{3}-\d{3}-\d{3}$/.test(value.trim()) ? undefined : TIN_MESSAGE;
}

export function postalError(value: string): string | undefined {
  if (!value.trim()) return 'Postal code is required.';
  return /^\d{4}$/.test(value.trim()) ? undefined : 'Enter a 4-digit postal code.';
}

export function secNumberError(value: string): string | undefined {
  if (!value.trim()) return 'SEC registration number is required.';
  return /^[A-Z]{2}\d{9}$/.test(value.trim().toUpperCase())
    ? undefined
    : 'Enter the SEC registration number as 2 letters followed by 9 digits, for example CS202012345.';
}

export function licenseNumberError(value: string): string | undefined {
  if (!value.trim()) return "Driver's license number is required.";
  return /^[A-Z]\d{2}-\d{2}-\d{6}$/.test(value.trim().toUpperCase())
    ? undefined
    : 'Enter the license number in the LTO format A00-00-000000 (1 letter and 11 digits).';
}

export function licenseExpiryError(value: string): string | undefined {
  if (!value) return 'License expiry date is required.';
  return value < manilaToday() ? "This driver's license is expired. The expiry date must be today or later." : undefined;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A10/A16: type by extension and MIME (the server also checks the content), and at most 5 MB. */
export function fileError(file: File | null, label: string, opts: { required?: boolean; pdf?: boolean } = {}): string | undefined {
  const { required = true, pdf = false } = opts;
  if (!file) return required ? `Please upload ${label}.` : undefined;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = pdf ? ['jpg', 'jpeg', 'png', 'pdf'] : ['jpg', 'jpeg', 'png'];
  const mimes = pdf ? ['image/jpeg', 'image/png', 'application/pdf'] : ['image/jpeg', 'image/png'];
  if (!allowed.includes(ext) || (file.type && !mimes.includes(file.type))) {
    return `${label[0].toUpperCase()}${label.slice(1)} must be a ${pdf ? 'JPG, PNG or PDF' : 'JPG or PNG'} file.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return `${label[0].toUpperCase()}${label.slice(1)} must be 5 MB or smaller.`;
  return undefined;
}

/** Laravel's 422 errors as one message per field. */
export function firstErrors(errors: Record<string, string[]> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}

/** Drops empty entries so `Object.keys(errs).length` counts real problems. */
export function compact(errs: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errs)) if (v) out[k] = v;
  return out;
}
