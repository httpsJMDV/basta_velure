import { useState, useId } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import LovedItLogo from '../../components/LovedItLogo';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import CustomSelect from '../../components/ui/CustomSelect';
import FileUploadZone from '../../components/ui/FileUploadZone';
import PsgcCascadingAddress from '../../components/logistics/PsgcCascadingAddress';
import type { HubAddressValue } from '../../components/logistics/PsgcCascadingAddress';
import CoverageBarangaySelector from '../../components/logistics/CoverageBarangaySelector';
import type { SelectedBarangay } from '../../components/logistics/CoverageBarangaySelector';
import { registerSortingCenterApi } from '../../api/client';
import {
  Building2,
  User,
  ShieldCheck,
  FileText,
  AlertCircle,
  Truck,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import axios from 'axios';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const GOV_ID_OPTIONS = [
  { value: 'national_id',     label: 'National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport',        label: 'Passport' },
  { value: 'umid',            label: 'UMID' },
  { value: 'sss_id',          label: 'SSS ID' },
  { value: 'philhealth_id',   label: 'PhilHealth ID' },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'postal_id',       label: 'Postal ID' },
  { value: 'school_id',       label: 'School ID' },
];

const REQUIRES_BACK = new Set([
  'drivers_license',
  'umid',
  'sss_id',
  'philhealth_id',
  'voters_id',
  'postal_id',
]);

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function HubRegisterPage() {
  const navigate = useNavigate();
  const dobId = useId();

  // Form Fields State
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  // ID Uploads
  const [govIdType, setGovIdType] = useState('');
  const [govIdFront, setGovIdFront] = useState<File | null>(null);
  const [govIdBack, setGovIdBack] = useState<File | null>(null);

  // Hub Business Details
  const [hubName, setHubName] = useState('');
  const [dtiPermit, setDtiPermit] = useState<File | null>(null);
  const [hubAddress, setHubAddress] = useState<HubAddressValue>({
    region: '',
    regionName: '',
    province: '',
    provinceName: '',
    city: '',
    cityName: '',
    barangay: '',
    barangayName: '',
    street: '',
  });

  // Coverage Area Multi-Select
  const [coverageBarangays, setCoverageBarangays] = useState<SelectedBarangay[]>([]);

  // Errors & Loading
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Compute live applicant age
  const calculatedAge = calcAge(dateOfBirth);
  const needsBack = Boolean(govIdType && REQUIRES_BACK.has(govIdType));

  // Client-side validation
  function validateForm(): boolean {
    const errs: Record<string, string> = {};

    // Applicant Name
    if (!firstName.trim()) errs.first_name = 'First name is required.';
    else if (firstName.length > 50) errs.first_name = 'First name must not exceed 50 characters.';

    if (middleName.length > 50) errs.middle_name = 'Middle name must not exceed 50 characters.';

    if (!lastName.trim()) errs.last_name = 'Last name is required.';
    else if (lastName.length > 50) errs.last_name = 'Last name must not exceed 50 characters.';

    // Sex
    if (!sex) errs.sex = 'Please specify biological sex.';

    // Email
    if (!email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please provide a valid email address.';
    } else if (email.length > 100) {
      errs.email = 'Email address must not exceed 100 characters.';
    }

    // Phone
    if (!phone.trim()) {
      errs.phone = 'Phone number is required.';
    } else if (phone.length < 10) {
      errs.phone = 'Please provide a valid phone number.';
    }

    // Date of birth & age >= 18
    if (!dateOfBirth) {
      errs.date_of_birth = 'Date of birth is required.';
    } else if (calculatedAge === null || calculatedAge < 18) {
      errs.date_of_birth = 'Applicant must be at least 18 years old to operate a logistics hub.';
    }

    // Passwords
    if (!password) {
      errs.password = 'Password is required.';
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }

    if (!passwordConfirmation) {
      errs.password_confirmation = 'Please confirm your password.';
    } else if (password !== passwordConfirmation) {
      errs.password_confirmation = 'Passwords do not match.';
    }

    // Government ID
    if (!govIdType) errs.government_id_type = 'Please select your valid identification document type.';
    if (!govIdFront) errs.government_id_image = 'Please upload a photo or scan of the front of your ID.';
    if (needsBack && !govIdBack) {
      errs.government_id_image_back = `The back of ${
        GOV_ID_OPTIONS.find((o) => o.value === govIdType)?.label || 'this ID'
      } is required.`;
    }

    // Hub Info
    if (!hubName.trim()) {
      errs.hub_name = 'Hub or business name is required.';
    } else if (hubName.length > 150) {
      errs.hub_name = 'Hub name must not exceed 150 characters.';
    }

    // Hub Physical Address
    if (!hubAddress.province && !hubAddress.provinceName) {
      errs.address_province = 'Province is required for hub address.';
    }
    if (!hubAddress.city && !hubAddress.cityName) {
      errs.address_city = 'City or municipality is required for hub address.';
    }
    if (!hubAddress.barangay && !hubAddress.barangayName) {
      errs.address_barangay = 'Barangay is required for hub address.';
    }
    if (!hubAddress.street.trim()) {
      errs.address_street = 'Street or building address is required.';
    }

    // DTI / Mayor's Permit
    if (!dtiPermit) {
      errs.dti_permit = 'Official DTI registration or Mayor\'s Permit document is required.';
    }

    // Coverage Area
    if (coverageBarangays.length === 0) {
      errs.coverage_barangays = 'At least one coverage barangay must be assigned to this hub.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();

      // Applicant details
      formData.append('first_name', firstName.trim());
      if (middleName.trim()) formData.append('middle_name', middleName.trim());
      formData.append('last_name', lastName.trim());
      formData.append('sex', sex);
      formData.append('email', email.trim());
      formData.append('phone', phone.trim());
      formData.append('date_of_birth', dateOfBirth);
      formData.append('password', password);
      formData.append('password_confirmation', passwordConfirmation);

      // ID documents
      formData.append('government_id_type', govIdType);
      if (govIdFront) formData.append('government_id_image', govIdFront);
      if (govIdBack) formData.append('government_id_image_back', govIdBack);

      // Hub info
      formData.append('hub_name', hubName.trim());
      formData.append('address_province', hubAddress.provinceName || hubAddress.province);
      formData.append('address_city', hubAddress.cityName || hubAddress.city);
      formData.append('address_barangay', hubAddress.barangayName || hubAddress.barangay);
      formData.append('address_street', hubAddress.street.trim());
      if (dtiPermit) formData.append('dti_permit', dtiPermit);

      // Coverage Barangays (append each PSGC code)
      coverageBarangays.forEach((b) => {
        formData.append('coverage_barangays[]', b.code);
      });

      const response = await registerSortingCenterApi(formData);

      // Navigate to pending confirmation screen with summary
      const hubData = response.data.sorting_center;
      const addressSummary = `${hubData.address_street}, ${hubData.address_barangay}, ${hubData.address_city}, ${hubData.address_province}`;

      navigate('/register/hub/pending', {
        state: {
          hub_name: hubData.hub_name,
          address_summary: addressSummary,
          coverage_count: hubData.coverage_barangays.length,
          submitted_at: hubData.created_at || new Date().toISOString(),
          email: email.trim(),
          applicant_name: `${firstName.trim()} ${lastName.trim()}`,
        },
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 422) {
          const apiErrors = err.response.data?.errors as Record<string, string[]> | undefined;
          if (apiErrors) {
            const mapped: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(apiErrors)) {
              mapped[key] = Array.isArray(msgs) ? msgs[0] : String(msgs);
            }
            const coverageErrKey = Object.keys(apiErrors).find((k) => k.startsWith('coverage_barangays'));
            if (coverageErrKey && !mapped.coverage_barangays) {
              mapped.coverage_barangays = apiErrors[coverageErrKey][0];
            }
            setErrors((prev) => ({ ...prev, ...mapped }));
          }
          setServerError(
            err.response.data?.message || 'Please review and resolve the highlighted errors in the form.'
          );
        } else if (err.response.status === 429) {
          setServerError('Too many registration attempts. Please wait a few moments and try again.');
        } else {
          setServerError(
            err.response.data?.message || 'An error occurred while submitting your hub application. Please try again.'
          );
        }
      } else {
        setServerError('Network error. Please check your internet connection and try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Main Form Left Column */}
      <div className="flex flex-col w-full md:w-1/2 px-6 py-10 sm:px-12 lg:px-16 overflow-y-auto">
        <div className="max-w-md w-full mx-auto space-y-6">
          <Link to="/" className="inline-block group">
            <LovedItLogo
              variant="light"
              type="full"
              size="custom"
              imgClassName="h-12 sm:h-14 object-contain group-hover:opacity-95 transition-opacity"
            />
          </Link>

          {/* Page Badge & Header */}
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-red/10 border border-brand-red/20 text-brand-red text-xs font-semibold">
              <Truck className="w-3.5 h-3.5" />
              <span>Logistics &amp; Sorting Center Network</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-brand-black tracking-tight">
              Register Sorting Hub
            </h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Apply to operate an authorized sorting center and coordinate regional parcel routing on Loved-IT.
            </p>
          </div>

          {/* Server Error Alert Banner */}
          {serverError && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 text-red-700 text-xs shadow-xs"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-brand-red shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">Registration could not be completed</p>
                <p>{serverError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-7">
            {/* ── SECTION 1: APPLICANT PERSONAL DETAILS ── */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <User className="w-4 h-4 text-brand-red" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Applicant Representative Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="First Name"
                  required
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (errors.first_name) setErrors((prev) => ({ ...prev, first_name: '' }));
                  }}
                  placeholder="Juan"
                  error={errors.first_name}
                  disabled={submitting}
                />
                <Input
                  label="Middle Name (Optional)"
                  value={middleName}
                  onChange={(e) => {
                    setMiddleName(e.target.value);
                    if (errors.middle_name) setErrors((prev) => ({ ...prev, middle_name: '' }));
                  }}
                  placeholder="Santos"
                  error={errors.middle_name}
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Last Name"
                  required
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (errors.last_name) setErrors((prev) => ({ ...prev, last_name: '' }));
                  }}
                  placeholder="Dela Cruz"
                  error={errors.last_name}
                  disabled={submitting}
                />
                <CustomSelect
                  label="Sex"
                  required
                  value={sex}
                  onChange={(v) => {
                    setSex(v as 'male' | 'female');
                    if (errors.sex) setErrors((prev) => ({ ...prev, sex: '' }));
                  }}
                  options={SEX_OPTIONS}
                  placeholder="Select sex"
                  error={errors.sex}
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  placeholder="hub.admin@example.com"
                  error={errors.email}
                  disabled={submitting}
                />
                <PhoneInput
                  label="Mobile Contact"
                  required
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  error={errors.phone}
                />
              </div>

              {/* Date of Birth & Live Age Computation */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label htmlFor={dobId} className="text-sm font-medium text-brand-gray-mid">
                    Date of Birth <span className="text-brand-red">*</span>
                  </label>
                  {calculatedAge !== null && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        calculatedAge >= 18
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-brand-red border border-red-200'
                      }`}
                    >
                      {calculatedAge} years old {calculatedAge < 18 ? '(Underage)' : '(Eligible)'}
                    </span>
                  )}
                </div>
                <input
                  id={dobId}
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={dateOfBirth}
                  onChange={(e) => {
                    setDateOfBirth(e.target.value);
                    if (errors.date_of_birth) setErrors((prev) => ({ ...prev, date_of_birth: '' }));
                  }}
                  disabled={submitting}
                  className={[
                    'min-h-[44px] w-full px-4 py-2.5 text-sm rounded-xl transition-colors duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent',
                    errors.date_of_birth ? 'border border-red-500 bg-red-50/20' : 'border border-gray-300 bg-white',
                  ].join(' ')}
                />
                {errors.date_of_birth && (
                  <p className="text-xs text-red-600 font-medium" role="alert">
                    {errors.date_of_birth}
                  </p>
                )}
                <p className="text-[11px] text-gray-400">Hub representatives must be 18 years of age or older.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  placeholder="Min. 8 characters"
                  error={errors.password}
                  disabled={submitting}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  required
                  value={passwordConfirmation}
                  onChange={(e) => {
                    setPasswordConfirmation(e.target.value);
                    if (errors.password_confirmation) setErrors((prev) => ({ ...prev, password_confirmation: '' }));
                  }}
                  placeholder="Repeat password"
                  error={errors.password_confirmation}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* ── SECTION 2: APPLICANT IDENTIFICATION ── */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-brand-red" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Applicant Identity Verification
                </h2>
              </div>

              <CustomSelect
                label="Government ID Type"
                required
                value={govIdType}
                onChange={(val) => {
                  setGovIdType(val);
                  if (errors.government_id_type) setErrors((prev) => ({ ...prev, government_id_type: '' }));
                }}
                options={GOV_ID_OPTIONS}
                placeholder="Select government-issued ID"
                error={errors.government_id_type}
                disabled={submitting}
              />

              <FileUploadZone
                label="Government ID (Front)"
                required
                file={govIdFront}
                onChange={(f) => {
                  setGovIdFront(f);
                  if (errors.government_id_image) setErrors((prev) => ({ ...prev, government_id_image: '' }));
                }}
                onClear={() => setGovIdFront(null)}
                error={errors.government_id_image}
                disabled={submitting}
              />

              {needsBack && (
                <FileUploadZone
                  label="Government ID (Back)"
                  required
                  file={govIdBack}
                  onChange={(f) => {
                    setGovIdBack(f);
                    if (errors.government_id_image_back) setErrors((prev) => ({ ...prev, government_id_image_back: '' }));
                  }}
                  onClear={() => setGovIdBack(null)}
                  error={errors.government_id_image_back}
                  disabled={submitting}
                />
              )}
            </div>

            {/* ── SECTION 3: HUB DETAILS & PSGC ADDRESS ── */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <Building2 className="w-4 h-4 text-brand-red" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Sorting Center Information
                </h2>
              </div>

              <Input
                label="Registered Business / Hub Name"
                required
                value={hubName}
                onChange={(e) => {
                  setHubName(e.target.value);
                  if (errors.hub_name) setErrors((prev) => ({ ...prev, hub_name: '' }));
                }}
                placeholder="e.g. Laguna Central Logistics Hub"
                error={errors.hub_name}
                disabled={submitting}
              />

              <FileUploadZone
                label="DTI Registration / Mayor's Permit"
                required
                hint="DTI, SEC, or LGU Mayor's Permit — JPG, PNG, PDF max 5MB"
                file={dtiPermit}
                onChange={(f) => {
                  setDtiPermit(f);
                  if (errors.dti_permit) setErrors((prev) => ({ ...prev, dti_permit: '' }));
                }}
                onClear={() => setDtiPermit(null)}
                error={errors.dti_permit}
                disabled={submitting}
              />

              {/* Physical Hub Location (Region -> Province -> City -> Barangay -> Street) */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-brand-red" />
                  <span>Physical Hub Facility Location</span>
                </div>
                <PsgcCascadingAddress
                  value={hubAddress}
                  onChange={(newAddr) => {
                    setHubAddress(newAddr);
                    setErrors((prev) => ({
                      ...prev,
                      address_province: '',
                      address_city: '',
                      address_barangay: '',
                      address_street: '',
                    }));
                  }}
                  errors={{
                    province: errors.address_province,
                    city: errors.address_city,
                    barangay: errors.address_barangay,
                    street: errors.address_street,
                  }}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* ── SECTION 4: COVERAGE AREA ASSIGNMENTS ── */}
            <div className="space-y-3.5 pt-2">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <FileText className="w-4 h-4 text-brand-red" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Service Area Coverage Jurisdictions
                </h2>
              </div>

              <CoverageBarangaySelector
                selected={coverageBarangays}
                onChange={(items) => {
                  setCoverageBarangays(items);
                  if (errors.coverage_barangays) setErrors((prev) => ({ ...prev, coverage_barangays: '' }));
                }}
                error={errors.coverage_barangays}
                disabled={submitting}
              />
            </div>

            {/* Policy & Vetting Notice */}
            <div className="rounded-xl bg-amber-50/80 border border-amber-200/90 p-3.5 text-xs text-amber-800 leading-relaxed space-y-1">
              <p className="font-semibold text-amber-900">Administrative Vetting Notice:</p>
              <p>
                Sorting center registrations are subject to strict geographic jurisdiction validation and DTI document verification by the platform administration team. Your account will remain in <strong>PENDING</strong> status until formal review is concluded.
              </p>
            </div>

            {/* Submit Action */}
            <div className="space-y-3 pt-1">
              <Button
                type="submit"
                loading={submitting}
                disabled={submitting}
                className="w-full min-h-[46px] text-sm font-bold shadow-sm"
              >
                {submitting ? 'Submitting Application…' : 'Submit Sorting Center Application'}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                <span>Already have an approved account?</span>
                <Link to="/hub/login" className="font-semibold text-brand-red hover:underline inline-flex items-center gap-1">
                  Log in <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Decorative Right Column (Sticky on Desktop) */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black sticky top-0 h-screen">
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80"
          alt="Loved-IT Regional Sorting Center and Logistics Hubs"
          className="absolute inset-0 w-full h-full object-cover opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-brand-black/60 to-transparent flex items-end p-12">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-red text-white">
              Sorting Center Network
            </span>
            <h2 className="text-white text-3xl font-extrabold tracking-tight">
              Lead Regional Sorting in the Philippines
            </h2>
            <p className="text-white/70 text-sm max-w-md leading-relaxed">
              Coordinate parcel inbound intake, PSGC jurisdiction sorting, and express delivery dispatch for Loved-IT merchants and buyers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
