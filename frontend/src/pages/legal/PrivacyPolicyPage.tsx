import { Link } from 'react-router-dom';
import LegalLayout, { LegalPoint, type LegalSection } from '../../components/legal/LegalLayout';

const SECTIONS: LegalSection[] = [
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <>
        <LegalPoint title="What you give us">
          <p>Your name, email, phone number, delivery addresses and date of birth when you sign up and order. To verify your identity we also ask for a government ID. Sellers, riders, hubs and courier companies add the documents their application needs, such as permits, a driver&apos;s license or OR/CR, and the GCash number they are paid on.</p>
        </LegalPoint>
        <LegalPoint title="What we record as you use Loved-IT">
          <p>Your orders, payments (method, amount, GCash reference and receipt), deliveries, messages, reviews and feedback. Our servers also log technical details such as your IP address and browser to keep the service secure. We do not use analytics or advertising trackers.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use it',
    body: (
      <>
        <LegalPoint title="To run the marketplace">
          <p>We use your information to take and deliver orders, check payments, settle returns and disputes, review applications and answer your messages.</p>
        </LegalPoint>
        <LegalPoint title="To keep you informed">
          <p>We email you about your account and your orders, for example a receipt, a shipping update or an application decision. We do not send marketing emails.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'share',
    title: 'Who sees it',
    body: (
      <>
        <LegalPoint title="The shop you buy from">
          <p>Your name, phone number and delivery address, so it can pack and label your order. Shops may only use them for that order.</p>
        </LegalPoint>
        <LegalPoint title="Buyers and couriers, if you sell or deliver">
          <p>A shop&apos;s GCash name, number and QR code are shown to signed-in buyers at checkout so they can pay it, and to the couriers that settle cash-on-delivery money with it. A rider&apos;s or hub&apos;s GCash is seen only by its courier company.</p>
        </LegalPoint>
        <LegalPoint title="Your hub and riders">
          <p>The courier hub and riders handling your parcel see the same delivery details, and only while the parcel is with them.</p>
        </LegalPoint>
        <LegalPoint title="Loved-IT administrators">
          <p>Government IDs and application documents are stored privately and are only seen by the team reviewing applications. They are never shown publicly.</p>
        </LegalPoint>
        <LegalPoint title="When the law requires it">
          <p>We may disclose information when a law, court order or government authority requires it, or to protect the safety of our users.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'keep',
    title: 'How long we keep it and how we protect it',
    body: (
      <>
        <LegalPoint title="Retention">
          <p>We keep your information while your account is open, and afterwards only as long as we need it for orders still in progress, disputes, or legal and tax obligations.</p>
        </LegalPoint>
        <LegalPoint title="Security">
          <p>Documents are kept outside public storage, passwords are stored hashed, and the site is served over an encrypted connection. No system is perfectly secure, so we also ask you to keep your password private.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <LegalPoint>
          <p>Under the Data Privacy Act of 2012 (Republic Act No. 10173) you can ask what we hold about you, correct it, object to how it is used, and ask us to delete it.</p>
        </LegalPoint>
        <LegalPoint title="How to ask">
          <p>You can change most details yourself in <Link to="/settings" className="font-semibold text-brand-red hover:underline">your account</Link>. For anything else, including deleting your account, message our support team. Some records, such as completed orders, may have to be kept for a time by law.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Cookies and browser storage',
    body: (
      <LegalPoint>
        <p>Loved-IT does not set tracking cookies. What we keep in your browser, and why, is explained in the <Link to="/cookie-policy" className="font-semibold text-brand-red hover:underline">Cookie policy</Link>.</p>
      </LegalPoint>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      doc="privacy"
      title="Privacy policy"
      updated="October 17, 2026"
      intro={<p>What personal information Loved-IT collects, why, who can see it, and the choices you have. We collect only what we need to run the marketplace.</p>}
      sections={SECTIONS}
    />
  );
}
