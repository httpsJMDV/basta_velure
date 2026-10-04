import { useState, useEffect, useId } from 'react';
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
import { registerRiderApi, getPublicApprovedHubsApi } from '../../api/client';
import type { PublicApprovedHub, RiderVehicleType } from '../../types';
import {
  User,
  Truck,
  Bike,
  Building2,
  FileText,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Search,
} from 'lucide-react';
import axios from 'axios';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const VEHICLE_OPTIONS: { value: RiderVehicleType; label: string }[] = [
  { value: 'Motorcycle', label: 'Motorcycle (Two-wheeler)' },
  { value: 'Tricycle',   label: 'Tricycle / Three-wheeler' },
  { value: 'Car',        label: 'Car / Sedan / Hatchback' },
  { value: 'Van',        label: 'Delivery Van / MPV / L300' },
];

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

export default function RiderRegisterPage() {
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

  // Address
  const [riderAddress, setRiderAddress] = useState<HubAddressValue>({
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

  // Hub Selection State
  const [hubs, setHubs] = useState<PublicApprovedHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [hubSearch, setHubSearch] = useState('');
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [hubLoadError, setHubLoadError] = useState<string | null>(null);

  // Vehicle Details
  const [vehicleType, setVehicleType] = useState<RiderVehicleType | ''>('Motorcycle');
  const [plateNumber, setPlateNumber] = useState('');

  // Documents
  const [orCrImage, setOrCrImage] = useState<File | null>(null);
  const [driversLicenseImage, setDriversLicenseImage] = useState<File | null>(null);

  // Terms & Conditions
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Errors & Loading
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch approved hubs on mount
  function loadHubs() {
    setLoadingHubs(true);
    setHubLoadError(null);
    getPublicApprovedHubsApi({ limit: 100 })
      .then((data) => {
        setHubs(data || []);
      })
      .catch((err) => {
        console.error('Failed to load approved hubs:', err);
        setHubLoadError('Unable to load logistics hub directory. Please try again.');
      })
      .finally(() => {
        setLoadingHubs(false);
      });
  }

  useEffect(() => {
    loadHubs();
  }, []);

  // Compute live applicant age
  const calculatedAge = calcAge(dateOfBirth);

  // Filtered hubs by search term
  const filteredHubs = hubs.filter((h) => {
    if (!hubSearch.trim()) return true;
    const term = hubSearch.toLowerCase();
    return (
      h.hub_name.toLowerCase().includes(term) ||
      h.address_city.toLowerCase().includes(term) ||
      h.address_province.toLowerCase().includes(term)
    );
  });

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
      errs.phone = 'Contact number is required.';
    } else if (phone.length < 10) {
      errs.phone = 'Please provide a valid Philippine contact number.';
    }

    // Date of birth & age >= 18
    if (!dateOfBirth) {
      errs.date_of_birth = 'Date of birth is required.';
    } else if (calculatedAge === null || calculatedAge < 18) {
      errs.date_of_birth = 'Courier applicant must be at least 18 years old to register.';
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

    // Address
    if (!riderAddress.province && !riderAddress.provinceName) {
      errs.address_province = 'Province is required.';
    }
    if (!riderAddress.city && !riderAddress.cityName) {
      errs.address_city = 'City or municipality is required.';
    }
    if (!riderAddress.barangay && !riderAddress.barangayName) {
      errs.address_barangay = 'Barangay is required.';
    }
    if (!riderAddress.street.trim()) {
      errs.address_street = 'Street or house number is required.';
    }

    // Hub Selection
    if (!selectedHubId) {
      errs.sorting_center_id = 'Please select an approved logistics hub to join.';
    }

    // Vehicle
    if (!vehicleType) {
      errs.vehicle_type = 'Please select your vehicle type.';
    }
    if (!plateNumber.trim()) {
      errs.plate_number = 'Vehicle plate number is required.';
    } else if (!/^[A-Za-z0-9\s-]+$/.test(plateNumber.trim())) {
      errs.plate_number = 'Plate number contains invalid characters.';
    } else if (plateNumber.trim().length > 20) {
      errs.plate_number = 'Plate number must not exceed 20 characters.';
    }

    // Document Uploads
    if (!orCrImage) {
      errs.or_cr_image = 'Official Receipt / Certificate of Registration (OR/CR) document is required.';
    }
    if (!driversLicenseImage) {
      errs.drivers_license_image = "Driver's license or valid government ID is required.";
    }

    // Terms
    if (!agreeTerms) {
      errs.terms = 'You must agree to the Terms of Service to register as a courier.';
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

      // Address
      formData.append('address_province', riderAddress.provinceName || riderAddress.province);
      formData.append('address_city', riderAddress.cityName || riderAddress.city);
      formData.append('address_barangay', riderAddress.barangayName || riderAddress.barangay);
      formData.append('address_street', riderAddress.street.trim());

      // Logistics Hub
      formData.append('sorting_center_id', selectedHubId);

      // Vehicle
      formData.append('vehicle_type', vehicleType);
      formData.append('plate_number', plateNumber.trim().toUpperCase());

      // Documents
      if (orCrImage) formData.append('or_cr_image', orCrImage);
      if (driversLicenseImage) formData.append('drivers_license_image', driversLicenseImage);

      const res = await registerRiderApi(formData);

      // Navigate to pending confirmation page
      navigate('/register/rider/pending', {
        state: {
          applicant_name: `${res.data.user.first_name} ${res.data.user.last_name}`,
          email: res.data.user.email,
          hub_name: res.data.rider.hub_name || 'Selected Logistics Hub',
          vehicle_type: res.data.rider.vehicle_type,
          plate_number: res.data.rider.plate_number,
          submitted_at: res.data.rider.submitted_at || new Date().toISOString(),
        },
        replace: true,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 422 && err.response.data?.errors) {
          const rawErrors = err.response.data.errors as Record<string, string[]>;
          const mapped: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(rawErrors)) {
            mapped[key] = msgs[0];
          }
          setErrors(mapped);
          setServerError('Please review the highlighted fields below.');
        } else {
          setServerError(
            err.response.data?.message || 'Courier registration failed. Please try again.'
          );
        }
      } else {
        setServerError('A network error occurred. Please check your internet connection.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedHubObj = hubs.find((h) => String(h.id) === selectedHubId);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between">
      {/* Top Banner / Navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-block group">
              <LovedItLogo size="sm" />
            </Link>
            <div className="h-5 w-px bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              <Bike className="w-3.5 h-3.5" />
              <span>Courier Registration</span>
            </div>
          </div>

          <div className="text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-red font-semibold hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Registration Form */}
      <main className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 flex-grow">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            Apply as a Delivery Courier
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Earn flexibly delivering parcels in your community. Connect with an approved Loved-IT Logistics / Sorting Center hub to get started.
          </p>
        </div>

        {/* Global Error Banner */}
        {serverError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 font-medium">{serverError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          {/* ─── SECTION 1: Personal Details ───────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  Personal Information
                </h2>
                <p className="text-xs text-gray-500">
                  Your legal identification and primary account credentials
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="First Name"
                  placeholder="e.g. Danilo"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  error={errors.first_name}
                  required
                />
                <Input
                  label="Middle Initial / Name"
                  placeholder="e.g. Santos (Optional)"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  error={errors.middle_name}
                />
                <Input
                  label="Last Name"
                  placeholder="e.g. Reyes"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  error={errors.last_name}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomSelect
                  label="Biological Sex"
                  value={sex}
                  onChange={(v) => setSex(v as 'male' | 'female')}
                  options={SEX_OPTIONS}
                  placeholder="Select biological sex"
                  error={errors.sex}
                  required
                />

                <div>
                  <label htmlFor={dobId} className="block text-xs font-semibold text-gray-700 mb-1">
                    Date of Birth <span className="text-red-500">*</span>
                    {calculatedAge !== null && (
                      <span className={`ml-2 text-xs font-normal ${calculatedAge >= 18 ? 'text-emerald-600' : 'text-red-600'}`}>
                        ({calculatedAge} years old)
                      </span>
                    )}
                  </label>
                  <input
                    id={dobId}
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className={`w-full h-10 px-3 text-sm bg-white border rounded-xl outline-none transition-colors ${
                      errors.date_of_birth
                        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-gray-200 focus:border-gray-900 focus:ring-1 focus:ring-gray-900'
                    }`}
                  />
                  {errors.date_of_birth && (
                    <p className="mt-1 text-xs text-red-600">{errors.date_of_birth}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    Applicants must be at least 18 years old to drive for the platform.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="danilo.rider@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errors.email}
                  required
                />
                <PhoneInput
                  label="Contact Mobile Number"
                  value={phone}
                  onChange={setPhone}
                  error={errors.phone}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Input
                  label="Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={errors.password}
                  required
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter password"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  error={errors.password_confirmation}
                  required
                />
              </div>
            </div>
          </section>

          {/* ─── SECTION 2: Home Address ───────────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Residential Address
                </h2>
                <p className="text-xs text-gray-500">
                  Select your region, province, municipality, and barangay via standard PSGC directory
                </p>
              </div>
            </div>

            <PsgcCascadingAddress
              value={riderAddress}
              onChange={setRiderAddress}
              errors={{
                province: errors.address_province,
                city: errors.address_city,
                barangay: errors.address_barangay,
                street: errors.address_street,
              }}
            />
          </section>

          {/* ─── SECTION 3: Logistics Hub Selection ────────────────── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  Target Logistics / Sorting Center Hub
                </h2>
                <p className="text-xs text-gray-500">
                  Select the approved hub where you will report for parcel collection and delivery assignments
                </p>
              </div>
              <button
                type="button"
                onClick={loadHubs}
                disabled={loadingHubs}
                className="text-xs text-gray-400 hover:text-gray-700 p-1 flex items-center gap-1 transition-colors"
                title="Refresh hubs list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHubs ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {hubLoadError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{hubLoadError}</p>
                </div>
                <button
                  type="button"
                  onClick={loadHubs}
                  className="text-xs font-semibold text-amber-900 hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            ) : loadingHubs ? (
              <div className="py-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                <span>Loading approved logistics hubs directory…</span>
              </div>
            ) : hubs.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-center">
                <p className="text-sm font-semibold text-gray-700">No Approved Logistics Hubs Found</p>
                <p className="mt-1 text-xs text-gray-500">
                  There are currently no approved sorting centers accepting courier applications. Please check back soon or contact platform administration.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search filter for hubs */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={hubSearch}
                    onChange={(e) => setHubSearch(e.target.value)}
                    placeholder="Search hub by name, city, or province..."
                    className="w-full h-10 pl-9 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-colors"
                  />
                </div>

                {/* Hub Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {filteredHubs.map((hub) => {
                    const isSelected = selectedHubId === String(hub.id);
                    return (
                      <div
                        key={hub.id}
                        onClick={() => setSelectedHubId(String(hub.id))}
                        className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-xs'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm text-gray-900 line-clamp-1">
                            {hub.hub_name}
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {hub.address_city}, {hub.address_province}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredHubs.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    No hubs match your search term &ldquo;{hubSearch}&rdquo;.
                  </p>
                )}

                {selectedHubObj && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs text-blue-900">
                    <span className="font-medium">
                      Selected Hub: <strong>{selectedHubObj.hub_name}</strong> ({selectedHubObj.address_city})
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedHubId('')}
                      className="text-blue-700 font-semibold hover:underline"
                    >
                      Change
                    </button>
                  </div>
                )}

                {errors.sorting_center_id && (
                  <p className="text-xs text-red-600 mt-1">{errors.sorting_center_id}</p>
                )}
              </div>
            )}
          </section>

          {/* ─── SECTION 4: Vehicle Information ────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                4
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-400" />
                  Vehicle Information
                </h2>
                <p className="text-xs text-gray-500">
                  Details of the motorized vehicle you will use for parcel dispatch and delivery
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomSelect
                label="Vehicle Type"
                value={vehicleType}
                onChange={(v) => setVehicleType(v as RiderVehicleType)}
                options={VEHICLE_OPTIONS}
                placeholder="Select vehicle type"
                error={errors.vehicle_type}
                required
              />

              <div>
                <Input
                  label="Plate Number"
                  placeholder="e.g. ABC 1234 or ND 1234"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  error={errors.plate_number}
                  required
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Motorized license plate number (alphanumeric and dashes)
                </p>
              </div>
            </div>
          </section>

          {/* ─── SECTION 5: Document Uploads ───────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                5
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-gray-400" />
                  Document Verification
                </h2>
                <p className="text-xs text-gray-500">
                  Upload clear photos or scans of your vehicle OR/CR and valid driver&apos;s license (max 5MB each)
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <FileUploadZone
                label="Official Receipt / Certificate of Registration (OR/CR)"
                file={orCrImage}
                onChange={setOrCrImage}
                onClear={() => setOrCrImage(null)}
                error={errors.or_cr_image}
                hint="Clear scan or photo of the Land Transportation Office (LTO) OR/CR — max 5MB (JPG, PNG, PDF)"
                required
              />

              <FileUploadZone
                label="Driver's License or Government ID"
                file={driversLicenseImage}
                onChange={setDriversLicenseImage}
                onClear={() => setDriversLicenseImage(null)}
                error={errors.drivers_license_image}
                hint="Valid LTO Driver's License or government identification card — max 5MB (JPG, PNG, PDF)"
                required
              />
            </div>
          </section>

          {/* ─── SECTION 6: Terms & Submit ─────────────────────────── */}
          <div className="space-y-4">
            <label className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                I hereby declare that all submitted personal details, vehicle credentials, and uploaded documents are genuine and accurate. I understand that my courier application is subject to verification and approval by the selected Logistics / Sorting Center hub, and approval status notifications will be delivered to my registered email address.
              </span>
            </label>
            {errors.terms && <p className="text-xs text-red-600">{errors.terms}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Courier Application…</span>
                </>
              ) : (
                <>
                  <span>Submit Courier Application</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Loved-IT Philippines. All rights reserved.
      </footer>
    </div>
  );
}
