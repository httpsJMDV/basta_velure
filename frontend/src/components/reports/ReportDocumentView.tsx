// A report from the server (ReportDocument): its key figures, then each table, the way the Excel and PDF files show
// them. Long tables show their first rows here; the files have every row.
import type { ReportCellType, ReportDocumentData } from '../../types';
import { displayCell } from '../../utils/reportFormat';

const NUMERIC: ReportCellType[] = ['int', 'money', 'percent', 'hours'];

const isNumeric = (type: ReportCellType, value: string | number | null) => NUMERIC.includes(type) && displayCell(type, value) !== value;

export default function ReportDocumentView({ doc, loading }: { doc: ReportDocumentData | null; loading?: boolean }) {
  if (!doc) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading report">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-200" />)}</div>
        <div className="h-64 rounded-2xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {doc.kpis.map((k) => (
          <div key={k.label} className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3.5 shadow-xs">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 truncate">{k.label}</p>
            <p className="mt-1 text-[22px] leading-tight font-black tabular-nums text-gray-900 truncate">{k.display}</p>
            {k.hint && <p className="mt-0.5 text-[11.5px] text-gray-500 truncate" title={k.hint}>{k.hint}</p>}
          </div>
        ))}
      </div>

      {doc.sections.map((s) => (
        <section key={s.title} className="bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden" aria-label={s.title}>
          <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-900">{s.title}</h2>
            <p className="text-[11.5px] text-gray-500 tabular-nums">
              {s.total_rows > s.rows.length ? `First ${s.rows.length} of ${s.total_rows.toLocaleString()} · all in the files` : `${s.total_rows.toLocaleString()} ${s.total_rows === 1 ? 'row' : 'rows'}`}
            </p>
          </div>
          {s.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-gray-400">{s.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50/80">
                    {s.columns.map((c) => (
                      <th key={c.label} scope="col" className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap ${NUMERIC.includes(c.type) ? 'text-right' : 'text-left'}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {s.rows.map((row, r) => (
                    <tr key={r} className="hover:bg-gray-50/60">
                      {s.columns.map((c, i) => (
                        <td key={c.label} className={`px-4 py-2.5 whitespace-nowrap ${NUMERIC.includes(c.type) ? 'text-right tabular-nums' : 'text-left'} ${i === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {displayCell(c.type, row[i] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {s.total && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60">
                      {s.columns.map((c, i) => (
                        <td key={c.label} className={`px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap ${isNumeric(c.type, s.total![i] ?? null) ? 'text-right tabular-nums' : 'text-left'}`}>
                          {displayCell(c.type, s.total![i] ?? null)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {s.note && <p className="px-4 py-3 border-t border-gray-100 text-[12px] text-gray-500">{s.note}</p>}
        </section>
      ))}

      {doc.notes.length > 0 && (
        <ul className="px-1 space-y-1 text-[11.5px] text-gray-500">
          {doc.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}
