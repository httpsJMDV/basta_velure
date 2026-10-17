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
  Eye,
  BadgeAlert,
  ArrowRight,
  Clock,
  Scale,
} from 'lucide-react';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import { useChat } from '../../hooks/useChat';

const SAFETY_PILLARS = [
  {
    icon: Lock,
    title: '7-Day Returns',
    badge: 'Core Guarantee',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description:
      'You pay the shop directly, and the shop stands behind its items. If an order arrives damaged, wrong or incomplete, request a return within 7 days of delivery and the shop refunds you.',
    points: [
      'Return window of 7 days after delivery',
      'Refunds come from the shop you paid',
      'Claims the shop will not settle go to our team',
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
      'Pay only from Loved-IT checkout: by GCash to the shop account checkout shows you, with your receipt uploaded, or in cash to the rider. Never send money to a number a seller gives you in chat or on social media.',
    points: [
      'The GCash name and number come from the shop\'s verified account',
      'Every GCash payment is checked against your uploaded receipt',
      'Payments made outside checkout are not covered by returns',
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
      'Both sides are heard before a decision',
    ],
  },
];

const RED_FLAGS = [
  {
    icon: AlertTriangle,
    title: 'Requests to Chat or Transact on Social Media',
    text: 'A seller who asks you to finalize deals on Telegram, Viber, WhatsApp, or Facebook Messenger is trying to get you outside the protection of checkout.',
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
    desc: 'Once approved, the shop sends your refund to your GCash, with no hidden restocking fees.',
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

      <main className="flex-1 w-full max-w-6xl px-4 py-8 mx-auto space-y-12 sm:px-6 lg:px-8 sm:py-12">
        
        {/* ── Breadcrumb & Back Link ── */}
        <div className="flex items-center justify-between text-xs">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-semibold text-stone-500 hover:text-brand-red transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="items-center hidden gap-2 font-medium sm:flex text-stone-400">
            <span>Help Center</span>
            <span>/</span>
            <span className="font-bold text-stone-700">Trust &amp; Buyer Protection</span>
          </div>
        </div>

        {/* ── Hero Banner ── */}
        <section className="relative p-6 overflow-hidden bg-white border shadow-xs rounded-3xl sm:p-10 border-stone-200/80">
          <div className="absolute top-0 right-0 rounded-bl-full pointer-events-none w-96 h-96 bg-gradient-to-bl from-rose-100/60 via-amber-50/40 to-transparent -z-0" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-bold tracking-wide border rounded-full bg-emerald-50 border-emerald-200 text-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Official Loved-IT Trust &amp; Safety Desk</span>
            </div>

            <h1 className="text-2xl font-black leading-tight tracking-tight sm:text-4xl text-stone-900">
              Your Protection is Built Into Every Single Transaction
            </h1>

            <p className="text-sm leading-relaxed sm:text-base text-stone-600">
              We built Loved-IT to bring accountability, respect, and safety back to Philippine online shopping. From mandatory seller vetting to receipt-checked payments, 7-day returns and human dispute review, explore how our systems keep your money and identity safe.
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
          <div className="max-w-2xl mx-auto space-y-2 text-center">
            <span className="text-xs font-black tracking-wider uppercase text-brand-red">Safety Standard</span>
            <h2 className="text-xl font-black tracking-tight sm:text-3xl text-stone-900">The 4 Guarantees of Loved-IT</h2>
            <p className="text-xs sm:text-sm text-stone-500">
              Clear policies designed to shield shoppers and legitimate Filipino merchants from fraud, fake goods, and unpaid deliveries.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {SAFETY_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="flex flex-col justify-between p-6 space-y-5 transition-colors bg-white border shadow-xs rounded-3xl sm:p-7 border-stone-200/80 hover:border-stone-300"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center justify-center font-bold border w-11 h-11 rounded-2xl bg-rose-50 text-brand-red shrink-0 border-rose-100/80">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${pillar.badgeColor}`}>
                        {pillar.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-bold sm:text-lg text-stone-900">{pillar.title}</h3>
                    <p className="text-xs font-normal leading-relaxed sm:text-sm text-stone-600">
                      {pillar.description}
                    </p>

                    <div className="pt-1 space-y-2 border-t border-stone-100">
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
        <section className="p-6 space-y-6 text-white shadow-lg bg-stone-900 rounded-3xl sm:p-10">
          <div className="max-w-2xl space-y-2">
            <span className="text-xs font-black tracking-wider uppercase text-amber-400">Scam Prevention</span>
            <h2 className="text-xl font-black tracking-tight sm:text-2xl">Red Flags to Watch Out For</h2>
            <p className="text-xs leading-relaxed sm:text-sm text-stone-400">
              Help us maintain a safe community by reporting any merchant or buyer engaging in these prohibited behaviors.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {RED_FLAGS.map((flag) => {
              const Icon = flag.icon;
              return (
                <div
                  key={flag.title}
                  className="bg-neutral-800/80 border border-neutral-700/60 rounded-2xl p-5 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 sm:text-sm">
                    <Icon className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{flag.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-stone-300">{flag.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Step by Step Dispute Flow ── */}
        <section className="p-6 space-y-8 bg-white border shadow-xs rounded-3xl sm:p-10 border-stone-200/80">
          <div className="max-w-2xl mx-auto space-y-2 text-center">
            <span className="text-xs font-black tracking-wider uppercase text-brand-red">Step-by-Step Guidance</span>
            <h2 className="text-xl font-black tracking-tight sm:text-2xl text-stone-900">How to Settle a Problem with Your Order</h2>
            <p className="text-xs sm:text-sm text-stone-500">
              In the rare event an item doesn't match its description or arrives damaged, here is exactly how our dispute resolution flow works.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DISPUTE_STEPS.map((step) => (
              <div
                key={step.step}
                className="flex flex-col justify-between p-5 space-y-3 border bg-stone-50/70 border-stone-200/70 rounded-2xl"
              >
                <div className="space-y-2">
                  <span className="text-xs font-black text-brand-red font-mono bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg inline-block">
                    Step {step.step}
                  </span>
                  <h3 className="text-xs font-bold sm:text-sm text-stone-900">{step.title}</h3>
                  <p className="text-xs leading-relaxed text-stone-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 p-4 text-xs border rounded-2xl bg-amber-50/80 border-amber-200/80 text-amber-900">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              <strong>Important Reminder:</strong> Unpack and test your items before you click "Order Received". Once you confirm, the order is complete and a return can no longer be requested.
            </span>
          </div>
        </section>

        {/* ── Customer Help Desk Callout ── */}
        <section className="flex flex-col items-center justify-between gap-6 p-6 border bg-gradient-to-r from-rose-50 via-stone-50 to-amber-50/50 rounded-3xl sm:p-8 border-stone-200/90 sm:flex-row">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 text-white shadow-sm rounded-2xl bg-brand-red shrink-0">
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

