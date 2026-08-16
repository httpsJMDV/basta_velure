const fs = require('fs');
const file = 'c:/Projects/basta_velure/frontend/src/pages/admin/AdminDashboardPage.tsx';
let t = fs.readFileSync(file, 'utf8');

// The correct new function (already inserted at first occurrence)
const CORRECT_START = 'function HighlightCard({ stats, payStats }';
// The old/duplicate function signature
const OLD_START = 'function HighlightCard({ stats }: { stats: AdminStats }) {';
const OLD_END   = "Today's highlight\n      </span>\n    </div>\n  );\n}";

// Remove every occurrence of the OLD function
let idx;
while ((idx = t.indexOf(OLD_START)) !== -1) {
  const endIdx = t.indexOf(OLD_END, idx);
  if (endIdx === -1) { console.error('end marker not found at', idx); break; }
  t = t.substring(0, idx) + t.substring(endIdx + OLD_END.length);
  console.log('Removed old copy at', idx);
}

// Verify only one HighlightCard remains
let count = 0, pos = -1;
while ((pos = t.indexOf('function HighlightCard', pos + 1)) !== -1) count++;
console.log('Remaining HighlightCard copies:', count);

fs.writeFileSync(file, t, 'utf8');
console.log('Done.');
