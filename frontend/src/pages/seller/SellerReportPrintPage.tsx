import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import logo from '../../assets/branding/loved-it-logo-full-on-light.png';
import { useAuth } from '../../hooks/useAuth';
import {
  downloadSellerReportApi,
  getSellerPaymentMethodsApi,
  getSellerReportSummaryApi,
  getSellerReportTopProductsApi,
  getSellerRevenueChartApi,
  type SellerReportWindow,
} from '../../api/client';
import type { PaymentMethodSplit, SellerReportSummary, SellerRevenueChartPoint, SellerTopProduct } from '../../types';
import { apiErrorMessage } from '../../utils/apiError';

const peso = (n: number | undefined) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number | undefined) => Number(n || 0).toLocaleString('en-PH');
/** ₱950, ₱12.5k, ₱1.2M: short enough for a chart's scale. */
const short = (n: number) => (n >= 1e6 ? `₱${(n / 1e6).toFixed(1).replace('.0', '')}M` : n >= 1e3 ? `₱${(n / 1e3).toFixed(1).replace('.0', '')}k` : `₱${Math.round(n)}`);
const longDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });

const RANGE_LABEL: Record<string, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', all: 'All time' };

interface ReportData {
  summary: SellerReportSummary;
  chart: SellerRevenueChartPoint[];
  payments: PaymentMethodSplit;
  products: SellerTopProduct[];
}

