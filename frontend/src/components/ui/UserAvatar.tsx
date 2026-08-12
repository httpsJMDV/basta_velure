interface UserAvatarProps {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-2xl',
};

export default function UserAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const sizeClass = SIZE[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-brand-red to-brand-red-dark flex items-center justify-center text-white font-bold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
