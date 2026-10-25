import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Headphones } from 'lucide-react';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import { useChat } from '../../hooks/useChat';
import { useAuth } from '../../hooks/useAuth';

/** The page's sections, for the side menu and the jump links. Every rule below is how the app works today. */
const SECTIONS = [
  { id: 'paying', label: 'Paying safely' },
  { id: 'returns', label: 'Returns and refunds' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'sellers', label: 'Who sells here' },
  { id: 'scams', label: 'Scams to avoid' },
  { id: 'account', label: 'Your account' },
];

const RETURN_STEPS = [
  { title: 'Ask within 7 days', text: 'From Orders, open the delivered order and request a return within 7 days of delivery, before you mark it received. Give a reason, a short description and 1 to 5 photos.' },
  { title: 'The shop answers in 3 days', text: 'The shop approves or rejects your request, with a reason if it says no. If it does not answer in 3 days, your return is approved.' },
  { title: 'Escalate once if you disagree', text: 'If the shop rejects it, you can send it to the Loved-IT team once, within 3 days. The team reads both sides and decides.' },
  { title: 'Refund', text: 'When a return is approved you are refunded and the order shows as Returned. A rejected request that is not escalated completes the order.' },
];

const SCAMS = [
  { title: 'Paying outside checkout', text: 'A seller who asks you to pay a different GCash number, or to finish the deal on Messenger, Viber or Telegram, is taking you out of checkout. Payments made outside checkout are not covered by returns.' },
  { title: 'Fees before cash on delivery', text: 'A cash-on-delivery order never needs a reservation fee or a courier deposit. You pay the rider when the parcel is in your hands.' },
  { title: 'Asking for your delivery code early', text: 'Your 6-digit delivery code is how the rider proves you received the parcel. Give it only when you are holding the parcel.' },
  { title: 'Prices too good to be true', text: 'Branded gadgets or cosmetics far below their usual price are a warning sign. Check the shop\'s reviews and how long it has been on Loved-IT first.' },
];

