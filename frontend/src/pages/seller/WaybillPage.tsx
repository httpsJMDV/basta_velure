import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { Printer, ArrowLeft, AlertCircle, Package } from 'lucide-react';
import { getSellerOrderWaybillApi } from '../../api/client';
import type { WaybillData } from '../../types';

export default function WaybillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [waybill, setWaybill] = useState<WaybillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getSellerOrderWaybillApi(Number(id))
      .then((data) => {
        setWaybill(data);
      })
      .catch((err: any) => {
        const msg = err.response?.data?.message || 'Failed to load waybill data.';
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!loading && waybill?.barcode?.value && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, waybill.barcode.value, {
          format: 'CODE128',
          width: 1.8,
          height: 48,
          displayValue: true,
          font: 'monospace',
          fontSize: 12,
          textMargin: 3,
          margin: 0,
        });
      } catch (err) {
        console.error('Barcode render error:', err);
      }
    }
  }, [loading, waybill]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-brand-red border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Generating shipping waybill...</p>
        </div>
      </div>
    );
  }

  if (error || !waybill) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-gray-900">Waybill Unavailable</h2>
          <p className="text-xs text-gray-500">{error || 'Unable to retrieve waybill data.'}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const { order, sender, recipient, items, cod } = waybill;

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4 print:p-0 print:bg-white text-gray-900">
      {/* Screen Control Bar (Hidden on Print) */}
      <div className="max-w-[420px] mx-auto mb-4 flex items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-400 bg-gray-200/60 px-2 py-1 rounded-md">
            Format: A6 (105×148mm)
          </span>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-brand-red hover:bg-red-700 rounded-xl shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Waybill
          </button>
        </div>
      </div>

      {/* A6 Waybill Printable Container */}
      <div
        id="waybill-label"
        className="w-full max-w-[105mm] min-h-[148mm] mx-auto bg-white border-2 border-black p-3.5 text-[11px] leading-tight font-sans print:border-none print:max-w-none print:w-full print:m-0 print:p-3"
        style={{
          boxSizing: 'border-box',
        }}
      >
        {/* Header: Carrier Brand & Document Type */}
        <div className="border-b-2 border-black pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-black stroke-[2.5]" />
            <span className="text-sm font-black tracking-tight uppercase">LOVED-IT EXPRESS</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-black uppercase tracking-wider block bg-black text-white px-1.5 py-0.5 rounded-sm">
              AIR WAYBILL
            </span>
          </div>
        </div>

        {/* Barcode & Tracking Number Section */}
        <div className="py-2.5 text-center border-b border-black">
          <div className="flex justify-center items-center">
            <svg ref={barcodeRef} className="max-w-full" />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-gray-600 px-1">
            <span>Order #{order.order_number}</span>
            <span>{order.created_at ? new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span>
          </div>
        </div>

        {/* Destination Routing Highlight */}
        <div className="py-1.5 border-b-2 border-black flex items-center justify-between bg-gray-50 px-1">
          <div>
            <span className="text-[8px] font-bold text-gray-500 uppercase block">Destination Hub / Brgy</span>
            <span className="text-xs font-black uppercase tracking-wide">{recipient.barangay || 'STANDARD ROUTE'}</span>
          </div>
          <div className="text-right">
            <span className="text-[8px] font-bold text-gray-500 uppercase block">City / Province</span>
            <span className="text-[11px] font-bold uppercase">{recipient.city || recipient.province || 'METRO MANILA'}</span>
          </div>
        </div>

        {/* Addresses Section (From & To) */}
        <div className="border-b border-black divide-y divide-black">
          {/* FROM */}
          <div className="py-1.5">
            <span className="text-[8px] font-extrabold uppercase text-gray-500 tracking-wider block mb-0.5">FROM (SENDER):</span>
            <div className="font-bold text-[11px]">{sender.shop_name || 'Loved-IT Merchant'}</div>
            <div className="text-[10px] text-gray-700">Phone: {sender.contact_phone || 'N/A'}</div>
            <div className="text-[10px] text-gray-600 line-clamp-2">
              {sender.full_address || [sender.street, sender.barangay, sender.city, sender.province].filter(Boolean).join(', ')}
            </div>
          </div>

          {/* TO */}
          <div className="py-1.5">
            <span className="text-[8px] font-extrabold uppercase text-gray-500 tracking-wider block mb-0.5">TO (CONSIGNEE):</span>
            <div className="font-bold text-[11px]">{recipient.name || 'Valued Customer'}</div>
            <div className="text-[10px] text-gray-700">Phone: {recipient.phone || 'N/A'}</div>
            <div className="text-[10px] text-gray-800 font-medium">
              {recipient.full_address || [recipient.street, recipient.barangay, recipient.city, recipient.province].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>

        {/* COD Banner */}
        <div className="my-2 p-2 border-2 border-black text-center">
          {cod.is_cod ? (
            <div>
              <span className="text-[9px] font-extrabold tracking-wider uppercase block text-gray-700">PAYMENT: CASH ON DELIVERY</span>
              <span className="text-base font-black tracking-tight">
                COLLECT: ₱{Number(cod.amount || order.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[9px] font-extrabold tracking-wider uppercase block text-gray-700">PAYMENT: GCASH PREPAID</span>
              <span className="text-sm font-black tracking-tight text-gray-900 uppercase">
                PAID — DO NOT COLLECT
              </span>
            </div>
          )}
        </div>

        {/* Items Summary Table */}
        <div className="border-t border-black pt-1.5">
          <span className="text-[8px] font-extrabold uppercase text-gray-500 tracking-wider block mb-1">
            PACKAGE CONTENTS ({items.length} {items.length === 1 ? 'ITEM' : 'ITEMS'}):
          </span>
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="flex justify-between items-start text-[10px]">
                <span className="font-medium truncate max-w-[200px]">
                  {item.quantity}x {item.product_name} {item.variant_label ? `(${item.variant_label})` : ''}
                </span>
                <span className="font-semibold shrink-0">₱{Number(item.subtotal).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Notice */}
        <div className="mt-3 pt-1.5 border-t border-dashed border-gray-400 text-[8px] text-gray-500 flex justify-between items-center">
          <span>Courier Handover Copy</span>
          <span>lovedit.ph logistics</span>
        </div>
      </div>

      {/* Global CSS for Print Size (A6) */}
      <style>{`
        @media print {
          @page {
            size: 105mm 148mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          #waybill-label {
            border: none !important;
            max-width: 100% !important;
            width: 100% !important;
            padding: 4mm !important;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