/** Gross sales per day (or month) as bars, drawn in SVG so the PDF stays sharp at any zoom. */
function SalesBars({ points }: { points: SellerRevenueChartPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.gross_sales));
  const w = 640;
  const top = 14; // room above the highest gridline for its label
  const h = 112; // the plot, from the top gridline to the baseline
  const left = 52; // the scale labels sit left of the bars
  const plot = w - left;
  const gap = points.length > 60 ? 1 : 2;
  const bar = Math.max(1, (plot - gap * (points.length - 1)) / Math.max(1, points.length));
  const ticks = [0, 0.5, 1];
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const y = (share: number) => top + h - h * share;

  return (
    <svg viewBox={`0 0 ${w} ${top + h + 20}`} className="w-full h-auto" role="img" aria-label="Gross sales over the period">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#a8a29e' : '#e7e5e4'} strokeWidth="1" />
          <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#a8a29e">{short(max * t)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const bh = (p.gross_sales / max) * h;
        const x = left + i * (bar + gap);
        const last = i === points.length - 1;
        return (
          <g key={p.iso_date ?? p.date}>
            {p.gross_sales > 0 && <rect x={x} y={y(0) - Math.max(bh, 1.5)} width={bar} height={Math.max(bh, 1.5)} rx={bar > 6 ? 2 : 0} fill="#b91c1c" />}
            {(i % labelEvery === 0 || (last && points.length > 1 && i % labelEvery > labelEvery / 2)) && (
              <text x={i === 0 ? x : last ? x + bar : x + bar / 2} y={y(0) + 14} textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'} fontSize="9" fill="#78716c">{p.date}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4 pb-1.5 mb-3 border-b border-stone-900">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-900">{title}</h2>
        {note && <p className="text-[10px] text-stone-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const TH = 'py-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-stone-500 text-left';
const TD = 'py-1.5 text-[11px] text-stone-800 border-t border-stone-200 align-top';

/**
 * The seller's report as an A4 document: the same window and figures as the Reports page, laid out to read on paper
 * and to save as a PDF from the browser's print dialog. Opened from Reports with ?range= or ?from=&to=; with
 * ?print=1 the print dialog opens once the figures have loaded.
 */
export default function SellerReportPrintPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const window_: SellerReportWindow = useMemo(() => {
    const from = params.get('from');
    const to = params.get('to');
    return from && to ? { from, to } : { range: params.get('range') ?? '30d' };
  }, [params]);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const printed = useRef(false);
  // When the report was made, fixed for the life of the page.
  const [madeAt] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    const monthly = window_.range === '12m' || window_.range === 'all';
    Promise.all([
      getSellerReportSummaryApi(window_),
      getSellerRevenueChartApi({ ...window_, ...(monthly ? { interval: 'monthly' } : {}) }),
      getSellerPaymentMethodsApi(window_),
      getSellerReportTopProductsApi(window_),
    ])
      .then(([summary, chart, payments, products]) => { if (live) setData({ summary, chart, payments, products }); })
      .catch((e) => { if (live) setError(apiErrorMessage(e, 'The report could not be loaded.')); });
    return () => { live = false; };
  }, [window_]);

  // Opened with "Save as PDF": print once the figures are on the page (and the logo has had a moment to load).
  useEffect(() => {
    if (!data || printed.current || params.get('print') !== '1') return;
    printed.current = true;
    const id = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(id);
  }, [data, params]);

  const shop = user?.seller_profile?.shop_name ?? 'Your shop';
  const s = data?.summary;
  const period = s?.from && s?.to
    ? (s.from === s.to ? longDay(s.from) : `${longDay(s.from)} – ${longDay(s.to)}`)
    : RANGE_LABEL[window_.range ?? ''] ?? 'All time';
  const rangeName = window_.range ? RANGE_LABEL[window_.range] : 'Custom range';
  const byMonth = !!data && data.chart.length > 0 && !/^\w{3} \d{2}$/.test(data.chart[0].date);
  const salesRows = (data?.chart ?? []).filter((p) => p.gross_sales > 0 || p.net_earnings > 0);
  const payments = data?.payments;
  const paid = [
    { label: 'Cash on delivery', row: payments?.cod },
    { label: 'GCash to your shop', row: payments?.gcash },
    { label: 'E-wallet and card (via Loved-IT)', row: payments?.e_wallet_card },
  ];
  const volume = Math.max(0.0001, payments?.total_volume ?? 0);
  const aov = s && s.total_orders > 0 ? s.gross_sales / s.total_orders : 0;
  const keepRate = s && s.gross_sales > 0 ? Math.round((s.net_earnings / s.gross_sales) * 1000) / 10 : null;

  const excel = async () => {
    setDownloading(true);
    try {
      await downloadSellerReportApi(window_);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-200/70 print:bg-white text-stone-900">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 12mm 14mm; }
          html, body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-stone-200 print:hidden">
        <div className="max-w-[210mm] mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/seller/reports" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-600 hover:text-stone-900">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Reports
          </Link>
          <p className="hidden sm:block text-[12px] text-stone-500">A4 preview · choose <span className="font-semibold text-stone-700">Save as PDF</span> as the printer</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void excel()} disabled={downloading || !data}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-stone-300 bg-white text-[12.5px] font-semibold text-stone-800 hover:border-stone-500 disabled:opacity-50">
              {downloading ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-700" aria-hidden="true" />} Excel
            </button>
            <button type="button" onClick={() => window.print()} disabled={!data}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-stone-900 text-white text-[12.5px] font-semibold hover:bg-black disabled:opacity-50">
              <Printer className="w-4 h-4" aria-hidden="true" /> Save as PDF
            </button>
          </div>
        </div>
      </header>

      <main className="py-6 sm:py-10 px-3 print:p-0">
        <article className="mx-auto w-full max-w-[210mm] min-h-[297mm] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_30px_rgba(0,0,0,0.08)] px-[12mm] py-[12mm] print:shadow-none print:max-w-none print:min-h-0 print:p-0">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-6">
            <img src={logo} alt="Loved-IT" className="h-8 w-auto" />
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-red">Sales report</p>
              <p className="mt-0.5 text-[10.5px] text-stone-500">Made {madeAt.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
            </div>
          </div>
          <div className="mt-5 pb-4 border-b-2 border-stone-900">
            <h1 className="font-serif text-[30px] leading-tight text-stone-900">{shop}</h1>
            <p className="mt-1 text-[12.5px] text-stone-600">
              <span className="font-semibold text-stone-800">{period}</span>
              {rangeName !== period && <><span className="mx-2 text-stone-300">|</span>{rangeName}</>}
              <span className="mx-2 text-stone-300">|</span>{s?.from ? 'Manila time, both days included' : 'Every order so far'}
            </p>
          </div>

          {error && <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 print:hidden">{error}</p>}
          {!data && !error && (
            <div className="mt-8 space-y-3" aria-hidden="true">
              <div className="h-20 rounded-lg bg-stone-100 animate-pulse" />
              <div className="h-40 rounded-lg bg-stone-100 animate-pulse" />
              <div className="h-24 rounded-lg bg-stone-100 animate-pulse" />
            </div>
          )}

          {data && s && (
            <>
              {/* Headline figures */}
              <div className="grid grid-cols-4 mt-6 border border-stone-300 divide-x divide-stone-300 break-inside-avoid">
                {[
                  { label: 'Gross sales', value: peso(s.gross_sales), hint: 'Items sold, before discounts' },
                  { label: 'Net earnings', value: peso(s.net_earnings), hint: keepRate === null ? 'What the shop keeps' : `${keepRate}% of gross sales`, strong: true },
                  { label: 'Orders', value: whole(s.total_orders), hint: `${whole(s.delivered_orders)} delivered or completed` },
                  { label: 'Units sold', value: whole(s.units_sold), hint: `Average order ${peso(aov)}` },
                ].map((k) => (
                  <div key={k.label} className={`px-3.5 py-3 ${k.strong ? 'bg-stone-900 text-white' : ''}`}>
                    <p className={`text-[9.5px] font-bold uppercase tracking-[0.1em] ${k.strong ? 'text-white/60' : 'text-stone-500'}`}>{k.label}</p>
                    <p className="mt-1 text-[17px] font-bold tabular-nums leading-tight">{k.value}</p>
                    <p className={`mt-0.5 text-[10px] ${k.strong ? 'text-white/60' : 'text-stone-500'}`}>{k.hint}</p>
                  </div>
                ))}
              </div>

              {/* From gross to net, as one sum */}
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-3.5 py-2.5 border border-t-0 border-stone-300 bg-stone-50 text-[11px] text-stone-600 tabular-nums break-inside-avoid">
                <span><span className="font-semibold text-stone-900">{peso(s.gross_sales)}</span> gross sales</span>
                <span className="text-stone-400">−</span>
                <span><span className="font-semibold text-stone-900">{peso(s.seller_discounts)}</span> shop discounts</span>
                <span className="text-stone-400">−</span>
                <span><span className="font-semibold text-stone-900">{peso(s.commission_paid)}</span> Loved-IT commission</span>
                <span className="text-stone-400">=</span>
                <span><span className="font-bold text-stone-900">{peso(s.net_earnings)}</span> net earnings</span>
              </div>

              <Section title={byMonth ? 'Gross sales by month' : 'Gross sales by day'} note={salesRows.length === 0 ? 'No sales in this period' : undefined}>
                <SalesBars points={data.chart} />
              </Section>

              <div className="grid grid-cols-2 gap-8">
                <Section title="How buyers paid">
                  <table className="w-full">
                    <thead><tr><th className={TH}>Method</th><th className={`${TH} text-right`}>Orders</th><th className={`${TH} text-right`}>Amount</th></tr></thead>
                    <tbody>
                      {paid.map((m) => {
                        const share = (m.row?.volume ?? 0) / volume;
                        return (
                          <tr key={m.label}>
                            <td className={TD}>
                              {m.label}
                              <span className="block mt-1 h-1 bg-stone-100" aria-hidden="true"><span className="block h-full bg-stone-800" style={{ width: `${Math.round(share * 100)}%` }} /></span>
                            </td>
                            <td className={`${TD} text-right tabular-nums`}>{whole(m.row?.count)}</td>
                            <td className={`${TD} text-right tabular-nums`}>{peso(m.row?.volume)}<span className="block text-[9.5px] text-stone-500">{Math.round(share * 100)}%</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[9.5px] leading-snug text-stone-500">Order totals include shipping and come off any vouchers, so they differ from gross sales.</p>
                </Section>

                <Section title={byMonth ? 'Months with sales' : 'Days with sales'} note={salesRows.length > 14 ? `Best ${Math.min(14, salesRows.length)} of ${salesRows.length}` : undefined}>
                  <table className="w-full">
                    <thead><tr><th className={TH}>{byMonth ? 'Month' : 'Day'}</th><th className={`${TH} text-right`}>Gross</th><th className={`${TH} text-right`}>Net</th></tr></thead>
                    <tbody>
                      {[...salesRows].sort((a, b) => b.gross_sales - a.gross_sales).slice(0, 14).map((p) => (
                        <tr key={p.iso_date ?? p.date}>
                          <td className={TD}>{p.date}</td>
                          <td className={`${TD} text-right tabular-nums`}>{peso(p.gross_sales)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{peso(p.net_earnings)}</td>
                        </tr>
                      ))}
                      {salesRows.length === 0 && <tr><td colSpan={3} className={`${TD} text-stone-500`}>No sales yet in this period.</td></tr>}
                    </tbody>
                  </table>
                </Section>
              </div>

              <Section title="Best-selling products" note={data.products.length ? 'By gross sales' : undefined}>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={`${TH} w-7`}>#</th><th className={TH}>Product</th><th className={`${TH} text-right`}>Units</th>
                      <th className={`${TH} text-right`}>Gross sales</th><th className={`${TH} text-right`}>Net earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p, i) => (
                      <tr key={p.product_id ?? p.name}>
                        <td className={`${TD} text-stone-400 tabular-nums`}>{i + 1}</td>
                        <td className={TD}>{p.name}</td>
                        <td className={`${TD} text-right tabular-nums`}>{whole(p.units_sold)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{peso(p.gross_sales ?? p.revenue)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{peso(p.net_earnings)}</td>
                      </tr>
                    ))}
                    {data.products.length === 0 && <tr><td colSpan={5} className={`${TD} text-stone-500`}>No products sold in this period.</td></tr>}
                  </tbody>
                </table>
              </Section>

              <footer className="mt-8 pt-3 border-t border-stone-300 text-[9.5px] leading-relaxed text-stone-500 break-inside-avoid">
                <p>
                  <span className="font-semibold text-stone-700">How these are counted.</span> Gross sales are your items' prices times quantities; shipping is not a sale.
                  Cancelled and returned orders are left out. Net earnings are what the shop keeps after its own discounts and Loved-IT's commission.
                  The Excel download has every order and product of this period.
                </p>
                <p className="mt-2 flex justify-between"><span>Loved-IT · loved-it.shop</span><span>{shop}</span></p>
              </footer>
            </>
          )}
        </article>
      </main>
    </div>
  );
}
