import { Link } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import LovedItLogo from '../components/LovedItLogo';
import {
  ShieldCheck,
  HeartHandshake,
  Scale,
  BadgeCheck,
  Store,
  Zap,
  Compass,
  Target,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

import jayMarkImg from '../assets/developers/jay-mark-del-valle.jpg';
import kingOrdonaImg from '../assets/developers/king-ordona.jpg';
import liamRubialesImg from '../assets/developers/liam-rubiales.png';
import amaruJayImg from '../assets/developers/amaru-jay-balmes.png';

const CORE_VALUES = [
  {
    title: 'Trust-Driven Commerce',
    description:
      'Every order is backed by automated escrow protection, strict merchant verification, and tamper-proof buyer reviews.',
    icon: ShieldCheck,
    accent: 'border-emerald-500/30 text-emerald-600 bg-emerald-50',
  },
  {
    title: 'Authentic Malasakit',
    description:
      'Direct, human customer care that actually resolves issues. We mediate order and delivery disputes within 48 hours.',
    icon: HeartHandshake,
    accent: 'border-rose-500/30 text-brand-red bg-rose-50',
  },
  {
    title: 'Transparent Pricing',
    description:
      'Zero surprise checkout fees for shoppers and predictable 8%–10% platform take-rates so merchants keep their real profits.',
    icon: Scale,
    accent: 'border-blue-500/30 text-blue-600 bg-blue-50',
  },
  {
    title: 'Safety & Compliance',
    description:
      'Strict regulatory documentation checks (FDA CPR and LTO) on consumable goods to protect everyday consumer health.',
    icon: BadgeCheck,
    accent: 'border-amber-500/30 text-amber-600 bg-amber-50',
  },
  {
    title: 'Local MSME Empowerment',
    description:
      'Equal algorithmic visibility, practical inventory tools, and direct marketplace access for regional and independent producers.',
    icon: Store,
    accent: 'border-teal-500/30 text-teal-600 bg-teal-50',
  },
  {
    title: 'Modern Engineering & Craft',
    description:
      'Built for speed and resilience: sub-second page loads, real-time WebSocket messaging, and ironclad transaction security.',
    icon: Zap,
    accent: 'border-violet-500/30 text-violet-600 bg-violet-50',
  },
];

const COMPANY_GOALS = [
  {
    step: '01',
    title: 'Comprehensive Merchant Onboarding',
    description:
      'Onboard and verify a growing base of trustworthy Filipino sellers across all 14 curated marketplace categories.',
  },
  {
    step: '02',
    title: '48-Hour Dispute Resolution SLA',
    description:
      'Maintain ironclad buyer protection with binding return and refund dispute mediation resolved within 48 hours.',
  },
  {
    step: '03',
    title: 'Full Regulatory FDA Compliance',
    description:
      'Achieve 100% FDA-compliance coverage (CPR & LTO validation) for all Food & Grocery and Cosmetics listings before public launch.',
  },
  {
    step: '04',
    title: 'Nationwide Trusted Payment Coverage',
    description:
      'Expand frictionless, secure payment channels nationwide via audited GCash slips and Cash on Delivery with 7-day escrow protection.',
  },
  {
    step: '05',
    title: 'Fair & Pro-Seller Commission Model',
    description:
      'Keep platform commission fair and transparent: a reduced 8% take-rate for Food & Grocery, and 10% standard across general merchandise.',
  },
];

const DEVELOPERS = [
  {
    name: 'Jay Mark Del Valle',
    role: 'Creative Leader / System Architect',
    bio: 'Architected the core Laravel REST APIs, Reverb WebSocket infrastructure, multi-vendor database schema, and automated escrow ledger settlement systems.',
    image: jayMarkImg,
    imgClass: 'object-cover object-center',
  },
  {
    name: 'King Ordoña',
    role: 'Quality Assurance & Integration',
    bio: 'Spearheaded automated integration testing, comprehensive user journey audits, resilient API contract validation, and cross-browser responsive fidelity.',
    image: kingOrdonaImg,
    imgClass: 'object-cover object-[center_15%]',
  },
  {
    name: 'Liam Rubiales',
    role: 'Operations & Business Logic',
    bio: 'Engineered merchant onboarding pipelines, regulatory compliance verification, dispute escalation workflows, and end-to-end order lifecycle management.',
    image: liamRubialesImg,
    imgClass: 'object-cover object-center',
  },
  {
    name: 'Amaru Jay Balmes',
    role: 'Frontend Architect & UI/UX',
    bio: 'Designed the unified modern design system, built high-performance responsive storefronts, optimized live merchant tooling, and streamlined checkout ergonomics.',
    image: amaruJayImg,
    imgClass: 'object-cover object-center',
  },
];

export default function AboutUsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f8] text-gray-900">
      <SiteHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 space-y-12">
        {/* ── SECTION 1 — Company Intro / Hero ── */}
        <section className="bg-white rounded-3xl p-6 sm:p-10 border border-gray-200/80 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-rose-100/50 via-amber-50/30 to-transparent rounded-bl-full pointer-events-none -z-0" />

          <div className="relative z-10 space-y-6">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-brand-red text-xs font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
              About Loved-IT Philippines
            </div>

            {/* Logo Lockup */}
            <div className="pt-1">
              <LovedItLogo
                variant="light"
                type="full"
                size="custom"
                className="h-16 sm:h-20 w-auto"
                alt="Loved-IT — The General Marketplace"
              />
            </div>

            {/* Tagline & Grounded Description */}
            <div className="space-y-3 max-w-3xl">
              <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-tight">
                The General Marketplace
              </h1>
              <p className="text-base sm:text-lg text-gray-600 leading-relaxed font-normal">
                Loved-IT is an independent Philippine multi-vendor marketplace designed to make digital commerce fair, dependable, and accessible. From everyday household essentials to regional specialty finds, we connect accredited Filipino merchants with shoppers nationwide through secure escrow payments, verified seller credentials, and reliable local logistics.
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/search"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-red hover:bg-[#8e2424] text-white text-sm font-bold shadow-xs transition-all"
              >
                Explore Marketplace <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/register/seller"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200/80 text-gray-800 text-sm font-bold transition-all border border-gray-200"
              >
                <Store className="w-4 h-4 text-brand-red" /> Become a Verified Seller
              </Link>
            </div>
          </div>
        </section>

        {/* ── SECTION 2 & 3 — Mission & Vision Statements ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Mission */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 rounded-full bg-brand-red" />
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                  Our Mission
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0 border border-rose-100/80">
                  <Compass className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                  Empowering Filipino Shoppers &amp; Independent Merchants
                </h2>
              </div>

              <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
                <p>
                  Loved-IT was created to resolve the recurring friction in Philippine e-commerce: unverified product claims, slow dispute resolution, and prohibitive merchant commissions that hurt small local sellers.
                </p>
                <p>
                  Our operational mission is to provide an accessible, high-trust marketplace where every buyer is protected by a 7-day payment escrow hold, regulated consumable goods are pre-screened for safety, and local entrepreneurs are equipped with transparent, low-cost tools to build sustainable digital storefronts.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Escrow-backed transactions:</strong> Funds are safely released only when buyers confirm receipt of authentic, undamaged items.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Pro-seller economics:</strong> Low 8%–10% commission rates with zero recurring storefront fees, keeping margins with merchants.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Responsive human mediation:</strong> A dedicated resolution desk that investigates issues and settles claims within 48 hours.
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center gap-2 text-xs font-medium text-gray-500">
              <ShieldCheck className="w-4 h-4 text-brand-red shrink-0" />
              <span>Built locally for community trust &amp; nationwide economic empowerment</span>
            </div>
          </section>

          {/* Vision */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-5 rounded-full bg-amber-500" />
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                  Our Vision
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0 border border-amber-100/80">
                  <Target className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                  The Benchmark for Dependable Archipelago Commerce
                </h2>
              </div>

              <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
                <p>
                  We envision an e-commerce ecosystem where geography no longer dictates opportunity — where provincial artisans, regional distributors, and urban consumers across Luzon, Visayas, and Mindanao trade with equal speed and security.
                </p>
                <p>
                  By marrying rigorous compliance validation with lightweight, reliable web architecture, Loved-IT is set to become the standard for community-first trade: resilient against counterfeit goods, accessible on any mobile device, and centered on honest long-term relationships.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Archipelago-wide reach:</strong> Streamlined direct-to-consumer delivery connecting all major provinces without excessive shipping penalties.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Regulatory consumer safety:</strong> Setting the standard for verified CPR &amp; LTO documentation across food and health categories.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-600">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Durable software infrastructure:</strong> Sub-second responsive interfaces optimized for real-world mobile internet speeds.
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center gap-2 text-xs font-medium text-gray-500">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Targeting nationwide coverage with personalized merchant support</span>
            </div>
          </section>
        </div>

        {/* ── SECTION 4 — Core Values (6 Pillars) ── */}
        <section className="space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-5 rounded-full bg-brand-red" />
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Pillars of Integrity
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Our Core Values
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              Six foundational principles that guide every feature we build, every merchant we onboard, and every order we protect.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CORE_VALUES.map((val, idx) => {
              const Icon = val.icon;
              return (
                <div
                  key={val.title}
                  className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-4 hover:border-gray-300 hover:shadow-xs transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border ${val.accent}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-gray-300">0{idx + 1}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 leading-tight">
                      {val.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                      {val.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECTION 5 — Company Goals ── */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-5 rounded-full bg-brand-red" />
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Roadmap &amp; Milestones
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              Strategic Platform Goals
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">
              Clear commitments driving our platform architecture, regulatory compliance, and community trust.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {COMPANY_GOALS.map((goal) => (
              <div key={goal.step} className="py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 group">
                <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 font-mono font-black text-sm flex items-center justify-center shrink-0 group-hover:bg-brand-red group-hover:text-white transition-colors">
                  {goal.step}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-brand-red transition-colors">
                    {goal.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                    {goal.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 6 — Engineering & Architecture Team ── */}
        <section className="space-y-6 pt-2">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-brand-red text-xs font-bold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
              Engineering &amp; Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
              Meet Our Team
            </h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              The software engineers and system architects building Loved-IT's core multi-vendor engine, real-time WebSocket communications, automated escrow ledger, and merchant workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {DEVELOPERS.map((dev) => (
              <div
                key={dev.name}
                className="h-full bg-white rounded-3xl p-6 sm:p-7 border border-gray-200/80 shadow-xs hover:shadow-md hover:border-gray-300 transition-all flex flex-col items-center text-center justify-between"
              >
                {/* Circular Avatar with Brand Ring */}
                <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full p-1 border-2 border-brand-red/25 ring-4 ring-rose-50/80 flex items-center justify-center shrink-0 mb-5 overflow-hidden bg-gray-50 shadow-2xs">
                  <img
                    src={dev.image}
                    alt={dev.name}
                    className={`w-full h-full rounded-full ${dev.imgClass}`}
                  />
                </div>

                {/* Name */}
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight mb-2">
                  {dev.name}
                </h3>

                {/* Bio (Italicized, clean typography matching reference card layout) */}
                <p className="text-xs sm:text-sm text-gray-500 italic leading-relaxed px-1 my-3 flex-1 flex items-center justify-center">
                  "{dev.bio}"
                </p>

                {/* Role (Centered at bottom, exact alignment across all cards) */}
                <div className="mt-auto pt-3.5 border-t border-gray-100 w-full flex items-center justify-center min-h-[46px]">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider text-center block w-full leading-snug">
                    {dev.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
