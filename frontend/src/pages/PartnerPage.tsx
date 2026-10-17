import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Bike, Warehouse, Truck, ArrowRight, LogIn, Check, PackageCheck, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import { DELIVERY_FEE } from '../utils/shipping';

type RoleId = 'sell' | 'rider' | 'hub' | 'courier';

interface PartnerOption {
  id: RoleId;
  icon: LucideIcon;
  title: string;
  short: string;
  pitch: string;
  earn: { value: string; label: string };
  requirements: string[];
  steps: string[];
  note?: string;
  registerTo: string;
  registerLabel: string;
  signInTo: string;
  signInLabel: string;
}

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

// The documents listed are the ones each registration form requires (see SellerRegisterRequest, RegisterRiderRequest
// and RegisterSortingCenterRequest); keep this list in step with them. The pay figures follow config/shipping.php
// (20% pickup leg, 65% delivery leg and 15% hub, of the flat delivery fee).
const OPTIONS: PartnerOption[] = [
  {
    id: 'sell',
    icon: Store,
    title: 'Sell on Loved-IT',
    short: 'Open a shop and list your products',
    pitch: 'Open a shop, list your products and reach shoppers across the Philippines. Buyers pay you directly by GCash, and the courier hands over cash-on-delivery money every week.',
    earn: { value: 'Your price', label: 'minus a commission set per category, shown before you list' },
    requirements: [
      'A Loved-IT buyer account to apply from',
      'Valid government ID (front, and back where it has one) and a selfie holding it',
      'Business permit and DTI or SEC registration',
      'FDA or LTO document if you sell regulated products',
      'Shop name, description and your pickup address',
    ],
    steps: ['Apply from your buyer account', 'Loved-IT checks your documents', 'List products and start selling'],
    note: 'Not a member yet? Create a buyer account first, then apply to sell from it.',
    registerTo: '/register/seller',
    registerLabel: 'Apply to sell',
    signInTo: '/login',
    signInLabel: 'Seller sign in',
  },
  {
    id: 'rider',
    icon: Bike,
    title: 'Become a delivery rider',
    short: 'Pick up and deliver parcels near you',
    pitch: 'Pick up parcels from shops in your area, bring them to your hub, and deliver them to buyers. Your hub gives you the barangays you cover.',
    earn: { value: `${peso(DELIVERY_FEE * 0.2)} + ${peso(DELIVERY_FEE * 0.65)}`, label: 'per parcel for the pickup leg and the delivery leg' },
    requirements: [
      'A Loved-IT buyer account, and you are 18 or older',
      'Driver’s license (photo or PDF)',
      'Vehicle OR/CR, plus your vehicle type and plate number',
      'The logistics hub you want to ride for',
    ],
    steps: ['Pick a hub and apply', 'The hub checks your documents', 'Get your areas and start delivering'],
    registerTo: '/register/rider',
    registerLabel: 'Apply as a rider',
    signInTo: '/rider/login',
    signInLabel: 'Rider sign in',
  },
  {
    id: 'hub',
    icon: Warehouse,
    title: 'Run a logistics hub',
    short: 'Receive, sort and dispatch parcels',
    pitch: 'Run a sorting center for a partner courier: receive parcels from pickup riders, sort them by barangay, and send your riders out for the last mile.',
    earn: { value: peso(DELIVERY_FEE * 0.15), label: 'for every parcel that goes through your hub' },
    requirements: [
      'Owner’s valid government ID on your account',
      'DTI or business permit for the hub',
      'Hub name and full address',
      'The barangays your hub covers',
    ],
    steps: ['Pick a courier company and apply', 'The courier checks your permit and area', 'Approve riders and start sorting'],
    registerTo: '/register/hub',
    registerLabel: 'Apply to run a hub',
    signInTo: '/hub/login',
    signInLabel: 'Hub sign in',
  },
  {
    id: 'courier',
    icon: Truck,
    title: 'Run a courier company',
    short: 'Bring your courier network',
    pitch: 'Bring your courier brand to Loved-IT, like J&T or Flash: approve the hubs that join you and follow every parcel in your network. Orders in your hubs’ areas are assigned to you automatically.',
    earn: { value: 'Your network', label: 'gets every parcel its hubs cover, with no bidding' },
    requirements: [
      'DTI, SEC or Mayor’s permit for the company',
      'Company name and a short code (for example JNT)',
      'Operations email, contact number and head office address',
      'A Loved-IT buyer account to apply from',
    ],
    steps: ['Apply with your company documents', 'Loved-IT checks the company', 'Approve the hubs that join you'],
    registerTo: '/register/courier',
    registerLabel: 'Apply as a courier',
    signInTo: '/login?next=%2Flogistics',
    signInLabel: 'Courier portal sign in',
  },
];

/** How one parcel moves, and which partner handles each step. */
const FLOW: { icon: LucideIcon; label: string; who: string }[] = [
  { icon: Store, label: 'Packed', who: 'Seller' },
  { icon: Bike, label: 'Picked up', who: 'Rider' },
  { icon: Warehouse, label: 'Sorted', who: 'Hub' },
  { icon: Truck, label: 'Out for delivery', who: 'Rider' },
  { icon: Home, label: 'Delivered', who: 'Buyer' },
];

function initialRole(): RoleId {
  const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
  return (OPTIONS.find((o) => o.id === hash)?.id ?? 'sell');
}

