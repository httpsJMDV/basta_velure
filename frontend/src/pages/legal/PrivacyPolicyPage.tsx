import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import LovedItLogo from '../../components/LovedItLogo';
import Footer from '../../components/Footer';

const SECTIONS = [
  {
    title: 'Information We Collect',
    content: [
      {
        subtitle: 'Information You Provide',
        text: 'When you create an account, place an order, or register as a seller, we collect your name, email address, phone number, delivery address, date of birth, and payment-related information such as your GCash number. Sellers additionally provide government-issued ID details for verification purposes.',
      },
      {
        subtitle: 'Information Collected Automatically',
        text: 'When you browse Loved-IT, we automatically collect certain technical data including your IP address, browser type, device information, pages visited, and time spent on the platform. This data is collected through cookies and similar tracking technologies.',
      },
      {
        subtitle: 'Transaction Information',
        text: 'We record details of purchases you make, including the items ordered, amounts paid, payment method, and delivery status. This information is retained to support order history, returns, and dispute resolution.',
      },
    ],
  },
  {
    title: 'How We Use Your Information',
    content: [
      {
        subtitle: 'To Provide Our Services',
        text: 'We use your information to process orders, facilitate payments, coordinate deliveries, and provide customer support. Your contact details are used to send order confirmations, shipping updates, and important account notifications.',
      },
      {
        subtitle: 'To Improve the Platform',
        text: 'Aggregated and anonymized usage data helps us understand how shoppers interact with Loved-IT, which allows us to improve product discovery, fix issues, and develop new features.',
      },
      {
        subtitle: 'Marketing Communications',
        text: 'With your consent, we may send you promotional emails about new arrivals, sales, and exclusive offers. You can opt out at any time by clicking "Unsubscribe" in any marketing email or updating your notification preferences in your account settings.',
      },
    ],
  },
  {
    title: 'How We Share Your Information',
    content: [
      {
        subtitle: 'With Sellers',
        text: 'When you place an order, we share your name, delivery address, and contact number with the seller fulfilling your order. Sellers are prohibited from using this information for any purpose other than completing your purchase.',
      },
      {
        subtitle: 'With Delivery Riders',
        text: 'Riders assigned to your delivery receive your name, delivery address, and contact number to complete the delivery. This information is not retained by riders after the delivery is completed.',
      },
      {
        subtitle: 'With Service Providers',
        text: 'We work with trusted third-party providers for payment processing, email delivery, and analytics. These providers are contractually bound to handle your data securely and only for the purposes we specify.',
      },
      {
        subtitle: 'Legal Requirements',
        text: 'We may disclose your information if required by law, court order, or government authority, or if we believe disclosure is necessary to protect the rights, property, or safety of Loved-IT, our users, or the public.',
      },
    ],
  },
  {
    title: 'Data Retention and Security',
    content: [
      {
        subtitle: 'How Long We Keep Your Data',
        text: 'We retain your personal information for as long as your account is active or as needed to provide you services, comply with legal obligations, resolve disputes, and enforce our agreements. Government ID images uploaded for seller verification are retained securely in accordance with Philippine regulations.',
      },
      {
        subtitle: 'Security Measures',
        text: 'We implement technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no internet transmission is 100% secure, and we cannot guarantee absolute security.',
      },
    ],
  },
  {
    title: 'Your Rights',
    content: [
      {
        subtitle: 'Access and Correction',
        text: 'You have the right to access and update your personal information at any time through your account settings. If you need assistance, please contact our support team.',
      },
      {
        subtitle: 'Account Deletion',
        text: 'You may request deletion of your account and personal data by contacting us. We will process your request in accordance with applicable laws, subject to retention requirements for pending orders or legal obligations.',
      },
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-brand-gray-soft">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center shrink-0">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-8 sm:h-9 object-contain" />
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <span className="text-sm font-semibold text-brand-black">Privacy Policy</span>
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
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
            <p className="text-white/70 text-sm mt-1">Last updated: August 1, 2026</p>
            <p className="text-white/85 text-sm mt-3 leading-relaxed max-w-2xl">
              At Loved-IT, your privacy matters. This policy explains what personal information we collect,
              how we use it, and the choices you have. By using Loved-IT, you agree to the practices described here.
            </p>
          </div>
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
              <div className="px-6 py-5 space-y-5">
                {section.content.map((item, j) => (
                  <div key={j}>
                    <p className="text-sm font-semibold text-brand-black mb-1">{item.subtitle}</p>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <p className="text-sm font-semibold text-brand-black mb-1">Questions about this policy?</p>
          <p className="text-sm text-gray-500">
            Contact our Data Privacy Officer at{' '}
            <a href="mailto:privacy@loved-it.ph" className="text-brand-red hover:underline font-medium">
              privacy@loved-it.ph
            </a>
            {' '}or write to us at: Loved-IT Inc., Makati City, Metro Manila, Philippines.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
