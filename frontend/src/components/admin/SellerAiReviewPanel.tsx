import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { reviewSellerApplicationAiApi, type SellerAiReview } from '../../api/client';

export default function SellerAiReviewPanel({ applicationId }: { applicationId: number }) {
  const [review, setReview] = useState<SellerAiReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const result = await reviewSellerApplicationAiApi(applicationId);
      if (active.current) setReview(result);
    } catch {
      if (active.current) setError('AI review could not be completed. Try again shortly, or continue reviewing the application yourself.');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  const evidence = review ? [
    ['Government ID', review.facts.government_id_provided],
    ['Shop address', review.facts.address_provided],
    ['Tax number', review.facts.tax_number_provided],
    ...(review.facts.business_registration_required ? [['Business registration', review.facts.business_registration_provided]] : []),
    ...(review.facts.bir_2303_required ? [['BIR Form 2303', review.facts.bir_2303_provided]] : []),
  ] as [string, boolean][] : [];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-white" aria-label="Seller AI review">
      <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row">
        <div className="flex w-full min-w-0 flex-1 gap-3 sm:w-auto">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#BE123C] shadow-sm ring-1 ring-rose-100"><Sparkles size={19} /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-gray-900">AI application review</h3><span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Advisory only</span></div>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">Get a completeness summary and suggested checks. You make every approval or rejection decision.</p>
          </div>
        </div>
        <button type="button" onClick={run} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#BE123C] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:shrink-0">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{busy ? 'Reviewing…' : review ? 'Review again' : 'Run AI review'}
        </button>
      </div>
      <div aria-live="polite" aria-busy={busy}>
        {error && <p role="alert" className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{error}</p>}
        {review && <div className="space-y-4 border-t border-rose-100/70 px-5 py-4">
          <p className="text-sm leading-relaxed text-gray-700">{review.summary}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{evidence.map(([label, provided]) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs"><span className="text-gray-600">{label}</span><span className={`inline-flex items-center gap-1 font-medium ${provided ? 'text-emerald-700' : 'text-amber-700'}`}>{provided ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}{provided ? 'Recorded' : 'Not recorded'}</span></div>)}</div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-gray-100"><h4 className="mb-2 text-xs font-bold text-gray-900">Checks for the reviewer</h4><ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-gray-600">{review.checks.map((check, i) => <li key={i}>{check}</li>)}</ol></div>
          <p className="text-[11px] text-gray-400">Generated {new Date(review.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} · Manila time. Results may be reused for 5 minutes.</p>
        </div>}
      </div>
      <div className="flex items-start gap-2 border-t border-rose-100/70 bg-white/70 px-5 py-3 text-[11px] leading-relaxed text-gray-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-rose-600" /><p>Only seller type and completeness indicators are sent to the AI. Private documents and personal details stay out of the prompt. Recorded uploads are not proof of authenticity—inspect the originals below.</p></div>
    </section>
  );
}
