import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';

import fashionImg from '../assets/categories/fashion.jpg';
import groceryImg from '../assets/categories/food-grocery.jpg';
import homeImg from '../assets/categories/home-living.jpg';
import jayMarkImg from '../assets/developers/jay-mark-del-valle.jpg';
import kingOrdonaImg from '../assets/developers/king-ordona.jpg';
import liamRubialesImg from '../assets/developers/liam-rubiales.png';
import amaruJayImg from '../assets/developers/amaru-jay-balmes.png';

/** How an order goes, in the order it happens. Every line is something the app does today. */
const HOW_IT_WORKS = [
  { title: 'Shop', text: 'Browse shops an admin has checked: an ID for every seller, and DTI, SEC and BIR papers for registered businesses.' },
  { title: 'Pay', text: 'Pay the rider in cash when the parcel arrives, or send GCash straight to the shop and upload the receipt.' },
  { title: 'Delivery', text: 'A partner courier picks the parcel up, a hub sorts it by barangay, and a rider brings it. Track every step on a map.' },
  { title: 'After', text: 'Check the item first. You have 7 days after delivery to ask for a return, and you can review the shop and the product.' },
];

const VALUES = [
  { title: 'Trust you can check', text: 'Sellers are reviewed before they can sell, and only buyers whose order was completed can leave a review. Nobody can hide a bad one.' },
  { title: 'Malasakit', text: 'A person answers in Messages. When a shop and a buyer cannot agree on a return, the Loved-IT team decides.' },
  { title: 'Fair to shops', text: 'One commission on item sales, and the delivery fee goes to the couriers who carry the parcel.' },
  { title: 'Local first', text: 'Built for shops and couriers in the Philippines: barangay-level addresses, GCash and cash on delivery.' },
];

const FIGURES = [
  { value: '5%', label: 'commission on item sales' },
  { value: '₱0', label: 'to open a shop' },
  { value: '7 days', label: 'to ask for a return' },
  { value: '2', label: 'ways to pay: cash or GCash' },
];

const TEAM = [
  { name: 'Jay Mark Del Valle', role: 'Project lead and system architect', bio: 'Designed the Laravel API, the order and payout ledger, and the real-time chat.', image: jayMarkImg, pos: 'object-center' },
  { name: 'King Ordoña', role: 'Quality assurance and integration', bio: 'Tests every flow end to end, from checkout to the rider\'s last delivery.', image: kingOrdonaImg, pos: 'object-[center_15%]' },
  { name: 'Liam Rubiales', role: 'Operations and business rules', bio: 'Worked out seller onboarding, returns and the order lifecycle.', image: liamRubialesImg, pos: 'object-center' },
  { name: 'Amaru Jay Balmes', role: 'Frontend and design', bio: 'Builds the storefront, the seller centre and the design system.', image: amaruJayImg, pos: 'object-center' },
];

