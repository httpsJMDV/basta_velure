import React from 'react';
import { Link } from 'react-router-dom';
import LovedItLogo from './LovedItLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-brand-black text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">

        {/* Brand Lockup & Socials */}
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
          <Link to="/" className="inline-flex items-center">
            <LovedItLogo variant="dark" type="full" size="custom" imgClassName="h-10 sm:h-12 object-contain" />
          </Link>
          <p className="text-white/50 text-sm leading-relaxed">
            The General Marketplace built for the Philippines — trusted sellers, secure payments, and nationwide delivery.
          </p>
          <div className="flex gap-3 mt-1">
            <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.975.975 1.246 2.242 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.975.975-2.242 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.975-.975-1.246-2.242-1.308-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.975-.975 2.242-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038.058-1.28.072-1.689.072-4.948s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
            </a>
            <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
            </a>
            <a href="#" aria-label="TikTok" className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-red flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </a>
          </div>
        </div>

        {/* Company */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest text-brand-red">Company</p>
          <ul className="flex flex-col gap-2.5">
            <li>
              <Link to="/about" className="text-white/70 text-sm hover:text-white hover:underline transition-colors font-medium">
                About Us
              </Link>
            </li>
            <li>
              <Link to="/register/seller" className="text-white/70 text-sm hover:text-white transition-colors">
                Sell on Loved-IT
              </Link>
            </li>
          </ul>
        </div>

        {/* Shop */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest text-brand-red">Shop</p>
          <ul className="flex flex-col gap-2.5">
            {[
              { label: 'New Arrivals', to: '/search' },
              { label: 'Best Sellers', to: '/search' },
              { label: 'Sale', to: '/search?on_sale=true' },
              { label: 'All Products', to: '/search' },
            ].map(({ label, to }) => (
              <li key={label}>
                <Link to={to} className="text-white/70 text-sm hover:text-white transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Support */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest text-brand-red">Support</p>
          <ul className="flex flex-col gap-2.5">
            {[
              { label: 'Help & Safety Center', to: '/help/safety' },
              { label: 'Track My Order', to: '/settings/orders' },
              { label: 'Returns & Exchanges', to: '/settings/returns' },
              { label: 'Buyer Protection', to: '/help/safety' },
            ].map(({ label, to }) => (
              <li key={label}>
                <Link to={to} className="text-white/70 text-sm hover:text-white transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <p className="text-white font-semibold text-sm mb-4 uppercase tracking-widest text-brand-red">Legal</p>
          <ul className="flex flex-col gap-2.5">
            {[
              { label: 'Privacy Policy',   to: '/privacy-policy' },
              { label: 'Terms of Service', to: '/terms-of-service' },
              { label: 'Cookie Policy',    to: '/cookie-policy' },
            ].map(({ label, to }) => (
              <li key={label}>
                <Link to={to} className="text-white/70 text-sm hover:text-white transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <p className="text-white/40 text-xs">
            © {new Date().getFullYear()} Loved-IT. All rights reserved.
          </p>
          <p className="text-white/30 text-xs hidden sm:block">
            The General Marketplace — Shop Everything, Delivered.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
