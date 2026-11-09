import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bike, Building2, Clock, Headphones, Home, Landmark, MapPin, PackageCheck, Scale, Ship, Store, Truck, Warehouse,
} from 'lucide-react';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';

/** The page's sections, for the side menu and the jump links. Every rule below is how Loved-IT works today. */
const SECTIONS = [
  { id: 'journey', label: 'Your parcel’s journey' },
  { id: 'vehicles', label: 'Trucks, ships and riders' },
  { id: 'fees', label: 'Delivery fee and time' },
  { id: 'receiving', label: 'Receiving your parcel' },
  { id: 'remote', label: 'Remote towns' },
  { id: 'limits', label: 'Limits and returns' },
];

/** One parcel's trip, Laguna to Davao: short rides at both ends, the long part by truck and ship. */
const JOURNEY: { icon: React.ElementType; title: string; text: string; leg?: { icon: React.ElementType; label: string; long?: boolean } }[] = [
  { icon: Store, title: 'The shop packs it', text: 'Each shop sends its own parcel with a tracking number and a printed waybill.', leg: { icon: Bike, label: 'Rider · short ride' } },
  { icon: Warehouse, title: 'The nearest branch', text: 'A rider collects it from the shop and scans it in at the courier branch for that area.', leg: { icon: Truck, label: 'Truck · long haul', long: true } },
  { icon: Building2, title: 'Gateways', text: 'Trucks carry it to the regional gateway. Between Luzon, Visayas and Mindanao it crosses by ship or plane.', leg: { icon: Truck, label: 'Truck · long haul', long: true } },
  { icon: Warehouse, title: 'The branch near you', text: 'It is sorted for your barangay and handed to a rider who covers it.', leg: { icon: Bike, label: 'Rider · short ride' } },
  { icon: Home, title: 'Your door', text: 'The rider delivers it, collects cash on delivery if you chose it, and takes a photo as proof.' },
];

const DAYS = [
  { where: 'Same city or town', days: '1–2' },
  { where: 'Same province', days: '1–3' },
  { where: 'Same region', days: '2–4' },
  { where: 'Same island group', days: '3–5' },
  { where: 'Luzon, Visayas or Mindanao to another', days: '5–8' },
];

