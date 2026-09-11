import React from 'react';
import iconLight from '../assets/branding/loved-it-icon-on-light.png';
import iconDark from '../assets/branding/loved-it-icon-on-dark.png';
import fullLight from '../assets/branding/loved-it-logo-full-on-light.png';
import fullDark from '../assets/branding/loved-it-logo-full-on-dark.png';

export interface LovedItLogoProps {
  /** Surface background variant: 'light' for white/light surfaces, 'dark' for dark/black/red surfaces */
  variant?: 'light' | 'dark';
  /** 'full' renders the full graphical logo lockup image, 'icon' renders the circular emblem */
  type?: 'icon' | 'full';
  /** Whether to render text next to icon (only when type='icon') */
  showText?: boolean;
  /** Wrap the icon in a circular badge container */
  circle?: boolean;
  /** Size preset */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  /** Optional custom text class override */
  textClassName?: string;
  /** Container class */
  className?: string;
  /** Image class */
  imgClassName?: string;
  /** Alt attribute */
  alt?: string;
}

const SIZE_MAP = {
  xs: { icon: 'w-5 h-5', full: 'h-5' },
  sm: { icon: 'w-6 h-6', full: 'h-6' },
  md: { icon: 'w-8 h-8', full: 'h-8' },
  lg: { icon: 'w-10 h-10', full: 'h-10' },
  xl: { icon: 'w-14 h-14', full: 'h-14' },
  '2xl': { icon: 'w-20 h-20', full: 'h-20' },
  custom: { icon: '', full: '' },
};

export const LovedItLogo: React.FC<LovedItLogoProps> = ({
  variant = 'light',
  type = 'full',
  showText = false,
  circle = false,
  size = 'md',
  textClassName,
  className = '',
  imgClassName = '',
  alt = 'Loved-IT — The General Marketplace',
}) => {
  const isDark = variant === 'dark';

  if (type === 'full') {
    const fullSrc = isDark ? fullDark : fullLight;
    const sizeCls = size !== 'custom' ? SIZE_MAP[size].full : '';
    return (
      <img
        src={fullSrc}
        alt={alt}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className={`object-contain max-w-full block select-none protected-image no-save ${sizeCls} ${imgClassName} ${className}`}
      />
    );
  }

  const iconSrc = isDark ? iconDark : iconLight;
  const iconSizeCls = size !== 'custom' ? SIZE_MAP[size].icon : '';

  const imgElement = (
    <img
      src={iconSrc}
      alt={alt}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className={`object-contain select-none protected-image no-save ${circle ? 'w-full h-full p-1' : iconSizeCls} ${imgClassName}`}
    />
  );

  if (circle) {
    const circleContainer = (
      <div
        className={`rounded-full flex items-center justify-center shrink-0 overflow-hidden shadow-xs transition-transform ${iconSizeCls} ${
          isDark
            ? 'bg-white/10 border border-white/20'
            : 'bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200/80 shadow-xs'
        } ${className}`}
      >
        {imgElement}
      </div>
    );

    if (!showText) return circleContainer;

    return (
      <div className="inline-flex items-center gap-3 shrink-0">
        {circleContainer}
        <span
          className={`font-black tracking-tight text-xl leading-none ${
            textClassName
              ? textClassName
              : isDark
              ? 'text-white'
              : 'text-gray-900'
          }`}
        >
          Loved<span className="text-amber-500">-</span>IT
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      {imgElement}
      {showText && (
        <span
          className={`font-black tracking-tight text-lg leading-none ${
            textClassName
              ? textClassName
              : isDark
              ? 'text-white'
              : 'text-gray-900'
          }`}
        >
          Loved<span className="text-amber-500">-</span>IT
        </span>
      )}
    </div>
  );
};

export default LovedItLogo;
