import type { SellerOrder } from '../types';
import { normalizeOrderStatus } from './orderStatus';

export function canReviewGcashPayment(order: Pick<SellerOrder, 'payment_method' | 'payment_status' | 'status' | 'collection_payee'>): boolean {
  return !order.collection_payee && order.payment_method === 'gcash' && normalizeOrderStatus(order.status) === 'PLACED'
    && ['pending', 'pending_verification', 'verification_failed'].includes(order.payment_status);
}
