import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, LifeBuoy, ShieldCheck, Truck, Banknote, ArrowUpRight, ArrowRight } from 'lucide-react';
import LovedItLogo from './LovedItLogo';
import AndroidIcon from './ui/AndroidIcon';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import gcashLogo from '../assets/brand/gcash-logo.svg';

/** For anyone on a computer: the download page, one scan away. The QR library loads only when this comes into view. */
function ScanToGetIt() {
  const [src, setSrc] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let cancelled = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void import('qrcode').then(({ default: QRCode }) =>
        QRCode.toDataURL(`${window.location.origin}/download`, { width: 232, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1E1B18', light: '#ffffff' } }),
      ).then((url) => {
        if (!cancelled) setSrc(url);
      });
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  // 58 pixels is exactly 2 for each square of this code, so it stays sharp enough for a camera at this small size.
  return (
    <div ref={box} className="items-center hidden gap-2.5 lg:flex shrink-0">
      <span className="p-1 bg-white rounded-lg shrink-0">
        {src ? <img src={src} width={58} height={58} alt="QR code that opens the download page on your phone" /> : <span className="block w-[58px] h-[58px]" aria-hidden="true" />}
      </span>
      <span className="max-w-[96px] text-[12px] leading-snug text-white/50">Or scan it with your phone’s camera</span>
    </div>
  );
}

/** The way to the app, above the links: one slim line on the dark footer. */
function AppBand() {
  return (
    <section aria-label="The Loved-IT app" className="flex flex-col gap-4 p-4 mb-10 sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-3 rounded-2xl bg-white/[0.05] ring-1 ring-inset ring-white/10">
      <div className="flex items-center flex-1 min-w-0 gap-3.5">
        <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 shrink-0">
          <AndroidIcon className="w-6 h-6 text-[#3DDC84]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-white">Get the Loved-IT app</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/55">Shop, pay and track your parcels on your Android phone. Free, with the account you already have.</p>
        </div>
      </div>
      <ScanToGetIt />
      <Link to="/download" className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-full bg-white hover:bg-white/85 text-[13px] font-semibold text-[#1E1B18] whitespace-nowrap transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-black">
        Download the app <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** The standard "Your Privacy Choices" toggle (a check and a cross on a pill), as sites show beside that link. */
function PrivacyChoicesIcon() {
  return (
    <svg viewBox="0 0 30 14" className="h-3.5 w-auto" aria-hidden="true">
      <rect x="0.5" y="0.5" width="29" height="13" rx="6.5" fill="#fff" stroke="#0066FF" />
      <path d="M15 0.5h8a6.5 6.5 0 0 1 0 13h-10.5z" fill="#0066FF" />
      <path d="M5.4 7.1l2 2 3.6-4.2" fill="none" stroke="#0066FF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 4.4l5 5.2M24.2 4.4l-5 5.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Company info',
    links: [
      { label: 'About Loved-IT', to: '/about' },
      { label: 'Download the app', to: '/download' },
      { label: 'Partner with us', to: '/partner' },
      { label: 'Help and safety center', to: '/help/safety' },
    ],
  },
  {
    title: 'Customer service',
    links: [
      { label: 'Track an order', to: '/settings/orders' },
      { label: 'Returns and refunds', to: '/settings/returns' },
      { label: 'Cancellations', to: '/settings/cancellations' },
      { label: 'Your messages', to: '/settings/messages' },
    ],
  },
  {
    title: 'Shop',
    links: [
      { label: 'New arrivals', to: '/search?sort=newest' },
      { label: 'Best sellers', to: '/search?sort=best_selling' },
      { label: 'On sale', to: '/search?on_sale=true' },
      { label: 'All products', to: '/search' },
    ],
  },
  {
    title: 'Work with us',
    links: [
      { label: 'Sell on Loved-IT', to: '/register/seller' },
      { label: 'Become a rider', to: '/register/rider' },
      { label: 'Run a logistics hub', to: '/register/hub' },
      { label: 'Register a courier company', to: '/register/courier' },
      { label: 'Rider sign in', to: '/rider/login' },
      { label: 'Hub sign in', to: '/hub/login' },
    ],
  },
];

export const Footer: React.FC = () => {
  const { user } = useAuth();
  const { openChatWithSupport } = useChat();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const chat = () => {
    if (user) void openChatWithSupport();
    else navigate('/login');
  };

  return (
    <footer className="mt-auto bg-brand-black text-white">
      <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 pt-12 pb-8">
        {pathname !== '/download' && <AppBand />}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,1fr))]">
          {/* Who we are, and the fastest way to a person */}
          <div className="max-w-sm">
            <Link to="/" className="inline-flex" aria-label="Loved-IT home">
              <LovedItLogo variant="dark" type="full" size="custom" imgClassName="h-10 sm:h-11 object-contain" />
            </Link>
            <p className="mt-4 text-[13px] leading-relaxed text-white/55">
              A marketplace for Philippine shops. Pay each shop directly by GCash, or in cash when your parcel arrives.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <button type="button" onClick={chat} className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-brand-red hover:bg-brand-red-dark text-[13px] font-semibold transition-colors">
                <MessageSquare className="w-4 h-4" /> Chat with support
              </button>
              <Link to="/help/safety" className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/20 hover:border-white/50 text-[13px] font-semibold text-white/90 transition-colors">
                <LifeBuoy className="w-4 h-4" /> Help center
              </Link>
            </div>
          </div>

          {/* Link columns: two across on phones, one row from large screens */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 lg:contents">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-[14px] font-semibold text-white">{col.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.to + l.label}>
                      <Link to={l.to} className="text-[13px] text-white/55 hover:text-white transition-colors">{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* How paying and delivery work here */}
        <div className="grid gap-6 pt-8 mt-10 border-t border-white/10 md:grid-cols-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">We accept</h2>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center h-9 px-3 rounded-lg bg-white" title="GCash">
                <img src={gcashLogo} alt="GCash" className="h-5 w-auto" />
              </span>
              <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white text-[#1E1B18]">
                <Banknote className="w-4 h-4 text-amber-600" />
                <span className="text-[13px] font-bold">Cash on delivery</span>
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-[14px] font-semibold text-white">Buyer protection</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-white/55">Every shop is verified before it can sell. Something wrong? Open a return within 7 days; our team reviews any claim a shop will not settle.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Truck className="w-5 h-5 mt-0.5 text-amber-300 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-[14px] font-semibold text-white">Delivery</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-white/55">One parcel per shop, priced by route and weight, carried by partner couriers matched to your area. Every parcel has a tracking number.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-white/40">© 2025－2026 Basta Corp.</p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
            <Link to="/terms-of-service" className="text-white/55 hover:text-white">Terms of use</Link>
            <Link to="/privacy-policy" className="text-white/55 hover:text-white">Privacy policy</Link>
            <Link to="/cookie-policy" className="text-white/55 hover:text-white">Cookie policy</Link>
            <Link to="/cookie-policy#your-choices" className="inline-flex items-center gap-1.5 text-white/55 hover:text-white">
              Your privacy choices <PrivacyChoicesIcon />
            </Link>
            <Link to="/partner" className="inline-flex items-center gap-0.5 text-white/55 hover:text-white">Partner program <ArrowUpRight className="w-3 h-3" /></Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
