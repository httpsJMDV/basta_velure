import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie } from 'lucide-react';

const COOKIE_TYPES = [
  {
    name: 'Strictly Necessary',
    badge: 'Always Active',
    badgeCls: 'bg-green-50 text-green-600',
    description:
      'These cookies are essential for the platform to function. They enable core features like staying logged in, keeping items in your cart, and navigating between pages securely. You cannot opt out of these cookies.',
    examples: ['Session authentication token', 'Cart contents', 'CSRF security token'],
  },
  {
    name: 'Functional',
    badge: 'Optional',
    badgeCls: 'bg-blue-50 text-blue-600',
    description:
      'Functional cookies remember your preferences to give you a more personalized experience. For example, they remember your selected language, your last-viewed category, and whether you have dismissed certain notices.',
    examples: ['Language preference', 'Recently viewed products', 'Dismissed banners'],
  },
  {
    name: 'Analytics',
    badge: 'Optional',
    badgeCls: 'bg-amber-50 text-amber-600',
    description:
      'Analytics cookies help us understand how visitors interact with Velure. The data collected is aggregated and anonymized — it tells us which pages are most visited and where users drop off, so we can improve the experience.',
    examples: ['Page view counts', 'Session duration', 'Click-through rates'],
  },
  {
    name: 'Marketing',
    badge: 'Optional',
    badgeCls: 'bg-purple-50 text-purple-600',
    description:
      'Marketing cookies track your browsing activity to show you relevant advertisements on other websites and platforms. We only use these with your explicit consent. You can withdraw consent at any time from your account settings.',
    examples: ['Ad targeting identifiers', 'Conversion tracking', 'Retargeting pixels'],
  },
];

const SECTIONS = [
  {
    title: 'What Are Cookies?',
    text: 'Cookies are small text files that are placed on your device when you visit a website. They are widely used to make websites work efficiently, remember your preferences, and provide information to site owners. Cookies set by Velure are called "first-party cookies." Cookies set by our partners (such as analytics providers) are called "third-party cookies."',
  },
  {
    title: 'How Long Do Cookies Last?',
    text: 'Cookies can be either "session cookies" or "persistent cookies." Session cookies are temporary and are deleted when you close your browser. Persistent cookies remain on your device for a set period — typically between 30 days and 2 years depending on their purpose — or until you delete them manually.',
  },
  {
    title: 'Managing Your Cookie Preferences',
    text: 'You can control and manage cookies in several ways. Most browsers allow you to view, block, or delete cookies through their settings menu. You can also opt out of optional cookie categories at any time by visiting your account settings on Velure. Note that blocking strictly necessary cookies will prevent the platform from functioning correctly — for example, you will not be able to stay logged in or complete a purchase.',
  },
  {
    title: 'Browser-Level Controls',
    text: 'Each browser handles cookie management differently. You can find instructions for the most common browsers at their respective help centers: Chrome (support.google.com/chrome), Firefox (support.mozilla.org), Safari (support.apple.com), and Edge (support.microsoft.com). On mobile, you can manage cookies through your device\'s browser settings under Privacy or Site Settings.',
  },
  {
    title: 'Third-Party Cookies',
    text: 'Some features on Velure — such as embedded maps, social sharing buttons, or payment widgets — may set third-party cookies. These are governed by the privacy policies of the respective third parties, not by this Cookie Policy. We recommend reviewing the privacy policies of any third-party services you interact with.',
  },
  {
    title: 'Updates to This Policy',
    text: 'We may update this Cookie Policy from time to time as we add new features or as regulations change. When we make significant changes, we will notify you via a notice on the platform or by email. The "Last updated" date at the top of this page reflects the most recent revision.',
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-brand-gray-soft">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo1.png" alt="Velure" className="w-7 h-7 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-lg tracking-tight">Velure</span>
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <span className="text-sm font-semibold text-brand-black">Cookie Policy</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10">
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
              This policy explains how Velure uses cookies and similar technologies, what types of cookies
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
            <a href="mailto:privacy@velure.ph" className="text-brand-red hover:underline font-medium">
              privacy@velure.ph
            </a>
            {' '}or write to us at: Velure Inc., Makati City, Metro Manila, Philippines.
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

        <p className="text-center text-xs text-gray-400 mt-8">
          © {new Date().getFullYear()} Velure. All rights reserved.
        </p>
      </div>
    </div>
  );
}