export default function PartnerPage() {
  const [role, setRole] = useState<RoleId>(initialRole);
  const option = OPTIONS.find((o) => o.id === role)!;
  const Icon = option.icon;

  const pick = (id: RoleId) => {
    setRole(id);
    try { window.history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      <SiteHeader />

      {/* Title band with the parcel flow */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-14 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-red">Partner with Loved-IT</p>
            <h1 className="mt-2 text-[32px] sm:text-[42px] font-serif font-bold tracking-tight leading-[1.08] text-[#1E1B18]">Grow with Loved-IT</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-stone-600">
              Every order moves through a few hands before it reaches a buyer. Sell the products, carry the parcels, run the hub that sorts them,
              or bring your whole courier network. Pick your part, see what you need, then apply from your Loved-IT account.
            </p>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-[#FAF8F5] p-5 sm:p-6">
            <p className="text-[12px] font-semibold text-stone-500">How a parcel moves</p>
            <ol className="mt-5 grid grid-cols-5 gap-1">
              {FLOW.map((f, i) => {
                const FIcon = f.icon;
                const mine = (role === 'sell' && f.who === 'Seller') || (role === 'rider' && f.who === 'Rider') || (role === 'hub' && f.who === 'Hub') || (role === 'courier' && ['Rider', 'Hub'].includes(f.who));
                return (
                  <li key={f.label} className="relative flex flex-col items-center text-center">
                    {i < FLOW.length - 1 && <span className="absolute top-5 left-[calc(50%+22px)] right-[calc(-50%+22px)] h-px bg-stone-300" aria-hidden="true" />}
                    <span className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${mine ? 'bg-brand-red text-white' : 'bg-white text-stone-500 ring-1 ring-stone-200'}`}>
                      <FIcon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="mt-2 text-[12px] font-semibold leading-tight text-stone-900">{f.label}</span>
                    <span className={`mt-0.5 text-[11px] ${mine ? 'text-brand-red font-semibold' : 'text-stone-500'}`}>{f.who}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-5 pt-4 border-t border-stone-200 text-[12.5px] text-stone-600">
              Buyers pay a flat <span className="font-semibold text-stone-900">{peso(DELIVERY_FEE)}</span> per shop. It is split between the pickup rider, the delivery rider and the hub.
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-8 py-10">
        {/* Pick a role */}
        <div role="tablist" aria-label="Ways to partner" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {OPTIONS.map((o) => {
            const OIcon = o.icon;
            const on = o.id === role;
            return (
              <button key={o.id} id={o.id} type="button" role="tab" aria-selected={on} aria-controls="partner-panel" onClick={() => pick(o.id)}
                className={`relative text-left p-4 sm:p-5 rounded-2xl border transition-all ${on ? 'bg-white border-stone-900 shadow-[0_12px_30px_-18px_rgba(28,25,23,0.45)]' : 'bg-white/70 border-stone-200 hover:border-stone-400 hover:bg-white'}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${on ? 'bg-brand-red text-white' : 'bg-stone-100 text-stone-600'}`}><OIcon className="w-5 h-5" /></span>
                <span className="block mt-3 text-[15px] font-semibold leading-snug text-stone-900">{o.title}</span>
                <span className="block mt-0.5 text-[12.5px] text-stone-500">{o.short}</span>
              </button>
            );
          })}
        </div>

        {/* The chosen role in full */}
        <section id="partner-panel" role="tabpanel" aria-labelledby={role} className="mt-5 rounded-3xl bg-white border border-stone-200 overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-brand-red text-white flex items-center justify-center"><Icon className="w-5 h-5" /></span>
                <h2 className="text-[24px] font-serif font-bold tracking-tight text-[#1E1B18]">{option.title}</h2>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-700">{option.pitch}</p>

              <h3 className="mt-7 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-400">What you need</h3>
              <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {option.requirements.map((r) => (
                  <li key={r} className="flex gap-2.5 text-[13.5px] leading-snug text-stone-700">
                    <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              {option.note && <p className="mt-5 text-[12.5px] text-stone-500">{option.note}</p>}
            </div>

            <div className="p-6 sm:p-8 bg-[#FAF8F5] border-t lg:border-t-0 lg:border-l border-stone-200 flex flex-col">
              <div className="rounded-2xl bg-white border border-stone-200 p-4">
                <p className="text-[12px] font-semibold text-stone-500">What you earn</p>
                <p className="mt-1 text-[24px] font-bold tracking-tight text-stone-900 tabular-nums">{option.earn.value}</p>
                <p className="text-[12.5px] text-stone-500">{option.earn.label}</p>
              </div>

              <h3 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-stone-400">How it works</h3>
              <ol className="mt-3 space-y-3">
                {option.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 text-[13.5px] text-stone-800">
                    <span className="w-7 h-7 rounded-full bg-stone-900 text-white text-[12px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>

              <div className="mt-auto pt-7 flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-2">
                <Link to={option.registerTo} className="flex-1 h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors">
                  {option.registerLabel} <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to={option.signInTo} className="flex-1 h-12 rounded-full border border-stone-300 bg-white text-stone-800 text-[14px] font-semibold inline-flex items-center justify-center gap-2 hover:border-stone-900 transition-colors">
                  <LogIn className="w-4 h-4 text-stone-500" /> {option.signInLabel}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-stone-500">
          <PackageCheck className="w-4 h-4 text-stone-400" /> Every application is made from a Loved-IT buyer account, so your name, contact details and ID are already on file.
        </p>
      </main>

      <Footer />
    </div>
  );
}
