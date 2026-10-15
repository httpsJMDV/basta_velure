import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import LovedItLogo from '../LovedItLogo';

export interface PortalPerk {
  icon: React.ElementType;
  text: string;
}

/**
 * The split sign-in layout of the buyer login (form on the left, photo on the right), for the courier and logistics
 * hub sign-in pages. The form column gets the children; the photo column is hidden on a phone.
 */
export default function PortalLoginShell({
  badge,
  heading,
  subtitle,
  image,
  imageAlt,
  headline,
  perks,
  children,
}: {
  badge: string;
  heading: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  /** The big lines over the photo. */
  headline: [string, string];
  perks: PortalPerk[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Form column */}
      <div className="w-full md:w-1/2 flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 bg-white">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="inline-block mb-8 group">
            <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-12 sm:h-14 object-contain group-hover:opacity-95 transition-opacity" />
          </Link>

          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-red bg-red-50 border border-red-100 rounded-full px-2.5 py-1 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-red" aria-hidden="true" />
            {badge}
          </p>
          <h1 className="text-3xl font-bold text-brand-black mb-1">{heading}</h1>
          <p className="text-sm text-gray-500 mb-8">{subtitle}</p>

          {children}
        </div>
      </div>

      {/* Photo column, hidden on a phone */}
      <div className="hidden md:block md:w-1/2 relative overflow-hidden bg-brand-black">
        <img src={image} alt={imageAlt} className="absolute inset-0 w-full h-full object-cover opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black/80 via-brand-black/30 to-transparent flex items-end p-12">
          <div>
            <p className="text-white text-4xl font-bold leading-tight">{headline[0]}</p>
            <p className="text-white text-4xl font-bold leading-tight">{headline[1]}</p>
            <ul className="mt-5 space-y-2">
              {perks.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-white/80 text-base">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