export default function SafetyHelpPage() {
  const { openChatWithSupport, openChat } = useChat();
  const { user } = useAuth();
  const navigate = useNavigate();

  const chat = () => {
    if (!user) { navigate('/login?next=/help/safety'); return; }
    if (openChatWithSupport) void openChatWithSupport();
    else openChat();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900">
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-10 grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-8 lg:gap-14 items-end">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-brand-red">Help and Safety Center</p>
            <h1 className="mt-3 font-serif text-[36px] sm:text-[50px] font-bold tracking-tight leading-[1.05] text-[#1E1B18]">Shop safely on Loved-IT.</h1>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-stone-600">
              How paying, returns and delivery work, what to do when something goes wrong, and the scams to watch for.
            </p>
            <button type="button" onClick={chat}
              className="mt-7 inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold transition-colors">
              <Headphones className="w-4 h-4" /> {user ? 'Chat with Loved-IT Support' : 'Sign in to chat with Support'}
            </button>
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
          <Section id="paying" n={1} title="Paying safely">
            <div className="grid md:grid-cols-2 gap-6">
              <Card title="Cash on delivery">
                Pay the rider in cash when the parcel is in your hands. The rider enters the exact amount, so you never pay more than your order total.
              </Card>
              <Card title="GCash to the shop">
                Checkout shows the shop's own GCash name and number. Send the exact amount, then enter the reference number and upload the receipt. The shop checks it before it packs your order.
              </Card>
            </div>
            <p className="mt-6 pl-4 border-l-2 border-brand-red text-[14px] leading-relaxed text-stone-700">
              Only pay through Loved-IT checkout. Never send money to a number a seller gives you in chat or on social media: those payments are not covered by returns.
            </p>
          </Section>

          <Section id="returns" n={2} title="Returns and refunds">
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">
              {RETURN_STEPS.map((s, i) => (
                <li key={s.title} className="pt-4 border-t-2 border-[#1E1B18]">
                  <p className="font-serif text-[14px] font-bold text-brand-red tabular-nums">Step {i + 1}</p>
                  <h3 className="mt-1 text-[16px] font-semibold text-stone-900">{s.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-stone-600">{s.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 rounded-2xl bg-[#FAF8F5] border border-stone-200 px-5 py-4 text-[14px] leading-relaxed text-stone-700">
              <span className="font-semibold text-stone-900">Check the item before you tap Order Received.</span> Once you confirm, the order is complete and a return can no longer be asked for.
              If you do nothing, an order completes by itself 7 days after delivery.
            </p>
            <p className="mt-4 text-[13.5px] text-stone-600">
              Cancelling is different: you can cancel an order yourself until the shop marks it ready for pickup. Your stock, vouchers and any prepaid amount come back.
              {user && <> <Link to="/settings/orders" className="font-semibold text-brand-red hover:underline">Go to your orders</Link>.</>}
            </p>
          </Section>

          <Section id="delivery" n={3} title="Delivery">
            <ul className="grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Track every step">Track package shows each scan, from the shop to the hub to your door, with the rider's live location while they carry it.</Fact>
              <Fact title="Your 6-digit delivery code">Your order shows a code. The rider needs it, plus a photo, to mark the parcel delivered. Five wrong tries lock the code for 15 minutes.</Fact>
              <Fact title="Message your rider">While your parcel is out for delivery, Track package has a Message rider button for gate codes or directions.</Fact>
              <Fact title="If no one is home">A parcel gets up to 3 delivery tries. After that, or if you refuse it, it goes back to the shop and a prepaid order is refunded.</Fact>
            </ul>
          </Section>

          <Section id="sellers" n={4} title="Who sells here">
            <ul className="grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Every shop is checked">An admin reviews each application before the shop can sell: a government ID for everyone, and DTI or SEC papers and BIR Form 2303 for registered businesses.</Fact>
              <Fact title="Honest reviews">Only buyers whose order was completed can review a product or a shop. Shops can reply, but nobody can hide or delete a review.</Fact>
            </ul>
          </Section>

          <Section id="scams" n={5} title="Scams to avoid" dark>
            <ul className="grid md:grid-cols-2 gap-px bg-white/10 rounded-2xl overflow-hidden">
              {SCAMS.map((s) => (
                <li key={s.title} className="bg-[#1E1B18] p-6">
                  <h3 className="text-[15.5px] font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/70">{s.text}</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13.5px] text-white/70">Seen one of these? Report it in chat with Loved-IT Support, with the shop's name and a screenshot.</p>
          </Section>

          <Section id="account" n={6} title="Your account">
            <ul className="grid md:grid-cols-2 gap-x-10 gap-y-5">
              <Fact title="Never share your codes">Nobody from Loved-IT will ask for your password, your email code or your GCash MPIN. Anyone who does is not us.</Fact>
              <Fact title="Forgot your password?">Ask for a reset link on the sign-in page. It works once, for 1 hour, and every device signed in to your account is signed out.</Fact>
            </ul>
            <Link to="/forgot-password" className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-red hover:underline">
              Reset your password <ArrowRight className="w-4 h-4" />
            </Link>
          </Section>

          <section className="rounded-3xl bg-white border border-stone-200 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div>
              <h2 className="font-serif text-[24px] font-bold tracking-tight text-[#1E1B18]">Still need help?</h2>
              <p className="mt-1 text-[14px] text-stone-600">Chat with Loved-IT Support. A person reads every message.</p>
            </div>
            <button type="button" onClick={chat}
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold transition-colors shrink-0">
              <Headphones className="w-4 h-4" /> Chat with Support
            </button>
          </section>
        </div>
      </main>

      <Footer />
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#FAF8F5] border border-stone-200 p-5">
      <h3 className="text-[16px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{children}</p>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <h3 className="text-[15.5px] font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 text-[14px] leading-relaxed text-stone-600">{children}</p>
    </li>
  );
}
