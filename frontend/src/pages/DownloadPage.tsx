import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, MotionConfig } from 'framer-motion';
import QRCode from 'qrcode';
import { ArrowDown, ArrowRight, Camera, Check, Globe, Image as ImageIcon, MapPin, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';
import AndroidIcon from '../components/ui/AndroidIcon';

import homeShot from '../assets/app/home.webp';
import categoriesShot from '../assets/app/categories.webp';
import productShot from '../assets/app/product.webp';
import checkoutShot from '../assets/app/checkout.webp';
import trackingShot from '../assets/app/tracking.webp';
import chatShot from '../assets/app/chat.webp';
import orderShot from '../assets/app/order.webp';
import searchShot from '../assets/app/search.webp';
import cartShot from '../assets/app/cart.webp';
import ordersShot from '../assets/app/orders.webp';
import shopShot from '../assets/app/shop.webp';
import accountShot from '../assets/app/account.webp';
import riderShot from '../assets/app/rider.webp';
import hubShot from '../assets/app/hub.webp';
import courierShot from '../assets/app/courier.webp';
import riderPhoto from '../assets/auth/rider.jpg';
import hubPhoto from '../assets/auth/hub.jpg';
import courierPhoto from '../assets/auth/courier.jpg';
import webCartShot from '../assets/app/web-cart.webp';

/** Written by setup/publish-apk.ps1 next to the APK, so a new version needs no website build. */
interface AppRelease {
  version: string;
  build: string;
  link: string;
  size_mb: number;
  published: string;
  sha256: string;
}

const APK_FALLBACK = '/download/loved-it.apk';
const MIN_ANDROID = 'Android 7.0 or newer';

// Every line below is something the app does today. Check it against mobile/lib before changing the wording: no push
// notifications, no seller screens, and Google sign-in only once its Android clients exist.
const FIGURES = [
  { value: '₱0', label: 'to download and use' },
  { value: '2', label: 'ways to pay: cash or GCash' },
  { value: '7 days', label: 'to ask for a return' },
  { value: '4', label: 'roles: shopper, rider, hub, courier' },
];

const JOURNEY: { kicker: string; title: string; text: string; points: string[]; shot: string; alt: string }[] = [
  {
    kicker: 'Find it',
    title: 'A shop window that fits your hand.',
    text: 'Open the app to what is trending, the shops worth knowing and every category at a glance. When you know what you want, search goes straight to it.',
    points: ['Sort by best match, top sales, newest, price or rating', 'Filter a list down to what you would actually buy', 'Save anything to your wishlist for later'],
    shot: homeShot,
    alt: 'The app home page with a banner, categories and search',
  },
  {
    kicker: 'Choose it',
    title: 'Everything you need to decide.',
    text: 'Big photos, every size and colour, the stock left and how long delivery takes. The shop’s rating and sales sit on the same page, so you know who you are buying from.',
    points: ['Reviews come only from completed orders', 'Vouchers show up where you can use them', 'Chat with the shop before you buy'],
    shot: productShot,
    alt: 'A product page with a large photo, its price and the Buy now button',
  },
  {
    kicker: 'Pay for it',
    title: 'Pay the way you already pay.',
    text: 'One parcel per shop, each with its own delivery fee and the exact total before you place the order. Then pay the rider in cash, or send GCash straight to the shop.',
    points: ['Add shop, Loved-IT and free delivery vouchers', 'Keep your addresses in one address book', 'Cash on delivery is always the exact amount shown'],
    shot: checkoutShot,
    alt: 'Checkout with the delivery address, order total and payment choice',
  },
  {
    kicker: 'Follow it',
    title: 'Know where your parcel is.',
    text: 'Every update, from the shop packing your order to the hub sorting it for your barangay. Once a rider is bringing it, follow them on the map.',
    points: ['A tracking number on every parcel', 'See the route: the shop, the hub and your address', 'The rider takes a photo at your door as proof'],
    shot: trackingShot,
    alt: 'The tracking page with the rider, the route and a timeline of updates',
  },
  {
    kicker: 'Talk about it',
    title: 'A person on the other end.',
    text: 'Message the shop, the rider bringing your parcel, or Loved-IT Support from one inbox. A chat updates as the other person replies.',
    points: ['Attach a photo, a product or one of your orders', 'Your rider’s messages appear beside your shops', 'Support is one tap away at the top of the list'],
    shot: chatShot,
    alt: 'A chat between a buyer and the rider bringing their parcel',
  },
  {
    kicker: 'After it arrives',
    title: 'If something isn’t right, say so.',
    text: 'Check the item, then tell us you received it. If there is a problem, ask for a return or refund within 7 days, with photos, right from the order.',
    points: ['Our team decides when a shop will not settle', 'Review the product and the shop once it is done', 'Every order stays in your history'],
    shot: orderShot,
    alt: 'A completed order with the rider’s proof of delivery photos',
  },
];

const SAME_EVERYWHERE = [
  { title: 'One account', text: 'Sign in with the email or username you use on the website. New here? Create an account in the app.' },
  { title: 'One cart and one order list', text: 'Add something on your phone and find it on your computer. Your orders, wishlist, addresses and messages follow you.' },
  { title: 'The same shops and prices', text: 'The app shows the same shops, products, prices and vouchers as the website, because both read from the same place.' },
];

const ROLES: { id: string; tab: string; title: string; text: string; points: string[]; photo: string; photoAlt: string; shot: string; shotAlt: string; cta: string; to: string }[] = [
  {
    id: 'riders',
    tab: 'Riders',
    title: 'Your whole shift, on one screen.',
    text: 'Go online when you are ready to work. Your jobs, your earnings and the cash you are holding are all in one place.',
    points: [
      'Pickups and deliveries in the barangays you cover',
      'Scan the waybill to confirm each parcel',
      'A photo at the door, taken with the camera, proves each delivery',
      'Earnings by day, week and month, job by job',
    ],
    photo: riderPhoto,
    photoAlt: 'A rider on a scooter',
    shot: riderShot,
    shotAlt: 'A delivery job in the rider app, with the cash to collect and the Delivered button',
    cta: 'Become a rider',
    to: '/register/rider',
  },
  {
    id: 'hubs',
    tab: 'Hubs',
    title: 'Run the sorting floor from your pocket.',
    text: 'See what is expected, what came in and what is waiting. The scanner is in the middle of the bar, because that is the job.',
    points: [
      'Scan parcels in, sort them by barangay and send them out',
      'See which parcels have waited longest and which riders can take them',
      'Reschedule a failed delivery or send it back to the shop',
      'Review rider applications and set their delivery areas',
    ],
    photo: hubPhoto,
    photoAlt: 'A warehouse aisle',
    shot: hubShot,
    shotAlt: 'The hub overview page with parcel counts',
    cta: 'Run a logistics hub',
    to: '/register/hub',
  },
  {
    id: 'couriers',
    tab: 'Couriers',
    title: 'See your whole network at a glance.',
    text: 'Hubs, riders and parcels on one screen, with whatever needs you at the top. Zones, rates and settlements stay on the website.',
    points: [
      'Dispatch pickups that have no rider yet',
      'Find any parcel by tracking number, order or buyer',
      'Add riders and check their papers',
      'Follow cash on delivery collections and remittances',
    ],
    photo: courierPhoto,
    photoAlt: 'A delivery van being loaded',
    shot: courierShot,
    shotAlt: 'The courier overview page with parcel counts',
    cta: 'Register a courier company',
    to: '/register/courier',
  },
];

const GALLERY = [
  { shot: categoriesShot, label: 'Every category', alt: 'The categories page' },
  { shot: searchShot, label: 'Search and sort', alt: 'A product list with sorting and filters' },
  { shot: shopShot, label: 'Shop pages', alt: 'A shop page with its products' },
  { shot: cartShot, label: 'Your cart', alt: 'The cart with one item and the total' },
  { shot: ordersShot, label: 'Your orders', alt: 'The list of orders by status' },
  { shot: accountShot, label: 'Your account', alt: 'The account page' },
];

const INSTALL_STEPS = [
  { title: 'Download', text: 'On your phone, tap Download for Android on this page and wait for it to finish.' },
  { title: 'Allow', text: 'Tap the finished download. If your phone asks, turn on Allow from this source, then go back.' },
  { title: 'Install', text: 'Tap Install. If Google Play Protect warns you, tap More details, then Install anyway.' },
  { title: 'Sign in', text: 'Tap Open and sign in with your Loved-IT account, or create a new one.' },
];

const INSTALL_NOTES = [
  { title: 'Why does my phone warn me?', text: 'Android warns about any app that does not come from the Play Store. To stay safe, only install Loved-IT from loved-it.shop.' },
  { title: 'It says App not installed', text: 'An older copy is in the way. Uninstall Loved-IT from your phone, then install again.' },
  { title: 'Updating later', text: 'Come back to this page and install the new version over the old one. You stay signed in.' },
];

const PERMISSIONS: { icon: LucideIcon; name: string; why: string }[] = [
  { icon: Camera, name: 'Camera', why: 'Only when you use it: a photo for a return or an ID, proof of delivery, or scanning a parcel.' },
  { icon: MapPin, name: 'Location', why: 'Riders only, and only while they work, so the buyer, the shop and the hub can follow the parcel. Shoppers are never asked.' },
  { icon: ImageIcon, name: 'Photos', why: 'You choose which pictures to share. The app cannot look through the rest of your gallery.' },
  { icon: Globe, name: 'Internet', why: 'Everything comes live from Loved-IT, so the app needs a connection to work.' },
];

const FAQS: { q: string; a: string }[] = [
  { q: 'Is the app free?', a: 'Yes. There is nothing to pay to download or use it, and no subscription. You only pay for what you order.' },
  { q: 'Why isn’t it on the Play Store?', a: 'We give the app out directly from this website, so you install it from this page instead. That is why your phone asks you to allow the install the first time.' },
  { q: 'Which phones does it work on?', a: `Phones on ${MIN_ANDROID}, with enough free space for the download. The size is under App details.` },
  { q: 'Is there an iPhone version?', a: 'Not yet. On an iPhone, you can shop on this website in your browser, with the same account, cart and orders.' },
  { q: 'Do I need a new account?', a: 'No. Sign in with the email or username and password you use on the website. If you are new, you can create an account in the app.' },
  { q: 'Can I run my shop from the app?', a: 'The Seller Center stays on the website, where a bigger screen helps. You can still shop from the app with the same account.' },
  { q: 'Will it notify me on my phone?', a: 'Not with pop-ups yet. Order updates are waiting under the bell inside the app, and your messages are under the Messages tab.' },
  { q: 'How do I know when there is a new version?', a: 'This page always has the latest one, with its version and date under App details. Install it over the old one and you stay signed in.' },
  { q: 'Does it work without internet?', a: 'No. Prices, stock and orders are live, so the app needs a connection. If you lose it, the app tells you and lets you try again.' },
];

/** A quiet rise as a block scrolls into view. Off for anyone who asked for less motion (see MotionConfig below). */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A phone around a real screen of the app. Give it a width; the height follows. */
function Phone({ src, alt, className = '', eager = false, small = false, children }: { src?: string; alt?: string; className?: string; eager?: boolean; small?: boolean; children?: ReactNode }) {
  return (
    <div className={`bg-[#141210] shadow-[0_30px_70px_-28px_rgba(28,25,23,0.6)] ring-1 ring-black/20 ${small ? 'rounded-[1.25rem] p-1' : 'rounded-[2.1rem] p-[6px]'} ${className}`}>
      <div className={`relative overflow-hidden bg-[#FAF8F5] aspect-[9/20] ${small ? 'rounded-[1rem]' : 'rounded-[1.75rem]'}`}>
        {src && <img src={src} alt={alt ?? ''} loading={eager ? 'eager' : 'lazy'} draggable={false} className="absolute inset-0 object-cover w-full h-full" />}
        {children}
      </div>
    </div>
  );
}

function DownloadButton({ release, tone = 'red' }: { release: AppRelease | null; tone?: 'red' | 'white' }) {
  const colors = tone === 'red'
    ? 'bg-brand-red hover:bg-brand-red-dark text-white focus-visible:ring-brand-red'
    : 'bg-white hover:bg-stone-100 text-[#1E1B18] focus-visible:ring-white focus-visible:ring-offset-brand-red';
  return (
    <a
      href={release?.link ?? APK_FALLBACK}
      download="Loved-IT.apk"
      className={`inline-flex items-center gap-3.5 min-h-[64px] pl-5 pr-7 rounded-2xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${colors}`}
    >
      <AndroidIcon className={`w-8 h-8 shrink-0 ${tone === 'red' ? '' : 'text-[#3DDC84]'}`} />
      <span className="text-left leading-tight">
        <span className="block text-[12px] font-medium opacity-80">Free{release ? ` · ${release.size_mb} MB` : ''}</span>
        <span className="block text-[17px] font-semibold tracking-tight">Download for Android</span>
      </span>
    </a>
  );
}

/** For anyone on a computer: this page, one scan away on their phone. Drawn in the browser, as ParcelQr does. */
function ScanCard({ className = '' }: { className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(`${window.location.origin}/download`, { width: 224, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1E1B18', light: '#ffffff' } }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className={`items-center gap-4 ${className}`}>
      <div className="p-1.5 bg-white rounded-xl ring-1 ring-stone-200 shrink-0">
        {src ? <img src={src} width={84} height={84} alt="QR code that opens this page on your phone" /> : <div className="w-[84px] h-[84px]" aria-hidden="true" />}
      </div>
      <p className="max-w-[210px] text-[13px] leading-snug">
        <span className="block font-semibold">On a computer?</span>
        <span className="opacity-70">Scan this with your phone’s camera to open this page there.</span>
      </p>
    </div>
  );
}

/** The story of one order. On wide screens the phone stays put and its screen changes as the steps scroll past. */
function Journey() {
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    steps.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
      <div className="relative hidden lg:block">
        <div className="sticky top-[132px] flex justify-center pt-4 pb-8">
          <div className="relative">
            <span className="absolute inset-x-[-56px] top-[14%] bottom-[-24px] rounded-[3rem] bg-[#F1EBE3]" aria-hidden="true" />
            <Phone className="relative w-[min(300px,calc((100vh-190px)*0.45))]">
              {JOURNEY.map((step, i) => (
                <img
                  key={step.kicker}
                  src={step.shot}
                  alt={i === active ? step.alt : ''}
                  draggable={false}
                  className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-500 motion-reduce:transition-none ${i === active ? 'opacity-100' : 'opacity-0'}`}
                />
              ))}
            </Phone>
          </div>
        </div>
      </div>
      <ol>
        {JOURNEY.map((step, i) => (
          <li
            key={step.kicker}
            ref={(el) => { steps.current[i] = el; }}
            data-step={i}
            className={`flex flex-col justify-center py-10 border-t lg:min-h-[74vh] lg:py-14 lg:pr-12 border-stone-200 transition-opacity duration-300 ${i === active ? 'lg:opacity-100' : 'lg:opacity-40'}`}
          >
            <p className="flex items-baseline gap-2.5 text-[13px] font-semibold text-stone-500">
              <span className="font-serif text-[15px] font-bold text-brand-red tabular-nums">0{i + 1}</span>
              {step.kicker}
            </p>
            <h3 className="mt-3 font-serif text-[28px] sm:text-[36px] font-bold tracking-tight leading-[1.1] text-[#1E1B18]">{step.title}</h3>
            <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-stone-600">{step.text}</p>
            <ul className="mt-5 space-y-2.5">
              {step.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-[14px] leading-snug text-stone-700">
                  <Check className="w-4 h-4 mt-0.5 text-brand-red shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <Phone src={step.shot} alt={step.alt} className="w-[230px] mx-auto mt-8 lg:hidden" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Riders, hubs and couriers: one panel at a time, with a real photo of the work and a real screen of the app. */
function Roles() {
  const [openId, setOpenId] = useState(ROLES[0].id);
  const role = ROLES.find((r) => r.id === openId) ?? ROLES[0];
  return (
    <>
      <div role="tablist" aria-label="Who else uses the app" className="inline-flex gap-1 p-1 rounded-full bg-white/10">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            id={`role-tab-${r.id}`}
            aria-selected={r.id === openId}
            aria-controls="role-panel"
            onClick={() => setOpenId(r.id)}
            className={`h-11 px-5 rounded-full text-[13.5px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white ${r.id === openId ? 'bg-white text-[#1E1B18]' : 'text-white/70 hover:text-white'}`}
          >
            {r.tab}
          </button>
        ))}
      </div>
      <div id="role-panel" role="tabpanel" aria-labelledby={`role-tab-${role.id}`} className="grid gap-10 mt-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16 items-center">
        <motion.div key={role.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative pb-10 pr-14 sm:pr-24">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-white/5">
            <img src={role.photo} alt={role.photoAlt} loading="lazy" className="object-cover w-full h-full" />
          </div>
          <Phone src={role.shot} alt={role.shotAlt} className="absolute right-0 bottom-0 w-[150px] sm:w-[200px]" />
        </motion.div>
        <motion.div key={`${role.id}-text`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h3 className="font-serif text-[28px] sm:text-[36px] font-bold tracking-tight leading-[1.1]">{role.title}</h3>
          <p className="mt-4 text-[15.5px] leading-relaxed text-white/70">{role.text}</p>
          <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
            {role.points.map((point) => (
              <li key={point} className="py-3 text-[14.5px] leading-snug text-white/90">{point}</li>
            ))}
          </ul>
          <Link to={role.to} className="inline-flex items-center gap-2 mt-7 min-h-[46px] px-6 rounded-full bg-white hover:bg-stone-200 text-[#1E1B18] text-sm font-semibold transition-colors">
            {role.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </>
  );
}

const DATE = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

export default function DownloadPage() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  // An APK is no use on an iPhone, so don't offer one there.
  const onIPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    let cancelled = false;
    fetch('/download/version.json', { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: AppRelease | null) => {
        if (!cancelled && data?.link) setRelease(data);
      })
      // Without it the button still works, using the plain link and leaving out the size.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const before = document.title;
    document.title = 'Download the Loved-IT app for Android';
    return () => {
      document.title = before;
    };
  }, []);

  const details: { label: string; value: string; mono?: boolean }[] = [
    ...(release
      ? [
          { label: 'Version', value: `${release.version} (${release.build})` },
          { label: 'Updated', value: DATE.format(new Date(`${release.published}T00:00:00`)) },
          { label: 'Download size', value: `${release.size_mb} MB` },
        ]
      : []),
    { label: 'Works on', value: MIN_ANDROID },
    { label: 'Language', value: 'English' },
    { label: 'Price', value: 'Free' },
    { label: 'Made by', value: 'Basta Corp., for Loved-IT' },
    ...(release ? [{ label: 'SHA-256', value: release.sha256, mono: true }] : []),
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
        <SiteHeader />

        <main className="flex-1">
          {/* The promise and the button, beside the app itself */}
          <section className="overflow-hidden">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16 lg:pt-20 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 lg:gap-12">
              <div className="lg:pb-20">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-red">The Loved-IT app for Android</p>
                <h1 className="mt-3 font-serif text-[42px] sm:text-[60px] xl:text-[68px] font-bold tracking-tight leading-[1.02] text-[#1E1B18]">
                  The whole marketplace, in your hand.
                </h1>
                <p className="mt-5 max-w-xl text-[16px] sm:text-[17px] leading-relaxed text-stone-600">
                  Shop from sellers we have checked, pay in cash or by GCash, and follow your parcel from the shop to your door. Riders, hubs and couriers run their day from the same app.
                </p>
                {onIPhone ? (
                  <div className="max-w-md p-5 mt-8 bg-white border rounded-2xl border-stone-200">
                    <p className="text-[15px] font-semibold text-stone-900">The app is for Android phones for now.</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-stone-600">On your iPhone, you can shop on this website instead, with the same account, cart and orders.</p>
                    <Link to="/search" className="inline-flex items-center gap-2 mt-4 min-h-[44px] px-5 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold transition-colors">
                      Shop on the website <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center mt-8 gap-x-6 gap-y-4">
                    <DownloadButton release={release} />
                    <a href="#install" className="inline-flex items-center gap-1.5 min-h-11 text-[14px] font-semibold text-stone-700 hover:text-brand-red transition-colors">
                      How to install <ArrowDown className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                )}
                {!onIPhone && (
                  <>
                    <p className="mt-4 text-[13px] text-stone-500">{MIN_ANDROID}. Not on the Play Store: you install it from this page.</p>
                    <ScanCard className="hidden mt-8 text-stone-800 lg:flex" />
                  </>
                )}
              </div>

              {/* Three real screens on a block of the brand red, rising from the section's bottom edge */}
              <div className="relative h-[350px] sm:h-[510px] lg:h-[600px] lg:self-end">
                <div className="absolute inset-x-0 top-[56px] sm:top-[90px] bottom-0 rounded-t-[2.5rem] bg-brand-red" aria-hidden="true" />
                <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="absolute left-[3%] top-[96px] sm:top-[130px] w-[40%] max-w-[225px]">
                  <Phone src={categoriesShot} alt="The categories page in the app" eager />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] }} className="absolute right-[3%] top-[96px] sm:top-[130px] w-[40%] max-w-[225px]">
                  <Phone src={trackingShot} alt="The tracking page in the app" eager />
                </motion.div>
                <div className="absolute inset-x-0 top-0 flex justify-center">
                  <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="w-[50%] sm:w-[46%] max-w-[282px]">
                    <Phone src={homeShot} alt="The home page of the Loved-IT app" eager />
                  </motion.div>
                </div>
              </div>
            </div>
          </section>

          {/* The figures that matter, in one ruled row */}
          <section className="bg-white border-b border-stone-200">
            <dl className="max-w-[1200px] mx-auto grid grid-cols-2 lg:grid-cols-4">
              {FIGURES.map((f, i) => (
                <div key={f.label} className={`px-4 sm:px-8 py-8 ${i % 2 === 1 ? 'border-l border-stone-200' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-stone-200' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
                  <dt className="font-serif text-[36px] sm:text-[44px] font-bold tracking-tight leading-none text-[#1E1B18] tabular-nums">{f.value}</dt>
                  <dd className="mt-2 text-[13.5px] text-stone-500">{f.label}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* One order, from first look to the front door */}
          <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-16 sm:pt-24">
            <Reveal className="max-w-2xl">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-red">For shoppers</p>
              <h2 className="mt-3 font-serif text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.06] text-[#1E1B18]">From first look to your front door.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-stone-600">Here is one order, the whole way through. These are real screens from the app.</p>
            </Reveal>
            <div className="mt-10 lg:mt-6">
              <Journey />
            </div>
          </section>

          {/* The same marketplace as the website */}
          <section className="bg-white border-y border-stone-200">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 lg:gap-16 items-center">
              <Reveal>
                <h2 className="font-serif text-[34px] sm:text-[42px] font-bold tracking-tight leading-[1.06] text-[#1E1B18]">Pick up on your phone where you left off.</h2>
                <dl className="mt-8">
                  {SAME_EVERYWHERE.map((item) => (
                    <div key={item.title} className="py-5 border-t border-stone-200">
                      <dt className="text-[16px] font-semibold text-stone-900">{item.title}</dt>
                      <dd className="mt-1 text-[14.5px] leading-relaxed text-stone-600">{item.text}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
              {/* The same cart on a computer and a phone, each shown whole */}
              <Reveal delay={0.1}>
                <figure className="p-4 rounded-3xl bg-[#F1EBE3] sm:p-7">
                  <div className="grid items-end gap-5 sm:gap-5 sm:grid-cols-[minmax(0,1fr)_24%]">
                    <div>
                      <div className="overflow-hidden bg-white rounded-xl ring-1 ring-black/10 shadow-[0_24px_50px_-28px_rgba(28,25,23,0.5)]">
                        <div className="flex items-center gap-1 px-2.5 h-7 bg-stone-100 border-b border-stone-200" aria-hidden="true">
                          <span className="w-2 h-2 rounded-full bg-stone-300" />
                          <span className="w-2 h-2 rounded-full bg-stone-300" />
                          <span className="w-2 h-2 rounded-full bg-stone-300" />
                          <span className="flex-1 min-w-0 ml-2 px-2.5 py-0.5 rounded-full bg-white text-[10.5px] leading-tight text-stone-500 truncate">loved-it.shop/cart</span>
                        </div>
                        <img src={webCartShot} width={1180} height={692} alt="The cart on the Loved-IT website, with Wireless Earbuds at ₱899" loading="lazy" className="block w-full h-auto" />
                      </div>
                      <p className="mt-3 text-center text-[13px] font-semibold text-stone-700">On your computer</p>
                    </div>
                    <div>
                      <Phone small src={cartShot} alt="The cart in the app, with the same item and the same total" className="w-[150px] mx-auto sm:w-full" />
                      <p className="mt-3 text-center text-[13px] font-semibold text-stone-700">On your phone</p>
                    </div>
                  </div>
                  <figcaption className="pt-4 mt-4 text-center text-[14px] leading-relaxed border-t border-black/10 text-stone-600">
                    The same cart on both. Add something on one and check out on the other.
                  </figcaption>
                </figure>
              </Reveal>
            </div>
          </section>

          {/* The people who carry the parcels use it too */}
          <section className="bg-[#1E1B18] text-[#FAF8F5]">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
              <Reveal className="max-w-2xl">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-amber-300">For the people behind the parcels</p>
                <h2 className="mt-3 font-serif text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.06]">One app. It opens to your job.</h2>
                <p className="mt-4 mb-9 text-[16px] leading-relaxed text-white/70">Sign in, and the app shows the screens for your work. Nothing to set up, and nothing that isn’t yours.</p>
              </Reveal>
              <Roles />
              <p className="pt-6 mt-12 text-[14px] leading-relaxed border-t border-white/10 text-white/60">
                Selling on Loved-IT? The Seller Center stays on the website, where a bigger screen helps.{' '}
                <Link to="/register/seller" className="font-semibold text-white underline underline-offset-4 decoration-white/30 hover:decoration-white">Open a shop</Link>
              </p>
            </div>
          </section>

          {/* A closer look: real screens, side by side */}
          <section className="pt-16 sm:pt-24">
            <Reveal className="max-w-[1200px] mx-auto px-4 sm:px-8">
              <h2 className="font-serif text-[34px] sm:text-[42px] font-bold tracking-tight text-[#1E1B18]">A closer look.</h2>
              <p className="mt-2 text-[15.5px] text-stone-600">Swipe through a few more screens.</p>
            </Reveal>
            <ul tabIndex={0} aria-label="More screens from the app" className="flex gap-5 px-4 pt-8 pb-10 overflow-x-auto outline-none sm:gap-7 sm:px-8 snap-x scrollbar-none min-[1640px]:justify-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red">
              {GALLERY.map((item) => (
                <li key={item.label} className="snap-center shrink-0">
                  <Phone src={item.shot} alt={item.alt} className="w-[200px] sm:w-[230px]" />
                  <p className="mt-4 text-center text-[14px] font-semibold text-stone-800">{item.label}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* How to install: what actually happens on the phone */}
          <section id="install" className="bg-white border-y border-stone-200 scroll-mt-[112px]">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
              <Reveal className="max-w-2xl">
                <h2 className="font-serif text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.06] text-[#1E1B18]">Install it in four steps.</h2>
                <p className="mt-4 text-[16px] leading-relaxed text-stone-600">The app comes straight from this website, not the Play Store, so your phone asks you to allow it the first time. After that, it is an app like any other.</p>
              </Reveal>
              <ol className="grid mt-10 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
                {INSTALL_STEPS.map((step, i) => (
                  <li key={step.title} className="pt-5 border-t-2 border-[#1E1B18]">
                    <p className="font-serif text-[40px] font-bold leading-none text-brand-red tabular-nums">{i + 1}</p>
                    <h3 className="mt-3 text-[18px] font-semibold text-stone-900">{step.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-stone-600">{step.text}</p>
                  </li>
                ))}
              </ol>
              <div className="grid gap-px mt-12 overflow-hidden border md:grid-cols-3 rounded-3xl bg-stone-200 border-stone-200">
                {INSTALL_NOTES.map((note) => (
                  <div key={note.title} className="p-6 sm:p-7 bg-[#FAF8F5]">
                    <h3 className="text-[15px] font-semibold text-stone-900">{note.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{note.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* What it asks of your phone, and the plain facts about it */}
          <section className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-20">
            <Reveal>
              <h2 className="font-serif text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight text-[#1E1B18]">What it asks for, and why.</h2>
              <ul className="mt-7">
                {PERMISSIONS.map(({ icon: Icon, name, why }) => (
                  <li key={name} className="flex gap-4 py-5 border-t border-stone-200">
                    <Icon className="w-5 h-5 mt-0.5 text-stone-500 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <div>
                      <h3 className="text-[15.5px] font-semibold text-stone-900">{name}</h3>
                      <p className="mt-0.5 text-[14.5px] leading-relaxed text-stone-600">{why}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="font-serif text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight text-[#1E1B18]">App details.</h2>
              <dl className="mt-7">
                {details.map((row) => (
                  <div key={row.label} className="flex justify-between gap-6 py-3.5 border-t border-stone-200">
                    <dt className="text-[14px] text-stone-500 shrink-0">{row.label}</dt>
                    <dd className={`text-right text-stone-900 min-w-0 ${row.mono ? 'font-mono text-[11.5px] leading-snug break-all' : 'text-[14px] font-medium'}`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </section>

          {/* Questions */}
          <section className="bg-white border-t border-stone-200">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-20">
              <div>
                <h2 className="font-serif text-[34px] sm:text-[42px] font-bold tracking-tight leading-[1.06] text-[#1E1B18]">Questions, answered.</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-stone-600">
                  More in the <Link to="/help/safety" className="font-semibold underline text-stone-900 underline-offset-4 decoration-stone-300 hover:decoration-stone-900">Help and Safety Center</Link>.
                </p>
              </div>
              <div className="border-b border-stone-200">
                {FAQS.map((faq) => (
                  <details key={faq.q} className="border-t group border-stone-200">
                    <summary className="flex items-center justify-between gap-4 py-5 list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                      <span className="text-[16px] font-semibold text-stone-900">{faq.q}</span>
                      <Plus className="w-5 h-5 transition-transform duration-200 text-stone-400 shrink-0 group-open:rotate-45 motion-reduce:transition-none" aria-hidden="true" />
                    </summary>
                    <p className="max-w-2xl pb-6 -mt-1 text-[15px] leading-relaxed text-stone-600">{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* One more time, for anyone who read to the end */}
          <section className="bg-brand-red text-white">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-14 sm:py-20 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-xl">
                <h2 className="font-serif text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.06]">Get Loved-IT on your phone.</h2>
                <p className="mt-3 text-[16px] leading-relaxed text-white/80">Free, for phones on {MIN_ANDROID}.</p>
              </div>
              {onIPhone ? (
                <Link to="/search" className="inline-flex items-center self-start gap-2 min-h-[48px] px-6 rounded-full bg-white hover:bg-stone-100 text-[#1E1B18] text-sm font-semibold transition-colors">
                  Shop on the website <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              ) : (
                <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                  <DownloadButton release={release} tone="white" />
                  <ScanCard className="hidden lg:flex" />
                </div>
              )}
            </div>
          </section>

          <p className="max-w-[1200px] mx-auto px-4 sm:px-8 py-6 text-[12px] leading-relaxed text-stone-500">
            Screens show sample shops, products and accounts. Android is a trademark of Google LLC. The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License.
          </p>
        </main>

        <Footer />
      </div>
    </MotionConfig>
  );
}
