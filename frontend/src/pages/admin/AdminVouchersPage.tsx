import VoucherManager from '../../components/vouchers/VoucherManager';

/** Loved-IT's platform and shipping vouchers (A8: funded by Loved-IT, never from a shop's earnings). */
export default function AdminVouchersPage() {
  return (
    <div className="w-full pb-8">
      <VoucherManager admin />
    </div>
  );
}
