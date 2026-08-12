import { Construction } from 'lucide-react';

export default function AdminPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-black">{title}</h1>
      <div className="bg-white rounded-2xl border border-gray-100 p-16 flex flex-col items-center justify-center text-center gap-4">
        <Construction className="w-10 h-10 text-gray-300" />
        <p className="text-gray-500 font-medium">Coming in a future build pass</p>
        <p className="text-xs text-gray-400 max-w-xs">
          This section requires tables not yet migrated (orders, payments, disputes, categories, products).
          It will be built once those migrations land.
        </p>
      </div>
    </div>
  );
}
