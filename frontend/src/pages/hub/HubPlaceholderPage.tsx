import { Link } from 'react-router-dom';
import { ArrowLeft, Construction, Clock } from 'lucide-react';
import type { ElementType } from 'react';

interface HubPlaceholderPageProps {
  title: string;
  subtitle?: string;
  icon?: ElementType;
}

export default function HubPlaceholderPage({
  title,
  subtitle,
  icon: Icon = Construction,
}: HubPlaceholderPageProps) {
  return (
    <div className="space-y-6">
      {/* Dark gradient hero header matching Loved-IT Logistics theme */}
      <div
        className="rounded-2xl px-6 py-6 sm:px-8 sm:py-7 overflow-hidden relative shadow-sm border border-neutral-800"
        style={{ background: 'linear-gradient(135deg, #141824 0%, #1e2433 60%, #2b1f24 100%)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-brand-red/20 text-brand-red border border-brand-red/30">
            Logistics Operations
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
          {subtitle || 'This module will be activated in upcoming logistics releases.'}
        </p>
      </div>

      {/* Placeholder Content Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-8 sm:p-12 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mx-auto text-gray-400 mb-4 shadow-inner">
          <Icon className="w-8 h-8 text-gray-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">
          {title} is Under Development
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto mt-2 leading-relaxed">
          The team is actively building out this sorting center workstation feature. You can monitor live metrics from the command dashboard.
        </p>

        <div className="mt-6 flex justify-center">
          <Link
            to="/hub/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Command Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

