const fs = require('fs');
const file = 'c:/Projects/basta_velure/frontend/src/pages/admin/AdminDashboardPage.tsx';
let t = fs.readFileSync(file, 'utf8');

// Replace the inline type annotation with a named interface to fix OXC parsing
t = t.replace(
  'function HighlightCard({ stats, payStats }: { stats: AdminStats; payStats: AdminPaymentStats | null })',
  'interface HighlightCardProps { stats: AdminStats; payStats: AdminPaymentStats | null; }\nfunction HighlightCard({ stats, payStats }: HighlightCardProps)'
);

fs.writeFileSync(file, t, 'utf8');
console.log('done, contains fix:', t.includes('HighlightCardProps'));
