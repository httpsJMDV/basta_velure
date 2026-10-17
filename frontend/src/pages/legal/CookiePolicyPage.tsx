import { Link } from 'react-router-dom';
import LegalLayout, { LegalPoint, type LegalSection } from '../../components/legal/LegalLayout';

/** What Loved-IT keeps in the browser (localStorage); there are no cookies of its own. */
const STORED: { name: string; why: string; until: string }[] = [
  { name: 'Sign-in token', why: 'Keeps you signed in between visits.', until: 'You sign out' },
  { name: 'Your account summary', why: 'Shows your name and photo right away while the page loads.', until: 'You sign out' },
  { name: 'Cart', why: 'Remembers what you added, even before you sign in.', until: 'You check out or clear it' },
  { name: 'Display choices', why: 'Remembers small preferences, such as a dismissed notice or a list or grid view.', until: 'You clear your browser data' },
];

const SECTIONS: LegalSection[] = [
  {
    id: 'summary',
    title: 'In short',
    body: (
      <LegalPoint>
        <p>Loved-IT does not use analytics, advertising or cross-site tracking. We set no cookies of our own. To work, the site keeps a few things in your browser&apos;s local storage, listed below.</p>
      </LegalPoint>
    ),
  },
  {
    id: 'what-we-store',
    title: 'What we keep in your browser',
    body: (
      <>
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <table className="w-full text-left text-[14px]">
            <thead className="bg-stone-50 text-[12px] text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Item</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Why</th>
                <th scope="col" className="px-4 py-2.5 font-semibold hidden sm:table-cell">Kept until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {STORED.map((s) => (
                <tr key={s.name} className="align-top">
                  <td className="px-4 py-3 font-semibold text-stone-900 whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-3 text-stone-700">{s.why}<span className="sm:hidden block mt-1 text-[12.5px] text-stone-500">Until: {s.until}</span></td>
                  <td className="px-4 py-3 text-stone-600 hidden sm:table-cell">{s.until}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LegalPoint>
          <p>All of these are needed for the site to work, so they are always on. None of them is shared with anyone.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'third-parties',
    title: 'Other services',
    body: (
      <LegalPoint title="Sign in with Google">
        <p>The &ldquo;Continue with Google&rdquo; button loads Google&apos;s sign-in script. If you use it, Google may set its own cookies under the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="font-semibold text-brand-red hover:underline">Google Privacy Policy</a>. Signing in with email and password does not involve Google.</p>
      </LegalPoint>
    ),
  },
  {
    id: 'your-choices',
    title: 'Your privacy choices',
    body: (
      <>
        <LegalPoint title="We do not sell or share your data for advertising">
          <p>There is nothing to opt out of: Loved-IT does not sell your personal information or share it for targeted advertising.</p>
        </LegalPoint>
        <LegalPoint title="Clearing what is stored">
          <p>Signing out removes your sign-in token and account summary. To remove everything else, clear this site&apos;s data in your browser settings; your cart and display choices will reset.</p>
        </LegalPoint>
        <LegalPoint title="Your personal information">
          <p>To see, correct or delete the information in your account, read <Link to="/privacy-policy#rights" className="font-semibold text-brand-red hover:underline">Your rights</Link> in the Privacy policy.</p>
        </LegalPoint>
      </>
    ),
  },
  {
    id: 'updates',
    title: 'Changes to this policy',
    body: (
      <LegalPoint>
        <p>If we start storing something new, we will update this page and change the date at the top before we do.</p>
      </LegalPoint>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      doc="cookies"
      title="Cookie policy"
      updated="October 17, 2026"
      intro={<p>What Loved-IT keeps in your browser, why, and how to remove it.</p>}
      sections={SECTIONS}
    />
  );
}
