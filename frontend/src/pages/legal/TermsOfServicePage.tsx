import { Link } from 'react-router-dom';
import { ArrowLeft, ScrollText } from 'lucide-react';

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    content: [
      {
        subtitle: 'Agreement to These Terms',
        text: 'By accessing or using Velure — whether as a guest, registered buyer, seller, or delivery rider — you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, please do not use the platform.',
      },
      {
        subtitle: 'Changes to Terms',
        text: 'We reserve the right to modify these Terms at any time. We will notify you of material changes via email or a prominent notice on the platform. Continued use of Velure after changes take effect constitutes your acceptance of the revised Terms.',
      },
    ],
  },
  {
    title: 'Accounts and Registration',
    content: [
      {
        subtitle: 'Eligibility',
        text: 'You must be at least 18 years old to create an account on Velure. By registering, you represent and warrant that you meet this age requirement and that all information you provide is accurate and complete.',
      },
      {
        subtitle: 'Account Security',
        text: 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately at support@velure.ph if you suspect unauthorized use of your account.',
      },
      {
        subtitle: 'One Account Per Person',
        text: 'Each person may maintain only one buyer account. Sellers may not operate multiple seller accounts without prior written approval from Velure. Accounts found to be duplicates may be suspended without notice.',
      },
    ],
  },
  {
    title: 'Buying on Velure',
    content: [
      {
        subtitle: 'Orders and Contracts',
        text: 'When you place an order, you are making a binding offer to purchase the item at the listed price. A contract is formed when the seller confirms your order. Velure acts as a marketplace facilitator and is not a party to the sale contract between you and the seller.',
      },
      {
        subtitle: 'Pricing and Payment',
        text: 'All prices are listed in Philippine Pesos (PHP) and are inclusive of applicable taxes unless stated otherwise. We accept GCash and Cash on Delivery (COD). Payment must be completed before an order is processed for GCash transactions.',
      },
      {
        subtitle: 'Cancellations and Returns',
        text: 'You may cancel an order before it is packed by the seller. Once packed or shipped, cancellations are subject to the seller\'s return policy. Items must be returned in their original condition with tags intact. Velure\'s dispute resolution team will mediate unresolved issues between buyers and sellers.',
      },
    ],
  },
  {
    title: 'Selling on Velure',
    content: [
      {
        subtitle: 'Seller Verification',
        text: 'To sell on Velure, you must complete our seller registration process, which includes identity verification via a government-issued ID. Your application is subject to review and approval by Velure. We reserve the right to reject any application at our discretion.',
      },
      {
        subtitle: 'Seller Responsibilities',
        text: 'Sellers are responsible for the accuracy of product listings, maintaining sufficient stock, fulfilling orders promptly, and complying with all applicable Philippine laws including consumer protection regulations. Misrepresentation of products is grounds for immediate account suspension.',
      },
      {
        subtitle: 'Prohibited Items',
        text: 'Sellers may not list counterfeit goods, items that infringe intellectual property rights, hazardous materials, or any product prohibited by Philippine law. Velure reserves the right to remove any listing and suspend any seller account found in violation of this policy.',
      },
      {
        subtitle: 'Payouts',
        text: 'Seller payouts are processed via GCash after order completion and any applicable holding period. Velure deducts a platform service fee from each transaction. The current fee schedule is available in your Seller Dashboard.',
      },
    ],
  },
  {
    title: 'Prohibited Conduct',
    content: [
      {
        subtitle: 'What You May Not Do',
        text: 'You agree not to: use the platform for any unlawful purpose; attempt to gain unauthorized access to any part of the platform or another user\'s account; post false, misleading, or defamatory content; engage in price manipulation or fake reviews; use automated tools to scrape or interact with the platform; or interfere with the platform\'s security or integrity.',
      },
      {
        subtitle: 'Consequences of Violations',
        text: 'Violations of these Terms may result in immediate suspension or permanent termination of your account, removal of your listings, withholding of pending payouts pending investigation, and referral to law enforcement where applicable.',
      },
    ],
  },
  {
    title: 'Intellectual Property',
    content: [
      {
        subtitle: 'Velure\'s Content',
        text: 'All content on the Velure platform — including the logo, design, text, graphics, and software — is owned by or licensed to Velure and is protected by Philippine and international intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.',
      },
      {
        subtitle: 'Your Content',
        text: 'By uploading product images, reviews, or other content to Velure, you grant us a non-exclusive, royalty-free, worldwide license to use, display, and distribute that content in connection with operating and promoting the platform.',
      },
    ],
  },
  {
    title: 'Limitation of Liability',
    content: [
      {
        subtitle: 'Platform as Marketplace',
        text: 'Velure is a marketplace that connects buyers and sellers. We do not manufacture, store, or inspect the products listed on the platform. We are not liable for the quality, safety, legality, or accuracy of any product listing.',
      },
      {
        subtitle: 'Limitation of Damages',
        text: 'To the maximum extent permitted by applicable law, Velure\'s total liability to you for any claim arising from your use of the platform shall not exceed the amount you paid for the transaction giving rise to the claim in the 90 days preceding the claim.',
      },
    ],
  },
  {
    title: 'Governing Law',
    content: [
      {
        subtitle: 'Applicable Law',
        text: 'These Terms are governed by the laws of the Republic of the Philippines. Any disputes arising from these Terms or your use of Velure shall be subject to the exclusive jurisdiction of the courts of Makati City, Metro Manila.',
      },
    ],
  },
];

export default function TermsOfServicePage() {
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
          <span className="text-sm font-semibold text-brand-black">Terms of Service</span>
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
        <div className="bg-gradient-to-br from-brand-black to-gray-800 rounded-2xl p-8 mb-8 flex items-start gap-5">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <ScrollText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
            <p className="text-white/50 text-sm mt-1">Last updated: August 1, 2026</p>
            <p className="text-white/75 text-sm mt-3 leading-relaxed max-w-2xl">
              These Terms of Service govern your use of the Velure platform — whether you're shopping,
              selling, or delivering. Please read them carefully before using our services.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {SECTIONS.map((section, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-gray-100 text-brand-black text-xs font-bold flex items-center justify-center shrink-0">
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
          <p className="text-sm font-semibold text-brand-black mb-1">Questions about these Terms?</p>
          <p className="text-sm text-gray-500">
            Contact us at{' '}
            <a href="mailto:legal@velure.ph" className="text-brand-red hover:underline font-medium">
              legal@velure.ph
            </a>
            {' '}or write to us at: Velure Inc., Makati City, Metro Manila, Philippines.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          © {new Date().getFullYear()} Velure. All rights reserved.
        </p>
      </div>
    </div>
  );
}
