import { useMountAnim } from '../../hooks/useDashboardAnimations';
import VoucherManager from '../../components/vouchers/VoucherManager';

/** The shop's store vouchers (S9). */
export default function SellerVouchersPage() {
  const pageRef = useMountAnim();
  return (
    <div ref={pageRef} className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Vouchers</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Discounts buyers claim or type at checkout. One store voucher per shop per order.</p>
      </div>
      <VoucherManager />
    </div>
  );
}
