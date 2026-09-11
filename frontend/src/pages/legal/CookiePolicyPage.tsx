import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';
import LovedItLogo from '../../components/LovedItLogo';
import Footer from '../../components/Footer';

const COOKIE_TYPES = [
  {
    name: 'Strictly Necessary Cookies',
    badge: 'Always Active',
    badgeCls: 'bg-green-50 text-green-700 border border-green-200',
    description: 'Essential for the website to function. They enable core features like logging in, shopping cart persistence, and checkout security. You cannot opt out of these cookies.',
    examples: ['Authentication session token', 'Cart item state', 'CSRF protection token'],
  },
  {
    name: 'Performance & Analytics Cookies',
    badge: 'Optional',
    badgeCls: 'bg-gray-100 text-gray-600',
    description: 'Help us understand how visitors interact with Loved-IT by collecting aggregated, anonymous data on pages visited, time spent, and errors encountered.',
    examples: ['Google Analytics', 'Page view metrics', 'Error logging'],
  },
  {
    name: 'Functional Cookies',
    badge: 'Optional',
    badgeCls: 'bg-gray-100 text-gray-600',
    description: 'Remember your choices to provide a more personalized experience, such as your preferred delivery address, recently viewed items, and display preferences.',
    examples: ['Recently viewed products', 'Dismissed notice flags', 'UI preference settings'],
  },
  {
    name: 'Targeting & Advertising Cookies',
    badge: 'Optional',
    badgeCls: 'bg-gray-100 text-gray-600',
    description: 'May be set through our site by advertising partners to build a profile of your interests and show you relevant ads on other sites. They do not store personal details directly.',
    examples: ['Ad retargeting pixels', 'Campaign attribution tags'],
  },
];

const SECTIONS = [
  {
    title: 'What Are Cookies?',
    text: 'Cookies are small text files placed on your computer or mobile device when you visit a website. They are widely used to make websites work efficiently, provide a smoother browsing experience, and give website operators insight into how their site is used.',
  },
  {
    title: 'How Loved-IT Uses Cookies',
    text: 'Loved-IT uses first-party cookies (set by us) for essential site operation, session management, and remembering your shopping cart. We also use third-party cookies from trusted partners such as Google for aggregated site analytics and fraud prevention.',
  },
  {
    title: 'How Long Cookies Stay on Your Device',
    text: 'Session cookies are temporary and expire when you close your browser. Persistent cookies remain on your device until they expire (typically between 30 days and 2 years) or until you manually delete them through your browser settings.',
  },
  {
    title: 'Managing and Disabling Cookies',
    text: 'Most web browsers allow you to manage your cookie preferences through their settings menu. You can block all cookies, accept only first-party cookies, or delete existing cookies. Please note that blocking strictly necessary cookies will prevent you from logging in, adding items to your cart, or checking out on Loved-IT.',
  },
  {
    title: 'Updates to This Policy',
    text: 'We may update this Cookie Policy from time to time to reflect changes in our practices or applicable law. Any updates will be posted here with an updated "Last updated" date. We encourage you to review this page periodically.',
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-brand-gray-soft">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center shrink-0">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-8 sm:h-9 object-contain" />
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <span className="text-sm font-semibold text-brand-black">Cookie Policy</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 flex-1 w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-black transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        {/* Hero */}
        <div className="bg-gradient-to-br from-brand-red to-brand-red-dark rounded-2xl p-8 mb-8 flex items-start gap-5">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Cookie className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cookie Policy</h1>
            <p className="text-white/70 text-sm mt-1">Last updated: August 1, 2026</p>
            <p className="text-white/85 text-sm mt-3 leading-relaxed max-w-2xl">
              This policy explains how Loved-IT uses cookies and similar technologies, what types of cookies
              we use, and how you can control them. We believe in being transparent about the data we collect.
            </p>
          </div>
        </div>

        {/* Cookie types */}
        <h2 className="font-bold text-brand-black mb-3 px-1">Types of Cookies We Use</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {COOKIE_TYPES.map((type) => (
            <div key={type.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-brand-black text-sm">{type.name}</p>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${type.badgeCls}`}>
                  {type.badge}
                </span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">{type.description}</p>
              <div className="pt-1 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Examples</p>
                <ul className="flex flex-col gap-1">
                  {type.examples.map((ex) => (
                    <li key={ex} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {SECTIONS.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-red-50 text-brand-red text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <h2 className="font-bold text-brand-black">{section.title}</h2>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm text-gray-500 leading-relaxed">{section.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <p className="text-sm font-semibold text-brand-black mb-1">Questions about cookies?</p>
          <p className="text-sm text-gray-500">
            Contact us at{' '}
            <a href="mailto:privacy@loved-it.ph" className="text-brand-red hover:underline font-medium">
              privacy@loved-it.ph
            </a>
            {' '}or write to us at: Loved-IT Inc., Makati City, Metro Manila, Philippines.
          </p>
        </div>

        {/* Related links */}
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <p className="text-sm font-semibold text-brand-black mb-3">Related Policies</p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/privacy-policy"
              className="text-sm text-brand-red hover:text-brand-red-dark font-medium transition-colors"
            >
              Privacy Policy →
            </Link>
            <Link
              to="/terms-of-service"
              className="text-sm text-brand-red hover:text-brand-red-dark font-medium transition-colors"
            >
              Terms of Service →
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
