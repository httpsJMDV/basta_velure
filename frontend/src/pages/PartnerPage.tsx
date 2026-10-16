import { Link } from 'react-router-dom';
import { Store, Bike, Warehouse, Truck, FileText, UserCheck, ArrowRight, LogIn, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import Footer from '../components/Footer';

interface PartnerOption {
  id: string;
  icon: LucideIcon;
  title: string;
  pitch: string;
  requirements: string[];
  approval: string;
  note?: string;
  registerTo: string;
  registerLabel: string;
  signInTo: string;
  signInLabel: string;
}

// The documents listed are the ones each registration form requires (see SellerRegisterRequest, RegisterRiderRequest
// and RegisterSortingCenterRequest); keep this list in step with them.
const OPTIONS: PartnerOption[] = [
  {
    id: 'sell',
    icon: Store,
    title: 'Sell on Loved-IT',
    pitch: 'Open a shop, list your products and reach shoppers across the Philippines. Payments are held in escrow until the buyer receives the order.',
    requirements: [
      'A Loved-IT buyer account to apply from',
      'Valid government ID (front, and back where the ID has one) and a selfie holding it',
      'Business permit and DTI or SEC registration',
      'FDA or LTO document if you sell regulated products',
      'Shop name, description and your pickup address',
    ],
    approval: 'Loved-IT administration reviews your documents and approves or rejects the shop.',
    note: 'Not a member yet? Create your buyer account first, then apply to sell from it.',
    registerTo: '/register/seller',
    registerLabel: 'Register as a seller',
    signInTo: '/login',
    signInLabel: 'Seller sign in',
  },
  {
    id: 'rider',
    icon: Bike,
    title: 'Become a delivery rider',
    pitch: 'Pick up parcels from sellers, bring them to your hub and deliver them to buyers. You earn a fixed fee for every parcel you deliver.',
    requirements: [
      'Driver’s license (photo or PDF)',
      'Vehicle OR/CR (photo or PDF), plus your vehicle type and plate number',
      'A valid mobile number and email address',
      'The logistics hub you want to ride for',
    ],
    approval: 'The logistics hub you choose reviews your application and approves or declines it.',
    registerTo: '/register/rider',
    registerLabel: 'Register as a rider',
    signInTo: '/rider/login',
    signInLabel: 'Courier sign in',
  },
  {
    id: 'hub',
    icon: Warehouse,
    title: 'Register a logistics hub',
    pitch: 'Run a sorting center: receive parcels from pickup riders, sort them by area, and dispatch your riders for the last mile.',
    requirements: [
      'Owner’s valid government ID (front, and back where the ID has one)',
      'DTI or business permit for the hub',
      'Hub name and full address',
      'The barangays your hub covers',
    ],
    approval: 'The courier company you join reviews the application. Once approved, you also approve the riders who choose your hub.',
    registerTo: '/register/hub',
    registerLabel: 'Register a hub',
    signInTo: '/hub/login',
    signInLabel: 'Hub sign in',
  },
  {
    id: 'courier',
    icon: Truck,
    title: 'Run a courier company',
    pitch: 'Bring your courier brand to Loved-IT, like J&T or Flash: approve the hubs that join you, watch every parcel in your network, and get picked by buyers at checkout.',
    requirements: [
      'DTI, SEC or Mayor’s permit for the company',
      'Company name and a short code (for example JNT)',
      'Operations email, contact number and head office address',
      'A Loved-IT buyer account to apply from',
    ],
    approval: 'Loved-IT administration reviews the company. Once approved, you review the hubs that want to join your network.',
    registerTo: '/register/courier',
    registerLabel: 'Apply as a courier',
    signInTo: '/login?next=%2Flogistics',
    signInLabel: 'Courier portal sign in',
  },
];

export default function PartnerPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f8] text-gray-900">
      <SiteHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 space-y-8">
        <section className="space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-brand-red text-xs font-bold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-brand-red" />
            Partner with us
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">Grow with Loved-IT</h1>
          <p className="text-base sm:text-lg text-gray-600 leading-relaxed">
            Sell products, deliver parcels, run a sorting hub or bring your courier company. Pick the way you want to work with us, see what you
            need to apply and who approves it, then register or sign in.
          </p>
        </section>

        <section aria-label="Ways to partner with Loved-IT" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <article
                key={option.id}
                id={option.id}
                aria-labelledby={`${option.id}-title`}
                className="flex flex-col bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 sm:p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-red text-white shadow-md shadow-brand-red/20">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h2 id={`${option.id}-title`} className="text-lg font-black leading-snug">{option.title}</h2>
                </div>

                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{option.pitch}</p>

                <div className="mt-5">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> What you need
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                    {option.requirements.map((requirement) => (
                      <li key={requirement} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-red" aria-hidden="true" />
                        <span>{requirement}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200/80 p-3.5">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Who approves you
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-700">{option.approval}</p>
                </div>

                {option.note && (
                  <p className="mt-3 flex gap-2 text-xs text-gray-500">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{option.note}</span>
                  </p>
                )}

                <div className="mt-auto pt-6 flex flex-col sm:flex-row gap-2.5">
                  <Link
                    to={option.registerTo}
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-red-dark transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
                  >
                    {option.registerLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to={option.signInTo}
                    className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2"
                  >
                    <LogIn className="h-4 w-4 text-gray-500" aria-hidden="true" /> {option.signInLabel}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </main>

      <Footer />
    </div>
  );
}