export default function AboutUsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      <SiteHeader />

      <main className="flex-1">
        {/* Who we are, beside what is sold here */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-12 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-red">About Loved-IT</p>
            <h1 className="mt-3 font-serif text-[36px] sm:text-[52px] font-bold tracking-tight leading-[1.04] text-[#1E1B18]">
              The general marketplace, built for Filipino shops.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-stone-600">
              Loved-IT brings small and growing shops, partner couriers and shoppers together in one place: from groceries and home goods to gadgets and fashion,
              paid in cash on delivery or by GCash straight to the shop.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/search" className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold transition-colors">
                Start shopping <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/partner" className="inline-flex items-center min-h-[46px] px-6 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-800 hover:border-stone-900">
                Sell or deliver with us
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 grid-rows-2 gap-3 h-[340px] sm:h-[440px]">
            <figure className="row-span-2 relative rounded-3xl overflow-hidden bg-stone-200">
              <img src={fashionImg} alt="Clothes on a rail" className="absolute inset-0 w-full h-full object-cover" />
              <figcaption className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-white/95 text-[12px] font-semibold text-stone-800">Fashion</figcaption>
            </figure>
            <figure className="relative rounded-3xl overflow-hidden bg-stone-200">
              <img src={groceryImg} alt="Fresh groceries" className="absolute inset-0 w-full h-full object-cover" />
              <figcaption className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-white/95 text-[12px] font-semibold text-stone-800">Food &amp; Grocery</figcaption>
            </figure>
            <figure className="relative rounded-3xl overflow-hidden bg-stone-200">
              <img src={homeImg} alt="A living room" className="absolute inset-0 w-full h-full object-cover" />
              <figcaption className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-white/95 text-[12px] font-semibold text-stone-800">Home &amp; Living</figcaption>
            </figure>
          </div>
        </section>

        {/* The figures that matter, in one ruled row */}
        <section className="border-y border-stone-200 bg-white">
          <dl className="max-w-[1200px] mx-auto grid grid-cols-2 lg:grid-cols-4">
            {FIGURES.map((f, i) => (
              <div key={f.label} className={`px-4 sm:px-8 py-8 ${i % 2 === 1 ? 'border-l border-stone-200' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-stone-200' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
                <dt className="font-serif text-[36px] sm:text-[44px] font-bold tracking-tight leading-none text-[#1E1B18] tabular-nums">{f.value}</dt>
                <dd className="mt-2 text-[13.5px] text-stone-500">{f.label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How an order goes */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-serif text-[30px] sm:text-[36px] font-bold tracking-tight text-[#1E1B18]">How buying here works</h2>
          <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.title} className="pt-5 border-t-2 border-[#1E1B18]">
                <p className="font-serif text-[15px] font-bold text-brand-red tabular-nums">0{i + 1}</p>
                <h3 className="mt-1 text-[18px] font-semibold text-stone-900">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-stone-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Mission and vision */}
        <section className="bg-white border-y border-stone-200">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 grid md:grid-cols-2 gap-10 md:gap-16">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-stone-400">Our mission</p>
              <h2 className="mt-2 font-serif text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight text-[#1E1B18]">Make buying online from a small shop feel as safe as buying in person.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
                Online shopping in the Philippines still runs on trust that is hard to check: sellers you cannot verify, payments sent to strangers, and returns
                nobody answers. Loved-IT checks every shop, keeps payments inside checkout, and puts a person in charge when a return goes wrong.
              </p>
            </div>
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-stone-400">Our vision</p>
              <h2 className="mt-2 font-serif text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight text-[#1E1B18]">A shop in any province, reaching a buyer in any barangay.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
                We want a provincial maker and a city shopper to trade as easily as neighbours, with local couriers, honest reviews and prices that leave
                the shop a fair living.
              </p>
            </div>
          </div>
        </section>

        {/* What we stand for */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-serif text-[30px] sm:text-[36px] font-bold tracking-tight text-[#1E1B18]">What we stand for</h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-px bg-stone-200 rounded-3xl overflow-hidden border border-stone-200">
            {VALUES.map((v) => (
              <div key={v.title} className="bg-white p-7 sm:p-9">
                <h3 className="text-[18px] font-semibold text-stone-900">{v.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">{v.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The team */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pb-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-[30px] sm:text-[36px] font-bold tracking-tight text-[#1E1B18]">The team</h2>
              <p className="mt-1 text-[14px] text-stone-500">Four developers building Loved-IT.</p>
            </div>
          </div>
          <ul className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8">
            {TEAM.map((m) => (
              <li key={m.name}>
                <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-stone-200">
                  <img src={m.image} alt={m.name} className={`w-full h-full object-cover ${m.pos}`} />
                </div>
                <h3 className="mt-4 text-[16px] font-semibold text-stone-900">{m.name}</h3>
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-brand-red">{m.role}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-stone-600">{m.bio}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Where to go next */}
        <section className="bg-[#1E1B18] text-[#FAF8F5]">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-14 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="font-serif text-[28px] font-bold tracking-tight">Questions about buying or selling?</h2>
              <p className="mt-1 text-[14.5px] text-white/70">The Help and Safety Center covers payments, returns, delivery and scams to avoid.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/help/safety" className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-white text-sm font-semibold text-stone-900 hover:bg-stone-100">
                Help and Safety Center <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/register/seller" className="inline-flex items-center min-h-[46px] px-6 rounded-full border border-white/30 text-sm font-semibold text-white hover:border-white">
                Open a shop
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
