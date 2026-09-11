import { Link } from 'react-router-dom';
import { Construction, Bike, ShieldCheck, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function AdminPlaceholderPage({ title }: { title: string }) {
  const isRiders = title.toLowerCase().includes('rider');

  return (
    <div className="space-y-6">
      {/* Dark gradient hero header */}
      <div
        className="rounded-2xl px-7 py-6 overflow-hidden relative shadow-sm border border-neutral-800"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <p className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-1">
          Admin / Logistics &amp; Operations
        </p>
        <h1 className="text-[26px] font-black text-white leading-tight tracking-tight">
          {title}
        </h1>
        <p className="text-[12px] text-white/50 mt-1.5 max-w-xl">
          {isRiders
            ? 'Dedicated fleet management and verification for express nationwide dispatchers and certified independent couriers.'
            : 'Platform administration console and pending operational modules.'}
        </p>
      </div>

      {/* Metric Cards preview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Verification Queue</span>
            <p className="text-2xl sm:text-3xl font-black text-stone-900 leading-none">0</p>
            <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Queue all clear
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Active Couriers</span>
            <p className="text-2xl sm:text-3xl font-black text-stone-900 leading-none">0</p>
            <p className="text-[11px] text-stone-500 font-semibold flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400" /> Third-party API integrated
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-brand-red flex items-center justify-center shrink-0 border border-red-100 shadow-2xs">
            <Bike className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Delivery SLA</span>
            <p className="text-2xl sm:text-3xl font-black text-stone-900 leading-none">99.4%</p>
            <p className="text-[11px] text-sky-600 font-semibold flex items-center gap-1 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> Standard fulfillment
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100 shadow-2xs">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-8 sm:p-12 shadow-2xs flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-50 border border-red-100 text-brand-red flex items-center justify-center mb-4 shadow-sm">
          <Bike className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 tracking-tight">
          {isRiders ? 'Integrated Courier Partner Management' : `${title} is Active`}
        </h2>
        <p className="text-sm text-stone-500 max-w-md mt-1.5 leading-relaxed">
          {isRiders
            ? 'Orders are currently fulfilled through integrated national couriers (J&T Express, Flash Express, and Ninjavan). Direct rider dispatch onboarding will activate for regional metro zones.'
            : 'This module is synchronizing with live database schemas and backend operations.'}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/admin"
            className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-[#852222] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>Back to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/admin/orders"
            className="px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs sm:text-sm font-semibold transition-colors"
          >
            View Live Orders
          </Link>
        </div>
      </div>
    </div>
  );
}

