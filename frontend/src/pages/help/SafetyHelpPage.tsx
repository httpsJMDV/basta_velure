import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  Lock,
  CheckCircle2,
  ArrowLeft,
  Headphones,
  FileCheck,
  Truck,
  RotateCcw,
  Eye,
  BadgeAlert,
  ArrowRight,
  HelpCircle,
  Clock,
  Sparkles,
  PhoneCall,
  Mail,
  Scale,
} from 'lucide-react';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import LovedItLogo from '../../components/LovedItLogo';
import { useChat } from '../../hooks/useChat';

const SAFETY_PILLARS = [
  {
    icon: Lock,
    title: '7-Day Escrow Payment Hold',
    badge: 'Core Guarantee',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description:
      'When you place an order, your payment is held in escrow by Loved-IT. Funds are only transferred to the seller after you receive your delivery and confirm the items match the seller’s listing.',
    points: [
      'Automatic order hold until confirmed delivery',
      'Instant hold extensions if a parcel is delayed',
      'No surprise deduction or unauthorized balance transfers',
    ],
  },
  {
    icon: FileCheck,
    title: 'Strict Merchant Vetting',
    badge: 'Seller Accreditation',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description:
      'Every store on Loved-IT undergoes manual identity review. Sellers submit government-issued IDs, Philippine business registrations (DTI or SEC), and verified bank details before listing products.',
    points: [
      'Government ID and biometric identity validation',
      'DTI / SEC corporate business permits on file',
      'Mandatory FDA CPR & LTO licenses for food and cosmetics',
    ],
  },
  {
    icon: CreditCard,
    title: 'Official Payment Channels Only',
    badge: 'Financial Security',
    badgeColor: 'bg-rose-50 text-brand-red border-rose-200',
    description:
      'Always pay through Loved-IT checkout using authorized GCash QR verification or Cash on Delivery (COD). Never send money to personal bank accounts, external payment links, or unauthorized numbers.',
    points: [
      'GCash QR codes verified with timestamped receipts',
      'Cash on Delivery supported across nationwide courier zones',
      'Transactions outside Loved-IT automatically void buyer warranty',
    ],
  },
  {
    icon: Scale,
    title: '48-Hour Fair Dispute Mediation',
    badge: 'Dispute Desk',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description:
      'Received a broken, counterfeit, or wrong item? Our human dispute specialists review your case, order photos, and seller unboxing proof within 48 hours to ensure a fair refund or replacement.',
    points: [
      'Filing window open for 7 days post-delivery',
      'Human-arbitrated review (no automated rejections)',
      'Escrow funds frozen until both sides are resolved',
    ],
  },
];

const RED_FLAGS = [
  {
    icon: AlertTriangle,
    title: 'Requests to Chat or Transact on Social Media',
    text: 'A seller who asks you to finalize deals on Telegram, Viber, WhatsApp, or Facebook Messenger is attempting to bypass escrow protection.',
  },
  {
    icon: BadgeAlert,
    title: 'Requests for Advance Downpayments on COD',
    text: 'Legitimate Loved-IT Cash on Delivery orders never require upfront “reservation fees” or courier deposits sent via personal GCash accounts.',
  },
  {
    icon: Eye,
    title: 'Unrealistic or Suspicious Pricing',
    text: 'If high-end electronics or luxury cosmetics are listed at 80% below retail with stock images, check their seller verification badge and reviews before buying.',
  },
  {
    icon: Lock,
    title: 'Phishing Links & OTP Requests',
    text: 'Loved-IT representatives will never ask for your account password, GCash MPIN, or SMS One-Time Passwords (OTPs) under any circumstance.',
  },
];

const DISPUTE_STEPS = [
  {
    step: '01',
    title: 'Record Your Unboxing Video',
    desc: 'When receiving high-value packages, inspect the exterior seal and record an uncut unboxing clip showing the shipping label and contents.',
  },
  {
    step: '02',
    title: 'File via Orders Page within 7 Days',
    desc: 'Go to Settings > My Orders, select the order, click "Request Return / Refund", and upload photos or video evidence highlighting the issue.',
  },
  {
    step: '03',
    title: 'Loved-IT Review & Seller Response',
    desc: 'The merchant has 48 hours to accept or provide counter-evidence. If unresolved, our dispute team steps in to render a binding decision.',
  },
  {
    step: '04',
    title: 'Refund or Replacement Settlement',
    desc: 'Once approved, your refund is credited directly back to your payment method or escrow wallet without hidden restocking fees.',
  },
];

