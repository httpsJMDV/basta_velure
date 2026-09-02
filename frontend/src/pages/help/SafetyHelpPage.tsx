import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, CreditCard, Lock, CheckCircle2, ArrowLeft, Headphones } from 'lucide-react';
import SiteHeader from '../../components/SiteHeader';

export default function SafetyHelpPage() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Back navigation */}
        <Link
          to="/settings/messages"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-brand-red transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Messages
        </Link>

        {/* Hero Header */}
        <div className="bg-gradient-to-br from-[#8a2424] to-[#A32D2D] rounded-3xl p-8 text-white shadow-xl flex flex-col sm:flex-row items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <div>
            <span className="text-[11px] font-black tracking-widest uppercase bg-white/20 px-2.5 py-0.5 rounded-full">
              Trust &amp; Safety Guidelines
            </span>
            <h1 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">Velure Buyer &amp; Seller Protection</h1>
            <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-xl">
              Learn how to keep your transactions, personal information, and orders protected on the Velure Marketplace.
            </p>
          </div>
        </div>

        {/* Key Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center font-bold">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Never Transact Outside Velure</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Always complete checkout through Velure using official payment methods (GCash QR verification or Cash on Delivery). Sellers asking for direct bank transfers or external payment links violate marketplace policy and void buyer protection.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Beware of Phishing &amp; External Links</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Velure will never ask for your passwords, OTP codes, or financial PINs via chat. Do not click links directing you outside velure.ph or asking you to claim rewards elsewhere.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Verified Seller Assurance</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Look for the Verified Seller badge on merchant profiles. All sellers submit government IDs, DTI/SEC registrations, and FDA licenses (for food and health items) before listing on Velure.
            </p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Delivery &amp; Dispute Resolution</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              If an item is missing, damaged, or significantly not as described, you can open a dispute from your Orders page within 7 days of delivery.
            </p>
          </div>
        </div>

        {/* Support Callout */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Need to report suspicious activity?</p>
              <p className="text-xs text-gray-400">Our safety and moderation team is available to assist you.</p>
            </div>
          </div>
          <Link
            to="/settings/messages"
            className="px-5 py-2.5 bg-brand-red hover:bg-[#8a2424] text-white text-xs font-bold rounded-2xl shadow-xs transition-colors shrink-0"
          >
            Contact Velure Support
          </Link>
        </div>
      </div>
    </div>
  );
}

