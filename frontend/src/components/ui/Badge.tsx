type BadgeVariant = 'pending' | 'approved' | 'rejected' | 'default';

const styles: Record<BadgeVariant, string> = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  default:  'bg-gray-100 text-gray-700',
};

export default function Badge({ label, variant = 'default' }: { label: string; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[variant]}`}>
      {label}
    </span>
  );
}
