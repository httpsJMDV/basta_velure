import { useMountAnim } from '../../hooks/useDashboardAnimations';
import VoucherManager from '../../components/vouchers/VoucherManager';

/** The shop's store vouchers (S9). */
export default function SellerVouchersPage() {
  const pageRef = useMountAnim();
  return (
    <div ref={pageRef} className="pb-8 w-full">
      <VoucherManager />
    </div>
  );
}
