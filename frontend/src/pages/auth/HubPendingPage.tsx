import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import LovedItLogo from '../../components/LovedItLogo';
import {
  FileCheck,
  Clock,
  Mail,
  Building2,
  MapPin,
  Layers,
  ArrowRight,
  LogIn,
  CheckCircle,
} from 'lucide-react';

interface PendingHubData {
  hub_name: string;
  address_summary?: string;
  coverage_count?: number;
  submitted_at?: string;
  email?: string;
  applicant_name?: string;
}

export default function HubPendingPage() {
  const location = useLocation();
  const [data, setData] = useState<PendingHubData | null>(null);

  useEffect(() => {
    // 1. Prefer navigation state
    if (location.state && (location.state as PendingHubData).hub_name) {
      const stateData = location.state as PendingHubData;
      setData(stateData);
      try {
        sessionStorage.setItem('lovedit_last_hub_submission', JSON.stringify(stateData));
      } catch {
        // Ignore storage errors
      }
      return;
    }

    // 2. Fallback to session storage on page reload
    try {
      const saved = sessionStorage.getItem('lovedit_last_hub_submission');
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
      sub: 'Hub details, PSGC coverage, and legal permits received',
      done: true,
    },
    {
      icon: Clock,
      label: 'Administrative Review',
      sub: 'Verification of DTI registration and service area jurisdiction',
      done: false,
      active: true,
    },
    {
      icon: Mail,
      label: 'Decision Notification',
      sub: 'Official approval or compliance instructions sent to your email',
      done: false,
    },
    {
      icon: Building2,
      label: 'Hub Activation',
      sub: 'Full access to parcel sorting, rider dispatch, and logistics tools',
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
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-amber-400/15 border border-amber-400/30 rounded-full px-3 py-1 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-semibold text-amber-300 tracking-wide uppercase">
                  Pending Admin Approval
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white leading-snug">
                Application Received!
              </h1>
              <p className="text-xs sm:text-sm text-white/70 mt-1">
                Your sorting center hub application has been submitted and is currently queued for administrator vetting.
              </p>
            </div>
          </div>

          {/* Application Summary Box (Gracefully shows submitted details or generic summary) */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-gray-200/80 pb-2.5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand-red" />
                Submission Summary
              </h2>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/70 border border-amber-300/60 rounded-full px-2.5 py-0.5">
                STATUS: PENDING
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500 font-medium">Hub Name</span>
                <span className="font-bold text-brand-black text-right">
                  {data?.hub_name || 'Regional Sorting Center Hub'}
                </span>
              </div>

              {data?.address_summary && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500 font-medium flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                    Hub Location
                  </span>
                  <span className="font-medium text-gray-800 text-right max-w-[220px]">
                    {data.address_summary}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-500 font-medium flex items-center gap-1">
                  <Layers className="w-3 h-3 text-gray-400 shrink-0" />
                  Coverage Area
                </span>
                <span className="font-semibold text-gray-800 text-right">
                  {data?.coverage_count !== undefined
                    ? `${data.coverage_count} Barangays registered`
                    : 'Designated jurisdiction registered'}
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
                Notification regarding your hub credentials and administrative decision will be sent to{' '}
                <strong className="font-semibold">{data?.email || 'your registered email'}</strong> once verification is complete.
              </p>
            </div>
          </div>

          {/* Workflow Steps Progress */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Next Steps</p>
            {steps.map(({ icon: Icon, label, sub, done, active }, i) => (
              <div key={label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                      done
                        ? 'bg-green-500 border-green-500'
                        : active
                        ? 'bg-amber-50 border-amber-500'
                        : 'bg-white border-gray-200'
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
                      done ? 'text-green-700' : active ? 'text-brand-black' : 'text-gray-400'
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

          {/* Action Buttons: strictly returning home or login (no hub portal links) */}
          <div className="space-y-2 pt-2">
            <Link
              to="/"
              className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-wine active:scale-98 transition-all shadow-xs"
            >
              Return to Marketplace Homepage <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/hub/login"
              className="flex items-center justify-center gap-2 w-full min-h-[42px] rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 active:scale-98 transition-all"
            >
              <LogIn className="w-4 h-4 text-gray-500" />
              Go to Hub Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Decorative Right Column */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black sticky top-0 h-screen">
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80"
          alt="Loved-IT Regional Sorting Center and Express Fleet"
          className="absolute inset-0 w-full h-full object-cover opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-brand-black/60 to-transparent flex items-end p-12">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-red/90 text-white">
              Logistics Network Partner
            </span>
            <h2 className="text-white text-3xl font-extrabold tracking-tight">
              Powering Local Hub Fulfillment
            </h2>
            <p className="text-white/70 text-sm max-w-md leading-relaxed">
              Loved-IT regional sorting centers coordinate parcel sortation, transit assignments, and last-mile rider dispatch across the Philippines.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
