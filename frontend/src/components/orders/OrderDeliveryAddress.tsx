import { useState } from 'react';
import { MapPin, Pencil, ShieldCheck } from 'lucide-react';
import type { Order } from '../../types';
import { http } from '../../api/client';
import { apiErrorMessage } from '../../utils/apiError';
import { localPhMobile } from '../../utils/accountRules';
import PhoneInput from '../ui/PhoneInput';
import { Dialog, BUTTON } from '../ui/Overlay';
import { useToast } from '../ui/Toast';

export default function OrderDeliveryAddress({ order, onUpdated }: { order: Order; onUpdated: (order: Order) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [street, setStreet] = useState(''), [error, setError] = useState('');
  const { showToast } = useToast();
  const area = [order.shipping_barangay, order.shipping_city, order.shipping_province].filter(Boolean).join(', ');
  const begin = () => { setName(order.shipping_name ?? ''); setPhone(localPhMobile(order.shipping_phone ?? '')); setStreet(order.shipping_address ?? ''); setError(''); setOpen(true); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const response = await http.patch<{ data: Order }>(`/buyer/orders/${order.id}/delivery-address`, { shipping_name: name.trim(), shipping_phone: phone, shipping_address: street.trim(), address_revision: order.address_revision ?? 1 });
      onUpdated(response.data.data); setOpen(false); showToast('Delivery details corrected. The shop has been notified.', 'success');
    } catch (e) { setError(apiErrorMessage(e, 'Delivery details could not be updated.')); }
    finally { setBusy(false); }
  };
  return <>
    <section className="mx-4 mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" /><div className="min-w-0 flex-1"><h3 className="text-[13px] font-semibold text-stone-900">Delivery details</h3><p className="mt-1 text-[12px] font-medium text-stone-700">{order.shipping_name} · {order.shipping_phone}</p><p className="mt-1 text-[12px] leading-5 text-stone-500">{[order.shipping_address, area].filter(Boolean).join(', ')}</p></div>{order.can_edit_delivery_address && <button type="button" onClick={begin} className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-50 px-2.5 py-2 text-xs font-semibold text-brand-red"><Pencil className="h-3.5 w-3.5" />Correct</button>}</div>
      <p className="mt-3 border-t border-stone-100 pt-2 text-[11px] leading-4 text-stone-500">{order.can_edit_delivery_address ? 'Check your details before dispatch. Chat confirmation is optional; your order keeps moving without it.' : 'Delivery details are locked for this order. Contact the shop or courier about a mistake. Saved-address edits do not reroute an existing order.'}</p>
    </section>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title="Correct delivery details">
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <p className="text-sm leading-6 text-stone-600">Correct the recipient, mobile number or street before a waybill is created. This updates this order only.</p>
        <label className="block text-xs font-semibold text-stone-700">Recipient<input required minLength={2} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal" /></label>
        <PhoneInput label="Recipient mobile number" value={phone} onChange={setPhone} />
        <label className="block text-xs font-semibold text-stone-700">House, street, building and unit<textarea required minLength={5} maxLength={500} rows={3} value={street} onChange={(e) => setStreet(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-normal" /></label>
        <div className="rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600"><p className="flex items-center gap-2 font-semibold text-stone-800"><ShieldCheck className="h-4 w-4" />Delivery area stays the same</p><p className="mt-1">{area}</p><p className="mt-2">For a different barangay or city, cancel while eligible and place a new order to check the courier, delivery fee and coverage. Do not put a different city in the street field.</p></div>
        {error && <p role="alert" className="text-sm text-brand-red">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className={BUTTON.ghost}>Cancel</button><button disabled={busy} className={BUTTON.primary}>{busy ? 'Saving…' : 'Save correction'}</button></div>
      </form>
    </Dialog>
  </>;
}
