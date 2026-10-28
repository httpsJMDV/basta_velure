import type { AdminProduct } from '../../api/client';

/** What the AI listing check said about a product waiting for review (Amaru task 7), in the admin's words. */
export function aiReviewText(ai: AdminProduct['ai_review']): { text: string; tone: 'amber' | 'red' | 'gray' } | null {
  if (!ai) return null;
  if (ai.status === 'checking') return { text: 'AI check is still running.', tone: 'gray' };
  if (ai.status === 'unavailable') return { text: 'The AI check could not run, so this one needs a person.', tone: 'gray' };
  if (ai.verdict === 'reject') return { text: `AI suggests rejecting: ${ai.reason ?? ''}`, tone: 'red' };
  if (ai.verdict === 'send_to_admin') return { text: `AI was unsure: ${ai.reason ?? ''}`, tone: 'amber' };
  return null;
}

const TONE = {
  amber: 'text-amber-800 bg-amber-50 border-amber-400',
  red: 'text-red-800 bg-red-50 border-red-500',
  gray: 'text-gray-700 bg-gray-100 border-gray-400',
};

/**
 * Why a product waits for a person: held by the listing rules (filed under Others, or it mentions medicine), then
 * what the AI said, if it ran.
 */
function reviewNote(product: AdminProduct): { text: string; tone: 'amber' | 'red' | 'gray' } | null {
  if (product.status !== 'pending_review') return null;
  const ai = aiReviewText(product.ai_review);
  if (product.hold_reason) {
    const aiPassed = product.ai_review?.verdict === 'approve' ? ' The AI found nothing wrong.' : '';
    return { text: `Held for a person: ${product.hold_reason}${ai ? ` ${ai.text}` : aiPassed}`, tone: ai?.tone === 'red' ? 'red' : 'amber' };
  }
  return ai;
}

/** One short line under a product in the list. */
export function AiReviewLine({ product }: { product: AdminProduct }) {
  const note = reviewNote(product);
  if (!note) return null;
  return (
    <p title={note.text} className={`mt-1 text-[11px] leading-snug line-clamp-2 ${note.tone === 'red' ? 'text-red-600' : note.tone === 'amber' ? 'text-amber-700' : 'text-gray-500'}`}>
      {note.text}
    </p>
  );
}

/** The full note on the product's review page. */
export function AiReviewBanner({ product }: { product: AdminProduct }) {
  const note = reviewNote(product);
  if (!note) return null;
  return (
    <p className={`py-2.5 px-4 text-[13px] border-l-2 rounded-r-lg ${TONE[note.tone]}`}>
      <span className="font-semibold">Listing check:</span> {note.text.replace(/^AI /, 'The AI ')}
    </p>
  );
}
