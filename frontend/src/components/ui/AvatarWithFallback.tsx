import { useState, useEffect } from 'react';
import { User, Store, Headphones } from 'lucide-react';

interface AvatarWithFallbackProps {
  src?: string | null;
  alt?: string;
  role?: 'buyer' | 'seller' | 'admin' | 'rider' | string;
  fallbackInitials?: string;
  className?: string;
  iconClassName?: string;
}

export default function AvatarWithFallback({
  src,
  alt = 'Avatar',
  role = 'buyer',
  fallbackInitials,
  className = 'w-10 h-10 rounded-2xl',
  iconClassName = 'w-5 h-5',
}: AvatarWithFallbackProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <div className={`relative overflow-hidden shrink-0 border border-gray-200/80 bg-gray-100 ${className}`}>
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Fallback rendering
  const isSeller = role === 'seller';
  const isAdmin = role === 'admin';

  return (
    <div
      className={`shrink-0 flex items-center justify-center font-bold text-xs select-none border ${className} ${
        isAdmin
          ? 'bg-rose-50 text-brand-red border-rose-100'
          : isSeller
          ? 'bg-amber-50 text-amber-800 border-amber-200/80'
          : 'bg-gray-100 text-gray-700 border-gray-200'
      }`}
    >
      {fallbackInitials ? (
        <span className="font-black uppercase tracking-tight">{fallbackInitials.slice(0, 2)}</span>
      ) : isAdmin ? (
        <Headphones className={iconClassName} />
      ) : isSeller ? (
        <Store className={iconClassName} />
      ) : (
        <User className={iconClassName} />
      )}
    </div>
  );
}