export default function SafetyHelpPage() {
  const { openChatWithSupport, openChat } = useChat();

  const handleSupportChat = () => {
    if (openChatWithSupport) openChatWithSupport();
    else if (openChat) openChat();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F8] text-stone-900 font-sans">
      <SiteHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-12">
        
        {/* ── Breadcrumb & Back Link ── */}
        <div className="flex items-center justify-between text-xs">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-semibold text-stone-500 hover:text-brand-red transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-stone-400 font-medium">
            <span>Help Center</span>
            <span>/</span>
            <span className="text-stone-700 font-bold">Trust &amp; Buyer Protection</span>
          </div>
        </div>

        {/* ── Hero Banner ── */}
        <section className="bg-white rounded-3xl p-6 sm:p-10 border border-stone-200/80 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-rose-100/60 via-amber-50/40 to-transparent rounded-bl-full pointer-events-none -z-0" />

          <div className="relative z-10 space-y-6 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Official Loved-IT Trust &amp; Safety Desk</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-stone-900 tracking-tight leading-tight">
              Your Protection is Built Into Every Single Transaction
            </h1>

            <p className="text-sm sm:text-base text-stone-600 leading-relaxed">
              We built Loved-IT to bring accountability, respect, and safety back to Philippine online shopping. From mandatory seller vetting to escrow-backed buyer protection and dedicated human dispute mediation, explore how our systems keep your money and identity safe.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleSupportChat}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red hover:bg-[#852222] text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
              >
                <Headphones className="w-4 h-4" />
                <span>Chat with Support Team</span>
              </button>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-semibold transition-all border border-stone-200"
              >
                <span>Read About Our Mission</span>
                <ArrowRight className="w-4 h-4 text-stone-400" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── 4 Core Safety Pillars ── */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-brand-red">Safety Standard</span>
            <h2 className="text-xl sm:text-3xl font-black text-stone-900 tracking-tight">The 4 Guarantees of Loved-IT</h2>
            <p className="text-xs sm:text-sm text-stone-500">
              Clear policies designed to shield shoppers and legitimate Filipino merchants from fraud, fake goods, and unpaid deliveries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SAFETY_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/80 shadow-xs flex flex-col justify-between space-y-5 hover:border-stone-300 transition-colors"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0 border border-rose-100/80">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${pillar.badgeColor}`}>
                        {pillar.badge}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-stone-900">{pillar.title}</h3>
                    <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
                      {pillar.description}
                    </p>

                    <div className="space-y-2 pt-1 border-t border-stone-100">
                      {pillar.points.map((pt) => (
                        <div key={pt} className="flex items-start gap-2 text-xs text-stone-600">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Warning / Red Flags Section ── */}
        <section className="bg-stone-900 text-white rounded-3xl p-6 sm:p-10 shadow-lg space-y-6">
          <div className="max-w-2xl space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-amber-400">Scam Prevention</span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Red Flags to Watch Out For</h2>
            <p className="text-xs sm:text-sm text-stone-400 leading-relaxed">
              Help us maintain a safe community by reporting any merchant or buyer engaging in these prohibited behaviors.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {RED_FLAGS.map((flag) => {
              const Icon = flag.icon;
              return (
                <div
                  key={flag.title}
                  className="bg-neutral-800/80 border border-neutral-700/60 rounded-2xl p-5 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm">
                    <Icon className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{flag.title}</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">{flag.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Step by Step Dispute Flow ── */}
        <section className="bg-white rounded-3xl p-6 sm:p-10 border border-stone-200/80 shadow-xs space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-brand-red">Step-by-Step Guidance</span>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">How to Settle a Problem with Your Order</h2>
            <p className="text-xs sm:text-sm text-stone-500">
              In the rare event an item doesn't match its description or arrives damaged, here is exactly how our dispute resolution flow works.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DISPUTE_STEPS.map((step) => (
              <div
                key={step.step}
                className="bg-stone-50/70 border border-stone-200/70 rounded-2xl p-5 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <span className="text-xs font-black text-brand-red font-mono bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg inline-block">
                    Step {step.step}
                  </span>
                  <h3 className="font-bold text-xs sm:text-sm text-stone-900">{step.title}</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              <strong>Important Reminder:</strong> Once you click "Order Received" on your dashboard, payment is permanently released from escrow to the seller. Always unpack and test your items first before confirming receipt!
            </span>
          </div>
        </section>

        {/* ── Customer Help Desk Callout ── */}
        <section className="bg-gradient-to-r from-rose-50 via-stone-50 to-amber-50/50 rounded-3xl p-6 sm:p-8 border border-stone-200/90 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-red text-white flex items-center justify-center shrink-0 shadow-sm">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Need Immediate Safety or Account Assistance?</h3>
              <p className="text-xs text-stone-600 mt-0.5">
                Our support team is active 7 days a week from 8:00 AM to 8:00 PM PHT.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleSupportChat}
              className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-[#852222] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Start Live Chat
            </button>
            <Link
              to="/settings/messages"
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200 transition-colors"
            >
              Open Ticket
            </Link>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

