import { Link } from 'react-router-dom';
import { ArrowLeft, Construction, Clock, Bike } from 'lucide-react';
import type { ElementType } from 'react';

interface RiderPlaceholderPageProps {
  title?: string;
  subtitle?: string;
  icon?: ElementType;
  inLayout?: boolean;
}

export default function RiderPlaceholderPage({
  title = 'Courier Dashboard',
  subtitle = 'Delivery assignments, real-time dispatch routes, and courier earnings will be activated here in upcoming releases.',
  icon: Icon = Bike,
  inLayout = false,
}: RiderPlaceholderPageProps) {
  if (inLayout) {
    return (
      <div className="max-w-3xl w-full mx-auto space-y-6">
        {/* Hero header */}
        <div
          className="rounded-3xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden relative shadow-sm border border-neutral-800"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #172554 100%)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Courier Network
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium">
              <Clock className="w-3 h-3 text-amber-400" /> Coming Soon
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-300/80 mt-2 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-3xl border border-gray-200/80 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600 mb-4 shadow-inner">
            <Construction className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            {title} Under Active Development
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto mt-2 leading-relaxed">
            This module is being built as part of the Loved-IT express logistics pipeline. You will be able to manage this workflow directly from this station once activated.
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              to="/rider/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Courier Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-3xl w-full mx-auto space-y-6">
        {/* Hero header */}
        <div
          className="rounded-2xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden relative shadow-sm border border-neutral-800"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #172554 100%)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Courier Network
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium">
              <Clock className="w-3 h-3 text-amber-400" /> Coming Soon
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-gray-300/80 mt-2 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600 mb-4 shadow-inner">
            <Construction className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">
            Courier App Station Under Construction
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto mt-2 leading-relaxed">
            Your rider profile is registered. The courier dispatch interface (Feature 2.3+) is currently in development.
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Marketplace
            </Link>
          </div>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Loved-IT Philippines. Courier Operations.
      </footer>
    </div>
  );
}

