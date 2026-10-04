import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import LovedItLogo from '../../components/LovedItLogo';
import {
  FileCheck,
  Clock,
  Mail,
  Bike,
  Building2,
  Truck,
  ArrowRight,
  LogIn,
  CheckCircle,
} from 'lucide-react';

interface PendingRiderData {
  applicant_name?: string;
  email?: string;
  hub_name?: string;
  vehicle_type?: string;
  plate_number?: string;
  submitted_at?: string;
}

export default function RiderPendingPage() {
  const location = useLocation();
  const [data, setData] = useState<PendingRiderData | null>(null);

  useEffect(() => {
    // 1. Prefer navigation state
    if (location.state && (location.state as PendingRiderData).hub_name) {
      const stateData = location.state as PendingRiderData;
      setData(stateData);
      try {
        sessionStorage.setItem('lovedit_last_rider_submission', JSON.stringify(stateData));
      } catch {
        // Ignore storage errors
      }
      return;
    }

    // 2. Fallback to session storage on page reload
    try {
      const saved = sessionStorage.getItem('lovedit_last_rider_submission');
      if (saved) {
        setData(JSON.parse(saved));
      }
    } catch {
      // Degrade gracefully
    }
  }, [location.state]);

  const steps = [
    {
      icon: FileCheck,
      label: 'Application Submitted',
      sub: 'Personal information, vehicle specifications, and license documents received',
      done: true,
    },
    {
      icon: Clock,
      label: 'Hub Manager Verification',
      sub: 'The logistics hub is reviewing your OR/CR and driver credentials',
      done: false,
      active: true,
    },
    {
      icon: Mail,
      label: 'Decision Email',
      sub: 'Official approval notification and onboarding instructions sent to your email',
      done: false,
    },
    {
      icon: Bike,
      label: 'Dispatch Activation',
      sub: 'Access to parcel pickups, route assignments, and delivery earnings',
      done: false,
    },
  ];

  const formattedDate = data?.submitted_at
    ? new Date(data.submitted_at).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Main Content Column */}
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

          {/* Hero Banner */}
          <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-7 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 rounded-full px-3 py-1 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-semibold text-amber-300 tracking-wide uppercase">
                  Pending Hub Approval
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white leading-snug">
                Application Received!
              </h1>
              <p className="text-xs sm:text-sm text-white/70 mt-1">
                Your courier application has been submitted to the logistics hub and is currently under review.
              </p>
            </div>
          </div>

          {/* Application Summary Box */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-200/80 pb-2.5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-blue-600" />
                Courier Application Summary
              </h2>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/70 border border-amber-300/60 rounded-full px-2.5 py-0.5">
                STATUS: PENDING
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {data?.applicant_name && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500 font-medium">Applicant</span>
                  <span className="font-bold text-gray-900 text-right">
                    {data.applicant_name}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                  Assigned Logistics Hub
                </span>
                <span className="font-bold text-blue-700 text-right max-w-[220px]">
                  {data?.hub_name || 'Selected Sorting Center'}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <Truck className="w-3 h-3 text-gray-400 shrink-0" />
                  Vehicle
                </span>
                <span className="font-semibold text-gray-800 text-right">
                  {data?.vehicle_type || 'Motorized Vehicle'}{' '}
                  {data?.plate_number ? `(${data.plate_number})` : ''}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500 font-medium">Submitted On</span>
                <span className="text-gray-700 text-right">{formattedDate}</span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/70 border border-blue-200/70 p-3 text-xs text-blue-800 flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Please wait for the Logistics / Sorting Center&apos;s approval, which will be sent to{' '}
                <strong className="font-semibold">{data?.email || 'your registered email'}</strong>.
              </p>
            </div>
          </div>

          {/* Workflow Steps Progress */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Application Progress</p>
            {steps.map(({ icon: Icon, label, sub, done, active }, i) => (
              <div key={label} className="flex items-start gap-3 relative">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-bold shrink-0 ${
                      done
                        ? 'bg-green-600 border-green-600 text-white'
                        : active
                        ? 'bg-amber-50 border-amber-400 text-amber-600'
                        : 'bg-gray-100 border-gray-200 text-gray-400'
                    }`}
                  >
                    {done ? (
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-600' : 'text-gray-300'}`} />
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`w-px flex-1 my-1 ${done ? 'bg-green-200' : 'bg-gray-200'}`}
                      style={{ minHeight: 18 }}
                    />
                  )}
                </div>

                <div className="pb-4 pt-0.5 flex-1 min-w-0">
                  <p
                    className={`text-xs font-bold leading-none ${
                      done ? 'text-green-700' : active ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1 leading-snug">{sub}</p>
                </div>

                {done && (
                  <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 h-fit shrink-0">
                    Done
                  </span>
                )}
                {active && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 h-fit shrink-0">
                    In Review
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <Link
              to="/"
              className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-98 transition-all shadow-xs"
            >
              Return to Marketplace Homepage <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full min-h-[42px] rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 active:scale-98 transition-all"
            >
              <LogIn className="w-4 h-4 text-gray-500" />
              Go to Account Login
            </Link>
          </div>
        </div>
      </div>

      {/* Decorative Right Column */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-gray-900 sticky top-0 h-screen">
        <img
          src="https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=1200&q=80"
          alt="Loved-IT Courier Delivery Fleet"
          className="absolute inset-0 w-full h-full object-cover opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent flex items-end p-12">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-600 text-white">
              Loved-IT Delivery Fleet
            </span>
            <h2 className="text-white text-3xl font-extrabold tracking-tight">
              Fast, Reliable Last-Mile Courier Delivery
            </h2>
            <p className="text-white/70 text-sm max-w-md leading-relaxed">
              Our delivery riders connect Philippine merchants directly to buyers with prompt local parcel deliveries, transparent earnings, and dedicated hub support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