export default function DeliveryHelpPage() {
  const { openChatWithSupport, openChat } = useChat();
  const { user } = useAuth();
  const navigate = useNavigate();

  const chat = () => {
    if (!user) { navigate('/login?next=/help/delivery'); return; }
    if (openChatWithSupport) void openChatWithSupport();
    else openChat();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      <SiteHeader />

      <main className="flex-1">
        {/* Introduction and the page menu */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-10 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-8 lg:gap-14 items-end">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-red">Delivery guide</p>
            <h1 className="mt-3 font-serif text-[36px] sm:text-[50px] font-bold tracking-tight leading-[1.05] text-[#1E1B18]">How your parcel gets to you.</h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-stone-600">
              Who carries it, how long it takes, what it costs, and what happens when you live far from the nearest courier branch.
            </p>
            <dl className="mt-8 grid grid-cols-3 max-w-lg divide-x divide-stone-300 border-y border-stone-300">
              <Stat label="Partner couriers" value="3" />
              <Stat label="Branches nationwide" value="1,700+" />
              <Stat label="Days, anywhere" value="1–8" />
            </dl>
          </div>
          <nav aria-label="On this page" className="rounded-3xl bg-white border border-stone-200 p-2">
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl hover:bg-stone-50 group">
                <span className="flex items-baseline gap-3">
                  <span className="font-serif text-[13px] font-bold text-brand-red tabular-nums">0{i + 1}</span>
                  <span className="text-[14.5px] font-semibold text-stone-800 group-hover:text-stone-950">{s.label}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-stone-700 transition-colors" />
              </a>
            ))}
          </nav>
        </section>

        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pb-16 space-y-6">
          <Section id="journey" n={1} title="Your parcel’s journey">
            <p className="-mt-3 mb-7 max-w-2xl text-[14.5px] leading-relaxed text-stone-600">
              Every order is one parcel per shop, carried by one courier from start to finish. Track package on your order shows each stop as it happens.
            </p>
            <ol className="grid gap-0 lg:grid-cols-5">
              {JOURNEY.map((step) => (
                <li key={step.title} className="relative flex lg:flex-col gap-4 lg:gap-0 pb-6 lg:pb-0">
                  <div className="flex lg:items-center flex-col lg:flex-row shrink-0">
                    <span className="relative z-10 w-11 h-11 rounded-2xl bg-[#1E1B18] text-white flex items-center justify-center">
                      <step.icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    {step.leg && (
                      <span className="flex lg:flex-1 flex-col lg:flex-row items-center lg:items-center gap-1.5 py-2 lg:py-0 lg:px-2 grow" aria-hidden="true">
                        <span className={`w-px lg:w-auto lg:h-px flex-1 min-h-6 lg:min-h-0 ${step.leg.long ? 'bg-sky-300' : 'bg-stone-300'}`} />
                      </span>
                    )}
                  </div>
                  <div className="lg:pt-4 lg:pr-5 min-w-0">
                    <h3 className="text-[15.5px] font-semibold text-stone-900">{step.title}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-stone-600">{step.text}</p>
                    {step.leg && (
                      <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${step.leg.long ? 'bg-sky-50 text-sky-800' : 'bg-stone-100 text-stone-700'}`}>
                        <step.leg.icon className="w-3.5 h-3.5" aria-hidden="true" /> Next: {step.leg.label}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="vehicles" n={2} title="Trucks, ships and riders">
            <div className="grid md:grid-cols-3 gap-4">
              <Vehicle icon={Bike} title="Riders: the short rides" tone="stone">
                Motorcycles and tricycles pick up from shops and deliver to you, only within their branch’s area: the towns within about 20 km of road.
              </Vehicle>
              <Vehicle icon={Truck} title="Trucks: the long haul" tone="sky">
                Trucks carry parcels between branches and the regional gateway. A rider never makes a long trip on a motorcycle.
              </Vehicle>
              <Vehicle icon={Ship} title="Ships and planes" tone="indigo">
                Between Luzon, Visayas and Mindanao, parcels cross from Manila, Cebu or Davao by ship, or by plane when the gateway sends it that way.
              </Vehicle>
            </div>
            <ul className="mt-8 grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Who carries your parcel">J&amp;T Express, Flash Express or Ninja Van. Loved-IT picks the courier that covers both the shop and you, and the one with the fewest parcels waiting when more than one does.</Fact>
              <Fact title="No branch in your town?">That’s normal. A branch serves the neighbouring towns too, so your parcel goes by truck to the branch nearest you and a rider makes the short ride from there.</Fact>
            </ul>
          </Section>

          <Section id="fees" n={3} title="Delivery fee and time">
            <div className="grid lg:grid-cols-2 gap-8">
              <div>
                <h3 className="flex items-center gap-2 text-[16px] font-semibold text-stone-900"><Scale className="w-4 h-4 text-brand-red" aria-hidden="true" /> What you pay</h3>
                <ul className="mt-4 space-y-4">
                  <Fact title="By weight and route">A price for the first kilo and for each extra kilo, set by how far the shop is. Weight is rounded up to the next whole kilo, so a 1.2 kg parcel is charged as 2 kg.</Fact>
                  <Fact title="Per shop">Buying from two shops makes two parcels, each with its own fee. Checkout shows every fee before you pay.</Fact>
                  <Fact title="Free delivery">Some shops deliver free above an amount they set; checkout applies it on its own. Shipping vouchers take off the fee too.</Fact>
                </ul>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-[16px] font-semibold text-stone-900"><Clock className="w-4 h-4 text-brand-red" aria-hidden="true" /> How long it takes</h3>
                <table className="mt-4 w-full text-[14px]">
                  <caption className="sr-only">Delivery days by distance</caption>
                  <thead>
                    <tr className="text-left text-[11.5px] uppercase tracking-wider text-stone-500">
                      <th scope="col" className="pb-2 font-semibold">From the shop to you</th>
                      <th scope="col" className="pb-2 font-semibold text-right">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 border-t border-stone-200">
                    {DAYS.map((d) => (
                      <tr key={d.where}>
                        <td className="py-2.5 text-stone-700">{d.where}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums text-stone-900">{d.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[12.5px] text-stone-500">Counted from when you order. Checkout and your order show the estimate for your address.</p>
              </div>
            </div>
          </Section>

          <Section id="receiving" n={4} title="Receiving your parcel">
            <ul className="grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Cash on delivery">Pay the rider when the parcel is in your hands. The rider must enter the exact amount of your order, never more.</Fact>
              <Fact title="Proof of delivery">The rider takes a photo of the parcel with you or at your door before marking it delivered. You can see it on your order.</Fact>
              <Fact title="Message your rider">While your parcel is out for delivery, Track package has a Message rider button for directions or gate codes.</Fact>
              <Fact title="If no one is home">A parcel gets up to 3 tries. The rider calls or texts before calling it a missed try. After that, or if you refuse it, it goes back to the shop and a prepaid order is refunded.</Fact>
            </ul>
            <p className="mt-6 pl-4 border-l-2 border-brand-red text-[14px] leading-relaxed text-stone-700">
              Check the item before you tap Order Received. Once you confirm, a return can no longer be asked for. If you do nothing, the order completes by itself 7 days after delivery.
            </p>
          </Section>

          <Section id="remote" n={5} title="Remote towns" dark>
            <p className="-mt-3 max-w-2xl text-[14.5px] leading-relaxed text-white/75">
              A few towns are too far from any courier branch for a rider to reach, mostly far islands such as Kalayaan, Cagayancillo, Mapun and the Turtle Islands.
              If your address is in one, checkout tells you and lets you choose where to get your parcel.
            </p>
            <div className="mt-7 grid md:grid-cols-2 gap-px bg-white/10 rounded-2xl overflow-hidden">
              <div className="bg-[#1E1B18] p-6">
                <Landmark className="w-6 h-6 text-[#F2A9A9]" aria-hidden="true" />
                <h3 className="mt-3 text-[16px] font-semibold text-white">At your barangay hall</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/70">
                  The rider brings it to your barangay hall on the next trip. Meet the rider there, or a barangay official signs for it. We tell you when it arrives.
                </p>
              </div>
              <div className="bg-[#1E1B18] p-6">
                <PackageCheck className="w-6 h-6 text-[#F2A9A9]" aria-hidden="true" />
                <h3 className="mt-3 text-[16px] font-semibold text-white">At the courier branch</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/70">
                  Your parcel waits at the nearest branch counter. Track package shows it as ready; bring a valid ID, and the exact cash if you pay on delivery.
                </p>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 text-[13px] text-white/60">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> A town counts as remote when it is not a city and no other town of its province is within 40 km.
            </p>
          </Section>

          <Section id="limits" n={6} title="Limits and returns">
            <ul className="grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Up to 50 kg a parcel">One shop’s order must weigh 50 kg or less, since the same parcel goes by rider at both ends.</Fact>
              <Fact title="Cash on delivery up to ₱50,000">A rider carries at most ₱50,000 for one shop’s order. Above that, pay the shop by GCash.</Fact>
              <Fact title="50 items, 200 pieces">One checkout holds up to 50 different items and 200 pieces in all.</Fact>
              <Fact title="Returns travel back the same way">An approved return is collected by a rider and goes back through the branches to the shop, by truck for the long part.</Fact>
            </ul>
            <Link to="/help/safety#returns" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-red hover:underline">
              How returns and refunds work <ArrowRight className="w-4 h-4" />
            </Link>
          </Section>

          <section className="rounded-3xl bg-white border border-stone-200 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <h2 className="font-serif text-[24px] font-bold tracking-tight text-[#1E1B18]">A question about a delivery?</h2>
              <p className="mt-1 text-[14px] text-stone-600">Track it from your orders, or chat with Loved-IT Support. A person reads every message.</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {user && (
                <Link to="/settings/orders" className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full border border-stone-300 hover:border-stone-500 text-sm font-semibold text-stone-800 transition-colors">
                  <Truck className="w-4 h-4" /> Track an order
                </Link>
              )}
              <button type="button" onClick={chat}
                className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold transition-colors">
                <Headphones className="w-4 h-4" /> Chat with Support
              </button>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 px-4 first:pl-0">
      <dt className="text-[11.5px] text-stone-500">{label}</dt>
      <dd className="font-serif text-[24px] font-bold tabular-nums text-[#1E1B18]">{value}</dd>
    </div>
  );
}

function Section({ id, n, title, dark = false, children }: { id: string; n: number; title: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-32 rounded-3xl p-6 sm:p-9 ${dark ? 'bg-[#1E1B18] text-white' : 'bg-white border border-stone-200'}`}>
      <p className={`font-serif text-[14px] font-bold tabular-nums ${dark ? 'text-[#F2A9A9]' : 'text-brand-red'}`}>0{n}</p>
      <h2 className={`mt-1 mb-6 font-serif text-[26px] sm:text-[30px] font-bold tracking-tight ${dark ? 'text-white' : 'text-[#1E1B18]'}`}>{title}</h2>
      {children}
    </section>
  );
}

function Vehicle({ icon: Icon, title, tone, children }: { icon: React.ElementType; title: string; tone: 'stone' | 'sky' | 'indigo'; children: React.ReactNode }) {
  const tones = { stone: 'bg-stone-100 text-stone-700', sky: 'bg-sky-50 text-sky-700', indigo: 'bg-indigo-50 text-indigo-700' };
  return (
    <div className="rounded-2xl bg-[#FAF8F5] border border-stone-200 p-5">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${tones[tone]}`}><Icon className="w-5 h-5" aria-hidden="true" /></span>
      <h3 className="mt-3 text-[16px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{children}</p>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="list-none">
      <h3 className="text-[15.5px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-stone-600">{children}</p>
    </li>
  );
}

