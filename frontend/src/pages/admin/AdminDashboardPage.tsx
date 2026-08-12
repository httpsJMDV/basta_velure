import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatsApi } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import type { AdminStats } from '../../types';
import {
  UserCheck, Bike, ShoppingBag, AlertTriangle,
  Users, Store, TrendingUp, ScrollText, ArrowRight,
} from 'lucide-react';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

interface StatChipProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  to?: string;
  color: string;   // tailwind bg class for icon chip
  textColor: string;
  urgent?: boolean;
}

function StatChip({ icon: Icon, label, value, to, color, textColor, urgent }: StatChipProps) {
  const isUrgent = urgent && Number(value) > 0;
  const inner = (
    <div className={[
      'bg-white border rounded-xl p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md hover:-translate-y-px',
      isUrgent ? 'border-brand-red/25' : 'border-gray-100',
    ].join(' ')}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className={`w-4 h-4 ${textColor}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none ${isUrgent ? 'text-brand-red' : 'text-brand-black'}`}>
          {value}
        </p>
        <p className="text-[11px] text-gray-400 mt-1 leading-tight">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function SectionHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">{title}</h2>
      {to && (
        <Link to={to} className="text-[11px] font-medium text-brand-red hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats]   = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStatsApi().then(setStats).finally(() => setLoading(false));
  }, []);

  const needsAttention = stats && (
    stats.pending_seller_applications > 0 ||
    stats.pending_rider_applications  > 0 ||
    stats.open_disputes               > 0
  );

  return (
    <div className="max-w-5xl space-y-6">

      {/* Hero greeting */}
      <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-brand-red uppercase tracking-[0.08em] mb-1">
            {getGreeting()}
          </p>
          <p className="text-xl font-bold text-brand-black leading-tight">
            {user?.first_name} {user?.last_name} 👋
          </p>
          <p className="text-[13px] text-gray-400 mt-0.5">Here's what's happening on Velure today.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Role</p>
            <p className="text-[13px] font-semibold text-brand-black">Administrator</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white text-sm font-bold shrink-0">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
        </div>
      </div>

      {/* Attention banner */}
      {needsAttention && (
        <div className="bg-brand-red/5 border border-brand-red/20 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-brand-red shrink-0" />
            <span className="text-[12px] font-semibold text-brand-red">Needs attention</span>
          </div>
          {stats!.pending_seller_applications > 0 && (
            <Link to="/admin/seller-applications" className="text-[12px] text-brand-red underline underline-offset-2">
              {stats!.pending_seller_applications} seller application{stats!.pending_seller_applications !== 1 ? 's' : ''}
            </Link>
          )}
          {stats!.pending_rider_applications > 0 && (
            <Link to="/admin/rider-applications" className="text-[12px] text-brand-red underline underline-offset-2">
              {stats!.pending_rider_applications} rider application{stats!.pending_rider_applications !== 1 ? 's' : ''}
            </Link>
          )}
          {stats!.open_disputes > 0 && (
            <Link to="/admin/disputes" className="text-[12px] text-brand-red underline underline-offset-2">
              {stats!.open_disputes} open dispute{stats!.open_disputes !== 1 ? 's' : ''}
            </Link>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div>
        <SectionHeader title="Platform Overview" />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 h-[72px] animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatChip icon={UserCheck}     label="Pending Seller Apps"  value={stats.pending_seller_applications} to="/admin/seller-applications" color="bg-orange-50"  textColor="text-orange-500" urgent />
            <StatChip icon={Bike}          label="Pending Rider Apps"   value={stats.pending_rider_applications}  to="/admin/rider-applications"  color="bg-blue-50"    textColor="text-blue-500"   urgent />
            <StatChip icon={AlertTriangle} label="Open Disputes"        value={stats.open_disputes}               to="/admin/disputes"            color="bg-red-50"     textColor="text-red-500"    urgent />
            <StatChip icon={ShoppingBag}   label="Orders Today"         value={stats.orders_today}                                                color="bg-purple-50"  textColor="text-purple-500" />
            <StatChip icon={Users}         label="Total Buyers"         value={stats.total_buyers}                to="/admin/buyers"              color="bg-sky-50"     textColor="text-sky-500" />
            <StatChip icon={Store}         label="Total Sellers"        value={stats.total_sellers}               to="/admin/sellers"             color="bg-emerald-50" textColor="text-emerald-600" />
            <StatChip icon={Bike}          label="Total Riders"         value={stats.total_riders}                to="/admin/riders"              color="bg-indigo-50"  textColor="text-indigo-500" />
            <StatChip icon={TrendingUp}    label="GMV"                  value="—"                                                                 color="bg-gray-50"    textColor="text-gray-400" />
          </div>
        ) : null}
      </div>

      {/* Quick actions */}
      <div>
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: UserCheck,
              label: 'Seller Applications',
              desc: 'Review pending seller registrations',
              to: '/admin/seller-applications',
              color: 'bg-orange-50',
              textColor: 'text-orange-500',
            },
            {
              icon: Users,
              label: 'Manage Users',
              desc: 'Buyers, sellers, and riders',
              to: '/admin/buyers',
              color: 'bg-sky-50',
              textColor: 'text-sky-500',
            },
            {
              icon: ScrollText,
              label: 'Activity Log',
              desc: 'Full audit trail of admin actions',
              to: '/admin/activity-log',
              color: 'bg-gray-100',
              textColor: 'text-gray-500',
            },
          ].map(({ icon: Icon, label, desc, to, color, textColor }) => (
            <Link
              key={to}
              to={to}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-3 hover:shadow-md hover:-translate-y-px transition-all duration-200"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                <Icon className={`w-4 h-4 ${textColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-brand-black leading-tight">{label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{desc}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5 ml-auto" />
            </Link>
          ))}
        </div>
      </div>

      {/* Coming soon sections */}
      <div>
        <SectionHeader title="Coming Soon" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Orders',             to: '/admin/orders' },
            { label: 'Payments & Payouts', to: '/admin/payments' },
            { label: 'Disputes',           to: '/admin/disputes' },
            { label: 'Reviews',            to: '/admin/reviews' },
          ].map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="bg-white border border-dashed border-gray-200 rounded-xl px-4 py-3 text-center hover:border-gray-300 transition-colors"
            >
              <p className="text-[12px] font-medium text-gray-400">{label}</p>
              <p className="text-[10px] text-gray-300 mt-0.5">Pending migration</p>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
