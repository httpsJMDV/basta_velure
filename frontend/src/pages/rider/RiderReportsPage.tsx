import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BarChart2, RefreshCw } from 'lucide-react';
import { getRiderReportDocumentApi } from '../../api/client';
import ReportDownloads from '../../components/reports/ReportDownloads';
import ReportDocumentView from '../../components/reports/ReportDocumentView';
import type { ReportDocumentData } from '../../types';
import { lastDays } from '../../utils/adminReports';
import { apiErrorMessage } from '../../utils/apiError';
import { PageHero, StateCard } from './RiderUi';

const PRESETS = [7, 30, 90] as const;

/**
 * The rider's report for a period: earnings, pickups, deliveries and failed tries, by day and job by job, with the
 * same report as Excel or PDF (docs/api/logistics-rider-reports.md). Truck drivers see their trips too.
 */
export default function RiderReportsPage() {
  const [days, setDays] = useState<(typeof PRESETS)[number]>(30);
  const [doc, setDoc] = useState<ReportDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRiderReportDocumentApi(lastDays(days))
      .then(setDoc)
      .catch((e) => setError(apiErrorMessage(e, 'The report could not be loaded.')))
      .finally(() => setLoading(false));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="pb-4 space-y-4">
      <PageHero
        icon={BarChart2}
        title="Reports"
        subtitle={doc ? `${doc.range.label} · Philippine time` : 'Your jobs and earnings over a period'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-0.5 rounded-xl bg-gray-100 border border-gray-200" role="group" aria-label="Period">
              {PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => setDays(p)} aria-pressed={days === p}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${days === p ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>
                  {p} days
                </button>
              ))}
            </div>
            <ReportDownloads base="/rider/reports" from={doc?.range.from ?? lastDays(days).from} to={doc?.range.to ?? lastDays(days).to} disabled={!doc || loading} />
          </div>
        )}
      />

      {error && !doc ? (
        <StateCard icon={AlertCircle} tone="red" title="Report not loaded" message={error} alert>
          <button type="button" onClick={load} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold">
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
        </StateCard>
      ) : (
        <ReportDocumentView doc={doc} loading={loading} />
      )}
    </div>
  );
}
