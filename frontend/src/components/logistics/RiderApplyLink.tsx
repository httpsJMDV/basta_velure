import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';

/**
 * The link to the public "Become a rider" form with this hub (or courier) already picked, plus its QR code, for a
 * Facebook post or a poster at the hub. Applications made through it land in the hub's Riders page as Pending.
 */
export default function RiderApplyLink({ query, title, hint, fileName }: {
  /** e.g. "hub=12" or "courier=3" */
  query: string;
  title: string;
  hint: string;
  fileName: string;
}) {
  const url = `${window.location.origin}/register/rider?${query}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Dark on white with a margin: it scans best that way, printed or on a phone screen.
    void QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })
      .then((data) => { if (!cancelled) setQr(data); });
    return () => { cancelled = true; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  const button = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:border-gray-400 transition-colors';

  return (
    <section className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      {qr
        ? <img src={qr} width={88} height={88} alt="QR code of the rider application link" className="rounded-lg border border-gray-100 shrink-0" />
        : <div className="w-[88px] h-[88px] rounded-lg bg-gray-100 animate-pulse shrink-0" aria-hidden="true" />}
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
        <p className="mt-2 font-mono text-[12px] text-gray-700 truncate" title={url}>{url}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={copy} className={button}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          {qr && (
            <a href={qr} download={`${fileName}.png`} className={button}><Download className="w-3.5 h-3.5" /> Download QR</a>
          )}
          <a href={url} target="_blank" rel="noreferrer" className={button}><ExternalLink className="w-3.5 h-3.5" /> Open form</a>
        </div>
      </div>
    </section>
  );
}
