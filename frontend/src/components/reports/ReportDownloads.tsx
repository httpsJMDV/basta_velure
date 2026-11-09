// Excel and PDF of the report on screen, for the same period (docs/api/logistics-rider-reports.md). Both files are made
// by the server, so they match the page and the app.
import { useState } from 'react';
import { FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { downloadLogisticsReportApi } from '../../api/client';
import { useToast } from '../ui/Toast';

type Base = '/hub/reports' | '/logistics/reports' | '/rider/reports';

export default function ReportDownloads({ base, from, to, tone = 'light', disabled = false }: {
  base: Base;
  from: string;
  to: string;
  /** light: on a white page bar; dark: on a dark page hero. */
  tone?: 'light' | 'dark';
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);

  async function download(format: 'xlsx' | 'pdf') {
    setBusy(format);
    try {
      showToast(`Saved ${await downloadLogisticsReportApi(base, format, { from, to })}`);
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : 'The report could not be downloaded.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const group = tone === 'dark'
    ? 'border-white/15 bg-white/10 divide-white/15'
    : 'border-gray-200 bg-white divide-gray-200';
  const button = tone === 'dark'
    ? 'text-white hover:bg-white/10'
    : 'text-gray-700 hover:bg-gray-50';

  return (
    <div className={`inline-flex items-center rounded-xl border divide-x overflow-hidden print:hidden ${group}`} role="group" aria-label="Download this report">
      <button type="button" onClick={() => void download('xlsx')} disabled={disabled || busy !== null}
        title="Download an Excel workbook: the summary and every table, one sheet each"
        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold disabled:opacity-50 ${button}`}>
        {busy === 'xlsx'
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          : <FileSpreadsheet className={`w-3.5 h-3.5 ${tone === 'dark' ? 'text-emerald-300' : 'text-emerald-700'}`} aria-hidden="true" />}
        Excel
      </button>
      <button type="button" onClick={() => void download('pdf')} disabled={disabled || busy !== null}
        title="Download an A4 PDF to share or print"
        className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold disabled:opacity-50 ${button}`}>
        {busy === 'pdf'
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          : <FileText className={`w-3.5 h-3.5 ${tone === 'dark' ? 'text-rose-300' : 'text-brand-red'}`} aria-hidden="true" />}
        PDF
      </button>
    </div>
  );
}
